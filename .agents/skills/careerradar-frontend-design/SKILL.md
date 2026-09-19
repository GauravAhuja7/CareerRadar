---
name: careerradar-frontend-design
description: Developer-grade frontend design skill for CareerRadar Chrome extension. Enforces Linear, Raycast, and modern developer observability console aesthetics, compact metric groups, semantic colors, and 3-second decision scannability.
---

# CareerRadar Frontend Design Skill

CareerRadar is a developer-grade Chrome extension for evaluating candidate/job fit.

## Visual Direction
- Linear / Raycast / developer-tool aesthetic
- Dense but breathable
- No generic AI SaaS aesthetics
- No excessive gradients
- No oversized cards
- No decorative UI that doesn't communicate information

## Hierarchy
1. Verdict (Hero recommendation + circular fit gauge)
2. Core metrics (Fit %, Systems Synergy /4, Screen Odds %)
3. Evidence ("Why this verdict" matched deliverables & nuance tags)
4. Experience gap (Compact 3–5 yrs req → 1.5 yrs candidate comparison)
5. Technical alignment (Horizontal skill progress indicators with percentages)
6. Secondary details & progressive disclosure (Reasoning drawer, latency telemetry)

## Component Rules
- Prefer one primary container or unified visual hierarchy over disconnected nested cards
- Use semantic status colors only (emerald green for strong fit, warm amber for stretch/gap, rose for mismatch)
- Use compact metric groups instead of dashboard tiles
- Use progressive disclosure for detailed reasoning (modal or collapsible telemetry)
- Keep the primary verdict visible without scrolling

## Interaction
- Every verdict must expose reasoning via "View reasoning"
- Secondary information should collapse cleanly
- Use hover/focus states on all interactive elements
- Keyboard accessible (with shortcuts hints like ⌘R, ⌘↵)
- Never hide important information behind animation
- Ensure responsive layout at 360–420px extension widths
