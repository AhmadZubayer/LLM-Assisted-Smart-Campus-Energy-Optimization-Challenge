<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

# GridWise LLM API

LLM-assisted operator-note interpretation and 24-hour campus energy optimization, built for the BUP CSE Fest 2026 Hackathon preliminary round ("Smart Campus Energy Optimization Challenge"). See `../docs/` for the canonical Problem Statement and Participant Guide & Evaluation Rubric.

Two endpoints:

- `GET /health` — readiness probe.
- `POST /optimize-energy` — accepts a 24-hour scenario plus 1-3 operator notes, interprets the notes with Gemini, validates that interpretation deterministically, runs a linear-programming optimizer, and returns the interpretation plus a valid, cost-minimizing 24-hour schedule.

## Quickstart

**Requirements:** Node.js 24.x, a Gemini API key with quota for the configured model.

```sh
npm install
cp .env.example .env
# open .env and set GEMINI_API_KEY
npm run build
npm run start:prod
```

For local development with reload instead of `build`/`start:prod`, use `npm run start:dev`.

**Environment variables** (set in `.env`, loaded by `@nestjs/config`):

| Variable | Required | Default | Meaning |
|---|---|---|---|
| `GEMINI_API_KEY` | yes | - | Gemini API key. The service fails fast on startup if this is missing or blank. |
| `GEMINI_MODEL` | no | `gemini-flash-lite-latest` | Gemini model id — see "Model / provider" below. |
| `PORT` | no | `3000` | HTTP port; the service binds `0.0.0.0`. |
| `LLM_TIMEOUT_MS` | no | `6000` | Per-attempt timeout for a single Gemini call. |
| `REQUEST_TIMEOUT_MS` | no | `25000` | Overall time budget for one `/optimize-energy` request, shared across all Gemini attempts. |
| `LLM_MAX_RETRIES` | no | `1` | Additional Gemini attempts after the first — shared between transport failures and guardrail-correction retries, not stacked. |

**Test `/health`:**

```sh
curl -s http://localhost:3000/health
# {"status":"ok"}
```

**Test `/optimize-energy`** with a hand-written request:

```sh
curl -s -X POST http://localhost:3000/optimize-energy \
  -H "Content-Type: application/json" \
  -d '{
    "scenario_id": "GRID-101",
    "operator_notes": [
      "Solar output will drop to about 20% from 1 PM to 3 PM.",
      "Do not charge the battery between 2 PM and 4 PM.",
      "The cafeteria menu changes tomorrow."
    ],
    "hours": [ /* 24 entries: {"hour","demand_kwh","solar_kwh","tariff_bdt_per_kwh"} */ ],
    "battery": {
      "capacity_kwh": 500,
      "initial_energy_kwh": 200,
      "minimum_energy_kwh": 50,
      "max_charge_kwh_per_hour": 100,
      "max_discharge_kwh_per_hour": 100
    }
  }'
```

Or run one of the ten organizer public samples directly, no hand-editing needed:

```sh
node -e "console.log(JSON.stringify(require('./test/fixtures/gridwise-public-cases.json').cases[0].input))" > /tmp/sample01.json
curl -s -X POST http://localhost:3000/optimize-energy -H "Content-Type: application/json" --data @/tmp/sample01.json
```

A successful response is HTTP `200` with `scenario_id`, `directive_interpretation[]` (one entry per note, in `note_index` order), `hourly_plan[]` (24 entries), `total_grid_kwh`, `total_cost_bdt`, `peak_grid_kwh`, and `plan_summary`. Numeric fields keep full solver precision — the published 0.01 kWh/BDT tolerance is for comparisons, not a rounding instruction.

Full interactive API documentation (all six directive schemas, request/response examples) is served at `/docs` once the service is running, with the raw OpenAPI document at `/docs-json`.

## Model / provider

