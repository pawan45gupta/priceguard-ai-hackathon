# PriceGuard AI Hackathon

PriceGuard is a pricing quality gate and root-cause assistant for SKU pricing. The prototype demonstrates the complete hackathon story: upload pricing rows, run deterministic quality checks, classify rows as PASS, REVIEW, or BLOCK, inspect evidence, generate RCA output, and create a regression-test handoff for Codex.

## Run the Prototype

```bash
cd priceguard-prototype
python3 server.py --port 8765
```

Open `http://127.0.0.1:8765`.

The seeded demo returns:

- 1,000 records analyzed
- 950 valid
- 33 review
- 17 block
- 74 risk score

## Repository Layout

- `priceguard-prototype/`: runnable no-dependency prototype.
- `priceguard-codex-plugin/`: skills-only Codex plugin skeleton for RCA and code-freeze workflows.
- `PriceGuard_Freeze_Pack.md`: architecture, stack, governance, and freeze notes.
- `PriceGuard_Demo_Script.md`: five-minute presenter flow.
- `PriceGuard_Code_Freeze_Manifest.json`: machine-readable freeze manifest.

## Recommended Production Stack

- Frontend: React + Vite + TypeScript.
- Backend: Java 17+ Spring Boot, aligned with the existing pricing application.
- Database: PostgreSQL for findings, audit trail, reviewer feedback, and JSON evidence bundles.
- AI boundary: approved OpenAI endpoint for bounded explanation and RCA assistance.
- Codex usage: reusable skills for RCA, regression tests, and release-freeze checks.

## Safety Principle

Rules decide. AI explains. Humans approve.

The prototype never changes production prices. AI output remains read-only and advisory.
