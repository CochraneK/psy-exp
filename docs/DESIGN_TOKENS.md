# psy-exp design tokens

> Canonical UI semantics for the researcher console, participant runner, governance surfaces, and research reports.  
> Task stimuli and timing-critical experiment screens remain a separate visual surface and should not be restyled merely for brand consistency.

## Semantic color system

The current v3/v6 UI palette is intentionally restrained:

| Role | Token | Value | Use |
|---|---|---:|---|
| App background | `--lab-bg` / `--ui-bg` | `#f6f7fb` | page background |
| Surface | `--lab-surface` / `--ui-surface` | `#ffffff` | cards, panels |
| Primary text | `--lab-text` / `--ui-text` | `#182230` | headings, primary copy |
| Muted text | `--lab-muted` / `--ui-muted` | `#667085` | metadata, helper text |
| Border | `--lab-line` / `--ui-line` | `#e4e7ec` | neutral separators |
| Primary action | `--lab-accent` / `--ui-accent` | `#5b5bd6` | navigation, primary CTA, research identity |
| Valid / complete | `--lab-success` / `--ui-green` | `#168a63` | QC-valid, completed, successful |
| Review / caution | `--lab-warning` / `--ui-amber` | `#ad6c1d` | pending review, boundary notice |
| Risk / destructive | `--lab-danger` / `--ui-red` | `#c44558` | delete, invalid, destructive |
| Informational | `--lab-info` / `--ui-blue` | `#3976b8` | neutral information state |

## Color semantics

- **Indigo is not a score.** It represents product identity and primary action.
- **Green means valid/completed/successful only.** Do not use it simply to make a card look positive.
- **Amber means review/caution.** It is the default tone for research-boundary and pending-review notices.
- **Red is reserved for destructive actions, invalid state, or explicit failure.**
- **Blue is informational**, not “better performance.”
- Cognitive-domain colors may differentiate series in reports, but must not imply normative desirability.

## Research surfaces vs task surfaces

### Researcher / reporting surfaces

Use the semantic token system for:
- Researcher Console
- Participant Runner navigation/progress shell
- data governance
- single-participant research report
- cohort comparison report

### Timing-critical task surfaces

Task pages under `pages/` prioritize:
- stimulus consistency;
- target contrast and legibility;
- minimum interaction ambiguity;
- stable geometry;
- timing behavior.

Do not propagate decorative console changes into task stimuli without a protocol/version review.

## Interaction states

Every reusable control should provide:
- default;
- hover where pointer input exists;
- focus-visible;
- disabled;
- success/pending/error only when semantically appropriate.

Minimum rule: state must not be conveyed by color alone.

## Typography

Current code uses the native system stack:

```css
-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif
```

Do not introduce a webfont into timing-critical task pages without measuring its loading/layout effects.

## Accessibility baseline

- Browser zoom must remain enabled.
- Focus-visible styling must remain visible.
- Destructive actions require both label/context and danger color.
- Text/background contrast should be checked when tokens change.
- Reduced-motion preferences must be respected on non-task decorative motion.

## Source of truth

Current surface mapping is canonicalized in [`UI_UX_V2.md`](UI_UX_V2.md).

- Original console structure: `index.html`
- Original console polish: `original-ui-polish.css` (loaded by `research-session.js`, reversible with `?ui=classic`)
- Participant Runner / governance shell: `research-ui.css`
- Report base + semantic override: `mccb-common.css` + `research-color-system.css`
- Timing-critical task presentation: `mccb-common.css` plus task-local styles under `pages/`

If these files diverge, semantic meaning wins over pixel-perfect color matching. Do not consolidate task-page styling merely to reduce CSS duplication; experimental stability has higher priority than design-system purity.