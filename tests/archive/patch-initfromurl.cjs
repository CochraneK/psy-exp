/**
 * Patch all test pages: init participant from URL on page load (not just test start).
 * Adds init call into the wide-mode IIFE (runs at end of body, DOM ready).
 */
const fs = require('fs');
const path = require('path');
const DIR = 'D:/Software/DSH/psy-exp';
const PAGES = [
  'mccb-msceit.html','mccb-bacs.html','mccb-hvlt.html','mccb-fluency.html',
  'mccb-spatial-span.html','mccb-lns.html','mccb-tmt.html','mccb-bvmt.html',
  'mccb-mazes.html','mccb-cpt.html',
];
const MARKER = 'ParticipantManager.initFromUrl()';
const INIT_SNIPPET = 'try{if(window.ParticipantManager)ParticipantManager.initFromUrl();}catch(e){}';

PAGES.forEach(f => {
  const fp = path.join(DIR, f);
  let c = fs.readFileSync(fp, 'utf-8');
  // Insert into wide-mode IIFE right after '(function(){'
  const anchor = "(function(){var b=document.createElement('button');b.id='wm-toggle';";
  if (c.includes(INIT_SNIPPET)) { console.log(`  ${f}: already patched`); return; }
  if (c.includes(anchor)) {
    c = c.replace(anchor, '(function(){' + INIT_SNIPPET + 'var b=document.createElement(\'button\');b.id=\'wm-toggle\';');
    fs.writeFileSync(fp, c, 'utf-8');
    console.log(`  ${f}: patched (wide-mode IIFE)`);
  } else {
    console.log(`  ${f}: WARN - wide-mode IIFE anchor not found`);
  }
});
