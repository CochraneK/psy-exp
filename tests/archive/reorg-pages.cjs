/**
 * Reorganize: move 10 test pages into pages/ and rewrite internal refs.
 * Run BEFORE moving files (patches in place), then move files separately.
 */
const fs = require('fs');
const path = require('path');
const DIR = 'D:/Software/DSH/psy-exp';
const PAGES = [
  'mccb-msceit.html','mccb-bacs.html','mccb-hvlt.html','mccb-fluency.html',
  'mccb-spatial-span.html','mccb-lns.html','mccb-tmt.html','mccb-bvmt.html',
  'mccb-mazes.html','mccb-cpt.html',
];

PAGES.forEach(f => {
  const fp = path.join(DIR, f);
  let c = fs.readFileSync(fp, 'utf-8');
  let n = 0;
  // 1. CSS link
  if (c.includes('href="mccb-common.css"')) {
    c = c.replace('href="mccb-common.css"', 'href="../mccb-common.css"'); n++;
  }
  // 2. participant.js src
  if (c.includes('src="mccb-participant.js"')) {
    c = c.replace('src="mccb-participant.js"', 'src="../mccb-participant.js"'); n++;
  }
  // 3. back links to index
  const before = c;
  c = c.split('href="index.html"').join('href="../index.html"');
  if (c !== before) { n += (before.match(/href="index\.html"/g) || []).length; }
  // 4. inline location.href='index.html'
  const b2 = c;
  c = c.split("location.href='index.html'").join("location.href='../index.html'");
  if (c !== b2) { n += (b2.match(/location\.href='index\.html'/g) || []).length; }

  fs.writeFileSync(fp, c, 'utf-8');
  console.log(`  ${f}: ${n} refs updated`);
});
console.log('Done patching pages.');
