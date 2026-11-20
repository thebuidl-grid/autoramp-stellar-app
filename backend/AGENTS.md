# AGENTS.md

NestJS 11 backend for Autoramp (on/off-ramp, token swaps, merchant KYC, VAS). TypeScript compiled with **SWC** (`nest-cli.json` `compiler: "swc"`), Prisma 6 + PostgreSQL, BullMQ + Redis for background queues, Passport JWT auth, Swagger (dev only).

## Commands

Use **npm** (CI runs `npm ci` on Node 20). Both `package-lock.json` and `yarn.lock` are committed, but CI/README assume npm.

| Task | Command |
|------|---------|
| Dev server (watch) | `npm run start:dev` |
| Build | `npm run build` (SWC via `nest build`) |
| Prod run | `npm run start:prod` (runs `dist/main`) |
| Type-check | `npx tsc --noEmit` |
| Lint (auto-fix) | `npm run lint` |
| Format | `npm run format` (prettier: singleQuote, trailingComma all) |
| Unit tests | `npm test` (jest, `rootDir: src`, matches `*.spec.ts`) |
| E2E tests | `npm run test:e2e` (config `test/jest-e2e.json`, matches `.e2e-spec.ts`) |
| Prisma generate | `npm run generate` |
| Migrate | `npm run migrate` = `prisma migrate deploy` (no auto `dev`/`generate`) |
| Webhook worker | `npm run worker:webhook` (separate process) |
| Audit worker | `npm run worker:audit` |
| Both workers | `npm run worker` |

## Architecture

- Feature modules under `src/modules/`: `ramp` (on/off-ramp), `swap`, `otc`, `bridge`, `blockradar`, `safehaven`/`pulsemfb`/`bitnob` (providers), `merchants`, `user`, `auth`, `admin`, `webhook`, `vas`, `analytics`.
- Fiat transfer provider is selected at runtime by `FIAT_TRANSFER_PROVIDER` (`SAFEHAVEN` | `PULSE_MFB`); see `src/modules/providers/`.
- `src/common/` holds cross-cutting guards, interceptors, pipes, and `audit`/`balance-cache` services. `src/config/` holds env validation + factories.
- Webhook and audit **workers are standalone processes** bootstrapped with `NestFactory.createApplicationContext(...)` (not the HTTP app), driven by BullMQ over `REDIS_URL`. The API enqueues; workers dequeue.
- Some source files import with an `src/...` prefix (e.g. `src/modules/admin/transactions/...`). Jest maps it via `moduleNameMapper`; `tsconfig` `baseUrl` resolves it for tsc/build.

## Gotchas

- **Env is validated at boot** (`src/config/env.validation.ts`, Joi). Missing required vars crash startup: `JWT_SECRET`, `DATABASE_URL`, `RESEND_API_KEY`, and all `SAFEHAVEN_*`. Env is loaded from `.env.local` then `.env` (`app.module.ts`).
- **Prisma `relationMode = "prisma"`** in `schema.prisma`: no DB-level foreign keys; relations are emulated in the client. Don't add `@db.*` FK assumptions.
- **`rawBody: true`** is set in `main.ts` and is required for Bitnob webhook HMAC-SHA512 verification (`x-bitnob-signature` over raw bytes). Don't remove it.
- Global `ValidationPipe` uses `whitelist: true, forbidNonWhitelisted: true, transform: true` — DTOs must declare every accepted field; unknown fields are rejected.
- Global `APP_GUARD` = `CustomThrottlerGuard` (rate limits defined in `app.module.ts`). Auth guards live in `src/modules/auth/guards` and `src/common/guards`.
- `schema.sql` at repo root is a **legacy raw SQL dump**, separate from `prisma/migrations/`. Prisma is the source of truth.
- `src/_archive/deprecated-swap.ts` (and `dist/_archive/`) is dead/archived code — ignore it.
- One-off ops scripts live in `scripts/` and `src/scripts/` and are run directly with ts-node, e.g. `npx ts-node -r tsconfig-paths/register scripts/reconcile-safehaven-transfers.ts`. They are not in `package.json` scripts.
- `.env`, `.env.old`, `hello.json`, and `scripts/generate-token.ts` are gitignored but present locally — never commit them.
- Swagger UI is only mounted when `NODE_ENV === 'development'` at `/docs`.

## Instawards SOW (30-day scope)

`docs/Instawards_SOW_Autoramp.pdf` (gitignored, kept local) is the signed Statement of Work for a 30-day Stellar Instaward. **Testnet-only** — no real funds or fiat settlement. Anticipated next step: SCF Build Award application.

Deliverables are tracked as session todos; **mark each todo completed as soon as its deliverable ships**:

- [ ] **D1 — Hardened testnet off-ramp** (USDC deposit → conversion → simulated fiat payout). Handle failure paths (timeout, partial settlement, rejected payout, reversal, insufficient liquidity), persistent transaction status model surfaced in UI, structured reconciliation logging per cash-out attempt. ($2,200)
- [ ] **D2 — Cross-chain USDC deposit route** (Base → Stellar via Allbridge or equivalent) feeding the off-ramp: deposit detection, status tracking across both chains, delayed/stuck bridge-transfer handling. ($1,700)
- [ ] **D3 (optional) — Public testnet demo + evidence pack**: reviewer demo with test credentials + funded testnet accounts, recorded walkthrough of both flows, setup/usage docs, written test report (scenarios run, pass/fail, issues found/resolved, known limitations). ($350 evidence + $450 infra + $300 QA)

Out of scope: chains beyond the single Base route, native mobile apps, custom Soroban contracts, load/stress testing, admin dashboard.

Weekly plan: W1 state machine + logging · W2 failure paths + begin cross-chain · W3 complete cross-chain e2e + QA · W4 fix/stabilize, deploy demo, submit evidence pack.

## Docs

API reference markdown lives in `docs/` (`ADMIN_API.md`, `MERCHANT_BANK_API.md`, `OTC_DEVELOPER_GUIDE.md`, `FRONTEND_API_REFERENCE.md`, etc.) and `WEBHOOK_RETRY.md` documents the merchant webhook delivery/retry contract.
