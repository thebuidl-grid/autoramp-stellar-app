# AutoRamp Frontend 




Docs WIP. Auto deploy on dokploy. Test dokploy!




## Backend API access (server-side proxy)

The browser never calls the backend directly. All API calls go to the same-origin proxy
`/api/backend/*` (`app/api/backend/[...path]/route.ts`), which forwards to the real backend.

- Set **`API_URL`** (server-only, read at runtime) to the backend base URL, e.g. `https://api.example.com`.
- **Remove `NEXT_PUBLIC_API_URL`** from the build and runtime env. Anything prefixed `NEXT_PUBLIC_` is inlined
  into client JS; the proxy still falls back to it only as a transition aid for deployments that haven't set `API_URL`.
- `NEXT_PUBLIC_DOCS_API_URL` is the public API URL shown to merchants on `/docs` (intentionally public).
- Still exposed: `NEXT_PUBLIC_WS_URL` (the swap WebSocket cannot go through a Next route handler).

The proxy forwards only an allowlist of headers, forwards the visitor's IP as `cf-connecting-ip` so backend
per-IP rate limits stay per visitor, and returns generic 502/504 errors that never include the backend URL.
