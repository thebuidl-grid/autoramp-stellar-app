# AutoRamp Stellar App

A multi-chain crypto on-ramp / off-ramp / swap platform targeting Nigerian Naira (NGN) ↔ stablecoins, with cross-chain bridging via Circle CCTP and native Stellar USDC support.

---

## Repository layout

```
autoramp-stellar-app/
├── autoramp-frontend/    Next.js 16 application (main product)
├── stellar-cctp/         Circle CCTP Stellar integration package
└── docs/                 Mintlify API reference site
```

---

## Packages

### `autoramp-frontend/`

The primary end-user application. Built with Next.js 16 / React 19 and deployed as a server-side-rendered web app.

**Features**

| Tab | What it does |
|---|---|
| Buy (on-ramp) | NGN bank transfer → CNGN / USDC / USDT sent to a connected wallet |
| Sell (off-ramp) | CNGN / USDC burned on-chain → NGN wired to a Nigerian bank account |
| Swap | On-chain token swap between USDC, CNGN, USDT, WETH via 0x Exchange Proxy on Base / BSC |
| Bridge | Cross-chain USDC transfer using Circle BridgeKit (EVM ↔ EVM, EVM ↔ Stellar) |
| OTC | Over-the-counter trading desk for large-volume trades |

**User roles**

- **User** — standard retail user; can buy, sell, swap, bridge, and manage saved bank accounts / wallets
- **Merchant** — business with KYB approval; has a separate dashboard, can see their own transaction history, configure webhooks, and manage API keys
- **Admin** — full back-office: approve merchants, view all transactions, manage API keys and users


**Directory structure**

```
autoramp-frontend/
├── app/
│   ├── page.tsx                   Landing + main swap/bridge UI
│   ├── layout.tsx                 Root layout with providers
│   ├── auth/admin/login/          Admin login page
│   ├── dashboard/api-keys/        User API key management
│   ├── history/                   User transaction history
│   ├── profile/                   Saved bank accounts & wallets
│   ├── merchant/                  Merchant login, onboarding, dashboard
│   │   └── dashboard/             Transactions, settings, API keys
│   ├── otc/                       OTC trade, dashboard, history
│   ├── admin/                     Admin panel
│   │   ├── users/                 User management
│   │   ├── merchants/             Merchant KYB review
│   │   ├── transactions/          On-ramp / off-ramp / swap tables
│   │   ├── otc/                   OTC transaction management
│   │   ├── transfer-logs/         Bridge / transfer audit trail
│   │   └── api-keys/              Platform API key issuance
│   ├── api/
│   │   ├── swap/price|quote|permit2-quote/   0x API proxy routes
│   │   ├── upload/                Cloudinary upload endpoint
│   │   └── docs/proxy/            Mintlify docs proxy
│   └── docs/                      Embedded docs viewer
│
├── components/
│   ├── ui/                        Base design system (Button, Dialog, Toast, …)
│   ├── layout/                    Header, Footer
│   ├── hero/                      Landing page background
│   ├── auth/                      AuthProvider, email OTP modal, route guards
│   ├── swap/                      Swap form, chain/crypto selectors, bridge section
│   ├── transactions/              Step-based transaction flow (pending → execute → done)
│   ├── profile/                   Saved account / wallet management dialogs
│   ├── merchant/                  KYB multi-step form, settings views, sidebar
│   ├── otc/                       OTC initiation form, sidebar
│   ├── admin/                     All admin-panel tables and dialogs
│   ├── dashboard/                 User API key overview
│   └── providers/                 Root, Wagmi, top-loader providers
│
├── lib/
│   ├── api.ts                     Axios client + typed API namespaces (auth, swap, bridge, …)
│   ├── store.ts                   Zustand stores (auth, UI, transaction form)
│   ├── wagmi-config.ts            RainbowKit / Wagmi chain + connector config
│   ├── merchant.ts                Merchant-specific API calls
│   ├── utils.ts                   cn, formatNumber, safeBigInt, copyToClipboard, …
│   ├── bignumber-fix.ts           BigInt serialisation shim
│   ├── cloudinary.ts              Cloudinary upload helper
│   ├── query-provider.tsx         TanStack Query client setup
│   ├── constants/
│   │   ├── networks.ts            Chain metadata, RPC URLs, IS_TESTNET flag
│   │   ├── swap-constants.ts      ERC-20 addresses, decimals, 0x config
│   │   ├── bridge-constants.ts    USDC addresses per chain
│   │   └── quoter-constants.ts    Permit2 / quoter addresses
│   └── hooks/
│       ├── use-auth.ts            signIn / signUp / OTC auth mutations
│       ├── use-swap.ts            initializeSwap, updateSwap, token balances
│       ├── use-swap-execution.ts  Permit2 + 0x on-chain swap execution
│       ├── use-bridge.ts          Circle BridgeKit cross-chain execution
│       ├── use-transaction-form.ts on-ramp / off-ramp form helpers
│       ├── use-transaction-handlers.ts buy / sell submit handlers
│       ├── use-estimate-ngn.ts    Real-time NGN rate estimation
│       ├── use-transactions.ts    User transaction history queries
│       ├── use-user.ts            Authenticated user profile
│       ├── use-saved-accounts.ts  Saved bank account CRUD
│       ├── use-saved-wallets.ts   Saved wallet address CRUD
│       ├── use-account-resolution.ts Bank account name lookup
│       ├── use-debounce.ts        Generic debounce hook
│       ├── use-swap-websocket.ts  WebSocket for live swap status
│       ├── use-api-keys.ts        User API key CRUD
│       ├── use-merchant.ts        Merchant onboarding + settings
│       ├── use-otc.ts             OTC trade lifecycle
│       ├── use-admin.ts           Admin user / merchant management
│       ├── use-admin-*-transactions.ts  Admin transaction table queries
│       └── use-admin-otc.ts       Admin OTC oversight
```

