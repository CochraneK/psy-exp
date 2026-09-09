/** Validate driver strings: stub require/process/etc, slice off run entry, grab DRV. */
const fs = require('fs');
const vm = require('vm');
let src = fs.readFileSync(__dirname + '/full-battery.cjs', 'utf-8');
src = src.slice(0, src.indexOf('async function runOne'));  // drop run entry & main
src = src.replace(/const NODE = .*\n/m, '').replace(/const AB = .*\n/m, '');
src = src.replace(/^const REPORT = .*\n/m, '');
src = src.replace(/^if \(!fs\.existsSync.*\n/m, '');  // stub-safe: drop runtime checks
src = src.replace(/^const /gm, 'var ').replace(/^let /gm, 'var ');
const ctx = {
  console: { log(){} },
  process: { env: {}, argv: [], exit(){}, exitCode: 0 },
  require: (m) => ({ execFile(){}, writeFileSync(){}, existsSync(){return false}, mkdirSync(){}, readFileSync(){''}, statSync(){return {isDirectory:()=>false}} }),
  setTimeout, clearTimeout, setInterval, clearInterval,
};
ctx.require.cache = {};
vm.createContext(ctx);
try { vm.runInContext(src, ctx); } catch (e) { console.log('prelude err:', e.message.slice(0, 80)); }
const DRV = ctx.DRV;
if (!DRV) { console.log('DRV not found in context'); process.exit(1); }
let ok = 0;
for (const [k, v] of Object.entries(DRV)) {
  try { new vm.Script(v); console.log('OK  ' + k); ok++; }
  catch (e) { console.log('BAD ' + k + ': ' + e.message); }
}
console.log(ok + '/10 valid');
