# Docker build and submission

Run these commands from the directory containing package.json and Dockerfile.
Install and start Docker Desktop with Linux containers first:
https://docs.docker.com/desktop/setup/install/windows-install/

## Build and run locally

The container fails fast on startup without `GEMINI_API_KEY`, so pass your
local `.env` file even for this first check:

```sh
docker build -t gridwise:dev .
docker run --rm --name gridwise -p 3000:3000 --env-file .env gridwise:dev
```

In a second terminal (use curl.exe in Windows PowerShell):

```sh
curl http://localhost:3000/health
docker inspect --format '{{.State.Health.Status}}' gridwise
```

Expect HTTP 200 with {"status":"ok"}; Docker's health status should become
healthy after the first successful check. Stop the foreground container with
Ctrl+C. If port 3000 is occupied, use -p 3001:3000 and test localhost:3001.

## Runtime secrets

`GET /health` needs no credentials, but `POST /optimize-energy` calls Gemini and
requires `GEMINI_API_KEY`. Supply it (and the other env vars below) from a
local, uncommitted `.env` file at runtime - never bake it into the image:

```sh
docker run --rm --name gridwise -p 3000:3000 --env-file .env gridwise:dev
```

| Variable | Required | Default | Meaning |
|---|---|---|---|
| `GEMINI_API_KEY` | yes | - | Gemini API key used for operator-note interpretation |
| `GEMINI_MODEL` | no | `gemini-flash-lite-latest` | Gemini model id |
| `PORT` | no | `3000` | HTTP port the service listens on |
| `LLM_TIMEOUT_MS` | no | `6000` | Per-attempt timeout for a single Gemini call |
| `REQUEST_TIMEOUT_MS` | no | `25000` | Overall budget for one `/optimize-energy` request |
| `LLM_MAX_RETRIES` | no | `1` | Additional Gemini attempts after the first, shared between transport and guardrail-correction retries |

The container fails fast on startup if `GEMINI_API_KEY` is missing or blank.
The Docker build excludes `.env` files and copies only application build inputs.
Never put credentials in the Dockerfile, source code, or image build arguments.
The image runs as a non-root user and listens on 0.0.0.0:3000 by default.

### Smoke-test the optimization endpoint against the container

Extract one public sample's `input` object, then POST it:

```sh
node -e "console.log(JSON.stringify(require('./test/fixtures/gridwise-public-cases.json').cases[0].input))" > /tmp/sample01.json
curl -X POST http://localhost:3000/optimize-energy -H "Content-Type: application/json" --data @/tmp/sample01.json
```

A successful response is HTTP 200 with `directive_interpretation`, a 24-entry
`hourly_plan`, and `total_cost_bdt`/`total_grid_kwh`/`peak_grid_kwh` consistent
with that plan.

## Submitted fallback image

This is the exact image submitted for the preliminary round:

- **Registry:** Docker Hub
- **Tag reference:** `ahmadzubayer/gridwise:preliminary-v2`
- **Digest:** `sha256:b55cfe43384614335c28a06e7062cb928913ecafe2b184b0c4f4a45f705e8af9`
- **Pinned reference (immutable):** `ahmadzubayer/gridwise@sha256:b55cfe43384614335c28a06e7062cb928913ecafe2b184b0c4f4a45f705e8af9`

Pull and run it exactly like this:

```sh
docker pull ahmadzubayer/gridwise:preliminary-v2
docker run --rm --name gridwise -p 3000:3000 --env-file .env ahmadzubayer/gridwise:preliminary-v2
curl http://localhost:3000/health
```

**Verified end to end** by removing the local image entirely and pulling it back fresh (the same thing a judge does): the fresh pull resolved to the exact digest above, `docker inspect --format '{{.State.Health.Status}}'` reported `healthy`, `GET /health` returned `{"status":"ok"}`, `GET /` returned the landing page, and a real `POST /optimize-energy` against the organizer's SAMPLE-01 input returned the exact reference cost (38365 BDT). `docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}'` on the image confirms its baked-in `ENV` layer contains only `PATH`, `NODE_VERSION`, `YARN_VERSION`, `NODE_ENV`, `PORT` - no `GEMINI_API_KEY` or any other secret. The key reaches the container only via `--env-file .env` at `docker run` time.

`preliminary-v1` (digest `sha256:5e89151a1d7454715e2208351ba3fb92e3d57f94300df2aba5e44b72e4ab64aa`) remains on Docker Hub but is superseded - it predates the `/` landing page.

## Publishing a new version

To rebuild and publish an updated image (use a new tag - never overwrite `preliminary-v2`, the currently submitted tag, once it's been submitted):

```sh
docker login
docker build --platform linux/amd64 -t ahmadzubayer/gridwise:NEW_TAG .
docker push ahmadzubayer/gridwise:NEW_TAG
docker rmi ahmadzubayer/gridwise:NEW_TAG --force
docker pull ahmadzubayer/gridwise:NEW_TAG
docker run --rm --name gridwise -p 3000:3000 --env-file .env ahmadzubayer/gridwise:NEW_TAG
```

Force-removing the local image before the verification pull matters - without it, `docker run` can silently reuse a stale local build instead of proving the registry copy actually works. Recheck `/health`, repeat the `/optimize-energy` smoke test above, capture the new digest the same way, and update this file and README.md with the new reference.
