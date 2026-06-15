# Contributing to AutoRamp Stellar App

Thanks for taking the time to contribute. This document covers the development workflow, conventions, and pull request process for all packages in this monorepo.

---

## Table of contents

- [Repo structure](#repo-structure)
- [Setting up locally](#setting-up-locally)
- [Development workflow](#development-workflow)
- [Branching strategy](#branching-strategy)
- [Commit conventions](#commit-conventions)
- [Pull request process](#pull-request-process)
- [Code conventions](#code-conventions)
- [Adding a new feature](#adding-a-new-feature)
- [Environment variables](#environment-variables)
- [Working with the stellar-cctp package](#working-with-the-stellar-cctp-package)

---

## Repo structure

```
autoramp-stellar-app/
├── autoramp-frontend/    Next.js app — main product
├── stellar-cctp/         Circle CCTP Stellar package
└── docs/                 Mintlify API docs
```

Each package is independent — there is no shared root `package.json`. Changes to one package do not automatically affect the others.

---

## Setting up locally

### Requirements

- Node.js 20 or later
- npm 10 or later
- Git

### Clone and install

```bash
git clone https://github.com/thebuidl-grid/autoramp-stellar-app.git
cd autoramp-stellar-app

# Frontend
cd autoramp-frontend
npm install

# Stellar CCTP package
cd ../stellar-cctp
npm install
```

### Environment

Copy the example env file and fill in the values:

```bash
cd autoramp-frontend
cp .env.example .env.local
```

Minimum vars needed to run locally:

```env
NEXT_PUBLIC_API_URL=http://localhost:4000        # backend URL
NEXT_PUBLIC_NETWORK=testnet
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=<your-id>
```

See the [README](README.md#environment-variables) for the full list.

### Start the dev server

```bash
cd autoramp-frontend
npm run dev
```

The app will be at `http://localhost:3000`.

---

## Development workflow

1. Pick or create a GitHub issue for the work you want to do.
2. Create a branch off `main` following the naming scheme below.
3. Make your changes in small, focused commits.
4. Open a pull request against `main` when the work is ready for review.
5. Address review feedback, then merge once approved.

---

## Branching strategy

| Branch | Purpose |
|---|---|
| `main` | Stable, deployable code. All PRs target this branch. |
| `feat/<short-description>` | New feature |
| `fix/<short-description>` | Bug fix |
| `chore/<short-description>` | Tooling, deps, config, docs |
| `refactor/<short-description>` | Code restructuring without behaviour change |

Keep branch names lowercase and hyphen-separated. Examples:

```
feat/stellar-usdc-receive
fix/bridge-chain-switch
chore/upgrade-tanstack-query
```

---

## Commit conventions

Follow [Conventional Commits](https://www.conventionalcommits.org/). The format is:

```
<type>(<scope>): <short summary>
```

**Types**

| Type | When to use |
|---|---|
| `feat` | New user-facing feature |
| `fix` | Bug fix |
| `chore` | Build, tooling, dependency updates |
| `refactor` | Code change with no behaviour change |
| `docs` | Documentation only |
| `test` | Test additions or changes |
| `style` | Formatting, whitespace — no logic change |

**Scope** (optional) — the package or area affected: `frontend`, `stellar-cctp`, `docs`, `bridge`, `swap`, `auth`, etc.

Examples:

```
feat(stellar-cctp): add waitForAttestation polling helper
fix(bridge): handle chain switch failure gracefully
chore(frontend): upgrade wagmi to v2.19
docs: update CCTP integration notes in README
```

One logical change per commit. Avoid "WIP" commits in PRs — squash or rebase before requesting review.

---

## Pull request process

1. **Scope** — one concern per PR. A feature PR should not also refactor unrelated code.
2. **Title** — use the same `<type>(<scope>): <summary>` format as commits.
3. **Description** — explain *why* the change is needed and what it does. Link the related issue.
4. **Tests** — if the change is testable, include tests or explain why they are not applicable.
5. **Self-review** — read your own diff before requesting review. Remove debug logs, commented-out code, and TODO comments that belong in issues.
6. **Reviewers** — request at least one reviewer. Do not merge your own PR without approval.
7. **Merge** — use squash merge to keep `main` history clean. The PR title becomes the squash commit message.

---

## Code conventions

### TypeScript

- Strict mode is enabled (`"strict": true` in `tsconfig.json`). Do not disable it with `// @ts-ignore` unless there is a genuine third-party typing gap — add a short comment explaining why.
- Prefer explicit return types on exported functions.
- Use `type` imports (`import type { Foo }`) where only the type is needed.

### React / Next.js

- All client components that use hooks or browser APIs must have `"use client"` at the top.
- Keep components focused. If a component file exceeds ~200 lines, consider splitting presentation from logic.
- State that is used in only one component stays local (`useState`). State shared across sibling components belongs in Zustand. Data that comes from the server belongs in TanStack Query.
- Avoid prop drilling beyond two levels — lift state or use Zustand.

### Hooks

- One hook file per domain concern, co-located in `lib/hooks/`.
- Every hook that calls the backend should use TanStack Query (`useQuery` or `useMutation`) — do not `fetch` or call Axios directly from components.
- Export hooks as named functions, not default exports.

### Styling

- Use Tailwind utility classes directly on JSX elements.
- Use `cn(...)` (from `lib/utils.ts`) to conditionally combine class names.
- Do not add inline `style` props unless you need a dynamic value that cannot be expressed in Tailwind.
- Radix UI primitives are the default choice for interactive components (Dialog, Select, Tabs, etc.).

### Comments

- Do not comment what the code does — name things so the code explains itself.
- Only add a comment when the **why** is non-obvious: a hidden constraint, a platform quirk, or a workaround for a specific bug.

### Error handling

- Validate user input at the form boundary with Zod schemas.
- Surface errors to the user via the `useToast` hook.
- Log unexpected errors to the console in development; do not swallow them silently.

---

## Adding a new feature

### New page route

1. Create `app/<route>/page.tsx`.
2. If the page should be protected, wrap it with `AdminProtected` or `MerchantProtected` from `components/auth/`.
3. Add a link to it in the relevant sidebar component (`AdminSidebar`, `MerchantSidebar`, `OtcSidebar`).

### New API namespace

1. Add typed DTOs and a namespace object to `lib/api.ts`.
2. Create a corresponding hook file in `lib/hooks/use-<domain>.ts`.
3. Export the hook from `lib/hooks/index.ts`.

### New chain support

1. Add the chain to `SUPPORTED_CHAINS` in `lib/constants/networks.ts`.
2. Add its USDC address to `USDC_ADDRESSES` in `lib/constants/bridge-constants.ts`.
3. Add its chain metadata (name, logo) to `CHAIN_METADATA`.
4. Update `getChainId` and `getRpcUrl` to handle the new chain.

### New supported token

1. Add the address and decimals to `SWAP_CONSTANTS` in `lib/constants/swap-constants.ts`.
2. Add the token to the `CryptoType` union in `lib/store.ts`.
3. Add a logo to `autoramp-frontend/public/` and wire it up in the crypto selection modal.

---

## Environment variables

Never commit real secrets or private keys. Keep `.env.local` in `.gitignore` (it already is).

If you need to add a new environment variable:

1. Add it to `.env.example` with a placeholder value and a short comment.
2. Document it in the [README environment variables table](README.md#environment-variables).
3. For client-side vars, prefix with `NEXT_PUBLIC_`.
4. For server-only vars (API keys, Cloudinary secrets), do **not** prefix with `NEXT_PUBLIC_`.

---

## Working with the stellar-cctp package

The `stellar-cctp/` package is consumed by the frontend as a local file dependency. When you make changes to it, the frontend picks them up immediately (no build step needed in dev).

**Key files**

| File | What to touch when… |
|---|---|
| `src/constants.ts` | Updating contract addresses or adding a new network |
| `src/hook-data.ts` | The CCTP hook data layout changes upstream |
| `src/decimals.ts` | Circle changes decimal handling for Stellar |
| `src/attestation.ts` | Changing poll interval or attestation API base URL |
| `src/send.ts` | Modifying outbound burn argument encoding |
| `src/receive.ts` | Modifying inbound `mint_and_forward` call or event parsing |

**Testing locally**

There is no test suite yet. To verify CCTP changes manually:

1. Set `NEXT_PUBLIC_NETWORK=testnet`.
2. Get testnet USDC on Stellar via Circle's testnet faucet.
3. Use the bridge tab in the frontend (or write a one-off script) to exercise `burnUsdcOnStellar` and `receiveCctpMessage`.
4. Verify the attestation is fetched via Circle's [Iris API sandbox](https://iris-api-sandbox.circle.com).

**Adding a test suite**

Add a `test/` directory under `stellar-cctp/` and use Vitest or Jest. Unit-test the pure functions in `decimals.ts` and `hook-data.ts` first — they have no external dependencies.

---

## Questions

Open a GitHub Discussion or ping the team in the project Slack channel.
