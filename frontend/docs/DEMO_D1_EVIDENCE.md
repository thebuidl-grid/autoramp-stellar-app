# Deliverable 1 evidence: hardened Stellar USDC off-ramp

Videos (Nigerian English voice): `docs/autoramp_d1_full_demo.mp4` (6 min, full walkthrough = sell flow + results/failure scenarios); parts: `docs/autoramp_d1_flow_part.mp4` (sell flow) and `docs/autoramp_d1_offramp_hardening_demo.mp4` (results and failure scenarios).

## What is real and what is simulated
| Item | Status |
|---|---|
| App UI, live AutoRamp API, history/detail pages | Real |
| Completed cash-out `off_stellar_real_proof` (loaded from the live API) | Real record. **Its on-chain deposit `80e855d2...d33aed` is a 3.125 native XLM payment, not USDC** (checked on Horizon). The app labels it USDC. |
| Four USDC deposits below | Real Stellar testnet USDC payments |
| Timeout, partial, rejected, reversal, insufficient-liquidity screens | **Simulated**: staged API responses rendered by the real UI, labelled with an on-screen banner. Nothing written to any backend. |

## Real Stellar testnet USDC deposits (sender -> funding address `GB2YAU7KGYM3KA7FCDTPJDGIN5OIZY4EGZBYFG3EFQO3WMHC3U7LKJJH`)
| Scenario | Amount | Tx hash | Link |
|---|---|---|---|
| partial | 2.5 USDC | `a283674047e72cf197faeff96eac606e9d949406578c6bbd3244e06a0707c8a2` | [Stellar Expert](https://stellar.expert/explorer/testnet/tx/a283674047e72cf197faeff96eac606e9d949406578c6bbd3244e06a0707c8a2) |
| rejected | 1 USDC | `6acda0f53278366bc6e38b46d2895159f0b87435083cc9ee644b9ad51b77ad1c` | [Stellar Expert](https://stellar.expert/explorer/testnet/tx/6acda0f53278366bc6e38b46d2895159f0b87435083cc9ee644b9ad51b77ad1c) |
| reversal | 1 USDC | `7f97fe88ed4f9a2ce0557277a90cdccec8e7ca1680fee126f09f8dae31d1fbb5` | [Stellar Expert](https://stellar.expert/explorer/testnet/tx/7f97fe88ed4f9a2ce0557277a90cdccec8e7ca1680fee126f09f8dae31d1fbb5) |
| liquidity | 1 USDC | `07211f95fdc02253613c12e1c541dabac11bf0f09f9ec6bbe0f409123540e90e` | [Stellar Expert](https://stellar.expert/explorer/testnet/tx/07211f95fdc02253613c12e1c541dabac11bf0f09f9ec6bbe0f409123540e90e) |

## Tests
- Backend (`autoramp-backend`, branch `feat/d1-offramp-hardening`): 28 suites / 339 tests pass, including the state machine (48), the state service covering ticket tests 1-8 (23), expiry (10) and webhook (30).
- Frontend: 12 files / 60+ tests pass (status model, detail view per scenario).

## Not done / caveats
- The migration (`prisma/migrations/20261110210000_offramp_state_machine_reconciliation`) is not applied to any database; the live API still runs the old code, so the real cash-out uses the UI's legacy-compatible view.
- A new real USDC cash-out through the live backend has not been run; the ticket's "real successful USDC tx hash" is only covered by the deposits above plus the XLM-based proof record.
- Nothing is committed.
- Reconciliation records are covered by backend tests and the API (`GET /ramp/offramp/:reference/reconciliation`) but are not shown in the video.

## Sell flow scene (added)
The sell form, bank lookup (Zenith Bank, account name resolved by the live API), Stellar wallet connection and the deposit are real.
The backend order creation is **simulated** (staged response, labelled on screen) because the live backend could not create the order:
- `POST /ramp/offramp` with 1 USDC returned `400 amount must not be less than 2000`: the DTO (`src/modules/ramp/dto/index.dto.ts`, `@Min(2000)`) treats `amount` as naira while the sell form sends the USDC amount.
- `GET /rates/usd-ngn-rate` and `/rates/estimate-ngn` fail with an upstream RPC error (`base.llamarpc.com` 525), so the form's "You'll receive" stays 0.00.
- No order was created on the live account by these attempts (checked by listing transactions).

Real deposit made from the sell flow: 1 USDC, memo `d1-live-demo`, hash `d44896f30d46afbdb59be89101462f4cb5e17e10042e9c71f638d5c3d13c9fd1` (ledger 5671567, successful) - https://stellar.expert/explorer/testnet/tx/d44896f30d46afbdb59be89101462f4cb5e17e10042e9c71f638d5c3d13c9fd1
