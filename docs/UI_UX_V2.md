# UI / UX architecture — current

> Canonical UI architecture document. The filename `UI_UX_V2.md` is retained for stable links; the content tracks the current implementation rather than a frozen v2 snapshot.

This document describes the browser workflow after the research-safety hardening and subsequent UI restoration/polish passes. It is a product/interface contract, not a psychometric validation claim.

## Surface separation

### Researcher Console (`index.html`)

The console is for researchers/operators. It exposes participant creation/selection, QC state, pending Fluency semantic review, task-level inspection/retest entry points, report links, export, and an explicit DEV/USER operator toggle.

DEV mode is intentionally kept out of the participant-facing workflow.

### Participant Runner (`participant-runner.html`)

The runner is for task administration. It always launches tasks in USER mode and shows only participant ID, progress, the next task, task status, and a basic device/software preflight.

When a USER-mode task uses its legacy “return to center” link, `index.html` detects the same-origin task referrer and returns the participant to the runner instead of leaving them in the researcher console. DEV-mode task returns stay in the console.

## Surface / stylesheet contract

The current UI deliberately uses several presentation layers rather than one global stylesheet:

| Surface | Primary presentation layer | Constraint |
|---|---|---|
| Researcher Console (`index.html`) | original inline shell + opt-in `original-ui-polish.css` injected by `research-session.js` | preserve the compact original DOM and researcher workflow |
| Participant Runner / Data Governance | `research-ui.css` + `research-app` | long-page application scrolling, focus, responsive layout |
| Research reports | `mccb-common.css` + `research-color-system.css` + page-level report layout | research-document presentation without changing scoring logic |
| Task pages (`pages/`) | `mccb-common.css` task shell | stable stimulus geometry and timing-oriented interaction |

`original-ui-polish.css` can be disabled with `?ui=classic`; it is a visual layer, not a protocol dependency.

Do not merge these layers into one global shell merely for visual consistency. Any change that reaches `pages/` must be reviewed as a possible protocol/stimulus change and browser-tested separately from researcher/report surfaces.

## Rank-display guardrail

The scoring engine may calculate protocol-compatible within-project tied ranks for any compatible group, including very small groups. UI presentation is more conservative:

- `reference N < 5`: do not display the 0–100 rank number.
- `reference N = 5–9`: display it only with an explicit exploratory/unstable warning.
- `reference N >= 10`: display normally, while still labelling it as a within-project research rank rather than a clinical percentile.

`MIN_REFERENCE_N = 5` is an interface guardrail against false precision. It is **not** a validated inferential sample-size threshold and does not convert the index into a standardized or clinical score.

Raw data, QC, protocol signatures, and reference-group membership remain available even when the rank is suppressed.

## Device/software preflight

The participant runner records a local preflight snapshot containing:

- localStorage availability,
- `performance.now()` availability,
- a short timer-jitter probe,
- visibility state,
- viewport/device-pixel ratio,
- screen size,
- secure-context state,
- hardware-concurrency/touch metadata where exposed by the browser,
- reduced-motion preference,
- browser user agent/language.

The timer probe is only a fast software/environment warning. Passing it does not establish timing equivalence across browsers/devices.

The preflight snapshot is stored in the participant record and therefore travels with the project's normal JSON export. Formal research deployments should review whether every device field is necessary under their privacy/data-minimization plan.

## Reporting

`research-report.html` defaults to human-readable QC and research-status information. Protocol signatures and provenance are collapsed into advanced detail blocks. Fluency raw entries are available for explicit researcher review without being inserted as HTML.

`research-comparison.html` groups rows by domain and reference-group signature, provides participant search, preserves cross-group non-comparability, applies the same small-N display guardrail, and can export the displayed comparison structure to CSV.

## Remaining UI work before a formal study

The current implementation is a research prototype. A formal frozen protocol should additionally define and test:

- supported browser/OS/device matrix,
- minimum viewport/physical-keyboard requirements per task,
- keyboard-only and screen-reader behavior where compatible with the construct,
- browser zoom and full-screen policy,
- break/resume policy between tasks,
- operator authentication and role separation,
- server-backed encrypted storage/backup,
- consent/study/site/session metadata,
- automated browser E2E and visual-regression tests on the frozen deployment.