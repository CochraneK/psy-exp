# Research evidence register

> Scope: evidence anchors for **research-governance decisions** in psy-exp.  
> These papers do **not** validate psy-exp, do not establish MCCB equivalence, and do not authorize use of MCCB norms or clinical interpretation.

## Why this file exists

The codebase already separates engineering correctness from psychometric validity. This register records external evidence that motivates the validation gates so later implementation choices can point to a stable source rather than relying on UI labels or informal memory.

## Evidence anchors

### Computerized attention tasks: reliability, validity, and practice effects

**Langner R, Scharnowski F, Ionta S. (2023). _Evaluation of the reliability and validity of computerized tests of attention._ PLOS ONE.**  
DOI: `10.1371/journal.pone.0281196`

Relevant findings reported by the paper:
- computerized cognitive scores still require explicit psychometric evaluation;
- test-retest reliability and practice effects are separate properties;
- practice effects can differ across metrics within the same task;
- reaction-time measures should not be assumed interchangeable simply because they come from related paradigms.

**psy-exp implication:** preserve task-specific raw metrics, version them, and validate repeated-measure behavior before interpreting longitudinal change.

### Remote / unsupervised computerized assessment

**Kochan NA, Heffernan M, Valenzuela M, et al. (2022). _Reliability, Validity, and User-Experience of Remote Unsupervised Computerized Neuropsychological Assessments in Community-Living 55- to 75-Year-Olds._ Journal of Alzheimer's Disease.**  
DOI: `10.3233/jad-220665`

The study explicitly examined reliability, convergent validity, practice effects, and user experience for at-home computerized testing, using repeated administrations including a practice/baseline session.

**psy-exp implication:** browser delivery and successful CI are not enough. Remote use requires its own target-population, device/browser, repeated-measure, and user-experience evidence.


### Device choice can shift measured reaction time

**Passell E, Strong RW, Rutter LA, et al. (2021). _Cognitive test scores vary with choice of personal digital device._ Behavior Research Methods.**  
DOI: `10.3758/s13428-021-01597-3`

In a very large web-based sample, timed cognitive performance differed across device classes and interfaces. The paper specifically reports slower measured reaction times on mobile devices—particularly Android phones—and differences associated with screen/interface characteristics, consistent with device latency contributing measurement variance.

**psy-exp implication:** device/browser metadata and target-device validation are not optional for RT-sensitive tasks. Raw millisecond values from heterogeneous personal hardware must not be assumed exchangeable merely because the browser code is identical.

### Web and laboratory RT can correlate without being equivalent

**Backx R, Skirrow C, Dente P, Barnett JH, Cormack FK. (2020). _Comparing Web-Based and Lab-Based Cognitive Assessment Using the Cambridge Neuropsychological Test Automated Battery: A Within-Subjects Counterbalanced Study._ Journal of Medical Internet Research.**  
DOI: `10.2196/16792`

The within-subject comparison found that some performance indices showed useful agreement across settings, while reaction times were systematically slower in web-based assessment. Correlation therefore did not by itself establish equivalence or agreement for RT.

**psy-exp implication:** a future timing-conformance study must test absolute bias/agreement—not only correlation—and must separate accuracy/performance indices from reaction-time endpoints.

### Test-retest reliability and practice effects in a computerized battery

**Rijnen SJM, van der Linden SD, Emons WHM, et al. (2018). _Test-retest reliability and practice effects of a computerized neuropsychological battery: A solution-oriented approach._ Psychological Assessment.**  
DOI: `10.1037/pas0000618`

This paper is directly concerned with test-retest reliability and practice effects in a computerized neuropsychological battery.

**psy-exp implication:** repeated testing must be treated as a measurement-design problem, not merely a storage/versioning problem. Practice/familiarization policies should be frozen per protocol and empirically evaluated.

### Metric choice and convergent validity

**Dean AC, Pochon J-B, Bilder RM, et al. (2024). _Convergent Validity of Experimental Cognitive Tests in a Large Community Sample._ Assessment.**  
DOI: `10.1177/10731911241283410`

The study reports that validity can differ across derived metrics from related cognitive tasks; for example, some interference-score transformations showed weaker convergence than simpler reaction-time measures.

**psy-exp implication:** derived scores require independent justification. The project should prefer transparent raw/task-level metrics until a derived metric has evidence and a frozen definition.

### Computerized screening battery validity/reliability

**Sawada Y, Satoh T, Saba H, et al. (2023). _Validity and reliability of a computerized cognitive function evaluation battery (CogEvo) as a screening tool._ Psychiatry and Clinical Neurosciences Reports.**  
DOI: `10.1002/pcn5.67`

The paper evaluates a computerized battery using explicit reliability and validity analyses and describes scoring that combines accuracy and reaction time.

**psy-exp implication:** any future composite or standardized transformation needs a declared empirical derivation and validation dataset; it must not be inferred from implementation convenience.

## Governance rules derived from this evidence

1. **No equivalence by resemblance.** A browser task that resembles a named neuropsychological test is not automatically equivalent to it.
2. **Validate the metric, not just the task.** Accuracy, RT, variability, interference scores, and composites can have different psychometric behavior.
3. **Repeated use needs repeated-use evidence.** Test-retest reliability, practice effects, and familiarization must be assessed explicitly.
4. **Remote delivery is a separate validation context.** Device, browser, supervision, environment, and target population matter.
5. **Correlation is not timing equivalence.** For RT-sensitive measures, assess systematic bias/agreement across target devices and administration settings rather than relying on correlation alone.
6. **Do not silently correct device latency.** Device/browser metadata may support stratification, QC, or exclusion rules, but any numerical latency correction requires its own validated calibration model.
7. **Keep raw data and provenance.** Derived metrics should remain traceable to raw performance, task version, protocol, material/scoring signature, and QC state.
8. **CI is engineering evidence only.** Automated tests can guard implementation invariants but cannot establish psychometric validity.

## Evidence status

- Source discovery/review: Scite + Consensus cross-check, 2026-09-17.
- This is a **curated evidence register**, not a systematic review.
- Before a formal study or validated mode, replace this lightweight register with a preregistered literature review and study-specific validation plan.