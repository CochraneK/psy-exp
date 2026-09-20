# AGENTS.md

## Project mission

`psy-exp` is a browser-native cognitive research prototype for task execution, session QC, research-safe scoring, reporting, and data export.

The repository must preserve a strict boundary between **software correctness / research workflow support** and **psychometric or clinical equivalence claims**.

## Canonical sources

Read these before changing behavior:

1. `README.md` — current public product/research boundary.
2. `task-manifest.json` — machine-readable task/runtime/material metadata.
3. `protocol-lock.json` — protocol governance lock.
4. `RESEARCH_VALIDATION.md` — validation claims and limits.
5. `docs/PROTOCOL_GOVERNANCE.md` — protocol-change rules.
6. `docs/RESEARCH_DATA_MODEL.md` — data model.
7. `docs/BACKEND_V1.md` — optional HTTP replica architecture.
8. `.github/workflows/ci.yml` — executable regression contract.

This file and the handoff files summarize those sources; they are not a second scientific truth.

## Do not break

- Do not describe this repository as an official or clinically equivalent MCCB implementation.
- Do not reintroduce MCCB T-score / clinical percentile language for the project-native research rank.
- Do not bypass QC, protocol/material/version compatibility gates, or Fluency semantic-review requirements.
- Do not commit private licensed stimuli, answer keys, operator forms, credentials, tokens, participant-sensitive exports, or local runtime data.
- Do not silently change protocol/material/scoring versions without updating their canonical metadata/governance.
- Keep Researcher Console and Participant Runner concerns separated.
- Preserve browser zoom/accessibility guardrails.
- Do not claim CI browser smoke proves real-device timing equivalence.

## Validation

Minimum portable validation:

```bash
node tests/full-battery.cjs
node tests/verify-ui.cjs
node tests/browser-smoke.cjs
```

For JavaScript edited outside those aggregate checks, also run `node --check <file>` as appropriate.

GitHub CI contains additional fail-closed research, protected-material, protocol-lock, data-model, and pseudo-standardization guards. A substantive change is not ready until the relevant CI passes.

## Agent workflow

For a bounded unit of work:

1. Read `HANDOFF.md` and the canonical files affected by the task.
2. Change canonical implementation/data/governance files first.
3. Run the smallest meaningful validation set, then the full portable battery when feasible.
4. Update `STATUS.md` if current capability/blocker state changed.
5. Append to `DECISIONS.md` only for material design/governance choices.
6. Update `HANDOFF.md` when the immediate next action or risk surface changes.
7. Commit before switching projects/agents.

## Owner-choice / external gates

Do not auto-decide:

- licensing or redistribution rights for protected assessment materials;
- clinical/psychometric validation claims;
- destructive Git-history rewriting;
- publication/privacy choices involving real participant data;
- changes that require real-device or empirical validation evidence not present in the repository.
