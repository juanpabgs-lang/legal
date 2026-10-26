# Architecture

Public records are shared. Everything a firm learns, scores or sends is kept per firm.

```
sources → records → detect → resolve → graph/cascades
       → predict + calibration → opportunities → route → draft
       → rules → send → outcomes → learner → scorecard
```

The three AI tasks (detect, predict, draft) go through `src/modules/swarm`. Today that is the simulated provider. Tomorrow it is the Deep Swarm, behind `src/modules/swarm/deepswarm/mapping.ts`.

## Modules

| Module | Responsibility |
| --- | --- |
| `http/` | Fastify `/v1` API, OpenAPI, auth |
| `jobs/` | pg-boss queues and schedules |
| `modules/sources` | Connectors and ingest |
| `modules/intelligence` | Matching, graph, cascade, predict |
| `modules/opportunities` | Lifecycle and shortlist |
| `modules/routing` | Warmest path |
| `modules/outreach` | Drafts, rules, mail |
| `modules/learning` | Per-firm model versions |
| `modules/pilot` | 8-week pilot and scorecard |
| `modules/swarm` | AI interface |

## Isolation

Firm-scoped tables always filter by `firmId` from the JWT or API key. Shared tables (`records`, `companies`, `signals`, `relationships`) are readable by every firm and are never written from another firm's contacts or opportunities.
