# JARVIS API

The JARVIS API is the central layer for the ecosystem. The WhatsApp bot, a future pairing portal, the web dashboard and a mobile app all talk to it instead of touching the bot's files or database.

It is **off by default**. Set `API_PORT` to turn it on. It listens on `API_HOST` (default `127.0.0.1`); put nginx with HTTPS in front to expose it.

## Environment

| Variable | Meaning |
| --- | --- |
| `API_PORT` | Port to listen on. Unset means the API is off. |
| `API_HOST` | Bind address. Default `127.0.0.1`. |
| `API_JWT_SECRET` | Secret for 15 minute JWTs. Without it a random per-boot secret is used (tokens stop working after a restart). |
| `API_CORS_ORIGINS` | Comma separated list of browser origins allowed to call the API. Default: none. |

No secrets live in the code or the repo.

## Layout

```
src/api/
  server.js        http server, request pipeline (CORS, rate limit, body, auth, validation, errors)
  routes.js        route table: method, path, role, body schema, handler
  controllers.js   validates input, shapes the response
  services/        all real work: botService, sessionService, keys, jwt, webhooks
  middleware.js    auth, RBAC, rate limiter, CORS, validation, security headers
  openapi.js       OpenAPI 3 document generated from routes.js
  events/bus.js    in-process event bus used by webhooks
  logger.js        structured JSON logs with redaction
```

Rules: routes only map URLs, controllers never touch files or the database, services own the logic. To add an endpoint, add a service function, a controller function and one line in `routes.js`. The OpenAPI docs update themselves.

## Responses

Success: `{"success":true,"data":{...}}`. Error: `{"success":false,"error":{"code":"forbidden","message":"..."}}`. Every response has an `x-request-id` header.

## Authentication and roles

Roles, lowest to highest: `readonly`, `service`, `admin`, `owner`.

1. The owner creates a key in a private chat with the bot: `/apikey create <name> <role>`. The key is shown once and only its hash is stored. `/apikey list` and `/apikey revoke <id>` manage keys.
2. Send it as the `X-API-Key` header, or trade it for a 15 minute token: `POST /api/v1/auth/token` with the key header returns a Bearer JWT.
3. Each route lists its minimum role in the docs.

## Endpoints (v1)

| Method and path | Role | What it does |
| --- | --- | --- |
| GET /health | none | Liveness |
| POST /auth/token | key | Trade a key for a JWT |
| GET /auth/me | readonly | Caller id and role |
| GET /bot/status | readonly | Online, connection, version, uptime |
| GET /bot/runtime | service | RAM, CPU, disk, command counters |
| POST /bot/restart | owner | Restart the process. Body `{"confirm":true}` |
| GET, POST /keys, DELETE /keys/:id | admin | Manage API keys |
| GET /sessions, GET /sessions/:id | service | WhatsApp session status (never credentials) |
| DELETE /sessions/:id | owner | Log the session out. Body `{"confirm":true}`. The number must be paired again. |
| GET /pairing/capabilities | service | What pairing supports today |
| POST /pairing/requests | admin | Reserved for the pairing portal. Returns 501 now. |
| GET /events/types | readonly | Event names for webhooks |
| GET, POST /webhooks, DELETE /webhooks/:id, POST /webhooks/:id/test | admin | Manage webhooks |

Interactive docs: `/api/v1/docs` (Swagger UI). Raw spec: `/api/v1/openapi.json`.

## Webhooks

Create one with `POST /webhooks {"url":"https://...","events":["connection.changed"]}`. The signing secret is returned once. The URL must be HTTPS and must not resolve to a private, loopback or link-local address; this is checked again on every delivery.

Each delivery is a JSON POST with headers `x-jarvis-event`, `x-jarvis-timestamp` and `x-jarvis-signature`. The signature is `sha256=` plus the HMAC-SHA256 of `<timestamp>.<raw body>` using your secret. Reject deliveries whose timestamp is older than 5 minutes. A non-2xx answer is retried after 5 seconds, 30 seconds and 5 minutes, then dropped. Events: `connection.changed`, `session.revoked`, `bot.restart`, `webhook.test`.

## What the API never does

- It never returns WhatsApp credentials, session files, API keys or secrets. Session views show a masked account (`91********10`).
- There is no endpoint that runs code, shell commands or arbitrary file paths.
- Logs redact tokens, keys, numbers and JIDs.
