# Implementation Plan - GridWise LLM API (NestJS)

## 1. Canonical sources and page references

Implement the three organizer files, located in the parent workspace's docs directory:

- [Problem Statement](../docs/BUP_CSE_FEST_2026_Preliminary_Problem_Statement_GridWise_LLM.pdf): behavior, schemas, directives, guardrails, battery rules, valid optimization.
- [Participant Guide and Evaluation Rubric](../docs/BUP_CSE_FEST_2026_Participant_Guide_&_Evaluation_Rubric_GridWise_LLM.pdf): performance, deployment, repository policy, submission, scoring, penalties.
- [Public Sample Cases](../docs/BUP_CSE_FEST_2026_Preli_Public_Sample_Cases.json): ten worked inputs and optimal reference outputs, not the hidden judge set.

The derived docs/requirement.md is secondary. Its suggestions to replace failed interpretation with no_op are incorrect and must not guide implementation. The corrected failure policy below takes precedence over that summary.

| Source | Location | Meaning |
|---|---|---|
| Problem Statement | Page 3, section 04 | Six directive types and adjustment shapes |
| Problem Statement | Page 4, sections 5.2-5.3 | Minimize grid cost and apply directives to the math |
| Problem Statement | Page 6, section 09 | Battery transitions, bounds, rates, solar limits, balance, final neutrality |
| Problem Statement | Page 7, section 10 | Required response and hourly-plan fields |
| Problem Statement | Pages 8-9, section 11 | Replay, interpretation checks, equivalent plans, tolerance |
| Participant Guide | Page 7, sections 07-08 | Scoring weights and optimization quality ratio |

Page 7 does not prescribe an optimization algorithm. The equations define the task; linear programming is our implementation choice. Build one public backend. Frontend, database, forecasting, hardware integration, and custom model training are not required.

## 2. Stack and configuration

Current package.json includes NestJS 11, @google/genai, and swagger-ui. Retain the existing Docker setup and health endpoint where correct. Add missing packages:

```bash
npm install @nestjs/swagger class-validator class-transformer @nestjs/config javascript-lp-solver
```

Use the already installed @google/genai. Commit package-lock.json. Check the selected solver's exports and bundled TypeScript declarations before adding a separate type package. First prove its integration with one hand-checkable case.

| Component | Responsibility |
|---|---|
| NestJS | HTTP, modules, dependency injection |
| @nestjs/swagger | OpenAPI schemas and /docs UI |
| class-validator / class-transformer | DTO and nested input validation |
| @nestjs/config | Load .env locally and validate startup configuration |
| @google/genai | Gemini interpretation with structured output |
| javascript-lp-solver | Continuous linear optimization |
| NestJS Logger | Safe logging; Pino is optional |

Example .env.example, containing placeholders only:

```dotenv
PORT=3000
GEMINI_API_KEY=replace_me
GEMINI_MODEL=gemini-2.5-flash
LLM_TIMEOUT_MS=6000
REQUEST_TIMEOUT_MS=25000
LLM_MAX_RETRIES=1
```

The model is an initial candidate: verify current availability, schema support, accuracy, deployed latency, and account quota before submission. Document the tested model/version. These timeout values are engineering defaults, not organizer requirements. Official limits: health ready within 60 seconds; requests within 30 seconds; p95 <= 5 seconds for full latency marks.

Load ConfigModule before constructing GoogleGenAI. Read the key through ConfigService and pass it explicitly to the client; the SDK does not replace .env loading. Validate required configuration and positive integer port/timeouts. Keep real .env files out of Git and Docker builds; supply production secrets at runtime.

## 3. Modules and responsibilities