Configured model: **`gemini-flash-lite-latest`**, called through the official `@google/genai` SDK. This is Google's rolling alias for their current recommended lite-tier model rather than a dated version string, and the choice is evidence-based, not arbitrary: during development, `gemini-2.5-flash-lite` and `gemini-2.5-flash` both returned `404 "no longer available to new users"` against a freshly created API key, while the model catalog kept shifting under active development (2.5 → 3.1 → 3.5 → 3.6 → 3.7 → 3.8 observed in one session). A pinned dated version risks the same fate; `gemini-flash-lite-latest` was verified working end-to-end (see Testing) and stays current automatically. If your key supports a specific dated model instead, set `GEMINI_MODEL` — no code change needed.

## LLM role, guardrails, and optimizer/solver

```
Request → LLM interpretation → guardrails → directive application → LP optimizer → formatter → independent replay → Response
```

The LLM's *only* job is turning each operator note into one structured directive (or `no_op`). It never computes the schedule, and it is never used only for `plan_summary` — that text is generated deterministically. One batched Gemini call per request sends all operator notes plus the full scenario and battery context (needed to resolve relative phrases like "half of capacity"), using Gemini's structured-output mode against a fixed JSON schema.

**Guardrails** (`src/energy/services/guardrail-validator.service.ts`) treat Gemini's output as untrusted until they confirm: every note gets exactly one entry, in order; `directive_type` is one of the six supported values; `hours` are unique ascending integers 0-23; `solar_reduction.factor` is in `[0,1]`; `minimum_battery_reserve.minimum_energy_kwh` is finite and within battery capacity; `max_grid_window.max_grid_kwh` is finite and non-negative; `applies` is `false` only for `no_op`. A structurally invalid response gets **one** corrective retry (shared with transport retries via `LLM_MAX_RETRIES`); if that also fails, the request returns a controlled `500` — never a fabricated `no_op`.

