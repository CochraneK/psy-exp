# psy-exp reference research backend

This directory contains a zero-dependency Node reference server used to verify the browser replica contract in CI.

Run locally:

```bash
PSY_EXP_API_TOKEN='development-only-token' \
PSY_EXP_ALLOWED_ORIGINS='http://127.0.0.1:8000' \
node server/research-backend.cjs
```

The default endpoint is `http://127.0.0.1:8787`. Browser configuration accepts insecure HTTP only for loopback development; non-local replica endpoints must use HTTPS.

The server supports health, authenticated study-bundle PUT/GET, and participant-scoped deletion. It writes JSON atomically with restrictive permissions and keeps a backup before overwrite/delete.

Do **not** treat this file-backed reference server as a production research data platform. Production deployment needs managed authentication/authorization, encrypted database and backups, secret management, retention enforcement, monitoring and operational recovery. See [`../docs/BACKEND_V1.md`](../docs/BACKEND_V1.md).