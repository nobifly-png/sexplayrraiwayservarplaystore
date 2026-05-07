# Backend deployment notes

## Super admin allowlist

Only these emails may hold `SUPER_ADMIN` (enforced at login, token refresh, `authenticate` middleware, and `npm run seed:admin`):

- `nitinchouhan1211@gmail.com`
- `sethusethu5073@gmail.com`

Optional env **`SUPER_ADMIN_ALLOWLIST`**: comma-separated extra emails (e.g. staging).  
**`SUPER_ADMIN_EMAIL`** used by the seed script must always be allowlisted.

Public registration never assigns `SUPER_ADMIN`. The seed script downgrades any `SUPER_ADMIN` whose email is not allowlisted.

## Reverse proxy and client IP (`TRUST_PROXY`)

Express derives `req.ip` from the socket connection unless **`trust proxy`** is configured. When the app runs behind a reverse proxy (nginx, Cloudflare, load balancer), the real client address is usually in **`X-Forwarded-For`** (or similar). Setting trust proxy correctly makes `req.ip`, **rate limiting**, **fraud checks**, **access logs**, and **auth** IP metadata align with the real client.

### Recommended settings

| Environment | `TRUST_PROXY` | Notes |
|-------------|---------------|--------|
| Local dev (direct to Node) | omit or `0` / `false` | Uses the TCP peer address only; do not trust `X-Forwarded-For`. |
| Single trusted reverse proxy | `1` | One hop; safest common production choice. |
| Multiple known proxies | `2`–`32` | Set to the number of **trusted** hops in front of Node. |

**Do not** set trust proxy to `true` (trust all hops) in production unless you fully understand the risk: clients can spoof `X-Forwarded-For` if the first untrusted hop accepts arbitrary values.

### Headers

Only the configured number of proxy hops is used when resolving `req.ip`. The app does **not** implement custom `X-Forwarded-For` parsing beyond Express’s built-in behavior (which depends on `trust proxy`).

### Application code

Use `getClientIp(req)` from `src/common/utils/ip.js` for a consistent normalized IP string in controllers and logs.

## Cloudflare R2

Upload endpoints require valid R2 env vars (non-placeholder). Without them, `/api/uploads/*` returns **400** with a clear message; the rest of the API still starts. Head-object verification after upload requires real credentials and a real object in the bucket (see sprint verification script labels).