**Authentication**

Users authenticate with email + OTP. The returned JWT is stored in Zustand (persisted to `localStorage`) and injected into every Axios request via an interceptor. Route guards (`admin-protected.tsx`, `merchant-protected.tsx`) check the role from the Zustand store.

**Network mode**

Set `NEXT_PUBLIC_NETWORK=testnet` to switch all contract addresses, RPC URLs, and Circle APIs to their testnet equivalents. The `IS_TESTNET` boolean in `lib/constants/networks.ts` gates every address.

**Supported chains**

Mainnet: Base, BSC, Ethereu

**On-chain swap flow**

1. User enters amounts → frontend calls `/api/swap/price` (0x price) for live estimation
2. On submit → `/api/swap/permit2-quote` returns a Permit2 signature request
3. User signs the Permit2 message in their wallet
4. Frontend calls 0x Exchange Proxy with the signed quote via `useWriteContract`
5. Transaction hash is reported to the backend via `swapApi.updateSwapAfterExecution`

**Bridge flow**

1. `useBridge.executeBridge` calls `bridgeApi.initiate` on the backend
2. Circle BridgeKit handles the chain-specific burn + attestation + mint sequence
3. Source and destination tx hashes are reported back via `bridgeApi.updateHash`

---

### `stellar-cctp/`

A standalone TypeScript package implementing Circle's Cross-Chain Transfer Protocol (CCTP) for Stellar (Soroban), domain ID 27.

The existing `@circle-fin/bridge-kit` does not cover Stellar, so this package fills that gap.

**Modules**

| File | Purpose |
|---|---|
| `src/constants.ts` | Soroban contract addresses (mainnet + testnet), domain IDs, RPC URLs |
| `src/types.ts` | TypeScript interfaces for burn, receive, attestation |
| `src/hook-data.ts` | `buildCctpForwarderHookData` — encodes the Stellar recipient into the EVM burn call's hookData |
| `src/decimals.ts` | 6 ↔ 7 decimal conversion between CCTP wire format and Stellar stroops |
| `src/attestation.ts` | `fetchAttestation` + `waitForAttestation` polling against Circle's iris-api |
| `src/send.ts` | `burnUsdcOnStellar` — calls `TokenMessengerMinter.deposit_for_burn` on Soroban |
| `src/receive.ts` | `receiveCctpMessage` — calls `CctpForwarder.mint_and_forward` to claim inbound USDC |
| `src/index.ts` | Barrel re-exports |

**Key protocol constraints**

- `CctpForwarder` is mandatory for all inbound Stellar transfers. Both `mintRecipient` and `destinationCaller` in the EVM burn call must be set to the `CctpForwarder` address.
- Stellar uses 7 decimal places; the CCTP wire format uses 6. The 7th decimal is always truncated (never rounded) on burn.
- Circle's Stellar attestation API returns `null` for decoded address fields — parse the raw `message` hex directly.

**Contracts**

