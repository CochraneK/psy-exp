// Runtime smoke test: execute the real app JS from person.html in a sandboxed
// DOM/Chart stub, drive init() for a real multi-wave person, assert the new
// renderPerson markers land in #app. node --check only validates syntax; this
// catches runtime errors (undefined vars / bad calls) in the new code path.
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const HERE = __dirname;

const html = fs.readFileSync(path.join(HERE, "person.html"), "utf-8");
const idxs = [];
let m;
const re = /<script>/g;
while ((m = re.exec(html)) !== null) idxs.push(m.index);
const start = idxs[idxs.length - 1] + "<script>".length;
const end = html.indexOf("</script>", start);
const appJs = html.slice(start, end);

// pick a real multi-wave person key embedded in the data
const dm = appJs.match(/const DATA=(\{.*\});\s*const R/s) || appJs.match(/const DATA=(\{[\s\S]*\});/);
const data = JSON.parse(dm[1].replace(/<\\\//g, "</"));
const byKey = {};
for (const r of data.records) {
  // KEY BY PERSON (pkey = file|baseid), NOT by visit (file|id).
  // Matches the app's persons()/init() deep-link contract.
  const k = r.pkey;
  (byKey[k] = byKey[k] || []).push(r);
}
// prefer a multi-wave person with a clear diagnosis
let personKey = null;
for (const [k, recs] of Object.entries(byKey)) {
  if (recs.length >= 2 && recs[0].diag && recs[0].diag !== "其他") { personKey = k; break; }
}
if (!personKey) personKey = Object.keys(byKey)[0];

// ---- sandbox ----
const els = {};
function el(id) {
  if (!els[id]) els[id] = {
    id, innerHTML: "", textContent: "", value: "",
    addEventListener() {}, getContext() { return {}; }
  };
  return els[id];
}
const dl = [];
const sandbox = {
  console,
  URLSearchParams, encodeURIComponent, decodeURIComponent, URL,
  location: { search: "?person=" + encodeURIComponent(personKey) },
  document: {
    getElementById: el,
    addEventListener(ev, cb) { if (ev === "DOMContentLoaded") dl.push(cb); }
  },
  Chart: function (e, o) { this.el = e; this.opt = o; }
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

let chartsCreated = 0;
const RealChart = sandbox.Chart;
sandbox.Chart = function (e, o) { chartsCreated++; this.el = e; this.opt = o; };

try {
  vm.runInContext(appJs, sandbox, { filename: "person-app.js" });
  dl.forEach(cb => cb()); // fire DOMContentLoaded -> init()
} catch (err) {
  console.error("RUNTIME_ERROR during app JS / init():");
  console.error(String(err && err.stack || err));
  process.exit(2);
}

const appHtml = els["app"] ? els["app"].innerHTML : "";
const title = els["headTitle"] ? els["headTitle"].textContent : "";
const sub = els["headSub"] ? els["headSub"].textContent : "";
const markers = {
  "8-KPI grid (.kpis k8)": appHtml.indexOf('kpis k8') > -1,
  "radar canvas cRadar": appHtml.indexOf('id="cRadar"') > -1,
  "deviation canvas cBench": appHtml.indexOf('id="cBench"') > -1,
  "benchmark table #pbench": appHtml.indexOf('id="pbench"') > -1,
  "longi canvas cLongi": appHtml.indexOf('id="cLongi"') > -1,
  "detail table #pdet": appHtml.indexOf('id="pdet"') > -1,
  "Overall Composite KPI": appHtml.indexOf("Overall Composite") > -1,
  "Neurocog Composite KPI": appHtml.indexOf("Neurocognitive Composite") > -1,
};
let allOk = true;
console.log("personKey =", personKey);
console.log("headTitle =", title);
console.log("headSub   =", sub);
console.log("chartsCreated =", chartsCreated, "(expect 3: radar, bench, longi)");
console.log("app.innerHTML length =", appHtml.length);
console.log("---- marker checks ----");
for (const [name, ok] of Object.entries(markers)) {
  console.log((ok ? "  [ok]   " : "  [MISS] ") + name);
  if (!ok) allOk = false;
}
// The benchmark/detail table rows are added via getElementById('pbench'/'pdet').
// The stub's el(id) returns a SEPARATE object per id, so those rows never merge
// into the #app string (appHtml). They live in els['pbench']/els['pdet']. Check
// those elements directly — counting <tr><td> in appHtml is a false negative.
const pbenchHtml = els["pbench"] ? els["pbench"].innerHTML : "";
const pdetHtml = els["pdet"] ? els["pdet"].innerHTML : "";
const bRows = (pbenchHtml.match(/<tr><td>/g) || []).length;
const dRows = (pdetHtml.match(/<tr><td>/g) || []).length;
const expectDet = byKey[personKey] ? byKey[personKey].length : 1;
console.log("benchmark table rows =", bRows, "(expect 9: 7 domains + 2 composites)");
console.log("detail table rows    =", dRows, "(expect " + expectDet + " = chosen person's waves)");
if (bRows !== 9) allOk = false;
if (dRows !== expectDet) allOk = false;

console.log(allOk ? "SMOKE_OK" : "SMOKE_FAIL");
process.exit(allOk ? 0 : 1);
