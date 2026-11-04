/* Research access gate (research-auth 1.0.0): opt-in local passcode confirmation for researcher pages.
   Honest boundary: this is a LOCAL ACCESS CONFIRMATION, NOT real security. It is client-side only:
   it stops casual entry but cannot stop a malicious actor with developer tools. Data safety still
   depends on the device itself, the consent/session fail-closed gates, and the export boundary.
   Real authorization (identity provider, role/site/study scoping) remains a production gap — see docs/BACKEND_V1.md. */
(function(root,factory){
  const api=factory(root||globalThis);
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.ResearchAuth=api;
})(typeof window!=='undefined'?window:globalThis,function(root){
  'use strict';
  const AUTH_VERSION='research-auth-1.0.0';
  const AUTH_KEY='psy-exp-research-auth-v1';
  const SESSION_KEY='psy-exp-research-auth-session';
  const MAX_ATTEMPTS=5;
  const LOCK_MS=30000;
  const MIN_CODE=4;
  const MAX_CODE=64;
  const nowIso=()=>new Date().toISOString();

  // ---- storage: real browser storage when present, in-memory fallback for Node contract tests ----
  function memStore(name){const m=new Map();return{name,getItem:k=>m.has(k)?m.get(k):null,setItem(k,v){m.set(k,String(v))},removeItem(k){m.delete(k)}}}
  function realStore(s){try{return s&&typeof s.getItem==='function'&&typeof s.setItem==='function'?s:null}catch{return null}}
  let store={local:realStore(root.localStorage)||memStore('memory-local'),session:realStore(root.sessionStorage)||memStore('memory-session')};
  function setStore(local,session){store={local:local||memStore('memory-local'),session:session||memStore('memory-session')};return getAuthState()}
  function memStores(){const l=memStore('test-local'),s=memStore('test-session');store={local:l,session:s};return{l,s}}

  // ---- SHA-256: WebCrypto when available, pure-JS fallback otherwise (non-secure contexts) ----
  function sha256Fallback(bytes){
    const K=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
    let h0=0x6a09e667,h1=0xbb67ae85,h2=0x3c6ef372,h3=0xa54ff53a,h4=0x510e527f,h5=0x9b05688c,h6=0x1f83d9ab,h7=0x5be0cd19;
    const padded=new Uint8Array(((bytes.length+9+63)>>6)<<6);
    padded.set(bytes);padded[bytes.length]=0x80;
    const bitLen=bytes.length*8,dv=new DataView(padded.buffer);
    dv.setUint32(padded.length-8,Math.floor(bitLen/0x100000000));dv.setUint32(padded.length-4,bitLen>>>0);
    const w=new Uint32Array(64);
    const rotr=(x,n)=>(x>>>n)|(x<<(32-n));
    for(let off=0;off<padded.length;off+=64){
      for(let i=0;i<16;i++)w[i]=dv.getUint32(off+i*4);
      for(let i=16;i<64;i++){const s0=rotr(w[i-15],7)^rotr(w[i-15],18)^(w[i-15]>>>3),s1=rotr(w[i-2],17)^rotr(w[i-2],19)^(w[i-2]>>>10);w[i]=(w[i-16]+s0+w[i-7]+s1)>>>0}
      let a=h0,b=h1,c=h2,dd=h3,e=h4,f=h5,g=h6,h=h7;
      for(let i=0;i<64;i++){const S1=rotr(e,6)^rotr(e,11)^rotr(e,25),ch=(e&f)^(~e&g),t1=(h+S1+ch+K[i]+w[i])>>>0,S0=rotr(a,2)^rotr(a,13)^rotr(a,22),maj=(a&b)^(a&c)^(b&c),t2=(S0+maj)>>>0;h=g;g=f;f=e;e=(dd+t1)>>>0;dd=c;c=b;b=a;a=(t1+t2)>>>0}
      h0=(h0+a)>>>0;h1=(h1+b)>>>0;h2=(h2+c)>>>0;h3=(h3+dd)>>>0;h4=(h4+e)>>>0;h5=(h5+f)>>>0;h6=(h6+g)>>>0;h7=(h7+h)>>>0}
    return[h0,h1,h2,h3,h4,h5,h6,h7].map(x=>x.toString(16).padStart(8,'0')).join('');
  }
  async function digest(text,opts={}){
    const bytes=new TextEncoder().encode(String(text));
    if(!opts.fallback){try{if(root.crypto&&root.crypto.subtle){const h=await root.crypto.subtle.digest('SHA-256',bytes);return[...new Uint8Array(h)].map(x=>x.toString(16).padStart(2,'0')).join('')}}catch{}}
    return sha256Fallback(bytes);
  }
  function randomHex(byteLen){try{if(root.crypto&&typeof root.crypto.getRandomValues==='function'){const a=new Uint8Array(byteLen);root.crypto.getRandomValues(a);return[...a].map(x=>x.toString(16).padStart(2,'0')).join('')}}catch{}let s='';for(let i=0;i<byteLen*2;i++)s+=Math.floor(Math.random()*16).toString(16);return s}

  // ---- state (fail-closed: malformed stored state is treated as unconfigured and logged) ----
  function readState(){
    try{
      const raw=store.local.getItem(AUTH_KEY);if(!raw)return null;
      const s=JSON.parse(raw);
      if(!s||s.version!==1||typeof s.salt!=='string'||!s.salt||typeof s.hash!=='string'||!s.hash){console.warn('ResearchAuth: stored state malformed; treating gate as unconfigured.');return null}
      s.enabled=s.enabled===true;s.attempts=Number.isFinite(s.attempts)?s.attempts:0;s.lockedUntil=Number.isFinite(s.lockedUntil)?s.lockedUntil:0;
      return s;
    }catch{console.warn('ResearchAuth: stored state unreadable; treating gate as unconfigured.');return null}
  }
  function writeState(s){try{store.local.setItem(AUTH_KEY,JSON.stringify(s));return true}catch{console.warn('ResearchAuth: state persist failed');return false}}
  function sessionActive(){try{return!!store.session.getItem(SESSION_KEY)}catch{return false}}

  // ---- public API ----
  function getAuthState(){
    const s=readState(),now=Date.now();
    if(!s)return{configured:false,enabled:false,locked:false,retryAfterMs:0,sessionActive:sessionActive(),createdAt:null,updatedAt:null};
    const locked=(s.lockedUntil||0)>now;
    return{configured:true,enabled:s.enabled,locked,retryAfterMs:Math.max(0,(s.lockedUntil||0)-now),sessionActive:sessionActive(),createdAt:s.createdAt||null,updatedAt:s.updatedAt||null};
  }
  function requireAccess(){
    const s=readState();
    if(!s||!s.enabled)return{ok:true,reason:'gate_off'};
    if(sessionActive())return{ok:true,reason:'session_active'};
    const now=Date.now();
    if(s.lockedUntil>now)return{ok:false,reason:'locked',retryAfterMs:s.lockedUntil-now};
    return{ok:false,reason:'gate_active',attemptsLeft:MAX_ATTEMPTS-s.attempts};
  }
  async function configure({passcode=null,currentPasscode=null}={}){
    const code=String(passcode==null?'':passcode);
    if(code.length<MIN_CODE||code.length>MAX_CODE)return{ok:false,reason:'invalid_passcode'};
    const s=readState();
    if(s&&s.enabled){
      const h=await digest(s.salt+':'+String(currentPasscode==null?'':currentPasscode));
      if(h!==s.hash)return{ok:false,reason:'invalid_current_passcode'};
    }
    const salt=randomHex(16);
    const hash=await digest(salt+':'+code);
    if(!hash)return{ok:false,reason:'crypto_unavailable'};
    if(!writeState({version:1,enabled:true,salt,hash,attempts:0,lockedUntil:0,createdAt:(s&&s.createdAt)||nowIso(),updatedAt:nowIso()}))return{ok:false,reason:'persist_failed'};
    return{ok:true,changed:!!(s&&s.enabled)};
  }
  async function verify(passcode){
    const s=readState();
    if(!s||!s.enabled)return{ok:false,reason:'not_configured'};
    const now=Date.now();
    if(s.lockedUntil>now)return{ok:false,reason:'locked',retryAfterMs:s.lockedUntil-now};
    const h=await digest(s.salt+':'+String(passcode==null?'':passcode));
    if(h===s.hash){
      writeState({...s,attempts:0,lockedUntil:0,updatedAt:nowIso()});
      try{store.session.setItem(SESSION_KEY,nowIso())}catch{}
      return{ok:true};
    }
    const attempts=s.attempts+1,locked=attempts>=MAX_ATTEMPTS;
    writeState({...s,attempts:locked?0:attempts,lockedUntil:locked?now+LOCK_MS:0,updatedAt:nowIso()});
    return{ok:false,reason:locked?'locked':'invalid_passcode',retryAfterMs:locked?LOCK_MS:0,attemptsLeft:locked?0:MAX_ATTEMPTS-attempts};
  }
  async function disable({currentPasscode=null}={}){
    const s=readState();
    if(s&&s.enabled){
      const h=await digest(s.salt+':'+String(currentPasscode==null?'':currentPasscode));
      if(h!==s.hash)return{ok:false,reason:'invalid_current_passcode'};
    }
    try{store.local.removeItem(AUTH_KEY)}catch{}
    clearSession();
    return{ok:true};
  }
  function clearSession(){try{store.session.removeItem(SESSION_KEY);return true}catch{return false}}

  // ---- gate overlay (mounted by researcher pages; honest boundary copy is part of the UI) ----
  function el(tag,style,html){const n=document.createElement(tag);if(style)n.style.cssText=style;if(html!=null)n.innerHTML=html;return n}
  function baseOverlay(){return el('div','position:fixed;inset:0;z-index:300;background:rgba(15,23,42,0.92);display:flex;align-items:center;justify-content:center;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;')}
  function card(){return el('div','background:#fff;border-radius:14px;padding:32px 36px;max-width:400px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,0.35);')}
  function errorOverlay(e){
    const ov=baseOverlay(),box=card();
    box.appendChild(el('h2','margin:0 0 8px;font-size:18px;color:#0f172a;','🔒 访问确认模块错误'));
    box.appendChild(el('p','margin:0 0 10px;font-size:13px;line-height:1.6;color:#475569;','访问确认模块出现异常，页面按 fail-closed 原则保持锁定。请研究者检查 research-auth.js 后刷新；如需强制解除，请清除 localStorage 中的 ' + AUTH_KEY + ' 后刷新。'));
    if(e&&e.message)box.appendChild(el('p','margin:0;font-size:12px;color:#94a3b8;word-break:break-all;',String(e.message)));
    ov.appendChild(box);return ov;
  }
  function mountGate(){
    if(typeof document==='undefined')return{mounted:false,reason:'no_dom'};
    const mount=()=>{
      let gate;
      try{gate=requireAccess()}catch(e){document.body.appendChild(errorOverlay(e));return{mounted:true,reason:'module_error'}}
      if(gate.ok)return{mounted:false,reason:gate.reason||'ok'};
      const ov=baseOverlay(),box=card();
      box.appendChild(el('h2','margin:0 0 8px;font-size:18px;color:#0f172a;','🔒 研究区访问确认'));
      box.appendChild(el('p','margin:0 0 16px;font-size:13px;line-height:1.6;color:#475569;','本页为研究者页面，请输入研究者设置的访问码。<br>注意：这是本地访问确认，不是真实安全边界——只阻止偶然进入，不能阻止使用开发者工具的用户访问数据。'));
      const msg=el('div','min-height:18px;font-size:12px;color:#dc2626;margin-bottom:8px;');
      const input=el('input','width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #cbd5e1;border-radius:8px;font-size:14px;');
      input.type='password';input.placeholder='访问码（4–64 字符）';input.setAttribute('aria-label','研究区访问码');
      const btn=el('button','margin-top:12px;width:100%;padding:10px;border:none;border-radius:8px;background:#2563eb;color:#fff;font-size:14px;font-weight:600;cursor:pointer;','确认');
      btn.type='button';
      let timer=null;
      const fail=(text,ms)=>{
        if(timer){clearInterval(timer);timer=null}
        msg.textContent=text;input.value='';
        btn.disabled=false;btn.style.opacity='1';btn.textContent='确认';
        if(ms>0){
          btn.disabled=true;btn.style.opacity='0.6';
          let left=ms;
          timer=setInterval(()=>{
            left-=1000;
            if(left<=0){clearInterval(timer);timer=null;btn.disabled=false;btn.style.opacity='1';btn.textContent='确认'}
            else btn.textContent='请等待 '+Math.ceil(left/1000)+' 秒';
          },1000);
        }
        input.focus();
      };
      const submit=async()=>{
        btn.disabled=true;btn.textContent='验证中…';
        const r=await verify(input.value);
        if(r.ok){ov.remove();return}
        if(r.reason==='not_configured'){ov.remove();return}
        if(r.reason==='locked')fail('错误次数过多，已临时锁定。',r.retryAfterMs||LOCK_MS);
        else fail('访问码错误。'+(r.attemptsLeft!=null?'（剩余 '+r.attemptsLeft+' 次）':''),0);
      };
      btn.addEventListener('click',submit);
      input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!btn.disabled)submit()});
      box.appendChild(msg);box.appendChild(input);box.appendChild(btn);
      ov.appendChild(box);document.body.appendChild(ov);
      input.focus();
      return{mounted:true,reason:gate.reason};
    };
    if(!document.body){let deferred=false;document.addEventListener('DOMContentLoaded',()=>{if(!deferred)deferred=true;mount()},false);return{mounted:'deferred'}}
    return mount();
  }

  return{AUTH_VERSION,AUTH_KEY,SESSION_KEY,MAX_ATTEMPTS,LOCK_MS,MIN_CODE,MAX_CODE,getAuthState,requireAccess,configure,verify,disable,clearSession,mountGate,setStore,memStores,_digest:digest};
});
