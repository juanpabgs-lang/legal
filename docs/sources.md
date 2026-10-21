# Sources

Connectors live in `src/modules/sources/connectors`. Each one returns a normalised record. The ingest job stores a raw copy and dedupes on `(source_id, external_id)`.

## Live, no key

| Id | Market | What |
| --- | --- | --- |
| `us-edgar` | US | SEC current 8-K atom feed |
| `us-federal-register` | US | Proposed rules |
| `us-courtlistener` | US | Docket search (token unlocks more) |
| `uk-gazette` | UK | Insolvency notices |
| `uk-find-a-tender` | UK | OCDS releases |
| `uk-govuk` | UK | Consultations and CMA cases |
| `uk-fca` | UK | FCA news RSS |
| `fr-bodacc` | FR | Commercial and insolvency notices |
| `fr-boamp` | FR | Public contracts |
| `fr-amf` `fr-autorite-concurrence` `fr-cnil` | FR | Regulator RSS |
| `es-borme` | ES | Daily companies-register summary |
| `es-boe` | ES | Official gazette (concurso notices, draft rules) |
| `es-placsp` | ES | Public contracts atom feed |
| `es-cnmc` | ES | Competition RSS |

## Built, waiting on a free key

- `uk-companies-house` — `COMPANIES_HOUSE_API_KEY`
- `us-sam` — `SAM_GOV_API_KEY`

## Not covered yet

US WARN and UCC (state-by-state), CNMV (blocks this environment), Infogreffe/RNE and Légifrance (need accounts).

Identify the crawler with `USER_AGENT`. Stay inside each source's published rate limit (`rateLimitPerMinute` on the source row).