```text
src/
  main.ts
  app.module.ts
  common/
    config/env.validation.ts
    filters/http-exception.filter.ts
    dto/error-response.dto.ts
    interceptors/request-context.interceptor.ts
    errors/application-error.ts
    validation/full-day-hours.validator.ts
    validation/directive-hours.validator.ts
    validation/battery-bounds.validator.ts
  health/
    health.module.ts
    health.controller.ts
  llm/
    llm.module.ts
    gemini-client.service.ts
    directive-output.schema.ts
    operator-notes.prompt.ts
  energy/
    energy.module.ts
    energy.controller.ts
    dto/
      hour-entry.dto.ts
      battery.dto.ts
      optimize-energy-request.dto.ts
      directive-interpretation.dto.ts
      structured-adjustment.dto.ts
      hourly-plan-entry.dto.ts
      optimize-energy-response.dto.ts
    interfaces/
      directive.types.ts
      effective-constraints.types.ts
      solver-result.types.ts
    services/
      energy-orchestrator.service.ts
      llm-interpreter.service.ts
      guardrail-validator.service.ts
      directive-application.service.ts
      energy-optimizer.service.ts
      schedule-formatter.service.ts
      schedule-validator.service.ts
test/
  fixtures/gridwise-public-cases.json
  helpers/reference-replay.ts
  optimize-energy.e2e-spec.ts
  provider-failures.e2e-spec.ts
  public-samples.live-spec.ts
```

Controllers delegate; orchestration owns sequencing, deadlines, and recovery. Guardrails/application/formatting are deterministic. The test replay must not simply reuse the production validator.

```text
Validate request -> normalize hour ordering -> Gemini interpretation
-> guardrails -> apply directives -> optimize -> format -> replay -> HTTP 200
```

## 4. Exact API contract and validation

- GET /health returns HTTP 200 and {"status":"ok"} once initialized.
- POST /optimize-energy explicitly uses @HttpCode(HttpStatus.OK). NestJS defaults POST success to 201.
- Keep these exact root paths: no /api prefix or authentication.
- Bind to 0.0.0.0 and configured PORT.
- Do not call Gemini on each health check. Test live provider access separately before submission.
- Never leave fake/static optimization responses in the submitted success path.

### Request DTOs

| Object | Required fields |
|---|---|
| Request | scenario_id, operator_notes, hours, battery |
| Hour | hour, demand_kwh, solar_kwh, tariff_bdt_per_kwh |
| Battery | capacity_kwh, initial_energy_kwh, minimum_energy_kwh, max_charge_kwh_per_hour, max_discharge_kwh_per_hour |

Validation requirements:

- scenario_id must be a string and echoed unchanged.
- One to three non-empty note strings; reject whitespace-only notes.
- Exactly 24 hourly objects, with unique integer hours covering 0-23.
- Normalize a copy by hour; do not assume array position equals hour.
- Validate nested objects with @ValidateNested and @Type plus object/array checks.
- Finite, non-negative demand, solar, and battery quantities; accept fractional amounts and valid zero limits.
- Require finite numeric tariff inputs; avoid introducing an unstated strictly-positive tariff restriction.
- Enforce 0 <= minimum_energy_kwh <= initial_energy_kwh <= capacity_kwh.
- Do not impose max_charge <= capacity; capacity constraints already limit actual charging.
- Keep implicit string-to-number coercion disabled.
- Separate full-day hourly-object validation from directive integer-hour subsets. A directive such as [13,14] does not require 24 elements.

Use one consistent global configuration:

```typescript
new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: false },
});
```

Malformed JSON is rejected by the HTTP body parser before DTO validation. Preserve that 400 through the exception filter. Decorators only work when correctly applied; test the full HTTP behavior.

### Response DTOs - Problem Statement page 7

| Object | Required fields |
|---|---|
| Response | scenario_id, directive_interpretation, hourly_plan, total_grid_kwh, total_cost_bdt, peak_grid_kwh, plan_summary |
| Interpretation | note_index, applies, directive_type, structured_adjustment, explanation |
| Hourly plan | hour, grid_kwh, solar_used_kwh, battery_action, battery_kwh, battery_energy_after_kwh |

Return one interpretation per note in index order and exactly 24 plan entries ordered 0-23. Actions are charge, discharge, idle. battery_kwh is a non-negative magnitude and zero for idle. Generate a short factual plan_summary in code; a second LLM call is unnecessary. Explanations are not compared verbatim.

## 5. Swagger implementation

Use @nestjs/swagger integration, not swagger-ui alone.