| | TokenMessengerMinter | MessageTransmitter | CctpForwarder |
|---|---|---|---|
| Mainnet | `CAE2G5Z7…PNFTXL` | `CACMENFF…FVXAZV` | `CBZL2IH7…TZJDF5T` |
| Testnet | `CDNG7HXA…SLRTHP` | `CBJ6MTCK…AVVJY` | `CA66Q2WF…K4T4VSZ` |

**To use from the frontend**

```json
// autoramp-frontend/package.json
"@autoramp/stellar-cctp": "file:../stellar-cctp"
```

```typescript
import {
  buildCctpForwarderHookData,
  waitForAttestation,
  receiveCctpMessage,
} from "@autoramp/stellar-cctp";

// When building an EVM → Stellar burn transaction:
const hookData = buildCctpForwarderHookData("GABCD...STELLARADDRESS");

// After the EVM burn, wait for Circle's attestation:
const attestation = await waitForAttestation(messageHash, "testnet");

// Then submit the claim on Stellar:
const result = await receiveCctpMessage(config, { message, attestation });
```

---

### `docs/`

Mintlify-powered API reference site.

```
docs/
├── mint.json           Mintlify site config (navigation, theme)
├── introduction.mdx    Product overview
├── authentication.mdx  API key usage
├── quickstart.mdx      First-transaction walkthrough
├── openapi.json        OpenAPI 3.x spec for the backend REST API
└── api-reference/
    └── overview.mdx    API reference landing page
```

Run locally: `npx mintlify dev` from the `docs/` directory.

---

## Getting started

### Prerequisites

- Node.js 20+
- A backend instance reachable at `NEXT_PUBLIC_API_URL`

### Frontend

```bash
cd autoramp-frontend
npm install
cp .env.example .env.local   # fill in env vars (see below)
npm run dev
```

### Environment variables

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | Yes | Backend REST API base URL |
| `NEXT_PUBLIC_NETWORK` | Yes | `mainnet` or `testnet` |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | Yes | WalletConnect v2 project ID |
| `NEXT_PUBLIC_RPC_BASE` | No | Override Base mainnet RPC |
| `NEXT_PUBLIC_RPC_BASE_SEPOLIA` | No | Override Base Sepolia RPC |
| `NEXT_PUBLIC_RPC_MAINNET` | No | Override Ethereum mainnet RPC |
| `NEXT_PUBLIC_RPC_SEPOLIA` | No | Override Sepolia RPC |
| `NEXT_PUBLIC_RPC_POLYGON` | No | Override Polygon RPC |
| `NEXT_PUBLIC_RPC_POLYGON_AMOY` | No | Override Polygon Amoy RPC |
| `CLOUDINARY_CLOUD_NAME` | Yes (merchant KYB) | Cloudinary cloud name |
| `CLOUDINARY_API_KEY` | Yes (merchant KYB) | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | Yes (merchant KYB) | Cloudinary API secret |

### stellar-cctp

```bash
cd stellar-cctp
npm install
```

No build step is required when consumed as a local file dependency. If publishing, run `tsc` to emit to `dist/`.

---

## Scripts

From `autoramp-frontend/`:

| Script | Description |
|---|---|
| `npm run dev` | Start Next.js dev server on port 3000 |
| `npm run build` | Production build (webpack mode) |
| `npm run start` | Start production server |
| `npm run lint` | ESLint check |

---

## Architecture notes

**State**

Three Zustand stores live in `lib/store.ts`:
- `useAuthStore` — user identity + JWT, persisted to localStorage
- `useUIStore` — toast queue, sidebar open/closed
- `useTransactionStore` — transaction form fields and step machine (form → pending → execute → completed)

**API layer**

All backend calls go through the Axios instance in `lib/api.ts`. Domain-specific namespaces (`authApi`, `swapApi`, `bridgeApi`, `rampApi`, `otcApi`, …) are co-located in the same file. Each namespace is consumed by a corresponding hook in `lib/hooks/`.

**Swap proxy routes**

The 0x API requires server-side calls (API key + CORS). `app/api/swap/price/route.ts`, `quote/route.ts`, and `permit2-quote/route.ts` act as Next.js Route Handler proxies to keep secrets off the client.

**Multi-wallet support**

EVM wallets are managed by Wagmi + RainbowKit. Stellar wallets use `@solana/wallet-adapter-react`. The bridge hook (`use-bridge.ts`) detects which adapter to use based on the selected source chain.
