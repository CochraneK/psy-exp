/*
 * Example only — do not put licensed/standardized materials in the public repo.
 *
 * Copy this file outside the repository to:
 *   private/stimuli.js
 * and populate it only with materials you are authorized to use.
 * The `private/` directory is git-ignored.
 */
window.PSY_PRIVATE_STIMULI = {
  hvlt: {
    setId: 'YOUR-AUTHORIZED-SET-ID',
    version: 'YOUR-MATERIAL-VERSION',
    source: 'Describe license/source privately',
    // Required: exactly the stimulus words authorized for your deployment.
    words: [],
    // Required: foils for the recognition phase. Must be the same length as
    // `words` (standard HVLT-R: 12 targets + 12 foils = 24 items), with no
    // duplicates and no overlap with `words`.
    foils: [],
    // Required protocol timings for this research adaptation.
    // Standard delayed recall is about 5 minutes: 300000.
    presentationMsPerWord: 0,
    interWordMs: 0,
    delayedRecallMs: 0
  }
};
