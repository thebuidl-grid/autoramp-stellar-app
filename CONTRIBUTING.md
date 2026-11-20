# Contributing to AutoRamp Stellar App

Thanks for taking the time to contribute. This document covers the development workflow, conventions, and pull request process for the backend, frontend and docs in this repo.

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

---

## Repo structure

```
autoramp-stellar-app/
├── backend/     NestJS API (Prisma, Postgres): ramps, swaps, bridge, admin, webhooks
├── frontend/    Next.js app: the product, the admin console and the merchant dashboard
└── docs/        Mintlify API docs (docs.json, MDX pages, openapi.yaml)
```

`backend/` and `frontend/` are independent packages with their own `package.json`. There is no shared root `package.json`, so a change in one does not affect the other. They are kept in step with the `autoramp-backend` and `autoramp-frontend` repos.

---

## Setting up locally

### Requirements

- Node.js 20 or later
- npm 10 or later
- PostgreSQL (for the backend)
- Git

### Clone and install

```bash
git clone https://github.com/thebuidl-grid/autoramp-stellar-app.git
cd autoramp-stellar-app

# Backend
cd backend
npm ci

# Frontend
cd ../frontend
npm ci
```

### Environment

**Backend.** Copy the example env file and fill in the values (database URL, provider keys, JWT secret):

```bash
cd backend
cp .env.example .env
```

Run it on a port other than 3000 so it does not clash with the frontend:

```env
PORT=4000
```

**Frontend.** Create `frontend/.env.local`. Minimum vars needed to run locally:

```env
API_URL=http://localhost:4000                    # backend URL, used by the server-side proxy
NEXT_PUBLIC_NETWORK=testnet
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=<your-id>
```

The browser never calls the backend directly: it goes through the Next.js proxy at `/api/backend`, which forwards to `API_URL`. See the [README](README.md#environment-variables) for the full list.

### Start the dev servers

```bash
# Terminal 1
cd backend
npx prisma migrate deploy      # apply migrations to your local database
npm run start:dev

# Terminal 2
cd frontend
npm run dev
```

The app will be at `http://localhost:3000` and the API at `http://localhost:4000`.

### Run the tests

```bash
cd backend && npm test
cd frontend && npm test
```

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

**Scope** (optional) — the package or area affected: `frontend`, `backend`, `docs`, `bridge`, `swap`, `auth`, etc.

Examples:

```
feat(bridge): add an attestation polling helper
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

1. Create `frontend/app/<route>/page.tsx`.
2. If the page should be protected, wrap it with `AdminProtected` or `MerchantProtected` from `frontend/components/auth/`.
3. Add a link to it in the relevant navigation: the admin sidebar (`frontend/components/admin/layout/nav.ts`), the merchant top navigation (`frontend/components/merchant/layout/nav.ts`) or the OTC sidebar.

### New API namespace

1. Add typed DTOs and a namespace object to `frontend/lib/api.ts`.
2. Create a corresponding hook file in `frontend/lib/hooks/use-<domain>.ts`.
3. Export the hook from `frontend/lib/hooks/index.ts`.

### New chain support

1. Add the chain to `SUPPORTED_CHAINS` in `frontend/lib/constants/networks.ts`.
2. Add its USDC address to `USDC_ADDRESSES` in `frontend/lib/constants/bridge-constants.ts`.
3. Add its chain metadata (name, logo) to `CHAIN_METADATA`.
4. Update `getChainId` and `getRpcUrl` to handle the new chain.

### New supported token

1. Add the address and decimals to `SWAP_CONSTANTS` in `frontend/lib/constants/swap-constants.ts`.
2. Add the token to the `CryptoType` union in `frontend/lib/store.ts`.
3. Add a logo to `frontend/public/` and wire it up in the crypto selection modal.

---

## Environment variables

Never commit real secrets or private keys. `.env` (backend) and `.env.local` (frontend) are in `.gitignore`.

If you need to add a new environment variable:

1. Backend: add it to `backend/.env.example` with a placeholder value and a short comment, and validate it in `backend/src/config/env.validation.ts`.
2. Frontend: document it in the [README environment variables table](README.md#environment-variables).
3. For client-side frontend vars, prefix with `NEXT_PUBLIC_`.
4. For server-only vars (API keys, secrets), do **not** prefix with `NEXT_PUBLIC_`.

### Database changes

Schema changes go through a Prisma migration in `backend/prisma/migrations/`. Keep migrations additive where you can, write a rollback in `backend/prisma/rollbacks/` for anything destructive, and test them on a copy of the data before they run against a real database.

---

## Docs

`docs/` is a Mintlify site (`docs.json` for the navigation, one MDX page per topic, `openapi.yaml` for the API reference). Update it in the same PR as the API change it describes.

---

## Questions

Open a GitHub Discussion or ping the team in the project Slack channel.
