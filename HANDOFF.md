# Agent Handoff

## Current mission

Keep `psy-exp` usable as a browser-native cognitive research prototype while preserving its research-validity, privacy, protocol, and licensing boundaries.

## What is already established

- Researcher Console and Participant Runner are separate surfaces.
- Eleven browser tasks are registered through `task-manifest.json` (10 MCCB-related + 1 independent supplementary battery, the Brief WAIS / 简易韦氏 4-subtest synthetic battery; stimuli are code-generated in `pages/mccb-bwais-stimuli.js` and shipped publicly).
- Session QC, attempt history, protocol/material compatibility, and research-safe cohort ranking are implemented.
- Open-item review is a first-class workflow: `research-review.html` (researcher console) + `reviewFluency`/`reviewBwais` primitives in `mccb-participant.js`; contract-tested by `tests/verify-review.cjs` (one of the 14 full-battery groups).
- Protected/private task material is injected locally rather than distributed in the public repository.
- Local-primary storage plus HTTP replica has offline resilience (`local-primary-http-replica-1.1.0`): bounded FIFO outbox with exponential backoff, fatal-failure action gates (researcher-triggered manual sync bypasses), and automatic recovery triggers (online / tab re-visibility); network never enters a timed trial's critical path.
- All eleven task pages share one runtime-registered leave guard (`research-runtime-0.5.0`): armed by `startLeaveGuard()` right after `markInProgress`, disarmed by `endLeaveGuard()` after `saveResult`; no page keeps its own `beforeunload` listener (contract-tested in `tests/verify-participant.cjs`).
- CI includes static contracts, UI/accessibility checks, desktop Chromium smoke, mobile layout (390x844) smoke, protected-material guards, protocol/data-model guards, and anti-pseudo-standardization checks.
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
5. Re-run the portable battery (14 groups) and GitHub CI before merge.
6. If empirical validation work becomes available, record it in `RESEARCH_VALIDATION.md` rather than weakening current disclaimers.

## Validation

```bash
node tests/full-battery.cjs
node tests/verify-ui.cjs
node tests/browser-smoke.cjs
node tests/mobile-smoke.cjs
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
