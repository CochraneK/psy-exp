# Agent Handoff

## Current mission

Keep `psy-exp` usable as a browser-native cognitive research prototype while preserving its research-validity, privacy, protocol, and licensing boundaries.

## What is already established

- Researcher Console and Participant Runner are separate surfaces.
- Eleven browser tasks are registered through `task-manifest.json` (10 MCCB-related + 1 independent supplementary battery, the Brief WAIS / 简易韦氏 4-subtest synthetic battery; stimuli are code-generated in `pages/mccb-bwais-stimuli.js` and shipped publicly).
- Session QC, attempt history, protocol/material compatibility, and research-safe cohort ranking are implemented.
- Open-item review is a first-class workflow: `research-review.html` (researcher console) + `reviewFluency`/`reviewBwais` primitives in `mccb-participant.js`; contract-tested by `tests/verify-review.cjs` (one of the 16 full-battery groups).
- **Result-processing stage (2026-10-28 integration)**: `research-reports.html` report center renders the MCCB-workbench templates 1:1 over browser-local data (cohort reference T cohort-t-0.1.0 with N≥5 pool guard + official-score injection, official priority); `mccb-dashboard-export.js` exports the 34-column refresh.py-compatible CSV; `analysis/` holds the cleaned `refresh.py` framework + template extractor; `demo/` holds the 100%-synthetic demo site. `tests/verify-export-csv.cjs` proves the browser→CSV→refresh.py roundtrip (per-record fields + JS/scipy KW cross-validation).
- Protected/private task material is injected locally rather than distributed in the public repository.
- Local-primary storage plus HTTP replica has offline resilience (`local-primary-http-replica-1.1.0`): bounded FIFO outbox with exponential backoff, fatal-failure action gates (researcher-triggered manual sync bypasses), and automatic recovery triggers (online / tab re-visibility); network never enters a timed trial's critical path.
- All eleven task pages share one runtime-registered leave guard (`research-runtime-0.5.0`): armed by `startLeaveGuard()` right after `markInProgress`, disarmed by `endLeaveGuard()` after `saveResult`; no page keeps its own `beforeunload` listener (contract-tested in `tests/verify-participant.cjs`)
- Research-grade CSV export (`research-table-export-1.0.0`): `research-export.js` builds `participant_wide` / `attempts` / `provenance` / `audit_log` tables on the data-governance page (counts and scores only — free-text responses and private material content never enter a table); every export appends a `table_exported` audit entry (contract-tested in `tests/verify-export.cjs`, one of the 16 full-battery groups).
- CI includes static contracts, UI/accessibility checks, desktop Chromium smoke, mobile layout (390x844) smoke, reports-center E2E, CSV→refresh.py roundtrip (scipy), protected-material guards, protocol/data-model/scoring-bundle guards, and anti-pseudo-standardization checks.
- Public documentation explicitly distinguishes research workflow support from validated MCCB equivalence.

## Current non-code gates

The repository must **not** treat these as solved by engineering alone:

- target-device/browser timing equivalence;
- retest reliability / validity;
- official norm or clinical interpretation;
- licensing of protected assessment material;
- formal clinical-data governance suitability.

## Immediate next actions

1. Score open-ended responses in `research-review.html` (Fluency semantic + BWAIS open items; BWAIS expected picture answers live in `tools/bwais-scenes.cjs`). BWAIS `verified` requires all three open-item scores **and** the auto-scored block raw score.
2. Real-device timing validation for the newly public BWAIS synthetic battery (CI alone does not prove cross-device timing equivalence).
3. Keep future product/UI changes inside the existing research boundary.
4. When a task/scoring/protocol behavior changes, update the manifest/protocol/validation documentation in the same bounded unit.
5. Re-run the portable battery (16 groups) and GitHub CI before merge.
6. If empirical validation work becomes available, record it in `RESEARCH_VALIDATION.md` rather than weakening current disclaimers.
7. When touching the report center / CSV export / `analysis/` pipeline, keep the caliber statement visible (cohort reference T is not MCCB official norms) — CI greps `research-reports.html` for it.

## Validation

```bash
node tests/full-battery.cjs
node tests/verify-ui.cjs
node tests/browser-smoke.cjs
node tests/mobile-smoke.cjs
node tests/verify-cohort-t.cjs
node tests/verify-reports-e2e.cjs
node tests/verify-export-csv.cjs   # needs Chrome + Python 3 with scipy
```

## Canonical files

- `task-manifest.json`
- `protocol-lock.json`
- `RESEARCH_VALIDATION.md`
- `docs/PROTOCOL_GOVERNANCE.md`
- `docs/RESEARCH_DATA_MODEL.md`
- `docs/BACKEND_V1.md`
- implementation/runtime files referenced by the manifest
- `.github/workflows/ci.yml`

## Do not

- do not store project state only in chat;
- do not convert a passing CI run into a psychometric-validity claim;
- do not expose private stimuli or participant-sensitive data;
- do not let dashboard/report wording drift into clinical interpretation.

## Session closeout

Before handing the project to another agent or conversation, checkpoint material code/docs changes to Git and update `STATUS.md`, `DECISIONS.md` when needed, and this handoff if the next gate changed.
