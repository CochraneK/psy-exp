'use strict';
/**
 * Portable one-command research battery contract runner.
 * Browser-specific E2E lives in browser-smoke.cjs; this command aggregates
 * portable repository, data-governance and reference-backend contracts.
 */
const {spawnSync}=require('child_process');
const path=require('path');
const ROOT=path.resolve(__dirname,'..');
const checks=[
  ['inline HTML JavaScript','tests/validate-inline-scripts.cjs'],
  ['participant/session QC','tests/verify-participant.cjs'],
  ['research data model','tests/verify-research-data.cjs'],
  ['storage adapter/outbox','tests/verify-storage.cjs'],
  ['consent/import governance','tests/verify-governance.cjs'],
  ['authenticated reference backend','tests/verify-backend.cjs'],
  ['research scoring','tests/verify-scoring.cjs'],
  ['synthetic demo dataset','tests/verify-demo-data.cjs'],
  ['task manifest/material policy','tests/verify-manifest.cjs'],
  ['protocol freeze/version governance','tests/verify-protocol-lock.cjs'],
  ['driver/static task contract','tests/validate-drivers.cjs'],
  ['original UI modern core','tests/verify-original-ui-core.cjs'],
  ['participant task return flow','tests/verify-task-return.cjs']
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
