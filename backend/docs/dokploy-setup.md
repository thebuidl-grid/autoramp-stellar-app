# Dokploy Deployment + Cloudflare Tunnel

How the Autoramp backend is deployed on the Dokploy server and exposed publicly through a Cloudflare Tunnel.

**Public URL:** `https://api-autoramp.thebuidl.xyz`

## Architecture

```
Client ──HTTPS──▶ Cloudflare edge (TLS, DNS)
                      │  (outbound-only tunnel, no open inbound ports)
                      ▼
          api-autoramp-tunnel  (Swarm service, cloudflared)
                      │  dokploy-network (overlay)
                      ▼
          autoramp-autorampservice-djlugc:4000  (NestJS API)
                      │
          ├── autoramp-autorampredis-dj7rpa:6379  (Redis / BullMQ)
          └── Postgres (external, Railway)
```

- The tunnel connects **straight to the app container**. It does not go through Dokploy's Traefik, so you don't need a domain in Dokploy for this app.
- Cloudflare handles TLS. Inside the server, traffic between the tunnel and the app is plain HTTP on the overlay network.
- This tunnel is separate from the host-level systemd tunnel (`dokploy-tunnel-nm`, `/etc/cloudflared/config.yml`). That one serves `gateway.thebuidl.xyz` and `b2.thebuidl.xyz` through Traefik. Don't mix the two.

## 1. App service (Dokploy)

| Setting | Value |
|---|---|
| Build | `Dockerfile` at repo root (multi-stage, pnpm, Node 20 alpine) |
| Container port | `4000` (`ENV PORT=4000` in Dockerfile) |
| Swarm service name | `autoramp-autorampservice-djlugc` |
| Network | `dokploy-network` |
| Start command | `node dist/main` |

### Required environment variables

Env is validated at boot (`src/config/env.validation.ts`). If a required variable is missing, the app crashes on startup. Set these in Dokploy → App → **Environment**:

