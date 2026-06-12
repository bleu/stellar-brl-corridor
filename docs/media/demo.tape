# Reproduce:  vhs docs/media/demo.tape   (run from repo root)
#
# Films the opening of `just demo` — partner mint → set_partner ×2 →
# settle_split printing its tx hash (~55-70s in at typical testnet pace) — then
# hides the recording while the demo runs to completion underneath, so
# deployments/testnet-demo.json is rewritten by the very run the GIF shows.
# Sync DEMO.md / REVIEWERS.md tx links from that JSON afterwards, and verify
# the settle_split hash in the GIF's final frames matches the JSON.
#
# Timing is Sleep-based, not Wait-based: vhs 0.11.0's Wait+Screen matches the
# first screenful of the scrollback buffer instead of the live viewport, so a
# Wait never fires once output scrolls. If testnet pace drifts and the hash
# is not visible at the end of the GIF, re-record (each run is idempotent).
#
# Requires the `bleu-deployer` keystore entry (canonical deployment admin).
Output docs/media/demo-testnet.gif
Set FontSize 20
Set Width 1600
Set Height 840
Set Padding 24
Set Theme "Dracula"
Set TypingSpeed 55ms
Set Framerate 15
Set CursorBlink false
Sleep 800ms
Type "just demo"
Enter
# First primitive: mint, set_partner ×2, settle_split + balance assertions.
# (settle_split's hash lands ~55-70s in depending on testnet pace.)
Sleep 75s
# Stop filming; let the demo complete underneath (~2m20s total run time).
Hide
Sleep 240s