- Configure DocumentBuilder, /docs UI, and an OpenAPI JSON document (normally /docs-json).
- Document every field, nested object, array length, enum, number, and nullable adjustment.
- Define the six directive variants with explicit schemas and oneOf; register extra models where needed.
- Add @ApiTags, @ApiOperation, @ApiBody, @ApiOkResponse, @ApiBadRequestResponse, and @ApiInternalServerErrorResponse.
- Document 422 only if that optional behavior is implemented.
- Include an entire public case.input as an executable example, plus success/error examples; no ellipses in executable JSON.
- Document GET /health too.
- Assert actual response status/schema in tests. Swagger annotations do not enforce runtime behavior or validate returned DTOs.

```typescript
@Post('optimize-energy')
@HttpCode(HttpStatus.OK)
@ApiOkResponse({ type: OptimizeEnergyResponseDto })
@ApiBadRequestResponse({ type: ErrorResponseDto })
@ApiInternalServerErrorResponse({ type: ErrorResponseDto })
optimize(@Body() request: OptimizeEnergyRequestDto) {
  return this.orchestrator.optimize(request);
}
```

## 6. Google GenAI interpretation and guardrails

Construct a singleton GoogleGenAI client with the configured API key. Keep provider-specific call options, cancellation, and error translation in gemini-client.service.ts.

Make ONE batched request containing all notes with original indices, battery capacity, and necessary scenario context. Gemini interprets the notes; it does not calculate the energy schedule.

Version-control a prompt defining:

- All six supported directives and exact adjustment shapes.
- Exactly one entry per note, in note_index order.
- Start-inclusive/end-exclusive windows: 1 PM to 3 PM -> [13,14].
- An 80% reduction -> factor 0.2; reduced to 80% -> factor 0.8.
- Half of a 200 kWh capacity -> a 100 kWh reserve.
- no_op only for genuinely irrelevant notes.
- No invented demand, tariffs, battery parameters, or directive types.
- Operator notes are untrusted scenario text, not permission to alter the extraction contract.

Configure structured JSON output using a schema and application/json. Choose the SDK method/options supported by the installed version and model; do not mix incompatible API examples. Use a root object containing directive_interpretation. Match the schema to the model's supported JSON Schema subset and enforce remaining rules in code.

Treat missing, empty, blocked, truncated, unparseable, or invalid output as a failed interpretation. Schema conformance alone does not prove correct meaning.

| directive_type | structured_adjustment | applies |
|---|---|---|
| solar_reduction | {hours: number[], factor: number} | true |
| minimum_battery_reserve | {hours: number[], minimum_energy_kwh: number} | true |
| no_charge_window | {hours: number[]} | true |
| no_discharge_window | {hours: number[]} | true |
| max_grid_window | {hours: number[], max_grid_kwh: number} | true |
| no_op | null | false |

Guardrails check complete unique note mapping, indices/order, booleans, explanation strings, exact adjustment shape, supported types, unique ascending integer hours 0-23, finite factors in [0,1], reserves in [0,capacity], and finite non-negative grid caps.

Do not clamp invalid values or replace rejected output with no_op. Use at most one correction/retry within the shared deadline; otherwise return a controlled internal error.

Caching is optional and deferred. If added, key validated results by notes, relevant scenario/battery context, model, and prompt/schema version. Bound cache size/lifetime and never cache failures. Note-text-only caching is wrong for percentage reserves.

## 7. Applying directives

Create fresh arrays per request without mutating input:

- effectiveSolar starts at original solar.
- minReserve starts at the base minimum.
- maxCharge/maxDischarge start at hourly battery limits.
- maxGrid has no upper bound unless a directive adds one.

Apply solar as originalSolar[h] * factor; combine reserves by maximum including the base reserve; combine grid caps by minimum; set charge/discharge limit to zero wherever prohibited. no_op changes nothing. Omit unconstrained grid upper-bound rows instead of passing Infinity into the solver.

The documents do not explicitly define composition of differing overlapping solar-reduction factors. Deduplicate identical adjustments, but do not claim multiplication or last-note-wins is an organizer rule. Isolate this ambiguity and resolve against organizer clarification/judge material if such cases arise. The ten public examples do not settle it. Other simultaneous bounds combine by intersection.

