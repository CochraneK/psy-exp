'use strict';
const http=require('http');
const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const HOST=process.env.PSY_EXP_HOST||'127.0.0.1';
const PORT=Number(process.env.PSY_EXP_PORT||8787);
const DATA_DIR=path.resolve(process.env.PSY_EXP_DATA_DIR||path.join(process.cwd(),'.psy-exp-data'));
const TOKEN=String(process.env.PSY_EXP_API_TOKEN||'');
const ALLOWED_ORIGINS=String(process.env.PSY_EXP_ALLOWED_ORIGINS||'').split(',').map(x=>x.trim()).filter(Boolean);
const MAX_BODY=Number(process.env.PSY_EXP_MAX_BODY_BYTES||12*1024*1024);
if(!TOKEN){console.error('PSY_EXP_API_TOKEN is required');process.exit(1)}
fs.mkdirSync(path.join(DATA_DIR,'studies'),{recursive:true});
fs.mkdirSync(path.join(DATA_DIR,'backups'),{recursive:true});
const safeId=v=>typeof v==='string'&&/^[A-Za-z0-9._-]{1,96}$/.test(v)?v:null;
const json=(res,status,payload,headers={})=>{const body=JSON.stringify(payload);res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','content-length':Buffer.byteLength(body),...headers});res.end(body)};
function cors(req,res){const origin=req.headers.origin;if(!origin)return true;if(!ALLOWED_ORIGINS.includes(origin)){json(res,403,{error:'ORIGIN_NOT_ALLOWED'});return false}res.setHeader('access-control-allow-origin',origin);res.setHeader('vary','Origin');res.setHeader('access-control-allow-headers','authorization,content-type,idempotency-key');res.setHeader('access-control-allow-methods','GET,PUT,DELETE,OPTIONS');return true}
function authorized(req){const h=String(req.headers.authorization||'');if(!h.startsWith('Bearer '))return false;const got=Buffer.from(h.slice(7));const want=Buffer.from(TOKEN);return got.length===want.length&&crypto.timingSafeEqual(got,want)}
function studyFile(studyId){return path.join(DATA_DIR,'studies',studyId+'.json')}
function readBundle(studyId){const file=studyFile(studyId);if(!fs.existsSync(file))return null;return JSON.parse(fs.readFileSync(file,'utf8'))}
function validateBundle(bundle,studyId){if(!bundle||typeof bundle!=='object')return'BUNDLE_REQUIRED';if(bundle.format!=='psy-exp-research-data-bundle')return'BUNDLE_FORMAT_INVALID';const r=bundle.researchData;if(!r||typeof r!=='object'||r.schemaVersion!==1)return'RESEARCH_DATA_INVALID';if(r.study&&r.study.id&&r.study.id!==studyId)return'STUDY_ID_MISMATCH';if(bundle.participantData&&(!bundle.participantData.participants||typeof bundle.participantData.participants!=='object'))return'PARTICIPANT_DATA_INVALID';return null}
function backup(studyId,file){if(!fs.existsSync(file))return;const dir=path.join(DATA_DIR,'backups',studyId);fs.mkdirSync(dir,{recursive:true});const stamp=new Date().toISOString().replace(/[:.]/g,'-');fs.copyFileSync(file,path.join(dir,stamp+'.json'))}
function writeBundle(studyId,bundle){const file=studyFile(studyId);backup(studyId,file);const tmp=file+'.tmp-'+process.pid+'-'+Date.now();fs.writeFileSync(tmp,JSON.stringify(bundle,null,2),{mode:0o600});fs.renameSync(tmp,file);return file}
function etag(bundle){return crypto.createHash('sha256').update(JSON.stringify(bundle)).digest('hex')}
function bodyJson(req){return new Promise((resolve,reject)=>{let total=0,chunks=[];req.on('data',c=>{total+=c.length;if(total>MAX_BODY){reject(Object.assign(new Error('BODY_TOO_LARGE'),{status:413}));req.destroy();return}chunks.push(c)});req.on('end',()=>{try{resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')||'null'))}catch{reject(Object.assign(new Error('INVALID_JSON'),{status:400}))}});req.on('error',reject)})}
function deleteParticipant(bundle,participantId,studyId){let removed={participant:false,sessions:0,attempts:0};const r=bundle.researchData||{};if(r.participants&&r.participants[participantId]){delete r.participants[participantId];removed.participant=true}if(r.sessions&&typeof r.sessions==='object'){for(const [id,s] of Object.entries(r.sessions))if(s&&s.participantId===participantId){delete r.sessions[id];removed.sessions++}}if(Array.isArray(r.attempts)){const before=r.attempts.length;r.attempts=r.attempts.filter(a=>!(a&&a.participantId===participantId));removed.attempts=before-r.attempts.length}r.audit=Array.isArray(r.audit)?r.audit:[];r.audit.push({id:'server-delete-'+crypto.randomUUID(),type:'server_participant_deleted',at:new Date().toISOString(),detail:{participantId,studyId,removed}});r.updatedAt=new Date().toISOString();const p=bundle.participantData;if(p&&p.participants&&p.participants[participantId]){delete p.participants[participantId];p.participantCount=Object.keys(p.participants).length}bundle.exportedAt=new Date().toISOString();return removed}
const server=http.createServer(async(req,res)=>{
  try{
    if(!cors(req,res))return;if(req.method==='OPTIONS'){res.writeHead(204);res.end();return}
    const u=new URL(req.url,'http://localhost');
    if(req.method==='GET'&&u.pathname==='/v1/health'){json(res,200,{ok:true,service:'psy-exp-research-backend',version:'1.0.0',storage:'json-file-reference'});return}
    const bundleMatch=u.pathname.match(/^\/v1\/studies\/([^/]+)\/bundle$/),deleteMatch=u.pathname.match(/^\/v1\/studies\/([^/]+)\/participants\/([^/]+)$/);
    if(!bundleMatch&&!deleteMatch){json(res,404,{error:'NOT_FOUND'});return}
    if(!authorized(req)){json(res,401,{error:'UNAUTHORIZED'},{'www-authenticate':'Bearer'});return}
    const studyId=safeId(decodeURIComponent((bundleMatch||deleteMatch)[1]));if(!studyId){json(res,400,{error:'STUDY_ID_INVALID'});return}
    if(bundleMatch&&req.method==='PUT'){
      const bundle=await bodyJson(req),err=validateBundle(bundle,studyId);if(err){json(res,400,{error:err});return}writeBundle(studyId,bundle);const hash=etag(bundle);json(res,200,{ok:true,studyId,etag:hash,idempotencyKey:req.headers['idempotency-key']||null,storedAt:new Date().toISOString()},{etag:'"'+hash+'"'});return
    }
    if(bundleMatch&&req.method==='GET'){
      const bundle=readBundle(studyId);if(!bundle){json(res,404,{error:'STUDY_NOT_FOUND'});return}const hash=etag(bundle);json(res,200,bundle,{etag:'"'+hash+'"'});return
    }
    if(deleteMatch&&req.method==='DELETE'){
      const participantId=safeId(decodeURIComponent(deleteMatch[2]));if(!participantId){json(res,400,{error:'PARTICIPANT_ID_INVALID'});return}const bundle=readBundle(studyId);if(!bundle){json(res,404,{error:'STUDY_NOT_FOUND'});return}const removed=deleteParticipant(bundle,participantId,studyId);writeBundle(studyId,bundle);json(res,200,{ok:true,studyId,participantId,removed,etag:etag(bundle)});return
    }
    json(res,405,{error:'METHOD_NOT_ALLOWED'});
  }catch(e){if(!res.headersSent)json(res,e.status||500,{error:e.message||'INTERNAL_ERROR'});else try{res.end()}catch{}}
});
server.listen(PORT,HOST,()=>console.log(`psy-exp research backend listening on http://${HOST}:${PORT}`));
function shutdown(){server.close(()=>process.exit(0))}
process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);