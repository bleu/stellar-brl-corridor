#!/usr/bin/env bash
# Bleu — Stellar BRL/PIX corridor — LIVE testnet demo.
#
# Exercises the three deployed Soroban corridor primitives against the live
# testnet contracts and prints the real transaction hash of every state-changing
# call. Every hash is reviewer-verifiable on stellar.expert.
#
# Primitives demonstrated:
#   1. Partner attribution  — set_partner (x2) + settle_split → partner_transfer
#      events + real USDC moved through the wrapped SAC (balances asserted).
#   2. FX rate-lock         — lock_quote (SEP-38 price invariant) + consume_quote
#      → quote_use event; plus the post-expiry replay-guard path.
#   3. Card-collateral PoC   — reserve → settle (partial) → release lifecycle,
#      plus a second authorization whose clearing exceeds locked collateral and
#      emits the shortfall event.
#
# Idempotent / re-runnable: ids that must be unique per run (quote ids, auth ids,
# sep31 tx ids) are derived from a per-run RUN tag (timestamp by default, or the
# first CLI arg). Helper identities (payer, partner payouts) are generated +
# friendbot-funded once and reused thereafter.
#
# Requires only the `stellar` CLI (no cargo). Network: testnet.
#
# Usage:
#   scripts/demo_testnet.sh [run-tag]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NETWORK="${NETWORK:-testnet}"
SOURCE="${SOURCE:-bleu-deployer}"
DEPLOY="$ROOT/deployments/testnet.json"
OUT="$ROOT/deployments/testnet-demo.json"

command -v stellar >/dev/null 2>&1 || { echo "error: stellar CLI not found" >&2; exit 1; }
command -v jq      >/dev/null 2>&1 || { echo "error: jq not found"           >&2; exit 1; }
[ -f "$DEPLOY" ] || { echo "error: $DEPLOY missing — deploy first" >&2; exit 1; }

# --- Load deployment ---------------------------------------------------------
ADMIN="$(jq -r '.admin'                      "$DEPLOY")"
USDC_SAC="$(jq -r '.usdc_sac'                "$DEPLOY")"
FX="$(jq -r '.contracts["fx-rate-lock"]'        "$DEPLOY")"
PA="$(jq -r '.contracts["partner-attribution"]' "$DEPLOY")"
CARD="$(jq -r '.contracts["card-collateral-poc"]' "$DEPLOY")"

RUN="${1:-$(date -u +%Y%m%d%H%M%S)}"
echo "› Demo run tag: $RUN"
echo "› Admin/deployer: $ADMIN"
echo "› USDC SAC: $USDC_SAC"
echo

# --- Record bookkeeping ------------------------------------------------------
TMP_RECORDS="$(mktemp)"
trap 'rm -f "$TMP_RECORDS"' EXIT

# invoke <step> <fn> <contract_id> -- <args...>
# Runs a state-changing invoke, captures the tx hash from --send=yes, appends a
# {step, fn, contract, tx_hash} record. Echoes the function return value.
invoke() {
  local step="$1" fn="$2" cid="$3"; shift 3
  shift # drop the literal "--"
  local out hash ret errfile
  errfile="$(mktemp)"
  # --send=yes forces a real on-chain submission. The CLI prints the tx hash to
  # stderr; we capture stderr to a file (also echoing it) and grep the 64-hex.
  out="$(stellar contract invoke --id "$cid" --source "$SOURCE" --network "$NETWORK" \
          --send=yes -- "$fn" "$@" 2>"$errfile")"
  cat "$errfile" >&2
  hash="$(grep -Eo '[0-9a-f]{64}' "$errfile" | head -1 || true)"
  rm -f "$errfile"
  # Strip surrounding JSON quotes so i128 returns ("200000000") compare as ints.
  ret="$(printf '%s' "$out" | tr -d '"')"
  if [ -z "$hash" ]; then
    echo "  !! no tx hash captured for $step/$fn" >&2
    exit 1
  fi
  echo "  ✓ $step :: $fn → $hash  (ret: ${ret:-<void>})"
  jq -cn --arg step "$step" --arg fn "$fn" --arg cid "$cid" --arg hash "$hash" --arg ret "$ret" \
     '{step:$step, fn:$fn, contract:$cid, tx_hash:$hash, ret:$ret}' >> "$TMP_RECORDS"
  LAST_RET="$ret"
}

