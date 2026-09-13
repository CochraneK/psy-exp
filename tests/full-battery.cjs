'use strict';
/**
 * Portable one-command research battery contract runner.
 *
 * The previous file was a Windows/agent-browser script tightly coupled to old
 * page internals and embedded assessment stimuli. It could no longer validate
 * the hardened pages safely. Browser-specific E2E should live in a dedicated
 * dependency-managed harness; this command aggregates the portable repository
 * contracts that CI also enforces.
 */
const {spawnSync}=require('child_process');
const path=require('path');
const ROOT=path.resolve(__dirname,'..');
const checks=[
  ['inline HTML JavaScript','tests/validate-inline-scripts.cjs'],
  ['participant/session QC','tests/verify-participant.cjs'],
  ['research scoring','tests/verify-scoring.cjs'],
  ['task manifest/material policy','tests/verify-manifest.cjs'],
  ['driver/static task contract','tests/validate-drivers.cjs']
];
let failures=0;
console.log('=== psy-exp portable full battery ===');
for(const [label,file] of checks){
  console.log(`\n--- ${label} ---`);
  const r=spawnSync(process.execPath,[path.join(ROOT,file)],{cwd:ROOT,stdio:'inherit'});
  if(r.status!==0){failures++;console.error(`FAILED: ${label}`)}
}
console.log(`\n=== Full battery: ${checks.length-failures}/${checks.length} groups passed ===`);
process.exit(failures===0?0:1);