- `DATABASE_URL`: Postgres connection string (see [Troubleshooting](#app-crash-loops-with-p1001) for Railway)
- `REDIS_URL`: e.g. `redis://autoramp-autorampredis-dj7rpa:6379`
- `JWT_SECRET`
- `RESEND_API_KEY`
- all `SAFEHAVEN_*` variables
- `FIAT_TRANSFER_PROVIDER` (`SAFEHAVEN` | `PULSE_MFB`)
- CORS allowed origins: must include the frontend domain(s)

> Migrations aren't run on deploy. Run `npm run migrate` (`prisma migrate deploy`) against the target database when the schema changes.

### Workers

The webhook and audit workers are separate processes (`npm run worker:webhook`, `npm run worker:audit`). The API image's `CMD` only starts the HTTP app. If you need the workers, deploy them as extra Dokploy services from the same image with a command override, e.g. `node dist/workers/...`. Check the compiled path in `dist/`.

## 2. Cloudflare Tunnel

### Components

| Item | Name / ID |
|---|---|
| Tunnel (locally managed) | `api-autoramp`: `df74cb74-a349-45ea-b03e-d2c4b79c4126` |
| Credentials file (host) | `~/.cloudflared/df74cb74-a349-45ea-b03e-d2c4b79c4126.json` |
| Swarm service | `api-autoramp-tunnel` (`cloudflare/cloudflared:latest`) |
| Swarm config (ingress) | `api-autoramp-tunnel-config` → `/etc/cloudflared/config.yml` |
| Swarm secret (creds) | `api-autoramp-tunnel-creds` → `/etc/cloudflared/creds.json` |
| DNS | CNAME `api-autoramp.thebuidl.xyz` → `<tunnel-id>.cfargotunnel.com` |

### Ingress config

```yaml
tunnel: df74cb74-a349-45ea-b03e-d2c4b79c4126
credentials-file: /etc/cloudflared/creds.json
ingress:
  - hostname: api-autoramp.thebuidl.xyz
    service: http://autoramp-autorampservice-djlugc:4000
  - service: http_status:404
```

### Setup from scratch

Run these on the Dokploy manager node, as a user with Docker access and `~/.cloudflared/cert.pem`:

```bash
# 1. Create the tunnel (skip if it already exists)
cloudflared tunnel create api-autoramp

# 2. Store ingress config + credentials in Swarm
docker config create api-autoramp-tunnel-config ./api-autoramp-config.yml
docker secret create api-autoramp-tunnel-creds ~/.cloudflared/<TUNNEL_ID>.json

# 3. Run cloudflared on dokploy-network
#    (uid/gid 65532 = the cloudflared image's nonroot user, so it can read the secret)
docker service create --name api-autoramp-tunnel \
  --network dokploy-network \
  --restart-condition any \
  --config source=api-autoramp-tunnel-config,target=/etc/cloudflared/config.yml,mode=0444 \
  --secret source=api-autoramp-tunnel-creds,target=/etc/cloudflared/creds.json,uid=65532,gid=65532,mode=0400 \
  cloudflare/cloudflared:latest \
  tunnel --no-autoupdate --config /etc/cloudflared/config.yml run

# 4. Point DNS at the tunnel
cloudflared tunnel route dns api-autoramp api-autoramp.thebuidl.xyz
```

### Changing the ingress (new hostname, port, or target)

Swarm configs can't be changed in place. Create a new version and swap it in:

```bash
docker config create api-autoramp-tunnel-config-v2 ./api-autoramp-config.yml
docker service update \
  --config-rm api-autoramp-tunnel-config \
  --config-add source=api-autoramp-tunnel-config-v2,target=/etc/cloudflared/config.yml,mode=0444 \
  api-autoramp-tunnel
docker config rm api-autoramp-tunnel-config   # optional cleanup
```

For a new hostname, also run `cloudflared tunnel route dns api-autoramp <hostname>`.

> If Dokploy renames the app service (e.g. after the app is recreated), update the `service:` target in the ingress config.

## 3. Verification

```bash
# Tunnel has active edge connections
cloudflared tunnel info api-autoramp

# Tunnel logs
docker service logs --tail 50 api-autoramp-tunnel

# App reachable on the overlay network
docker run --rm --network dokploy-network curlimages/curl -s -o /dev/null -w '%{http_code}\n' \
  http://autoramp-autorampservice-djlugc:4000/

# Public endpoint
curl -i https://api-autoramp.thebuidl.xyz/
```

## 4. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `502` / Cloudflare "Bad gateway" | App container not running or not listening on 4000 | `docker service ps autoramp-autorampservice-djlugc` and `docker service logs` for the app |
| `530` / error 1033 | Tunnel has no connections | Check `docker service logs api-autoramp-tunnel`; confirm the secret matches the tunnel ID |
| `404` from tunnel | Hostname not in ingress rules | Update the ingress config (see above) |
| Deploy shows "done" but the service still has old env values | New container failed on boot, so Swarm rolled back to the previous spec (`UpdateConfig.FailureAction = rollback`) | `docker service inspect <svc> --format '{{json .UpdateStatus}}'` shows `rollback_completed`. Fix the boot error (e.g. bad DB credentials, `P1000`), then redeploy |
| CORS errors in browser | Frontend origin not allowed | Add the origin to the CORS env var; check the `CORS allowed origins:` boot log |

### App crash loops with `P1001`

`PrismaClientInitializationError: Can't reach database server at postgres-production-aef4.up.railway.app:5432`

On Railway, `*.up.railway.app` is the **HTTP** domain and doesn't accept Postgres connections on 5432. For connections from outside Railway, use the **TCP proxy** address. You'll find it in Railway → Postgres → Settings → Networking, or in the `DATABASE_PUBLIC_URL` variable. It looks like `postgresql://...@<name>.proxy.rlwy.net:<port>/railway`. Update `DATABASE_URL` in Dokploy and redeploy.

Current value: `postgresql://postgres:<password>@interchange.proxy.rlwy.net:23375/railway`. Copy it whole from Railway's `DATABASE_PUBLIC_URL`. A wrong password gives `P1000` and triggers the Swarm rollback described above.

## 5. Known issues / TODO

- **Rate limiting behind the tunnel.** `main.ts` doesn't set `trust proxy`, so `req.ip` is the tunnel container's IP for every request. `CustomThrottlerGuard` then rate-limits all users as a single client. To fix, key the throttler on the `cf-connecting-ip` header, or enable `trust proxy` and read `X-Forwarded-For`.
- **Lock down origin exposure.** Since all public traffic goes through the tunnel, you can firewall inbound 80/443 on the server. Keep SSH and the Dokploy UI (`:3000`) restricted or behind Cloudflare Access.
- **Unused tunnels.** `cloudflared tunnel list` shows several tunnels with no connections (`dokploy-tunnel`, `infra-main`, `nexus-api`, `agromart-admin-frontend`). Check whether you still need them and delete the ones you don't.
