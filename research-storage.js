/* Backend-ready storage: synchronous local primary + asynchronous HTTP replica/outbox. */
(function(root,factory){
  const api=factory(root||globalThis);
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.ResearchStorage=api;
})(typeof window!=='undefined'?window:globalThis,function(root){
  'use strict';
  const STORAGE_ARCH_VERSION='local-primary-http-replica-1.1.0';
  const CONFIG_KEY='psy-exp-storage-config-v1';
  const OUTBOX_KEY='psy-exp-sync-outbox-v1';
  const STATE_KEY='psy-exp-sync-state-v1';
  const MAX_OUTBOX=50;
  const BACKOFF_BASE_MS=5000,BACKOFF_MAX_MS=600000;
  const now=()=>new Date().toISOString();
  const clone=v=>{try{return v==null?v:JSON.parse(JSON.stringify(v))}catch{return null}};
  const safeId=v=>{const s=String(v==null?'':v).trim();return/^[A-Za-z0-9._-]{1,96}$/.test(s)?s:null};
  const ls=()=>root&&root.localStorage;
  const readJson=(key,fallback)=>{try{const s=ls();const raw=s&&s.getItem(key);return raw?JSON.parse(raw):fallback}catch{return fallback}};
  const writeJson=(key,value)=>{try{const s=ls();if(!s)return false;s.setItem(key,JSON.stringify(value));return true}catch{return false}};
  class LocalPrimaryAdapter{
    constructor(storage){this.storage=storage||ls();this.name='browser-local-primary';this.synchronous=true}
    getItem(key){return this.storage?this.storage.getItem(key):null}
    setItem(key,value){if(!this.storage)throw new Error('LOCAL_STORAGE_UNAVAILABLE');this.storage.setItem(key,String(value));return true}
    removeItem(key){if(this.storage)this.storage.removeItem(key);return true}
    info(){return{name:this.name,synchronous:true,persistent:!!this.storage}}
  }
  class MemoryPrimaryAdapter{
    constructor(seed={}){this.map=new Map(Object.entries(seed).map(([k,v])=>[k,String(v)]));this.name='memory-primary';this.synchronous=true}
    getItem(key){return this.map.has(key)?this.map.get(key):null}
    setItem(key,value){this.map.set(key,String(value));return true}
    removeItem(key){this.map.delete(key);return true}
    info(){return{name:this.name,synchronous:true,persistent:false}}
  }
  const primary=new LocalPrimaryAdapter();
  let sessionToken='';
  function normalizeBaseUrl(value){
    const raw=String(value||'').trim();if(!raw)return null;
    let u;try{u=new URL(raw)}catch{throw new Error('REPLICA_URL_INVALID')}
    const local=['localhost','127.0.0.1','::1'].includes(u.hostname);
    if(u.protocol!=='https:'&&!(u.protocol==='http:'&&local))throw new Error('REPLICA_HTTPS_REQUIRED');
    u.pathname=u.pathname.replace(/\/+$/,'');u.search='';u.hash='';return u.toString().replace(/\/$/,'');
  }
  function getConfig(){const c=readJson(CONFIG_KEY,null)||{};return{version:1,mode:'local-primary',replica:{enabled:c.replica&&c.replica.enabled===true,baseUrl:c.replica&&c.replica.baseUrl||null,studyId:c.replica&&c.replica.studyId||null,autoSync:c.replica&&c.replica.autoSync===true},operatorId:c.operatorId||'local-researcher',siteId:c.siteId||'local-browser-site'}}
  function configureReplica({enabled=false,baseUrl=null,studyId=null,autoSync=false,operatorId,siteId}={}){
    const current=getConfig(),sid=studyId==null?current.replica.studyId:safeId(studyId);if(studyId!=null&&!sid)throw new Error('STUDY_ID_INVALID');
    const next={replica:{enabled:enabled===true,baseUrl:baseUrl?normalizeBaseUrl(baseUrl):null,studyId:sid,autoSync:autoSync===true},operatorId:safeId(operatorId)||current.operatorId,siteId:safeId(siteId)||current.siteId};
    if(next.replica.enabled&&(!next.replica.baseUrl||!next.replica.studyId))throw new Error('REPLICA_CONFIG_INCOMPLETE');
    writeJson(CONFIG_KEY,next);return getConfig();
  }
  function setSessionToken(token){sessionToken=String(token||'').trim();return!!sessionToken}
  function clearSessionToken(){sessionToken=''}
  function getTokenState(){return{present:!!sessionToken,persisted:false}}
  function outbox(){const xs=readJson(OUTBOX_KEY,[]);return Array.isArray(xs)?xs:[]}
  function saveOutbox(xs){return writeJson(OUTBOX_KEY,xs.slice(-MAX_OUTBOX))}
  function makeKey(bundle,studyId){const r=bundle&&bundle.researchData||{},p=bundle&&bundle.participantData||{};return[studyId,r.updatedAt||bundle&&bundle.exportedAt||'',p.exportDate||'',p.participantCount||0].join('|')}
  function stageBundle(bundle,{studyId,reason='checkpoint'}={}){
    const cfg=getConfig(),sid=safeId(studyId||cfg.replica.studyId||bundle&&bundle.researchData&&bundle.researchData.study&&bundle.researchData.study.id);if(!sid)return{queued:false,reason:'study_id_missing'};
    const key=makeKey(bundle,sid),xs=outbox(),existing=xs.find(x=>x.idempotencyKey===key);if(existing)return clone(existing);
    const item={id:`sync-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`,kind:'bundle',studyId:sid,reason,createdAt:now(),attempts:0,lastError:null,idempotencyKey:key,payload:clone(bundle)};xs.push(item);saveOutbox(xs);return clone(item);
  }
  function getOutbox(){return clone(outbox())}
  function clearOutbox(){return saveOutbox([])}
  function setState(patch){const prev=readJson(STATE_KEY,{})||{},next={...prev,...patch,updatedAt:now()};writeJson(STATE_KEY,next);return clone(next)}
  function getState(){const s=clone(readJson(STATE_KEY,{status:'idle',updatedAt:null})||{});return{...s,pending:outbox().length}}
  async function request(path,{method='GET',body=null,idempotencyKey=null,fetchImpl}={}){
    const cfg=getConfig();if(!cfg.replica.enabled)throw new Error('REPLICA_DISABLED');if(!cfg.replica.baseUrl)throw new Error('REPLICA_URL_MISSING');
    const f=fetchImpl||root.fetch;if(typeof f!=='function')throw new Error('FETCH_UNAVAILABLE');
    const headers={'accept':'application/json'};if(body!=null)headers['content-type']='application/json';if(sessionToken)headers.authorization=`Bearer ${sessionToken}`;if(idempotencyKey)headers['idempotency-key']=idempotencyKey;
    const res=await f(cfg.replica.baseUrl+path,{method,headers,body:body==null?undefined:JSON.stringify(body)});let data=null;try{data=await res.json()}catch{}
    if(!res.ok){const e=new Error(data&&data.error||`HTTP_${res.status}`);e.status=res.status;e.payload=data;throw e}return data;
  }
  async function health(options={}){const cfg=getConfig();const f=options.fetchImpl||root.fetch;if(!cfg.replica.baseUrl)throw new Error('REPLICA_URL_MISSING');const res=await f(cfg.replica.baseUrl+'/v1/health',{headers:{accept:'application/json'}});const data=await res.json();if(!res.ok)throw new Error(data&&data.error||`HTTP_${res.status}`);return data}
  async function pushBundle(bundle,{studyId,idempotencyKey,fetchImpl}={}){const cfg=getConfig(),sid=safeId(studyId||cfg.replica.studyId);if(!sid)throw new Error('STUDY_ID_INVALID');return request(`/v1/studies/${encodeURIComponent(sid)}/bundle`,{method:'PUT',body:bundle,idempotencyKey:idempotencyKey||makeKey(bundle,sid),fetchImpl})}
  async function pullBundle({studyId,fetchImpl}={}){const cfg=getConfig(),sid=safeId(studyId||cfg.replica.studyId);if(!sid)throw new Error('STUDY_ID_INVALID');return request(`/v1/studies/${encodeURIComponent(sid)}/bundle`,{fetchImpl})}
  async function deleteRemoteParticipant(participantId,{studyId,fetchImpl}={}){const cfg=getConfig(),sid=safeId(studyId||cfg.replica.studyId),pid=safeId(participantId);if(!sid||!pid)throw new Error('IDENTIFIER_INVALID');return request(`/v1/studies/${encodeURIComponent(sid)}/participants/${encodeURIComponent(pid)}`,{method:'DELETE',fetchImpl})}
  function backoffMs(attempts){return Math.min(BACKOFF_BASE_MS*Math.pow(2,Math.max(0,(attempts||1)-1)),BACKOFF_MAX_MS)}
  function classifyFlushError(e){
    const status=e&&Number(e.status);
    if(status===401||status===403)return{retryable:false,reason:'auth_failed'};
    if(status===400||status===404||status===405||status===413)return{retryable:false,reason:'rejected'};
    if(status===429||(status>=500&&status<600))return{retryable:true,reason:'server'};
    return{retryable:true,reason:'network'};
  }
  async function flushOutbox({fetchImpl,manual=false}={}){
    const cfg=getConfig();if(!cfg.replica.enabled)return{ok:false,reason:'replica_disabled',remaining:outbox().length};if(!sessionToken)return{ok:false,reason:'token_missing',remaining:outbox().length};
    let xs=outbox(),sent=0;
    if(manual)for(const x of xs){x.blockedReason=null}
    setState({status:'syncing',lastStartedAt:now(),lastError:null});
    for(let i=0;i<xs.length;){
      const item=xs[i];
      if(!manual&&item.blockedReason){saveOutbox(xs);setState({status:'blocked',lastError:item.blockedReason,blockedReason:item.blockedReason,lastFailedAt:item.lastAttemptAt||null});return{ok:false,reason:'blocked:'+item.blockedReason,blocked:true,sent,remaining:xs.length}}
      if(!manual&&item.nextRetryAt&&Date.now()<item.nextRetryAt){saveOutbox(xs);setState({status:'backoff',nextRetryAt:item.nextRetryAt});return{ok:false,reason:'backoff',nextRetryAt:item.nextRetryAt,sent,remaining:xs.length}}
      try{if(item.kind==='bundle')await pushBundle(item.payload,{studyId:item.studyId,idempotencyKey:item.idempotencyKey,fetchImpl});xs.splice(i,1);saveOutbox(xs);sent++}
      catch(e){
        const cls=classifyFlushError(e);
        item.attempts=(item.attempts||0)+1;item.lastError=String(e&&e.message||e);item.lastAttemptAt=now();
        if(cls.retryable){item.nextRetryAt=Date.now()+backoffMs(item.attempts);item.blockedReason=null;saveOutbox(xs);setState({status:'error',lastError:item.lastError,lastFailedAt:now(),nextRetryAt:item.nextRetryAt});return{ok:false,sent,remaining:xs.length,error:item.lastError,nextRetryAt:item.nextRetryAt}}
        item.blockedReason=cls.reason;item.nextRetryAt=null;saveOutbox(xs);setState({status:'blocked',lastError:item.lastError,blockedReason:cls.reason,lastFailedAt:now()});return{ok:false,reason:cls.reason,blocked:true,sent,remaining:xs.length,error:item.lastError}
      }
    }
    setState({status:'idle',lastSuccessAt:now(),lastError:null,blockedReason:null,nextRetryAt:null});return{ok:true,sent,remaining:0};
  }
  async function syncBundle(bundle,{reason='manual',fetchImpl}={}){const item=stageBundle(bundle,{reason});if(item&&item.queued===false)return{ok:false,reason:item.reason};return flushOutbox({fetchImpl,manual:true})}
  async function maybeAutoSync({fetchImpl}={}){
    const cfg=getConfig();
    if(!cfg.replica.enabled)return{ok:false,reason:'replica_disabled'};
    if(!cfg.replica.autoSync)return{ok:false,reason:'auto_sync_disabled'};
    if(!sessionToken)return{ok:false,reason:'token_missing'};
    if(!outbox().length)return{ok:false,reason:'outbox_empty'};
    return flushOutbox({fetchImpl,manual:false});
  }
  let autoSyncStarted=false;
  function startAutoSync({onSettled=null}={}){
    if(!root||!root.document||typeof root.document.addEventListener!=='function')return{ok:false,reason:'environment_unsupported'};
    if(autoSyncStarted)return{ok:true,already:true};
    autoSyncStarted=true;
    const settled=r=>{try{onSettled&&onSettled(r)}catch{}};
    const attempt=()=>{maybeAutoSync().then(settled).catch(e=>settled({ok:false,reason:String(e&&e.message||e)}))};
    root.addEventListener('online',attempt);
    root.document.addEventListener('visibilitychange',()=>{if(root.document.visibilityState==='visible')attempt()});
    if(typeof root.setTimeout==='function')root.setTimeout(attempt,1500);
    return{ok:true};
  }
  return{STORAGE_ARCH_VERSION,CONFIG_KEY,OUTBOX_KEY,STATE_KEY,MAX_OUTBOX,BACKOFF_BASE_MS,BACKOFF_MAX_MS,primary,LocalPrimaryAdapter,MemoryPrimaryAdapter,normalizeBaseUrl,getConfig,configureReplica,setSessionToken,clearSessionToken,getTokenState,stageBundle,getOutbox,clearOutbox,getState,health,pushBundle,pullBundle,deleteRemoteParticipant,flushOutbox,syncBundle,maybeAutoSync,startAutoSync};
});