## 8. Optimization model

### Variables and objective

Use a continuous LP across all 24 hours, not a per-hour greedy algorithm. Variables for each h:

- g[h]: grid import.
- s[h]: solar used.
- c[h]: battery charging.
- d[h]: battery discharging.
- E[h]: battery energy AFTER that hour.

Minimize sum(g[h] * tariff[h]). Peak import is reported, not a separate objective. Do not introduce efficiency losses, degradation costs, export revenue, or other unstated costs.

### Constraints - Problem Statement pages 4 and 6

```text
g[h] >= 0
0 <= s[h] <= effectiveSolar[h]
0 <= c[h] <= maxCharge[h]
0 <= d[h] <= maxDischarge[h]
g[h] <= maxGrid[h]                      when a cap exists

g[h] + s[h] + d[h] - c[h] = demand[h]

E[0] - c[0] + d[0] = initialEnergy
E[h] - E[h-1] - c[h] + d[h] = 0          for h = 1..23

minReserve[h] <= E[h] <= capacity
E[23] = initialEnergy
```

Reserves apply after each listed hour. Unused solar may be curtailed. Grid export is prohibited. The battery may charge using grid or solar through the balance equation.

### Solver adapter

- Map each objective coefficient and constraint to the solver's documented format.
- Verify non-negativity and missing-zero-variable conventions with tests.
- Check feasible/bounded/completion status and finite results. Never replace an error with a zero schedule.
- Do not discretize energy into integer kWh.
- Check a hand-computable case, then all public cases using reference interpretations.
- Solvers do not guarantee a correct model or exact floating-point equality; independent replay is mandatory.
- A Promise timeout cannot interrupt synchronous solver work. Measure worst-case runtime; if needed use a terminable worker and bounded queue inside the same service.

### One exported battery action

The LP may contain simultaneous positive charge/discharge. In this challenge's loss-free equations, cancel the common amount:

```text
net = c[h] - d[h]
chargeExported = max(net, 0)
dischargeExported = max(-net, 0)
battery_kwh = abs(net)
```

Choose charge/discharge by net sign, otherwise idle. Cancellation preserves balance, battery state, grid cost, rate bounds, and prohibitions. Binary variables are not needed solely to export one action under these equations. Revisit if losses or throughput costs are later introduced.

### Formatting and precision

- Keep useful numeric precision: 0.01 is a judge tolerance, not a demand to round all values to two decimals.
- Normalize only tiny solver noise with a documented internal epsilon, initially 1e-8; never hide substantive violations.
- Recompute battery states from initial energy and exported actions.
- total_grid_kwh = sum of exported grid values.
- total_cost_bdt = sum of exported grid values times corresponding input tariffs.
- peak_grid_kwh = maximum exported grid value.
- Validate the exact response values after formatting.
- Apply the published absolute 0.01 kWh/BDT tolerance unless the official judge specifies stricter values; keep internal residuals much smaller.

## 9. Independent final replay

Before returning HTTP 200, verify response shape, unchanged scenario_id, full note coverage/order, 24 ordered hours, finite non-negative energy values, action consistency, effective solar availability, hourly balance, recalculated battery transitions, capacity/reserves/rates, all directive restrictions, final neutrality, and recomputed totals.

Runtime replay checks validated interpretations. It cannot know organizer ground truth and therefore cannot prove semantic extraction correctness. Reference tests must establish that separately. Never return a plan that fails replay.

## 10. Error handling, deadlines, and logging

Use one error DTO and global exception filter. Preserve client-error status codes and return generic internal messages without provider details.

Example application-owned error format (not prescribed by organizers):

```json
{
  "error": {
    "code": "INTERPRETATION_UNAVAILABLE",
    "message": "Unable to interpret the operator notes.",
    "request_id": "generated-request-id"
  }
}
```

