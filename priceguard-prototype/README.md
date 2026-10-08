# PriceGuard AI Prototype

This is a runnable hackathon prototype for the PriceGuard AI use case. It shows the complete demo path from pricing input to PASS, REVIEW, and BLOCK findings, then into RCA evidence and a generated regression-test stub.

## Run

```bash
python3 server.py --port 8765
```

Open `http://127.0.0.1:8765`.

## Explanation agent (optional API key)

`Explain with AI` on a finding calls the Explanation agent. With a key set, it asks the model to explain the finding from a bounded evidence bundle and checks the answer against that evidence. Without a key, or if the call fails, it shows the rule-based summary, so the demo still runs offline.

```bash
export OPENAI_API_KEY=...                      # never commit this
export PRICEGUARD_EXPLAIN_MODEL=gpt-6-luna     # optional, this is the default
export OPENAI_BASE_URL=https://.../v1          # optional, for an approved gateway
python3 server.py --port 8765
```

Or keep the key in a file: copy `.env.example` to `.env` in this folder and fill in `OPENAI_API_KEY`. The server loads it at startup. `.env` is in `.gitignore`, so it is not committed; a real environment variable overrides the file.

`GET /api/health` reports whether the agent is in `llm` or `template` mode. The model never sets PASS, REVIEW, or BLOCK.

## What the demo proves

- Deterministic rules keep the pricing decision controlled.
- The anomaly layer adds historical and relationship evidence.
- The RCA view packages request data, rules, logs, and code references.
- The regression-test action creates a concrete handoff for Codex-assisted engineering.

## API

- `GET /api/health`
- `GET /api/seed`
- `GET /api/rule-settings`, `POST /api/rule-settings`
- `POST /api/analyze`
- `GET /api/findings/{id}/explanation`
- `POST /api/explain`
- `GET /api/findings/{id}/rca`
- `POST /api/findings/{id}/regression-test`
- `POST /api/feedback`

## Seed scenario

The seeded run returns the presentation story:

- 1,000 records analyzed
- 950 valid
- 33 review
- 17 block
- 74 overall risk score

## Production mapping

The no-dependency Python server exists only to make the prototype easy to run in a hackathon room. The production shape should move the same contracts into:

- React + Vite + TypeScript for the frontend
- Java 17+ Spring Boot for the backend, aligned with the existing pricing application
- PostgreSQL for findings, audit, feedback, and JSON evidence bundles
- Approved OpenAI endpoint for summarization and RCA assistance
- Codex skills/plugin for engineering RCA, regression tests, and code-freeze checks
