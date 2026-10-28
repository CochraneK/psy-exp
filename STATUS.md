# Status

## State

**Active research software prototype.**

The repository is engineering-mature enough to run its browser research workflow and automated regression suite, but it intentionally remains **not psychometrically or clinically validated as an MCCB-equivalent implementation**.

## Current capabilities

- researcher/participant surface separation;
- eleven browser cognitive research tasks (10 MCCB-related + 1 independent supplementary battery, the Brief WAIS / 简易韦氏 4-subtest synthetic battery with code-generated stimuli);
- local session/result persistence plus HTTP replica architecture with auto-sync and offline backoff (`local-primary-http-replica-1.1.0`);
- task/runtime/protocol/material metadata;
- session QC and attempt history;
- one runtime-registered leave guard across all eleven tasks (warns on close/refresh only while a session is open; no page-local `beforeunload` listeners);
- protocol/material/version-compatible research ranking;
- guarded Fluency semantic review plus a BWAIS open-item review console (`research-review.html`, backed by `reviewFluency`/`reviewBwais` primitives);
- raw/report/comparison/export research surfaces;
- research-grade CSV table export on the data-governance page (`participant_wide` / `attempts` / `provenance` / `audit_log`, `research-table-export-1.0.0`) with a `table_exported` audit trail — counts and scores only, free-text responses never enter a table;
- **report center** (`research-reports.html`): in-browser cohort overview + per-person reports rendering the MCCB-workbench templates 1:1 (`mccb-report-templates.js`, byte-identical roundtrip), with cohort reference T (cohort-t-0.1.0, N≥5 guard) and official-score injection (official takes priority);
- **dashboard-compatible CSV export** (`mccb-dashboard-export.js`): 34-column refresh.py schema, plus a full browser→Python roundtrip test (`tests/verify-export-csv.cjs`) that cross-validates the JS Kruskal-Wallis against scipy on identical input;
- **`analysis/` framework** (cleaned `refresh.py` + template extractor) and the 100%-synthetic `demo/` site;
- automated static, UI/accessibility, desktop browser-smoke, mobile layout (390x844), reports-center E2E, CSV→refresh.py roundtrip, protocol, privacy/material and scoring regression checks.

## Current limitations / external gates

- no official MCCB T-score or clinical percentile interpretation;
- no claim of standard MCCB equivalence;
- cohort reference T (cohort-t-0.1.0) is a within-cohort research reference (N≥5 per test pool), not a norm; KW significance results on small samples are exploratory only;
- no cross-device timing-equivalence evidence from CI alone;
- private licensed material must remain outside public Git;
- formal empirical reliability/validity and target-device validation remain separate research work;
- GitHub Pages/local browser storage should not be treated as formal clinical-data infrastructure.

## Canonical status sources

Task and protocol state live in `task-manifest.json`, `protocol-lock.json`, `RESEARCH_VALIDATION.md`, and the implementation they govern. This file is a handoff summary only.