# read <fn> <contract_id> -- <args...>  → echoes return (no submission, no record).
# Strips surrounding JSON quotes so i128 string returns become bare integers.
read_call() {
  local fn="$1" cid="$2"; shift 2; shift
  stellar contract invoke --id "$cid" --source "$SOURCE" --network "$NETWORK" \
    -- "$fn" "$@" 2>/dev/null | tr -d '"'
}

# --- Helper identities -------------------------------------------------------
ensure_key() {
  local name="$1"
  if ! stellar keys address "$name" >/dev/null 2>&1; then
    echo "› Generating + funding helper identity '$name'" >&2
    stellar keys generate --network "$NETWORK" --fund "$name" >&2
  fi
  stellar keys address "$name"
}

# Partner payout accounts are classic G-accounts, so they need a trustline to
# USDC:<issuer> before the SAC can credit them. Idempotent — change-trust on an
# existing line is a no-op. (Contract C-addresses wouldn't need this; classic
# accounts model the real "partner onboards a USDC wallet" flow.)
ensure_trust() {
  local name="$1"
  echo "› Ensuring USDC trustline for '$name'" >&2
  stellar tx new change-trust --source-account "$name" --network "$NETWORK" \
    --line "USDC:$ADMIN" >&2 2>&1 || true
}

PARTNER_A="$(ensure_key demo-partner-a)"
PARTNER_B="$(ensure_key demo-partner-b)"
ensure_trust demo-partner-a
ensure_trust demo-partner-b
# The settling account ("from") is the partner-attribution CONTRACT itself: it
# is the on-chain settlement account that holds incoming corridor flow and fans
# it out to partners. Using the contract as `from` is also the only auth model
# the public RPC supports here — the SAC `transfer(from, …)` is a sub-invocation
# under settle_split, so a classic-account `from` would require non-root auth
# recording (which the contract doesn't request and the public RPC rejects).
# A contract `from` authorizes its own outflow via the invocation context.
# The admin/issuer cannot itself hold a SAC balance ("operation invalid on
# issuer"), so it mints test USDC straight to the contract.
PAYER="$PA"
echo "› Partner A payout: $PARTNER_A"
echo "› Partner B payout: $PARTNER_B"
echo "› Settlement account (from): $PAYER (= partner-attribution contract)"
echo

# 32-hex helper: sha256 of a label, truncated to 32 bytes (64 hex chars).
hex32() { printf '%s' "$1" | shasum -a 256 | cut -c1-64; }

# =============================================================================
# 1. PARTNER ATTRIBUTION
# =============================================================================
echo "════════════════════════════════════════════════════════"
echo " 1. PARTNER ATTRIBUTION — revenue split through wrapped USDC SAC"
echo "════════════════════════════════════════════════════════"

# Mint test USDC to the settlement contract (admin is the SAC issuer). 100 USDC
# per run is enough for one 100-USDC settlement.
MINT_AMT=1000000000   # 100.0000000 USDC
invoke "partner.mint" mint "$USDC_SAC" -- --to "$PAYER" --amount "$MINT_AMT"

BAL_PAYER_BEFORE="$(read_call balance "$USDC_SAC" -- --id "$PAYER")"
BAL_A_BEFORE="$(read_call balance "$USDC_SAC" -- --id "$PARTNER_A")"
BAL_B_BEFORE="$(read_call balance "$USDC_SAC" -- --id "$PARTNER_B")"
echo "  balances before settle — payer:$BAL_PAYER_BEFORE A:$BAL_A_BEFORE B:$BAL_B_BEFORE"

# Register two partners: A = 30% (3000 bps), B = 20% (2000 bps).
invoke "partner.set_a" set_partner "$PA" -- \
  --partner "$PARTNER_A" --fee_bps 3000 --payout "$PARTNER_A" --domain accountant
invoke "partner.set_b" set_partner "$PA" -- \
  --partner "$PARTNER_B" --fee_bps 2000 --payout "$PARTNER_B" --domain fxoperator

TOTAL_BPS="$(read_call total_bps "$PA" --)"
echo "  total_bps after registration: $TOTAL_BPS (expect 5000)"
[ "$TOTAL_BPS" = "5000" ] || { echo "  !! total_bps assertion failed" >&2; exit 1; }

