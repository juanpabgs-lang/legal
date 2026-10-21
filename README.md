# Norfront

Predictive client acquisition for law firms. The back-end reads public records, maps knock-on effects, scores who is about to need advice, routes each opportunity to the partner with the warmest tie, and drafts the approach.

The Deep Swarm is the last piece. Until its API is wired in, a built-in simulated swarm does the three AI tasks (detect, predict, draft). Switching over is one mapping file and three environment variables.

## Quick start

```bash
# Postgres 16 on localhost, user/password/db: norfront
npm install
npm run db:migrate
npm run seed:demo
npm run dev          # API on :3000, OpenAPI at /docs
npm run dev:worker   # optional background jobs
```

Default demo login after `seed:demo`:

- BD admin: `bd@halevenner.test` / `hale-venner-admin`
- Commercial partner: `james.ellison@halevenner.test` / `partner-pass-1`

No real email is sent. Messages land in the test outbox (`GET /v1/outbox`).

## What works today

- Ingestion from public sources in the US, UK, France and Spain (see [docs/sources.md](docs/sources.md))
- Entity matching, the company graph, cascade rules
- Per-firm predictions, opportunities, routing, drafts, approvals, learning, 8-week pilot scorecard
- Firm isolation, JWT + API keys, audit log
- A plug-in point for the Deep Swarm ([docs/deep-swarm.md](docs/deep-swarm.md))

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | API with reload |
| `npm run dev:worker` | Job worker with reload |
| `npm test` | Unit, API, end-to-end and contract tests |
| `npm run seed:demo` | Load the example-card storyline |
| `npm run sources:smoke` | Hit every live source once |
| `npm run live-run` | Ingest live sources, no email sent |
| `npm run mock:deepswarm` | Local Deep Swarm stand-in |

## Configuration

Copy [.env.example](.env.example). The important switches:

- `SWARM_DETECT` / `SWARM_PREDICT` / `SWARM_DRAFT` — `simulated` or `deepswarm`
- `SWARM_FALLBACK=true` — fall back to the simulated swarm if Deep Swarm errors
- `MAIL_PROVIDER=test` — keep this until a partner connects a mailbox

## Architecture

See [docs/architecture.md](docs/architecture.md).
