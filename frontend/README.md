# AutoRamp — Frontend

The web app for **AutoRamp**, a cross-border payments app that moves money between local currency and stablecoins, and between stablecoins on different blockchains. It currently supports **Nigeria (NGN), Ghana (GHS) and Kenya (KES)**.

The backend API lives in [`../backend`](../backend); its README covers corridors, setup and the full feature list. For the architecture reference, see [`../docs.md`](../docs.md).

## What you can do in the app

### Home page (`/`)
- **Buy:** pay local currency and receive a stablecoin. Nigeria and Ghana pay by bank transfer to a virtual account. **In Kenya you enter your M-Pesa number (+254) and approve the payment prompt on your phone**, then receive CKES.
- **Sell:** send a stablecoin and receive local currency: to a bank account in Nigeria and Ghana, or **to your M-Pesa wallet in Kenya**. The app verifies the account holder's name before you send anything.
- **Swap:** trade one stablecoin for another on the same chain, such as CKES ↔ USDC ↔ CNGN on Stellar, or tokens on an EVM chain.
- **Cross-chain:** receive, send or bridge USDC between Stellar and EVM chains (Base, Ethereum, Arbitrum, Optimism, Polygon, Avalanche). You can convert it into a different stablecoin on arrival.
- **Live status:** transaction progress updates in real time over WebSocket.

### Wallets
- **Stellar:** Freighter by default, plus every other wallet [Stellar Wallets Kit](https://stellarwalletskit.dev) supports.
- **EVM:** any browser-injected wallet, such as MetaMask.
- The app never holds your keys. Swaps and bridge burns are signed in your own wallet.

### Other pages
| Route | What it's for |
|---|---|
| `/auth/signup` | Sign up or log in with email plus a one-time code (no password) |
| `/history` | Your onramp, offramp and swap history |
| `/profile` | Your account details |
| `/dashboard/api-keys` | View your API keys and their usage |
| `/merchant/login`, `/merchant/dashboard` | Merchant portal: create API keys and see stats (requires admin-approved API access) |
| `/admin/*` | Admin portal: users, API keys, transactions and analytics |
| `/docs` | Merchant API reference |

## Tech stack

- **Framework:** Next.js 16 (App Router), React 19 and Tailwind CSS 4, with Radix UI primitives.
- **State and data:** Zustand for client state (auth, wallets, form flow) and TanStack Query for server data. HTTP goes through axios, and live updates come over Socket.IO.
- **Wallets and chains:** `@stellar/stellar-sdk` and Stellar Wallets Kit for Stellar. EVM transactions go through the injected wallet provider.

## Getting started

```bash
npm install
cp .env.example .env.local   # then adjust as needed
npm run dev                  # http://localhost:3000
```

Run the backend alongside it, with its `PORT` matching `NEXT_PUBLIC_API_URL` below.

### Environment variables
| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_API_URL` | Backend API base URL. Defaults to `http://localhost:3001` if unset. |
| `NEXT_PUBLIC_WS_URL` | Backend WebSocket URL for live transaction status |
| `NEXT_PUBLIC_STELLAR_NETWORK` | `testnet` (default) or `mainnet`. **It must match the backend's `STELLAR_NETWORK`**, or wallet-signed transactions go to the wrong network. |
| `NEXT_PUBLIC_STELLAR_HORIZON_URL` | Optional Horizon override. Defaults to the testnet or mainnet Horizon URL based on the flag above. |

### Local sign-in without email
If the backend has no working email provider, set `OTP_DEV_RETURN_CODE=true` in the backend `.env` (development only). The sign-up screen will then fill in the one-time code for you.

## Scripts

```bash
npm run dev     # development server
npm run build   # production build
npm run start   # serve the production build
npm run lint    # ESLint
```

There's no automated frontend test suite yet. Check changes with `npx tsc --noEmit`, `npm run build`, and a manual pass through the flows above.