**Optimizer/solver** (`src/energy/services/energy-optimizer.service.ts`): a continuous linear program over 24 hours, solved with [`javascript-lp-solver`](https://github.com/JWally/jsLPSolver) (MIT/Unlicense, zero native dependencies) — not a per-hour heuristic. Variables `grid[h]`, `solar_used[h]`, `charge[h]`, `discharge[h]`, `battery_energy_after[h]`; minimizes `Σ grid[h] × tariff[h]` subject to the energy-balance equation and the solar/rate/reserve/grid-cap bounds from every applicable directive, plus end-of-day battery neutrality. Simultaneous LP charge/discharge is netted into the single exported `battery_action` per hour without changing cost or battery state. The finished plan is then independently replayed (`schedule-validator.service.ts`, re-derives every number from the plan itself) before the response is ever returned.

**Documented modeling choice, not an organizer rule:** the Problem Statement does not define how two `solar_reduction` directives that overlap the same hour with different factors should combine. This implementation takes the more restrictive (lowest resulting solar) value per hour. All other overlapping bounds (reserve, grid cap, charge/discharge bans) combine unambiguously per the Problem Statement.

### Errors

`400` for malformed JSON or a request that fails schema validation. `500` for a controlled failure (`INTERPRETATION_UNAVAILABLE`, `INTERPRETATION_INVALID`, `OPTIMIZATION_FAILED`, `PLAN_VALIDATION_FAILED`, `REQUEST_TIMEOUT`, `INTERNAL_ERROR`) — always a generic, secret-free body:

```json
{ "error": { "code": "INTERPRETATION_INVALID", "message": "Unable to obtain a valid interpretation of the operator notes.", "request_id": "..." } }
```

The service never returns `200` with a schedule that failed its own independent replay.

## Testing

```sh
npm test              # unit tests (guardrails, optimizer, formatter, replay, redaction) - 40 tests, no network
npm run test:e2e      # full HTTP pipeline, Gemini network call mocked, all 10 public samples - 20 tests, no network
npm run test:live     # OPTIONAL: real Gemini calls using GEMINI_API_KEY, all 10 public samples + 2 paraphrase checks
```

`npm test` and `npm run test:e2e` never touch the network — `test:e2e` replaces only the Gemini network boundary (`GeminiClientService`) with a scripted double, so the real guardrail validator, directive application, optimizer, formatter, and independent replay all run against the ten organizer-published public cases (`test/fixtures/gridwise-public-cases.json`, copied unchanged from `../docs/`). Every case's replayed cost matches the organizer's reference optimum, checked against `test/helpers/reference-replay.ts` — a from-scratch reimplementation of the GridWise rules, written independently of the production `schedule-validator.service.ts`, so passing tests are real evidence rather than the app checking itself.

`npm run test:live` is opt-in and makes real API calls (bounded to the 10 public cases plus 2 paraphrase/relative-quantity checks — about 12 requests). It was run during development: all 12 passed once free-tier rate limiting was accounted for (see Known limitations).

## Docker

Fallback image, submitted and verified:

```sh
docker pull ahmadzubayer/gridwise:preliminary-v2
docker run --rm --name gridwise -p 3000:3000 --env-file .env ahmadzubayer/gridwise:preliminary-v2
curl http://localhost:3000/health
```

- **Digest:** `sha256:b55cfe43384614335c28a06e7062cb928913ecafe2b184b0c4f4a45f705e8af9`
- Verified end to end: local image removed, pulled fresh from Docker Hub, `/health` returned `{"status":"ok"}` with Docker's own healthcheck reporting `healthy`, and a real `/optimize-energy` request against the organizer's SAMPLE-01 input returned the exact reference cost (38365 BDT). Confirmed via `docker inspect` that the image's baked-in `ENV` layer carries no secrets — `GEMINI_API_KEY` is supplied only through `--env-file .env` at `docker run` time.

See [DOCKER.md](DOCKER.md) for the full runtime variable table, the local dev build loop, and how to publish a new version.

## Dependencies and credits

- [NestJS](https://nestjs.com/) 11 — application framework
- [@google/genai](https://www.npmjs.com/package/@google/genai) — official Gemini SDK
- [@nestjs/swagger](https://docs.nestjs.com/openapi/introduction) — OpenAPI generation
- [class-validator](https://github.com/typestack/class-validator) / [class-transformer](https://github.com/typestack/class-transformer) — request DTO validation
- [@nestjs/config](https://docs.nestjs.com/techniques/configuration) — environment loading and validation
- [javascript-lp-solver](https://github.com/JWally/jsLPSolver) — linear programming solver
- Core architecture, prompts, guardrails, optimizer model, and tests are original work for this challenge; an AI coding assistant was used during implementation per the Participant Guide's permitted-tools policy.

## Known limitations

- **Free-tier Gemini rate limits.** The API key used during development is capped at 15 requests/minute on `gemini-flash-lite-latest`. A burst of `test:live` requests hit `429 RESOURCE_EXHAUSTED` after ~7 calls in quick succession (all passed once retried after the window reset). If the judging harness fires requests faster than your key's per-minute limit allows, requests will fail with a controlled `500` (`INTERPRETATION_INVALID`, after one retry) rather than hang — use a key with sufficient quota for judging.
- **Rate-limit handling is not backoff-aware.** A `429` is treated like any other transient provider failure (consumes one shared retry) rather than reading the provider's suggested `retryDelay`; given the request-level deadline (`REQUEST_TIMEOUT_MS`), respecting a multi-second suggested delay would rarely fit anyway.
- **Gemini's invalid-key error is 400, not 401/403.** Confirmed against the live API: an invalid `GEMINI_API_KEY` comes back as `400 INVALID_ARGUMENT` (reason `API_KEY_INVALID`), not the more conventional 401/403. The client checks for this specific case (plus 401/403 as a fallback) so a bad key fails fast without wasting a retry.
- **Overlapping `solar_reduction` composition** is this implementation's own documented tie-break (most restrictive wins), not a rule stated in the organizer documents — see "LLM role, guardrails, and optimizer/solver" above.

## Secret handling — no committed secrets

`.env` is git-ignored (see `.gitignore`) and excluded from the Docker build context (`.dockerignore`); only `.env.example`, which contains placeholders, is committed. No API keys, tokens, or raw provider error bodies are logged or returned in responses — `src/common/logging/redact.ts` strips the configured `GEMINI_API_KEY` out of any text before it is logged, and the global exception filter (`src/common/filters/http-exception.filter.ts`) always returns a generic, code-only error body for `500`s.