| Failure | Policy |
|---|---|
| Malformed JSON, missing fields, invalid structure/types | 400 INVALID_REQUEST |
| Invalid numerical relationships | 400; optional 422 only if documented/tested |
| Temporary provider connection/5xx failure | At most one retry within remaining deadline; then controlled 500 |
| Rate limit | Respect retry delay only if time and retry budget remain; otherwise controlled 500 |
| Invalid key, access denied, exhausted quota | No blind retry; safe diagnostic and controlled 500 |
| Invalid, blocked, truncated, or rejected interpretation | At most one correction attempt within the same shared retry budget; then 500 INTERPRETATION_INVALID |
| Infeasible/unbounded/failed solver result | 500 OPTIMIZATION_FAILED; investigate because valid scoring cases are feasible |
| Final replay fails | 500 PLAN_VALIDATION_FAILED; never report invalid plan as success |
| Overall deadline expires | Cancel supported in-flight work; 500 REQUEST_TIMEOUT |
| Unknown exception | Generic 500 INTERNAL_ERROR; keep server running |

A controlled 500 still loses reliability credit for a valid request. Recovery should minimize failures; inventing no_op and returning 200 is not a valid recovery strategy.

Deadline implementation:

- Start a monotonic 25-second overall budget on entry.
- Cap each Gemini call at min(configured attempt timeout, remaining budget).
- One additional attempt TOTAL across transport and semantic correction retries.
- Account for or disable SDK automatic retries so they do not multiply attempts.
- Use supported abort/HTTP timeout facilities; Promise.race alone does not cancel network work.
- Clean up timers; cancel on disconnect where supported; do not send duplicate responses.
- Bound concurrency/queued work and test quota pressure. Aim for p95 <= 5 seconds on normal requests.

Use NestJS Logger. Record request ID, scenario ID after validation, stage, duration, attempt count, sanitized error code, and status. Never log full provider error objects, authorization headers, API keys, .env contents, secret-bearing prompts, or sensitive stack traces. Test redaction with a synthetic sentinel secret. Pino is not required.

## 11. Testing and public samples

Copy the organizer JSON unchanged to test/fixtures/gridwise-public-cases.json for a self-contained repository, record provenance, and verify identical contents. POST case.input, not the outer case wrapper.

### Deterministic tests without network

- DTO/body parser: malformed JSON, wrong hour count, duplicates, unordered valid hours, string numbers, whitespace notes, invalid battery relationships.
- Guardrails: all six types, wrong shape/ranges/order/mapping, no_op semantics, and controlled rejection without fabricated no_op.
- Directive application: combined caps/reserves/bans, solar factors 0 and 1, unrelated hours unchanged.
- Optimizer: hand-computable 24-hour cases, fractional inputs, feasible zero capacities/rates, excess solar, zero tariffs, reserve/cap preparation, final recharge.
- Formatter/replay: netting simultaneous charge/discharge, tiny residuals, wrong states/totals, deliberately broken plans.
- Provider mocks: timeout, rate limit, auth/quota failures, malformed/blocked responses, bounded recovery, cancellation, failed request followed by successful request.
- API: actual POST 200, preserved malformed-input 400, exact response fields, safe 500, no secrets.

### Reference checks for every public case

1. Feed expected_output.directive_interpretation into optimizer tests to isolate math.
2. Independently replay against those reference directives, not the service's own interpretation.
3. Compare recalculated cost to the reference optimum within official tolerance.
4. Check totals against the returned plan. Equivalent optimal plans may have different action sequences and peaks.
5. In live tests also compare note indices, applies, types, hours, and numeric adjustments against the reference; ignore explanation wording.

| Case | Purpose | Reference cost BDT |
|---|---|---:|
| SAMPLE-01 | Solar cleaning + distractor | 38365 |
| SAMPLE-02 | No-charge maintenance | 42885 |
| SAMPLE-03 | Percentage reserve | 35480 |
| SAMPLE-04 | No-discharge window | 40495 |
| SAMPLE-05 | Grid cap | 33950 |
| SAMPLE-06 | Solar reduction + charging ban + distractor | 34090 |
| SAMPLE-07 | Reserve + grid cap | 38550 |
| SAMPLE-08 | Separate charge/discharge bans | 37665 |
| SAMPLE-09 | 80% reduction normalization | 34873 |
| SAMPLE-10 | Multiple evening restrictions + distractor | 41620 |