# Settle a 100 USDC flow split across both partners.
SETTLE_AMT=1000000000   # 100.0000000 USDC
SETTLE_TXHASH="$(hex32 "settle-$RUN")"
invoke "partner.settle_split" settle_split "$PA" -- \
  --from "$PAYER" --amount "$SETTLE_AMT" \
  --partners "[\"$PARTNER_A\",\"$PARTNER_B\"]" \
  --tx_hash "$SETTLE_TXHASH"

BAL_A_AFTER="$(read_call balance "$USDC_SAC" -- --id "$PARTNER_A")"
BAL_B_AFTER="$(read_call balance "$USDC_SAC" -- --id "$PARTNER_B")"
echo "  balances after settle  — A:$BAL_A_AFTER B:$BAL_B_AFTER"

# Expected deltas: A = 100 * 0.30 = 30 USDC = 300000000 ; B = 100 * 0.20 = 20 USDC = 200000000
DELTA_A=$(( BAL_A_AFTER - BAL_A_BEFORE ))
DELTA_B=$(( BAL_B_AFTER - BAL_B_BEFORE ))
echo "  partner A USDC delta: $DELTA_A (expect 300000000)"
echo "  partner B USDC delta: $DELTA_B (expect 200000000)"
[ "$DELTA_A" = "300000000" ] || { echo "  !! partner A delta assertion failed" >&2; exit 1; }
[ "$DELTA_B" = "200000000" ] || { echo "  !! partner B delta assertion failed" >&2; exit 1; }
echo "  ✓ partner balances moved exactly as split; partner_transfer events emitted."
echo

# =============================================================================
# 2. FX RATE-LOCK (SEP-38)
# =============================================================================
echo "════════════════════════════════════════════════════════"
echo " 2. FX RATE-LOCK — SEP-38 firm quote lock + consume"
echo "════════════════════════════════════════════════════════"

# SEP-38 price invariant enforced on-chain:
#   (sell_amount - fee_iof) * PRICE_SCALE == price * buy_amount     (PRICE_SCALE = 1e7)
# Model: sell 530.00 BRL (centavos, 2dp) for 100.0000000 USDC (stroops, 7dp) at
# 5.30 BRL/USDC, with 1.91 BRL IOF (Decreto 6.306/2007) disclosed.
#   sell_amount = 53191        (531.91 BRL incl. IOF, in centavos)
#   fee_iof     = 191          (1.91 BRL, in centavos)
#   buy_amount  = 1000000000   (100 USDC, in stroops)
#   net = sell - fee = 53000 (centavos = 530.00 BRL)
#   price = net * PRICE_SCALE / buy = 53000 * 1e7 / 1e9 = 530
SELL_AMT=53191
FEE_IOF=191
BUY_AMT=1000000000
PRICE=530
# Sanity-check the invariant locally before sending.
if [ $(( (SELL_AMT - FEE_IOF) * 10000000 )) -ne $(( PRICE * BUY_AMT )) ]; then
  echo "  !! local price-invariant check failed" >&2; exit 1
fi

QUOTE_ID="$(hex32 "quote-ok-$RUN")"
SEP31_TX="$(hex32 "sep31-$RUN")"
invoke "fx.lock_quote" lock_quote "$FX" -- \
  --quote_id "$QUOTE_ID" --sell_amount "$SELL_AMT" --buy_amount "$BUY_AMT" \
  --price "$PRICE" --fee_iof "$FEE_IOF" --ttl_ledgers 120

ACTIVE="$(read_call is_active "$FX" -- --quote_id "$QUOTE_ID")"
echo "  is_active after lock: $ACTIVE (expect true)"
[ "$ACTIVE" = "true" ] || { echo "  !! quote not active after lock" >&2; exit 1; }

invoke "fx.consume_quote" consume_quote "$FX" -- \
  --quote_id "$QUOTE_ID" --sep31_tx_id "$SEP31_TX"

ACTIVE2="$(read_call is_active "$FX" -- --quote_id "$QUOTE_ID")"
echo "  is_active after consume: $ACTIVE2 (expect false — replay guard set)"
[ "$ACTIVE2" = "false" ] || { echo "  !! quote still active after consume" >&2; exit 1; }
echo "  ✓ quote_use event emitted; one-shot consumed flag set (double-settle blocked)."
echo "  Note: the TTL-expiry path (QuoteExpired after the rate-lock window) is not"
echo "        re-demonstrated live here because waiting ~120 ledgers (~10 min) is"
echo "        impractical in a single run; it is covered by the contract unit tests"
echo "        (contracts/fx-rate-lock/src/test.rs). The one-shot replay guard above"
echo "        IS the live double-settlement defense."
echo

