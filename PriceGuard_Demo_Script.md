# PriceGuard AI Demo Script

## Goal

Show a five-minute journey from pricing input to a preventable engineering action.

## Flow

1. Open the prototype and reload the seeded pricing file.
2. Point out the quality-gate result: 1,000 records, 950 valid, 33 review, 17 block, 74 risk score.
3. Select the highest-risk BLOCK finding.
4. Walk through the evidence chain: request data, deterministic rule, historical signal, owner, and recommendation.
5. Click `Run RCA` to show the engineering investigation bundle and Codex prompt.
6. Click `Generate Test` to show how the finding becomes a regression-test handoff.
7. Close with the governance message: rules decide, AI explains, humans approve.

## Presenter Talk Track

PriceGuard catches risky SKU-pricing combinations before they become production issues. The hard checks are deterministic, so the application keeps control of pricing decisions. The AI layer explains why a row needs attention and packages the evidence for faster root-cause analysis.

This demo uses a seeded pricing incident. We upload a batch, the quality gate classifies every row, and then we open one high-risk combination. The RCA output shows the likely root cause, the evidence bundle, the code area to inspect, and a Codex-ready prompt. The final step generates a regression-test stub so the same issue does not return after the fix.

## Judging Points

- Clear separation between deterministic rules and AI assistance.
- Complete story from detection to prevention.
- Measurable pilot path: diagnosis time, pre-production detection, engineering effort, and false-positive rate.
- Safe enterprise boundary: read-only AI analysis and human-controlled production changes.
