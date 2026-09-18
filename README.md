# GridWise LLM API

**LLM-Driven Intent Interpretation meets Deterministic Energy Optimization.**

Built for the BUP CSE Fest 2026 Hackathon Preliminary Round: "Smart Campus Energy Optimization Challenge".

GridWise bridges the gap between natural language and rigorous mathematical optimization. It exposes a robust REST API that ingests 24-hour campus energy scenarios alongside natural language operator notes. By leveraging Google's Gemini for strict semantic extraction and a Linear Programming (LP) continuous solver for cost minimization, it guarantees optimal, constraint-abiding energy schedules with zero LLM hallucinations.

##  Core API Endpoints

-  **`GET /health`** — Instant readiness probe.
-  **`POST /optimize-energy`** — The core engine. Accepts a 24-hour scenario with 1-3 operator notes. Returns a semantically verified, deterministically optimized, and independently replayed 24-hour schedule.

Full interactive OpenAPI documentation is served at `/docs` when the service is running, with the raw OpenAPI spec available at `/docs-json`.

##  Quickstart

**Requirements:** Node.js 24.x, a Gemini API key with quota for the configured model.

```sh
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
#  Open .env and insert your GEMINI_API_KEY

# 3. Build & run
npm run build
npm run start:prod
```

>  For local development with hot-reload, use `npm run start:dev`.

### Try it out!

**1. Health check:**

```sh
curl -s http://localhost:3000/health
# Returns: {"status":"ok"}
```

**2. Test the optimizer engine** — run one of the 10 official organizer public samples directly (no hand-editing required):

```sh
node -e "console.log(JSON.stringify(require('./test/fixtures/gridwise-public-cases.json').cases[0].input))" > /tmp/sample01.json
curl -s -X POST http://localhost:3000/optimize-energy -H "Content-Type: application/json" --data @/tmp/sample01.json
```

A successful response yields HTTP 200 containing the scenario ID, directive interpretation (in exact note index order), the 24-hour optimal plan, total grid usage, minimized cost, and a deterministic plan summary. (Numeric fields retain full solver precision.)

##  Environment Configuration

Configuration is managed via `.env` and strictly validated by `@nestjs/config` at startup.

| Variable | Required | Default | Description |
|---|---|---|---|
| `GEMINI_API_KEY` | Yes | — | Fails fast on startup if missing or blank. |
| `GEMINI_MODEL` | No | `gemini-flash-lite-latest` | The Gemini model ID (see Model Strategy below). |
| `PORT` | No | `3000` | HTTP port (binds to `0.0.0.0`). |
| `LLM_TIMEOUT_MS` | No | `6000` | Per-attempt timeout for a single Gemini call. |
| `REQUEST_TIMEOUT_MS` | No | `25000` | Overall time budget for the endpoint (shared across retries). |
| `LLM_MAX_RETRIES` | No | `1` | Additional attempts for guardrail corrections or network drops. |

##  Architecture: AI Meets Determinism

GridWise is built on a fundamental principle: **LLMs should extract intent, not do math.**

**The request pipeline:**

```
Request → LLM Interpretation → Guardrails → Directive Application → LP Optimizer → Formatter → Independent Replay → Response
```

- **The LLM role:** One batched Gemini call via `@google/genai` (structured-output mode) turns notes into strict JSON directives. It is never used to compute schedules or generate the text summary.
- **The guardrail validator:** Gemini's output is treated as untrusted. The validator ensures perfect semantic mapping (ascending hours, valid fractions, capacity bounds). If it fails, the system triggers one self-correcting retry.
- **The optimizer:** A continuous linear program built with `javascript-lp-solver`. It minimizes total tariff cost subject to energy balance, battery neutrality, and extracted directives. Simultaneous charge/discharge is algorithmically netted.
- **Independent replay:** Before returning a `200 OK`, the resulting schedule is mathematically re-verified from scratch. The service never returns a schedule that fails its own independent replay.

> **Note on constraint logic:** overlapping solar reduction directives combine by taking the most restrictive/lowest value per hour. All other constraints combine unambiguously.

## Model Strategy

Configured to use `gemini-flash-lite-latest`.

**Why?** Model catalogs shift rapidly under active development (observed shifts from 2.5 to 3.8 in a single session). Pinning a dated version risks `404 "no longer available"` errors for newly generated API keys. Using the rolling `latest` alias ensures zero-maintenance stability. Override via `GEMINI_MODEL` if a specific dated model is preferred.

##  Rigorous Testing

Quality is enforced through a strict, multi-tiered testing strategy. Passing tests aren't just the app checking itself — they are validated against a from-scratch reimplementation of the GridWise rules.

- **`npm test`** — Unit tests (40 tests, 0 network calls). Tests guardrails, optimizer, and redaction logic.
- **`npm run test:e2e`** — Full HTTP pipeline (20 tests, 0 network calls). Replaces the Gemini network boundary with a scripted double to validate all 10 official public samples against reference optimums.
- **`npm run test:live`** — Live E2E verification (opt-in). Exercises real Gemini API calls against all 10 public samples plus 2 complex paraphrase checks.

##  Docker — Production Ready

The image is a multi-stage, non-root, health-checked build (see `Dockerfile`).

**Submitted fallback image**, verified end to end — local image force-removed and pulled back fresh, Docker's own healthcheck reporting `healthy`, `GET /health` returning `{"status":"ok"}`, and a real `POST /optimize-energy` call against the organizer's SAMPLE-01 input returning the exact reference cost (38365 BDT):

```sh
docker pull ahmadzubayer/gridwise:preliminary-v2
docker run --rm --name gridwise -p 3000:3000 --env-file .env ahmadzubayer/gridwise:preliminary-v2
```

- **Digest:** `sha256:b55cfe43384614335c28a06e7062cb928913ecafe2b184b0c4f4a45f705e8af9`

See [DOCKER.md](DOCKER.md) for the full runtime variable table and republish instructions.

##  Security & Error Handling

- **Zero secrets committed:** `.env` is ignored. `GEMINI_API_KEY` is completely stripped from all system logs via `src/common/logging/redact.ts`.
- **Controlled failures:** all 500-level errors return generic, secret-free JSON bodies (e.g. `INTERPRETATION_INVALID`, `OPTIMIZATION_FAILED`).
- **Fail-fast keys:** invalid API keys are caught instantly (`400 INVALID_ARGUMENT` from Google) rather than wasting retries.

##  Known Limitations

- **Free-tier rate limits:** heavy burst traffic on a free Gemini key may hit `429 RESOURCE_EXHAUSTED`. Rate limits consume a shared retry without explicit `retryDelay` backoff, to respect the strict `REQUEST_TIMEOUT_MS` budget. A key with adequate quota is recommended for the judging harness.
- **AI tooling:** core architecture, guardrails, math models, and tests are original work. An AI coding assistant was utilized during implementation strictly within the parameters of the Participant Guide's permitted-tools policy.

Built with NestJS 11, `@google/genai`, `javascript-lp-solver`, and `class-validator`.
