# Agent Handoff

## Current mission

Keep `psy-exp` usable as a browser-native cognitive research prototype while preserving its research-validity, privacy, protocol, and licensing boundaries.

## What is already established

- Researcher Console and Participant Runner are separate surfaces.
- Ten browser tasks are registered through `task-manifest.json`.
- Session QC, attempt history, protocol/material compatibility, and research-safe cohort ranking are implemented.
- Protected/private task material is injected locally rather than distributed in the public repository.
- CI includes static contracts, UI/accessibility checks, Chromium smoke, protected-material guards, protocol/data-model guards, and anti-pseudo-standardization checks.
- Public documentation explicitly distinguishes research workflow support from validated MCCB equivalence.

## Current non-code gates

The repository must **not** treat these as solved by engineering alone:

- target-device/browser timing equivalence;
- retest reliability / validity;
- official norm or clinical interpretation;
- licensing of protected assessment material;
- formal clinical-data governance suitability.

## Immediate next actions

1. Keep future product/UI changes inside the existing research boundary.
2. When a task/scoring/protocol behavior changes, update the manifest/protocol/validation documentation in the same bounded unit.
3. Re-run the portable battery and GitHub CI before merge.
4. If empirical validation work becomes available, record it in `RESEARCH_VALIDATION.md` rather than weakening current disclaimers.

## Validation

```bash
node tests/full-battery.cjs
node tests/verify-ui.cjs
node tests/browser-smoke.cjs
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
