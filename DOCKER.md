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

## Publish the completed application

Create a Docker Hub repository named gridwise that organizers can pull.
Replace YOUR_DOCKERHUB_USERNAME below with your actual Docker Hub username.
Publish only the version you intend to share; the image contains compiled code.

```sh
docker login
docker build --platform linux/amd64 -t YOUR_DOCKERHUB_USERNAME/gridwise:preliminary-v1 .
docker push YOUR_DOCKERHUB_USERNAME/gridwise:preliminary-v1
docker pull YOUR_DOCKERHUB_USERNAME/gridwise:preliminary-v1
docker run --rm --name gridwise -p 3000:3000 --env-file .env YOUR_DOCKERHUB_USERNAME/gridwise:preliminary-v1
```

Recheck /health, then repeat the /optimize-energy smoke test above against the
pulled image. Record these verified commands, runtime variable names, port,
and image reference in README.md for submission. Keep the submitted tag
unchanged; use a new tag for a subsequent release. A registry digest can also
be submitted to identify the exact image contents.
