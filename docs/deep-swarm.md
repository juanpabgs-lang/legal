# Deep Swarm plug-in

The rest of Norfront is ready. This file is the contract we will hand the Deep Swarm.

## Tasks

| Task | Input | Output |
| --- | --- | --- |
| `detect` | One public record | Signals with mentions, a type, a confidence and a rationale |
| `predict` | A company, its recent signals, relationships and cascade exposures | Scores per practice: likelihood, window, confidence, evidence |
| `draft` | Partner voice, recipient, opportunity, source records | Subject, body, citations |
| `feedback` (optional) | Accept / dismiss / reply / matter | Acknowledgement |

Schemas live in `src/modules/swarm/contracts.ts` and are versioned as `1.0.0`.

## HTTP shape we can speak tomorrow

Until the real API is published we assume:

```
POST {DEEP_SWARM_BASE_URL}/v1/tasks/{detect|predict|draft}
Authorization: Bearer {DEEP_SWARM_API_KEY}
Idempotency-Key: <optional>
```

Sync: `200` with the task output.

Async: `202 { id }` then `GET /v1/jobs/{id}` or a signed webhook to `POST /v1/webhooks/deep-swarm` (`X-Deep-Swarm-Signature: sha256=<hex>` over the raw body, secret `DEEP_SWARM_WEBHOOK_SECRET`).

## How to switch it on

1. Fill in `src/modules/swarm/deepswarm/mapping.ts` (`toDetectRequest` / `fromDetectResponse` and the predict and draft pairs).
2. Set `DEEP_SWARM_BASE_URL` and `DEEP_SWARM_API_KEY`.
3. Set `SWARM_DETECT=deepswarm` (and predict / draft as you are ready).
4. Leave `SWARM_FALLBACK=true` until you trust the remote.
5. Re-run `npm run test:contract` against the real base URL.

`DEEP_SWARM_CONTRACT_MODE=identity` is only for tests: it sends our contract as-is to the mock server.

## What we need from you

- Base URL and auth
- Example request and response for each task
- Sync vs async, and the webhook signature if async
- Rate limits and any cost field to store on `swarm_calls`
