#!/usr/bin/env bash
# Architecture-diagram checks (STE-47): every C4 diagram is an inline Mermaid
# block that parses with mermaid-cli, and no D2/SVG sources linger anywhere.
# Requires: mmdc (@mermaid-js/mermaid-cli).

set -uo pipefail
cd "$(dirname "$0")/.."

ARCH=docs/architecture/README.md
ROOT=README.md
fail=0

err() { echo "FAIL: $*" >&2; fail=1; }
ok()  { echo "  ok: $*"; }

command -v mmdc >/dev/null || { echo "mmdc not found — npm i -g @mermaid-js/mermaid-cli" >&2; exit 1; }

# The D2/SVG pair for a diagram is deleted and nothing in the repo references it.
gone() {
  local base=$1
  for ext in d2 svg; do
    [ -e "docs/architecture/$base.$ext" ] && err "$base.$ext still exists"
  done
  local refs
  refs=$(grep -rln "$base" \
    --exclude-dir=.git --exclude-dir=node_modules --exclude-dir=.claude \
    --exclude=check_docs.sh . 2>/dev/null)
  if [ -n "$refs" ]; then
    err "dangling references to $base in: $(echo "$refs" | tr '\n' ' ')"
  else
    ok "$base: files deleted, no dangling references"
  fi
}

# Print the first ```mermaid fenced block inside the section whose heading
# matches $2 (stops at the next heading, so a later section's block never leaks).
mermaid_block_after() {
  awk -v pat="$2" '
    !found && $0 ~ pat {found=1; next}
    found && !inblk && /^#/ {exit}
    found && /^```mermaid[[:space:]]*$/ {inblk=1; next}
    inblk && /^```[[:space:]]*$/ {exit}
    inblk {print}
  ' "$1"
}

