/**
 * Add wide-mode toggle to all MCCB test pages.
 * Run: node add-widemode.cjs
 * Inserts CSS before </style> and JS before </script>
 */
const fs = require('fs');
const path = require('path');

const DIR = 'D:/Software/DSH/psy-exp';
const PAGES = [
  'mccb-msceit.html',
  'mccb-bacs.html',
  'mccb-hvlt.html',
  'mccb-fluency.html',
  'mccb-spatial-span.html',
  'mccb-lns.html',
  'mccb-tmt.html',
  'mccb-bvmt.html',
  'mccb-mazes.html',
  'mccb-cpt.html',
];

// Per-page CSS overrides for wide mode (targeting test-area containers)
const PAGE_CSS = {
  'mccb-msceit.html': `/* Wide mode: MSCEIT */
body.wide-mode .test-card-container { max-width: 70rem; }
body.wide-mode .scenario-area .scenario-text { font-size: 1.15rem; }
body.wide-mode .options-area { max-width: 50rem; align-self: center; width: 100%; }
body.wide-mode #page-test { padding: 1.75rem 2.5rem; }
`,
  'mccb-bacs.html': `/* Wide mode: BACS */
body.wide-mode .grid-container { max-width: 55rem; width: 100%; }
body.wide-mode .grid-container .spatial-block { width: 2.75rem; height: 2.75rem; font-size: 0.9rem; }
body.wide-mode #page-test { padding: 1.5rem 3rem; }
body.wide-mode .input-row { max-width: 40rem; }
`,
  'mccb-hvlt.html': `/* Wide mode: HVLT-R */
body.wide-mode .recall-grid { max-width: 40rem; }
body.wide-mode .recall-input-row { max-width: 40rem; }
body.wide-mode #page-break p { max-width: 40rem; }
body.wide-mode #page-test { font-size: 110%; padding: 1.5rem 2.5rem; }
body.wide-mode .study-bar { max-width: 40rem; }
`,
  'mccb-fluency.html': `/* Wide mode: Fluency */
body.wide-mode #page-test { font-size: 110%; padding: 3rem; }
body.wide-mode .fluency-grid { gap: 0.75rem; }
`,
  'mccb-spatial-span.html': `/* Wide mode: Spatial-Span */
body.wide-mode #page-test { gap: 1.25rem; padding: 2rem 3rem; }
body.wide-mode .grid-container { max-width: 45rem; }
body.wide-mode .spatial-block { width: 5rem; height: 5rem; font-size: 1.375rem; }
body.wide-mode #spanDisplay { font-size: 450%; }
`,
  'mccb-lns.html': `/* Wide mode: LNS */
body.wide-mode #page-test { padding: 2.5rem 3rem; }
body.wide-mode .answer-area { max-width: 50rem; }
body.wide-mode .answer-area .char-box { width: 3rem; height: 3rem; font-size: 1.5rem; }
body.wide-mode .answer-area .prompt { font-size: 1.25rem; }
`,
  'mccb-tmt.html': `/* Wide mode: TMT */
body.wide-mode #page-welcome .part-cards { gap: 1.5rem; }
body.wide-mode #page-welcome .part-card { width: 18rem; padding: 1.5rem; }
`,
  'mccb-bvmt.html': `/* Wide mode: BVMT-R */
body.wide-mode .canvas-wrapper { max-width: 40rem; width: 90vw; }
body.wide-mode #page-test { font-size: 110%; }
body.wide-mode .recall-grid { gap: 0.875rem; }
`,
  'mccb-mazes.html': `/* Wide mode: Mazes */
body.wide-mode #page-test { gap: 0.875rem; padding: 1.5rem 2rem; }
`,
  'mccb-cpt.html': `/* Wide mode: CPT-IP */
body.wide-mode #page-test { gap: 1.5rem; padding: 2.5rem 3rem; }
body.wide-mode .stimulus-area { max-width: 50rem; }
body.wide-mode .stimulus-area .number-display { font-size: 6rem; }
body.wide-mode .inst-panel { max-width: 40rem; }
`,
};

function injectWideMode(fileName) {
  const filePath = path.join(DIR, fileName);
  let content = fs.readFileSync(filePath, 'utf-8');
  
  const cssBlock = PAGE_CSS[fileName];
  if (!cssBlock) {
    console.log(`  SKIP ${fileName}: no CSS defined`);
    return;
  }

  // === Inject CSS before </style> ===
  const styleEnd = content.lastIndexOf('</style>');
  if (styleEnd === -1) {
    console.log(`  FAIL ${fileName}: no </style> found`);
    return;
  }
  const beforeStyle = content.slice(0, styleEnd);
  const afterStyle = content.slice(styleEnd);
  content = beforeStyle + '\n' + cssBlock + '\n' + afterStyle;

  // === Inject JS before </script> (last one) ===
  const jsEnd = content.lastIndexOf('</script>');
  if (jsEnd === -1) {
    console.log(`  FAIL ${fileName}: no </script> found`);
    return;
  }

  const wmJs = `// === Wide Mode Toggle ===
(function(){var b=document.createElement('button');b.id='wm-toggle';b.textContent='⛶';
b.title='切换宽屏模式';var w=localStorage.getItem('mccb-wide')==='1';
if(w){document.body.classList.add('wide-mode');b.classList.add('wm-on');}
b.onclick=function(){document.body.classList.toggle('wide-mode');
b.classList.toggle('wm-on');localStorage.setItem('mccb-wide',
document.body.classList.contains('wide-mode')?'1':'0');};
document.body.appendChild(b);})();`;

  const beforeJs = content.slice(0, jsEnd);
  const afterJs = content.slice(jsEnd);
  content = beforeJs + '\n' + wmJs + '\n' + afterJs;

  fs.writeFileSync(filePath, content, 'utf-8');
  console.log(`  OK  ${fileName}`);
}

console.log('Adding wide-mode toggle to MCCB pages...');
PAGES.forEach(injectWideMode);
console.log('Done!');