Reference costs are test expectations only: never hard-code case answers in the runtime path.

### Live and deployment tests

- Opt-in live Gemini command with credentials; regular unit tests stay offline.
- All ten cases plus paraphrases, fractions, percentage differences, and distractors.
- Same percentage note with different capacities to detect context/cache mistakes.
- Repeated/concurrent external requests; measure whole-endpoint p95 and failure rate.
- Health ready within 60 seconds; request completion below 30 seconds.
- Actual public endpoints and at least one complete sample against the pulled Docker image.
- OpenAPI generation and working examples, checked against real response bodies.

Add README commands for unit, API, deterministic public-sample, and opt-in live tests.

## 12. Deployment and submission

Keep Docker aligned with final dependencies/build outputs. Bind 0.0.0.0, document/expose the service port, and use /health. Exclude secrets from source, build context, image layers, and logs. Supply runtime model credentials through documented environment variables, including organizer fallback execution.

Publish an image with an exact stable tag or digest. Pull and run that registry reference using the exact documented commands. Keep it available during evaluation. Keep both public endpoints reachable without login/VPN/manual setup and maintain sufficient model quota.

README must include clean clone/install/start, dependency/runtime requirements, .env.example, model/provider, LLM role, guardrails, optimizer, exact run command, health/API curl examples, public-sample tests and expected results, Docker pull/run/port, known limitations, secret handling, and credits for external tools/dependencies.

Repository must be created after question reveal, private during the event, and public after the deadline. Include fixtures and configuration needed for clean reproduction without secrets.

Submit public API base URL, repository, README/configuration, tested fallback image, and accessible video <= 3 minutes. Video explains the problem, architecture, LLM -> guardrail -> optimizer flow, and execution/testing. It is required but used only for tie-breaking, not base points.

## 13. Build order and acceptance gates

1. API foundation: DTOs, configuration, real 200 status, health, filter, Swagger. Gate: correct health and malformed-input behavior.
2. Solver prototype: one hand-computable case. Gate: correct cost and independent replay.
3. Gemini: batched structured output, context-aware prompt, guardrails, bounded recovery. Gate: reference interpretations and representative paraphrases.
4. Full optimizer: directives, LP, netting, precise formatting, replay. Gate: all ten reference costs with valid plans.
5. Full integration: real end-to-end requests. Gate: all live public cases without hard-coded responses.
6. Reliability: deadlines, redaction, repeated/concurrent tests. Gate: controlled recovery and measured deployed latency.
7. Deployment: public service and image. Gate: external checks and clean pulled-image reproduction.
8. Submission: README, stable image reference, repository visibility, video, accessible links.

Scoring: interpretation 25; directive/energy correctness 25; optimization 10; API 10; reliability 10; deployment/Docker 10; documentation 10.

The guide's quality ratio is min(1, organizer_optimal_cost / recalculated_team_cost) for valid cases. Invalid cases get zero optimization credit. Both costs near zero receive ratio 1; follow official judge handling for other zero-cost cases rather than dividing blindly. This is an evaluation metric; the optimizer's objective remains minimum grid cost.

## 14. Remaining verification items and references

- Confirm Gemini model/account quota, schema support, SDK timeout/abort/retry options.
- Confirm solver exports, typings, status values, zero-variable behavior, and execution bounds.
- Resolve differing overlapping solar factors if organizer/judge material introduces them.
- Recheck updated official tolerances or submission instructions.
- Separately correct obsolete no_op fallback advice in docs/requirement.md; it must not override this plan or the PDFs.

Implementation references:

- [NestJS controllers/status codes](https://docs.nestjs.com/controllers)
- [NestJS Swagger](https://docs.nestjs.com/openapi/introduction)
- [Google GenAI getting started](https://ai.google.dev/gemini-api/docs/get-started)
- [Gemini structured output](https://ai.google.dev/gemini-api/docs/structured-output)
- [JavaScript LP solver](https://github.com/JWally/jsLPSolver)
