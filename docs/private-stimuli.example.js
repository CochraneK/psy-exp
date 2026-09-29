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
  },
  bwais: {
    setId: 'YOUR-AUTHORIZED-SET-ID',
    version: 'YOUR-MATERIAL-VERSION',
    source: 'Describe license/source privately',
    // Required: exactly 29 non-empty knowledge question strings.
    knowledge: [],
    // Required: exactly 13 similarity pairs, each a [wordA, wordB] pair.
    similarities: [],
    // Required: exactly 21 non-empty picture completion items (SVG data URIs).
    picture: [],
    // Required: exactly 10 block design targets, each a 16-length
    // row-major 0/1 grid (4x4) of the target pattern to reproduce.
    blocks: []
  }
};