# diagram <file> <heading-regex> <mermaid-type> <label> [required-content...]
diagram() {
  local file=$1 heading=$2 type=$3 label=$4; shift 4
  local blk
  blk=$(mermaid_block_after "$file" "$heading")
  if [ -z "$blk" ]; then
    err "$label: no mermaid block after '$heading' in $file"
    return
  fi
  local first
  first=$(echo "$blk" | sed -n '/[^[:space:]]/{p;q;}')
  echo "$first" | grep -qE "^[[:space:]]*$type" \
    || err "$label: expected a $type, block starts with: $first"
  local missing=()
  for needle in "$@"; do
    echo "$blk" | grep -qF "$needle" || missing+=("$needle")
  done
  [ ${#missing[@]} -gt 0 ] && err "$label: content dropped from diagram: ${missing[*]}"
  local tmp
  tmp=$(mktemp /tmp/check-docs-XXXXXX.mmd)
  echo "$blk" > "$tmp"
  if mmdc -i "$tmp" -o "${tmp%.mmd}.svg" --quiet >/dev/null 2>&1; then
    ok "$label: valid $type"
  else
    err "$label: mmdc failed to parse the block"
  fi
  rm -f "$tmp" "${tmp%.mmd}.svg"
}

# ---- L1 System Context -----------------------------------------------------
diagram "$ARCH" '^### 2\.2' flowchart "L1 (architecture doc)" \
  "Enterprise Customer" "Fintech Integrator" "FX / Remittance Operator" "Channel Partner" \
  "Bleu Platform" "BR Stellar Anchor" "PIX" "BYO KYC / KYB" "BYO Wallet / Custody" \
  "Stellar Network" "USDC SAC" "Card Network" "OpenZeppelin Stellar Contracts"
diagram "$ROOT" '^## Architecture' flowchart "L1 (root README)" \
  "Bleu Platform" "BR Stellar Anchor" "Stellar Network"
grep -q '| Level | Diagram |' "$ROOT" && err "root README still has the diagram thumbnail table"
grep -q 'docs/architecture/README.md' "$ROOT" && ok "root README keeps the architecture doc link" \
  || err "root README lost the architecture doc link"
gone arch-l1

# ---- L2 Containers -----------------------------------------------------------
diagram "$ARCH" '^### 2\.3' flowchart "L2 (architecture doc)" \
  "API Gateway" "Enterprise Dashboard" "Partner Console" \
  "Orchestrator" "SEP Server" "Business Server" "KYC / KYB Proxy" \
  "Stellar RPC" "Event Indexer" "Card Issuer Adapter" \
  "Postgres" "Redis" "S3" \
  "Partner-Attribution" "Rate-Lock" "Card-Collateral Vault" "USDC SAC" \
  "BACEN FX-licensed" "Fireblocks" "Card Processor" "OpenZeppelin" \
  "Public VPC" "Private VPC" "Secure VPC"
gone arch-l2

# ---- L3 SEP-31 + SEP-38 + IOF flow --------------------------------------------
diagram "$ARCH" '^#### 2\.4\.1' sequenceDiagram "L3 SEP-31 (architecture doc)" \
  "Fintech Integrator" "Bleu API Gateway" "AP Business Server" "AP SEP Server" \
  "SEP-38 Rate-Lock" "BR Anchor" "Sender Wallet" "AP Stellar Observer" \
  "USDC SAC" "PIX" \
  "POST /quote" "IOF" "lock_quote" "quote_locked" \
  "POST /transactions" "request_offchain_funds" "stellar_memo" \
  "notify_onchain_funds_received" "pending_receiver" \
  "PIX payout" "notify_offchain_funds_sent" \
  "consume_quote" "quote_use" "completed"
gone arch-l3-sep31-flow

# ---- L3 CAP-33 sponsor-sandwich onboarding ------------------------------------
diagram "$ARCH" '^#### 2\.4\.3' sequenceDiagram "L3 onboarding (architecture doc)" \
  "Enterprise User" "Fintech UI" "Bleu API Gateway" "Orchestrator Service" \
  "Sponsor Signer" "Stellar RPC" "Stellar Core" \
  "CPF/CNPJ" "POST /accounts/onboard" "sponsored keypair" \
  "ChangeTrust" "sig_sponsor" "sendTransaction" "numSponsored" \
  "mutual-consent" "sponsored_reserves" "RevokeSponsorshipOp" \
  "Soroban contracts CANNOT" "~2 XLM"
gone arch-l3-onboarding

# ---- L3 card-collateral auth/clearing ------------------------------------------
diagram "$ARCH" '^#### 2\.4\.2' sequenceDiagram "L3 card auth (architecture doc)" \
  "Cardholder" "Merchant POS" "Card Network" "Issuer / BIN Sponsor" \
  "Card Issuer Adapter" "Card-Collateral Vault" "USDC SAC" \
  "authorization request" "POST /auth webhook" "reserve(" \
  "do_check_auth" "SpendingLimit" "when_not_paused" "transfer_from(allowance)" \
  "collateral_locked" "approval code" \
  "clearing batch" "POST /capture webhook" "settle(" "minSeqAge" \
  "card_settle" "shortfall" \
  "release(" "CAP-23" "collateral_released"
mermaid_block_after "$ARCH" '^#### 2\.4\.2' | grep -qE '^[[:space:]]*(alt|else)' \
  && ok "L3 card auth: shortfall path emphasized via alt block" \
  || err "L3 card auth: no alt block emphasizing the shortfall path"
gone arch-l3-card-auth

# ---- global sweep --------------------------------------------------------------
leftovers=$(find docs/architecture -name '*.d2' -o -name '*.svg' 2>/dev/null)
if [ -n "$leftovers" ]; then
  err "diagram source/render files remain: $(echo "$leftovers" | tr '\n' ' ')"
else
  ok "no .d2/.svg files under docs/architecture"
fi

# ---- result ------------------------------------------------------------------
[ "$fail" -eq 0 ] && echo "docs checks passed" || echo "docs checks FAILED"
exit "$fail"
