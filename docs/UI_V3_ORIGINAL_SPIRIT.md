# UI v3 — Original Spirit / Modernized

> **Historical design note.** This records an earlier visual pass and is not the current architecture contract. See [`UI_UX_V2.md`](UI_UX_V2.md) for the canonical current surface mapping and [`DESIGN_TOKENS.md`](DESIGN_TOKENS.md) for current color semantics.

This visual pass restores the density and quiet visual language of the earlier psy-exp workspace without rolling back the hardened research architecture.

Principles:

- keep Researcher Console / Participant Runner / research reports separated;
- keep protocol, QC, accessibility, small-N and provenance safeguards intact;
- return the main research workspace to a compact 1180px shell;
- reduce dashboard-like metric prominence, shadows, oversized spacing and explanatory cards;
- keep task cards dense and scannable;
- keep participant-facing Runner focused on one next action;
- record successful preflight checks without visually flooding the participant;
- make reports read more like research documents than BI dashboards.

This pass intentionally changes CSS only. DOM structure, task protocols, data models and JavaScript workflow logic are unchanged.