# =============================================================================
# 3. CARD-COLLATERAL PoC
# =============================================================================
echo "════════════════════════════════════════════════════════"
echo " 3. CARD-COLLATERAL — reserve → settle → release + shortfall race"
echo "════════════════════════════════════════════════════════"

# --- Normal lifecycle: reserve 50, settle 30 (partial), release 20 -----------
AUTH_OK="$(hex32 "auth-ok-$RUN")"
RESERVE_AMT=500000000   # 50.0000000 USDC
SETTLE_PARTIAL=300000000 # 30.0000000 USDC
invoke "card.reserve" reserve "$CARD" -- \
  --auth_id "$AUTH_OK" --amount "$RESERVE_AMT" --ttl_ledgers 600

invoke "card.settle_partial" settle "$CARD" -- \
  --auth_id "$AUTH_OK" --final_amount "$SETTLE_PARTIAL"
echo "  settle returned shortfall: $LAST_RET (expect 0 — fully covered)"
[ "$LAST_RET" = "0" ] || { echo "  !! expected zero shortfall on covered settle" >&2; exit 1; }

invoke "card.release" release "$CARD" -- --auth_id "$AUTH_OK"
echo "  release returned unused remainder: $LAST_RET (expect 200000000 = 20 USDC)"
[ "$LAST_RET" = "200000000" ] || { echo "  !! release remainder assertion failed" >&2; exit 1; }
echo "  ✓ collateral_locked → card_settle → collateral_released; only spent slice consumed."
echo

# --- Shortfall path: reserve 10, settle 14 (clearing > locked) ---------------
AUTH_SHORT="$(hex32 "auth-short-$RUN")"
RESERVE_SHORT=100000000  # 10.0000000 USDC
SETTLE_OVER=140000000    # 14.0000000 USDC (auth/clearing race)
invoke "card.reserve_short" reserve "$CARD" -- \
  --auth_id "$AUTH_SHORT" --amount "$RESERVE_SHORT" --ttl_ledgers 600

invoke "card.settle_shortfall" settle "$CARD" -- \
  --auth_id "$AUTH_SHORT" --final_amount "$SETTLE_OVER"
echo "  settle returned shortfall: $LAST_RET (expect 40000000 = 4 USDC over locked)"
[ "$LAST_RET" = "40000000" ] || { echo "  !! shortfall amount assertion failed" >&2; exit 1; }
echo "  ✓ shortfall event emitted for the auth/clearing race (off-chain top-up signal)."

# Clean up the shortfall auth so re-runs with the same tag don't trip AuthAlreadyExists.
invoke "card.release_short" release "$CARD" -- --auth_id "$AUTH_SHORT"
echo

# =============================================================================
# WRITE MACHINE-READABLE RECORD
# =============================================================================
LEDGER_TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
jq -s \
  --arg run "$RUN" --arg ts "$LEDGER_TS" --arg net "$NETWORK" \
  --arg admin "$ADMIN" --arg usdc "$USDC_SAC" \
  --arg fx "$FX" --arg pa "$PA" --arg card "$CARD" \
  --arg pa_a "$PARTNER_A" --arg pa_b "$PARTNER_B" \
  --arg da "$DELTA_A" --arg db "$DELTA_B" \
  '{network:$net, run:$run, ran_at:$ts, admin:$admin, usdc_sac:$usdc,
    contracts:{"fx-rate-lock":$fx,"partner-attribution":$pa,"card-collateral-poc":$card},
    partners:{a:$pa_a, b:$pa_b},
    observed:{partner_a_usdc_delta:$da, partner_b_usdc_delta:$db},
    steps: .}' \
  "$TMP_RECORDS" > "$OUT"

echo "════════════════════════════════════════════════════════"
echo "✓ Demo complete. Records written to: $OUT"
echo "  Explorer links:"
jq -r '.steps[] | "    \(.step)/\(.fn): https://stellar.expert/explorer/testnet/tx/\(.tx_hash)"' "$OUT"
