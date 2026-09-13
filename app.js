const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const APP_BUILD=window.NIRC_APP_BUILD||'20260914-clean1';
// 실제 회원 데이터는 새 저장소에 보관하고, 이전 데이터 저장소는 삭제하지 않습니다.
const STORE='nirc_member_manager_ops_clean_v3';
const DATA_SEED_VERSION_KEY='nirc_member_data_seed_v3';
const RUNTIME_BUILD_KEY='nirc_member_runtime_build_v3';
const LEGACY_DATA_STORES=['nirc_member_manager_ops_v2','nirc_member_manager_v1'];
const LEGACY_UI_KEYS=['nirc_member_ops_seed_version','nirc_member_seed_version','nirc_member_runtime_build','nirc_member_last_ui_version','nirc_member_app_version'];
let state={members:[],tt:{},races:{},lt:{}};
let currentStatus='current', selectedName=null;

const toSec=t=>{if(!t)return null;const m=String(t).trim().match(/^(\d{1,2}):([0-5]\d)(?::([0-5]\d))?$/);if(!m)return null;return +m[1]*60 + +m[2] + (m[3]?+m[3]/60:0)};
const secToMS=s=>s==null?'—':`${Math.floor(s/60)}:${String(Math.round(s%60)).padStart(2,'0')}`;
const secToHMS=s=>{if(s==null)return'—';s=Math.round(s);const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),x=s%60;return h?`${h}:${String(m).padStart(2,'0')}:${String(x).padStart(2,'0')}`:`${m}:${String(x).padStart(2,'0')}`};
const cleanName=s=>String(s||'').replace(/[^가-힣A-Za-z]/g,'').trim();
const fmtJoinDate=v=>{let x=String(v||'').replace(/\D/g,'');if(x.length===6)x='20'+x;if(x.length===8)return `${x.slice(0,4)}.${x.slice(4,6)}.${x.slice(6,8)}`;return v||'—'};
const fmtBirthDate=v=>{let x=String(v||'').replace(/\D/g,'');if(x.length===6){const yy=+x.slice(0,2),nowYY=new Date().getFullYear()%100;x=(yy<=nowYY?'20':'19')+x;}if(x.length===8)return `${x.slice(0,4)}.${x.slice(4,6)}.${x.slice(6,8)}`;return v||'—'};
function toast(msg){const d=document.createElement('div');d.className='toast';d.textContent=msg;document.body.appendChild(d);setTimeout(()=>d.remove(),1800)}

function vdot10k(timeSec){
 if(!timeSec)return null;
 const t=timeSec/60, v=10000/t; // m/min
 const vo2=-4.60+0.182258*v+0.000104*v*v;
 const pct=0.8+0.1894393*Math.exp(-0.012778*t)+0.2989558*Math.exp(-0.1932605*t);
 return vo2/pct;
}
function history5k(name){const rows=[];Object.keys(state.tt).sort().forEach(date=>{const r=(state.tt[date]||[]).find(x=>x.name===name);if(r)rows.push({date,...r})});return rows}
function best5k(name){const h=history5k(name);if(!h.length)return null;return h.reduce((a,b)=>toSec(a.time)<=toSec(b.time)?a:b)}
function latest5k(name){const h=history5k(name);return h.length?h[h.length-1]:null}
function raceList(name,type){return ((state.races[name]||{})[type]||[])}
function bestRace(name,type){const arr=raceList(name,type).filter(r=>Number.isFinite(r.sec));if(!arr.length)return null;return arr.reduce((a,b)=>a.sec<=b.sec?a:b)}
function allCurrentNames(){return state.members.filter(m=>m.status==='current').map(m=>m.name)}
function save(){localStorage.setItem(STORE,JSON.stringify({members:state.members||[],tt:state.tt||{},races:state.races||{},lt:state.lt||{}}));}

function seedState(){
 const seed=window.NIRC_SEED||{members:[],tt:{}};
 return JSON.parse(JSON.stringify({members:seed.members||[],tt:seed.tt||{},races:seed.races||{},lt:seed.lt||{}}));
}
function safeParseState(raw){
 try{
   const x=JSON.parse(raw||'');
   if(!x||!Array.isArray(x.members))return null;
   return {members:x.members||[],tt:x.tt||{},races:x.races||{},lt:x.lt||{}};
 }catch(e){return null}
}
function mergeMissingData(base,extra){
 if(!extra)return base;
 const out=JSON.parse(JSON.stringify(base));
 // 배포본 회원정보가 우선입니다. 이전 로컬값은 배포본의 빈 칸만 보충합니다.
 const localMembers=new Map((extra.members||[]).map(m=>[m.name,m]));
 for(const m of out.members||[]){
   const old=localMembers.get(m.name); if(!old)continue;
   for(const k of ['gender','group','birth','join','phone','shirt','blood','honor','withdrawReason','withdrawDate']){
     if((m[k]===undefined||m[k]===null||m[k]==='') && old[k]!==undefined && old[k]!==null && old[k]!=='')m[k]=old[k];
   }
   if((m.number===undefined||m.number===null||m.number==='') && old.number!==undefined)m.number=old.number;
 }
 // 공식 5K 배포값을 우선하고, 로컬에만 있는 날짜/회원 기록은 보존합니다.
 for(const [date,rows] of Object.entries(extra.tt||{})){
   out.tt[date]??=[];
   const names=new Set(out.tt[date].map(r=>r.name));
   for(const r of rows||[]) if(r?.name && !names.has(r.name)){out.tt[date].push(JSON.parse(JSON.stringify(r)));names.add(r.name)}
 }
 // 10K/하프/풀 기록은 중복을 제거하며 합칩니다.
 for(const [name,types] of Object.entries(extra.races||{})){
   out.races[name]??={};
   for(const [type,rows] of Object.entries(types||{})){
     out.races[name][type]??=[];
     const key=r=>`${r?.date||''}|${r?.sec??''}|${r?.meet||''}`;
     const seen=new Set(out.races[name][type].map(key));
     for(const r of rows||[]){const k=key(r);if(!seen.has(k)){out.races[name][type].push(JSON.parse(JSON.stringify(r)));seen.add(k)}}
   }
 }
 // LT도 배포본 우선, 빈 값만 로컬값으로 보충합니다.
 for(const [name,x] of Object.entries(extra.lt||{})){
   out.lt[name]??={};
   for(const k of ['lt1','lt2','lt1hr','lt2hr','date']) if(!out.lt[name][k] && x?.[k])out.lt[name][k]=x[k];
 }
 return out;
}
function isDirty(){try{return JSON.stringify(state)!==JSON.stringify(seedState())}catch(e){return true}}

async function clearCacheStorage(){
 if(!('caches' in window))return;
 try{const keys=await caches.keys();await Promise.all(keys.map(k=>caches.delete(k)))}catch(e){}
}
function clearLegacyUiStorage(){
 for(const k of LEGACY_UI_KEYS)try{localStorage.removeItem(k)}catch(e){}
 // 세션에는 회원 데이터를 저장하지 않았으므로 UI/버전 흔적만 정확히 제거합니다.
 const sessionKeys=['nirc_member_ui_version','nirc_member_view','nirc_member_selected','nirc_member_update_attempt'];
 for(const k of sessionKeys)try{sessionStorage.removeItem(k)}catch(e){}
}
async function clearLegacyUiIndexedDB(){
 if(!('indexedDB' in window)||!indexedDB.databases)return;
 const known=new Set(['nirc_member_ui','nirc-member-ui','nirc_member_cache','nirc-member-cache']);
 try{const dbs=await indexedDB.databases();for(const db of dbs||[])if(db?.name&&known.has(db.name))indexedDB.deleteDatabase(db.name)}catch(e){}
}
async function replaceServiceWorker(){
 if(!('serviceWorker' in navigator))return;
 try{
   const regs=await navigator.serviceWorker.getRegistrations();
   await Promise.all(regs.map(r=>r.unregister().catch(()=>false)));
 }catch(e){}
 try{
   const reg=await navigator.serviceWorker.register(`./sw.js?v=${encodeURIComponent(APP_BUILD)}`,{scope:'./',updateViaCache:'none'});
   await reg.update().catch(()=>{});
 }catch(e){}
}
async function hardRuntimeCleanupIfNeeded(){
 let prev='';try{prev=localStorage.getItem(RUNTIME_BUILD_KEY)||''}catch(e){}
 if(prev===APP_BUILD)return;
 await clearCacheStorage();
 clearLegacyUiStorage();
 await clearLegacyUiIndexedDB();
 await replaceServiceWorker();
 try{localStorage.setItem(RUNTIME_BUILD_KEY,APP_BUILD)}catch(e){}
}
async function checkRemoteVersion(){
 try{
   const r=await fetch(`./version.json?t=${Date.now()}`,{cache:'no-store',headers:{'Cache-Control':'no-cache'}});
   if(!r.ok)return true;
   const v=await r.json();
   if(v?.build && v.build!==APP_BUILD){
     const attempt=`${APP_BUILD}->${v.build}`;
     if(sessionStorage.getItem('nirc_member_update_attempt')!==attempt){
       sessionStorage.setItem('nirc_member_update_attempt',attempt);
       await clearCacheStorage();
       try{const regs=await navigator.serviceWorker.getRegistrations();await Promise.all(regs.map(x=>x.unregister().catch(()=>false)))}catch(e){}
       const u=new URL(location.href);u.searchParams.set('_nirc_update',v.build);u.searchParams.set('_ts',Date.now());
       location.replace(u.toString());
       return false;
     }
   }else sessionStorage.removeItem('nirc_member_update_attempt');
 }catch(e){}
 return true;
}
async function registerUpdater(){
 if(!('serviceWorker' in navigator))return;
 try{
   const reg=await navigator.serviceWorker.register(`./sw.js?v=${encodeURIComponent(APP_BUILD)}`,{scope:'./',updateViaCache:'none'});
   reg.update().catch(()=>{});
 }catch(e){}
}

async function init(){
 await hardRuntimeCleanupIfNeeded();
 if(!(await checkRemoteVersion()))return;
 const seedVersion=window.NIRC_SEED_VERSION||APP_BUILD;
 const savedVersion=localStorage.getItem(DATA_SEED_VERSION_KEY);
 const savedCurrent=safeParseState(localStorage.getItem(STORE));
 if(savedCurrent && savedVersion===seedVersion){
   state=savedCurrent;
 }else{
   state=seedState();
   // 새 공개 배포본을 기준으로 하되 이전 저장소의 실제 기록 중 배포본에 없는 데이터는 보존합니다.
   if(savedCurrent)state=mergeMissingData(state,savedCurrent);
   for(const key of LEGACY_DATA_STORES){const x=safeParseState(localStorage.getItem(key));if(x)state=mergeMissingData(state,x)}
   localStorage.setItem(DATA_SEED_VERSION_KEY,seedVersion);
   save();
 }
 buildGroups(); bind(); render(); registerUpdater();
}
function buildGroups(){const s=$('#groupFilter');const groups=[...new Set(state.members.filter(m=>m.status==='current').map(m=>m.group).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ko'));s.innerHTML='<option value="all">전체 조</option>'+groups.map(g=>`<option>${g}</option>`).join('')}
function bind(){
 $('#searchInput').addEventListener('input',renderList); $('#groupFilter').addEventListener('change',renderList); $('#sortFilter').addEventListener('change',renderList);
 $$('#statusTabs button').forEach(b=>b.onclick=()=>{currentStatus=b.dataset.status;$$('#statusTabs button').forEach(x=>x.classList.toggle('active',x===b));renderList()});
 $('#backBtn').onclick=showList; $('#adminBtn').onclick=openAdmin; $('#closeSheet').onclick=closeSheet; $('#sheetBackdrop').onclick=closeSheet;
}
function render(){
 $('#currentCount').textContent=state.members.filter(m=>m.status==='current').length;
 $('#withdrawnCount').textContent=state.members.filter(m=>m.status==='withdrawn').length;
 $('#ttCount').textContent=state.members.filter(m=>m.status==='current'&&best5k(m.name)).length;
 renderList();
}
function renderList(){
 const q=$('#searchInput').value.trim(), group=$('#groupFilter').value, sort=$('#sortFilter').value;
 let rows=state.members.filter(m=>(currentStatus==='all'||m.status===currentStatus)&&(!q||m.name.includes(q))&&(group==='all'||m.group===group));
 rows.sort((a,b)=>{
   if(sort==='pb'){const x=best5k(a.name),y=best5k(b.name);return (x?toSec(x.time):99999)-(y?toSec(y.time):99999)||a.name.localeCompare(b.name,'ko')}
   if(sort==='latest'){const x=latest5k(a.name),y=latest5k(b.name);return (x?toSec(x.time):99999)-(y?toSec(y.time):99999)||a.name.localeCompare(b.name,'ko')}
   if(sort==='group')return String(a.group).localeCompare(String(b.group),'ko')||a.name.localeCompare(b.name,'ko');
   return a.name.localeCompare(b.name,'ko');
 });
 $('#memberList').innerHTML=rows.length?rows.map(m=>{const pb=best5k(m.name);return `<button class="memberRow" data-name="${m.name}"><div><div class="memberNameLine"><span class="memberName">${m.name}</span><span class="tag ${m.status==='current'?'active':''}">${m.group||'미지정'}</span></div><div class="memberMeta">${m.gender||'-'} · 가입 ${fmtJoinDate(m.join)}${m.status==='withdrawn'?` · ${m.withdrawReason||'탈퇴'}`:''}</div></div><div class="memberStat"><b>${pb?pb.time:'—'}</b><span>5K PB</span></div></button>`}).join(''):'<div class="empty">조건에 맞는 회원이 없습니다.</div>';
 $$('#memberList .memberRow').forEach(b=>b.onclick=()=>showDetail(b.dataset.name));
}
function showList(){$('#detailView').classList.remove('active');$('#listView').classList.add('active');selectedName=null;window.scrollTo(0,0)}
function showDetail(name){selectedName=name;$('#listView').classList.remove('active');$('#detailView').classList.add('active');renderDetail();window.scrollTo(0,0)}
function pbBox(label,val,sub=''){return `<div class="pbBox"><span>${label}</span><b>${val||'—'}</b>${sub?`<small>${sub}</small>`:''}</div>`}
function renderDetail(){
 const m=state.members.find(x=>x.name===selectedName); if(!m)return;
 const b5=best5k(m.name),b10=bestRace(m.name,'10K'),bh=bestRace(m.name,'HALF'),bf=bestRace(m.name,'FULL');
 const vd=b10?vdot10k(b10.sec):null, lt=state.lt[m.name]||{}; const h=history5k(m.name); const last3=h.slice(-3); const bestSec=b5?toSec(b5.time):null;
 $('#detailCard').innerHTML=`
 <div class="personHead"><div><h2>${m.name}</h2><div class="personSub">${m.group||'미지정'} · ${m.status==='current'?'현재회원':'탈퇴회원'}${m.honor?` · ${m.honor}`:''}</div></div><div class="headActions"><button class="editTiny" id="editMember">운영진 수정</button></div></div>
 <div class="sectionTitle">PERSONAL BEST</div>
 <div class="pbGrid">${pbBox('5K',b5?b5.time:'—',b5?'PB':'')}${pbBox('10K',b10?secToHMS(b10.sec):'—')}${pbBox('HALF',bh?secToHMS(bh.sec):'—')}${pbBox('FULL',bf?secToHMS(bf.sec):'—')}</div>
 <div class="sectionTitle">TRAINING INDEX</div>
 <div class="metricGrid"><div class="metric"><span>VDOT · 10K기준</span><b>${vd?vd.toFixed(1):'—'}</b></div><div class="metric"><span>LT1 PACE</span><b>${lt.lt1||'—'}</b></div><div class="metric"><span>LT2 PACE</span><b>${lt.lt2||'—'}</b></div></div>
 <div class="sectionTitle">최근 5K T.T</div>
 <div class="ttStrip">${last3.length?last3.map(x=>`<div class="ttCell ${toSec(x.time)===bestSec?'pb':''}"><span>${+x.date.slice(5,7)}월</span><b>${x.time}</b></div>`).join(''):'<div class="ttCell"><span>기록</span><b>—</b></div>'}</div>
 <div class="sectionTitle">MEMBER INFO</div>
 <div class="infoGrid">${info('성별',m.gender)}${info('조',m.group)}${info('생년월일',fmtBirthDate(m.birth))}${info('가입일',fmtJoinDate(m.join))}${info('전화번호',m.phone||'—')}${info('옷 사이즈',m.shirt||'—')}${info('혈액형',m.blood||'—')}${info('회원번호',m.number||'—')}</div>
 <div class="actionGrid"><button data-act="5K">5K 이력</button><button data-act="10K">10K</button><button data-act="HALF">하프</button><button data-act="FULL">풀</button><button class="primary" data-act="LT">LT</button></div>`;
 $('#editMember').onclick=()=>openMemberEdit(m.name);
 $$('[data-act]').forEach(b=>b.onclick=()=>{const act=b.dataset.act;if(act==='5K')return open5kView(m.name);if(act==='LT')return openLTView(m.name);openRecordsView(m.name,act);});
}
function info(k,v){return `<div class="infoItem"><span>${k}</span><b>${v||'—'}</b></div>`}
function openSheet(title,html){$('#sheetTitle').textContent=title;$('#sheetBody').innerHTML=html;$('#sheetBackdrop').classList.remove('hidden');$('#bottomSheet').classList.remove('hidden')}
function closeSheet(){$('#sheetBackdrop').classList.add('hidden');$('#bottomSheet').classList.add('hidden')}

function openRecordsView(name,type){
 const arr=raceList(name,type),label={'10K':'10K','HALF':'하프','FULL':'풀'}[type];
 openSheet(`${name} · ${label} 기록`, `<div class="recordList">${arr.slice().sort((a,b)=>(b.date||'').localeCompare(a.date||'')).map(r=>`<div class="recordItem"><div><b>${secToHMS(r.sec)}</b><br><small>${r.date||'날짜 미입력'} · ${r.meet||'대회명 미입력'}</small></div></div>`).join('')||'<div class="note">등록된 기록이 없습니다.</div>'}</div><div class="note">기록 수정은 운영진 수정에서만 가능합니다.</div>`);
}
function openRecordsEdit(name,type){
 const arr=raceList(name,type),label={'10K':'10K','HALF':'하프','FULL':'풀'}[type];
 openSheet(`${name} · ${label} 운영진 수정`, `<div class="formGrid"><div class="field"><label>대회일</label><input id="raceDate" type="date"></div><div class="field"><label>기록</label><input id="raceTime" placeholder="예: 39:12 또는 1:26:37"></div><div class="field full"><label>대회명</label><input id="raceMeet" placeholder="대회명"></div></div><button id="addRace" class="saveBtn">기록 추가</button><div class="recordList">${arr.slice().sort((a,b)=>(b.date||'').localeCompare(a.date||'')).map(r=>`<div class="recordItem"><div><b>${secToHMS(r.sec)}</b><br><small>${r.date||'날짜 미입력'} · ${r.meet||'대회명 미입력'}</small></div><button class="textBtn dangerBtn" data-delrace="${r.id}">삭제</button></div>`).join('')||'<div class="note">등록된 기록이 없습니다.</div>'}</div>`);
 $('#addRace').onclick=()=>{const sec=parseRace($('#raceTime').value.trim());if(!sec)return toast('기록 형식을 확인해 주세요.');state.races[name]??={};state.races[name][type]??=[];state.races[name][type].push({id:Date.now().toString(),date:$('#raceDate').value,meet:$('#raceMeet').value.trim(),sec});save();openRecordsEdit(name,type);renderDetail();renderList()};
 $$('[data-delrace]').forEach(b=>b.onclick=()=>{state.races[name][type]=state.races[name][type].filter(x=>x.id!==b.dataset.delrace);save();openRecordsEdit(name,type);renderDetail();renderList()})
}
function parseRace(s){const p=s.replace(/\s/g,'').split(':').map(Number);if(p.some(x=>!Number.isFinite(x)))return null;if(p.length===2)return p[0]*60+p[1];if(p.length===3)return p[0]*3600+p[1]*60+p[2];return null}
function open5kView(name){
 const h=history5k(name);
 openSheet(`${name} · 5K T.T 이력`, `<div class="recordList">${h.slice().reverse().map(r=>`<div class="recordItem"><div><b>${r.time}</b><br><small>${r.date}</small></div>${best5k(name)?.date===r.date?'<span class="pill">PB</span>':''}</div>`).join('')||'<div class="note">기록 없음</div>'}</div><div class="note">5K T.T 공식 기록은 월별 결과 이미지에서 운영진 반영으로만 업데이트합니다.</div>`);
}
function open5kManual(name){
 const h=history5k(name);openSheet(`${name} · 5K T.T 운영진 수정`, `<div class="formGrid"><div class="field"><label>측정일</label><input id="ttDate" type="date"></div><div class="field"><label>5K 기록</label><input id="ttTime" placeholder="예: 20:23"></div></div><button id="addTT" class="saveBtn">5K 기록 추가</button><div class="recordList">${h.slice().reverse().map(r=>`<div class="recordItem"><div><b>${r.time}</b><br><small>${r.date}</small></div><button class="textBtn dangerBtn" data-deltt="${r.date}">삭제</button></div>`).join('')||'<div class="note">기록 없음</div>'}</div>`);
 $('#addTT').onclick=()=>{const d=$('#ttDate').value,t=$('#ttTime').value.trim();if(!d||toSec(t)==null)return toast('날짜와 기록을 확인해 주세요.');state.tt[d]??=[];state.tt[d]=state.tt[d].filter(r=>r.name!==name);state.tt[d].push({name,group:state.members.find(m=>m.name===name)?.group||'미지정',time:t});save();open5kManual(name);renderDetail();render()};
 $$('[data-deltt]').forEach(b=>b.onclick=()=>{state.tt[b.dataset.deltt]=(state.tt[b.dataset.deltt]||[]).filter(r=>r.name!==name);save();open5kManual(name);renderDetail();render()})
}
function openLTView(name){
 const x=state.lt[name]||{};openSheet(`${name} · LT1 / LT2`, `<div class="infoGrid">${info('LT1 페이스',x.lt1||'—')}${info('LT2 페이스',x.lt2||'—')}${info('LT1 심박',x.lt1hr||'—')}${info('LT2 심박',x.lt2hr||'—')}${info('측정일',x.date||'—')}</div><div class="note">LT 수정은 운영진 수정에서만 가능합니다.</div>`);
}
function openLTEdit(name){const x=state.lt[name]||{};openSheet(`${name} · LT 운영진 수정`, `<div class="formGrid"><div class="field"><label>LT1 페이스</label><input id="lt1" placeholder="예: 4:35" value="${x.lt1||''}"></div><div class="field"><label>LT2 페이스</label><input id="lt2" placeholder="예: 4:08" value="${x.lt2||''}"></div><div class="field"><label>LT1 심박 (선택)</label><input id="lt1hr" inputmode="numeric" value="${x.lt1hr||''}"></div><div class="field"><label>LT2 심박 (선택)</label><input id="lt2hr" inputmode="numeric" value="${x.lt2hr||''}"></div><div class="field full"><label>측정일</label><input id="ltDate" type="date" value="${x.date||''}"></div></div><button id="saveLT" class="saveBtn">저장</button>`);$('#saveLT').onclick=()=>{state.lt[name]={lt1:$('#lt1').value.trim(),lt2:$('#lt2').value.trim(),lt1hr:$('#lt1hr').value.trim(),lt2hr:$('#lt2hr').value.trim(),date:$('#ltDate').value};save();closeSheet();renderDetail();toast('LT 값을 저장했습니다.')};}
function renameMember(oldName,newName){newName=cleanName(newName);if(!newName||newName===oldName)return oldName;if(state.members.some(m=>m.name===newName))throw new Error('같은 이름의 회원이 이미 있습니다.');for(const rows of Object.values(state.tt||{}))for(const r of rows)if(r.name===oldName)r.name=newName;if(state.races[oldName]){state.races[newName]=state.races[oldName];delete state.races[oldName]}if(state.lt[oldName]){state.lt[newName]=state.lt[oldName];delete state.lt[oldName]}return newName;}
function openMemberEdit(name){
 const m=state.members.find(x=>x.name===name);
 openSheet(`${name} · 운영진 수정`, `<div class="formGrid"><div class="field"><label>이름</label><input id="eName" value="${m.name||''}"></div><div class="field"><label>성별</label><select id="eGender"><option value="남" ${m.gender==='남'?'selected':''}>남</option><option value="여" ${m.gender==='여'?'selected':''}>여</option></select></div><div class="field"><label>조</label><input id="eGroup" value="${m.group||''}"></div><div class="field"><label>회원 상태</label><select id="eStatus"><option value="current" ${m.status==='current'?'selected':''}>현재회원</option><option value="withdrawn" ${m.status==='withdrawn'?'selected':''}>탈퇴회원</option></select></div><div class="field"><label>생년월일</label><input id="eBirth" value="${m.birth||''}" placeholder="예: 920215"></div><div class="field"><label>가입일</label><input id="eJoin" value="${m.join||''}" placeholder="예: 260204"></div><div class="field"><label>옷 사이즈</label><input id="eShirt" value="${m.shirt||''}"></div><div class="field"><label>전화번호</label><input id="ePhone" value="${m.phone||''}"></div><div class="field"><label>혈액형</label><input id="eBlood" value="${m.blood||''}"></div><div class="field"><label>회원번호</label><input id="eNumber" inputmode="numeric" value="${m.number||''}"></div><div class="field"><label>탈퇴일</label><input id="eWithdrawDate" value="${m.withdrawDate||''}"></div><div class="field"><label>탈퇴 사유</label><input id="eWithdrawReason" value="${m.withdrawReason||''}"></div><div class="field full"><label>명예의 전당 / 메모</label><input id="eHonor" value="${m.honor||''}"></div></div><button id="saveMember" class="saveBtn">기본정보 저장</button><div class="opsQuick"><button data-oedit="5K">5K T.T</button><button data-oedit="10K">10K</button><button data-oedit="HALF">하프</button><button data-oedit="FULL">풀</button><button data-oedit="LT">LT1·LT2</button></div><div class="note">운영진 수정은 이 기기에 임시 저장됩니다. 모두에게 보이게 하려면 상단 ＋에서 배포용 ZIP을 만든 뒤 기존 고정 주소로 업데이트하세요.</div>`);
 $('#saveMember').onclick=()=>{try{const old=m.name,nm=renameMember(old,$('#eName').value.trim());m.name=nm;m.gender=$('#eGender').value;m.group=$('#eGroup').value.trim()||'미지정';m.status=$('#eStatus').value;m.birth=$('#eBirth').value.trim();m.join=$('#eJoin').value.trim();m.shirt=$('#eShirt').value.trim();m.phone=$('#ePhone').value.trim();m.blood=$('#eBlood').value.trim();m.number=+$('#eNumber').value||m.number;m.withdrawDate=$('#eWithdrawDate').value.trim();m.withdrawReason=$('#eWithdrawReason').value.trim();m.honor=$('#eHonor').value.trim();selectedName=nm;save();buildGroups();closeSheet();renderDetail();render();toast('운영진 수정 내용을 저장했습니다.')}catch(e){toast(e.message||'저장하지 못했습니다.')}};
 $$('[data-oedit]').forEach(b=>b.onclick=()=>{const a=b.dataset.oedit;closeSheet();if(a==='5K')open5kManual(name);else if(a==='LT')openLTEdit(name);else openRecordsEdit(name,a)});
}

function openAdmin(){
 openSheet('운영진 관리', `<div class="statusBanner ${isDirty()?'dirty':''}">${isDirty()?'● 미배포 변경사항 있음':'✓ 현재 배포본과 동일'}</div><div class="sectionTitle">5K T.T 월별 업데이트</div><div class="field"><label>측정일</label><input id="importDate" type="date"></div><div class="field" style="margin-top:8px"><label>결과 이미지</label><input id="imageInput" type="file" accept="image/*"><img id="imgPrev" class="ocrPreview hidden"><button id="runOCR" class="subBtn">이미지에서 이름·기록 읽기</button><div id="ocrProg" class="progress hidden"><i></i></div><div id="ocrStatus" class="note"></div></div><div class="field" style="margin-top:10px"><label>인식 결과 / 직접 붙여넣기</label><textarea id="ocrText" placeholder="예: 김건욱 19:01\n정혜영 20:23"></textarea></div><button id="previewImport" class="saveBtn">현재 회원과 매칭</button><div id="matchArea"></div><div class="note">현재 회원만 반영합니다. 비슷한 이름은 한 글자 오타까지 자동 후보로 판정합니다.</div><div class="sectionTitle">공개 업데이트</div><button id="makeDeployZip" class="publishBtn">배포용 ZIP 만들기</button><div class="note">운영진이 수정한 회원정보·5K·10K·하프·풀·LT 자료를 ZIP에 고정합니다. 원클릭 배포기에서 기존 회원명부 앱을 선택한 뒤 이 ZIP으로 업데이트하면 주소는 그대로 유지됩니다.</div><button id="discardDraft" class="subBtn dangerBtn">미배포 수정 취소 · 현재 배포본으로 되돌리기</button>`);
 $('#imageInput').onchange=e=>{const f=e.target.files?.[0];if(!f)return;$('#imgPrev').src=URL.createObjectURL(f);$('#imgPrev').classList.remove('hidden')};$('#runOCR').onclick=runOCR;$('#previewImport').onclick=previewImport;$('#makeDeployZip').onclick=makeDeployZip;$('#discardDraft').onclick=()=>{if(confirm('이 기기에서 아직 배포하지 않은 수정사항을 버리고 현재 배포본으로 되돌릴까요?')){localStorage.removeItem(STORE);localStorage.removeItem(DATA_SEED_VERSION_KEY);location.reload()}};
}
async function makeDeployZip(){
 if(!window.JSZip)return toast('ZIP 모듈을 불러오지 못했습니다.');const btn=$('#makeDeployZip');if(btn){btn.disabled=true;btn.textContent='ZIP 만드는 중...'}
 try{
   const stamp=new Date().toISOString().replace(/[-:TZ.]/g,'').slice(0,14),version=`ops-${stamp}`;
   const pub=JSON.parse(JSON.stringify({members:state.members,tt:state.tt,races:state.races,lt:state.lt}));
   const seedJs=`window.NIRC_SEED_VERSION = '${version}';\nwindow.NIRC_SEED = ${JSON.stringify(pub)};`;
   const files=['index.html','styles.css','app.js','sw.js','manifest.webmanifest','vercel.json'],texts={};
   for(const f of files){const r=await fetch(`./${f}?export=${Date.now()}`,{cache:'no-store'});if(!r.ok)throw new Error(`${f} 읽기 실패`);texts[f]=await r.text()}
   texts['index.html']=texts['index.html']
     .replace(/window\.NIRC_APP_BUILD="[^"]+";/,`window.NIRC_APP_BUILD="${version}";`)
     .replace(/(styles\.css|seed\.js|app\.js)\?v=[^"']+/g,`$1?v=${version}`);
   texts['app.js']=texts['app.js'].replace(/window\.NIRC_APP_BUILD\|\|'[^']+'/,`window.NIRC_APP_BUILD||'${version}'`);
   texts['sw.js']=texts['sw.js'].replace(/const APP_BUILD='[^']+';/,`const APP_BUILD='${version}';`);
   const versionJson=JSON.stringify({build:version,updatedAt:new Date().toISOString()},null,2);
   const zip=new JSZip();for(const [f,t] of Object.entries(texts))zip.file(f,t);zip.file('seed.js',seedJs);zip.file('seed.json',JSON.stringify(pub,null,2));zip.file('version.json',versionJson);
   const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:6}}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`NIRC_Member_Manager_UPDATE_${stamp}.zip`;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},1500);toast('배포용 ZIP을 만들었습니다. 기존 고정 주소로 업데이트하세요.')
 }catch(e){toast(e.message||'ZIP 생성에 실패했습니다.')}finally{if(btn){btn.disabled=false;btn.textContent='배포용 ZIP 만들기'}}
}

async function runOCR(){const f=$('#imageInput').files?.[0];if(!f)return toast('이미지를 선택해 주세요.');if(!window.Tesseract){$('#ocrStatus').textContent='글자 인식 모듈을 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.';return}$('#ocrProg').classList.remove('hidden');const bar=$('#ocrProg i');$('#ocrStatus').textContent='이미지 분석 중...';try{const r=await Tesseract.recognize(f,'kor+eng',{logger:m=>{if(m.status==='recognizing text'){const p=Math.round((m.progress||0)*100);bar.style.width=p+'%';$('#ocrStatus').textContent=`글자 읽는 중 ${p}%`}}});$('#ocrText').value=cleanupOCR(r?.data?.text||'');bar.style.width='100%';$('#ocrStatus').textContent='인식 완료. 내용 확인 후 매칭 버튼을 누르세요.'}catch(e){$('#ocrStatus').textContent='이미지 인식에 실패했습니다. 아래 칸에 결과를 붙여넣어도 됩니다.'}}
function cleanupOCR(s){return String(s).replace(/[|¦]/g,' ').replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n').trim()}
function levenshtein(a,b){a=cleanName(a);b=cleanName(b);const m=Array.from({length:a.length+1},()=>Array(b.length+1).fill(0));for(let i=0;i<=a.length;i++)m[i][0]=i;for(let j=0;j<=b.length;j++)m[0][j]=j;for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++)m[i][j]=Math.min(m[i-1][j]+1,m[i][j-1]+1,m[i-1][j-1]+(a[i-1]===b[j-1]?0:1));return m[a.length][b.length]}
function matchName(raw){const names=allCurrentNames(), n=cleanName(raw);if(names.includes(n))return {name:n,kind:'exact'};let best=null;for(const x of names){const d=levenshtein(n,x);if(!best||d<best.d)best={name:x,d}};if(best&&best.d<=1)return {name:best.name,kind:'fuzzy',raw:n};return null}
function parseImportText(text){const out=[];for(const line of String(text).split(/\r?\n/)){const times=[...line.matchAll(/(\d{1,2})\s*[:：.]\s*([0-5]\d)/g)];if(!times.length)continue;const last=times[times.length-1],time=`${Number(last[1])}:${last[2]}`;const left=line.slice(0,times[0].index);const nm=(left.match(/[가-힣]{2,5}/g)||[]).pop();if(!nm)continue;const mt=matchName(nm);if(mt)out.push({...mt,time})}const map=new Map();out.forEach(x=>map.set(x.name,x));return [...map.values()]}
function previewImport(){const rows=parseImportText($('#ocrText').value);const d=$('#importDate').value;if(!d)return toast('측정일을 선택해 주세요.');if(!rows.length){$('#matchArea').innerHTML='<div class="note warn">현재 회원과 매칭된 기록이 없습니다.</div>';return}$('#matchArea').innerHTML=`<table class="matchTable"><thead><tr><th>인식</th><th>회원</th><th>기록</th><th>판정</th></tr></thead><tbody>${rows.map((r,i)=>`<tr><td>${r.raw||r.name}</td><td>${r.name}</td><td><input data-time="${i}" value="${r.time}" style="width:62px;border:1px solid #e2e8f0;border-radius:7px;padding:4px"></td><td class="${r.kind==='exact'?'ok':'warn'}">${r.kind==='exact'?'일치':'오타추정'}</td></tr>`).join('')}</tbody></table><button id="commitImport" class="saveBtn">${rows.length}명 기록 반영</button>`;$('#commitImport').onclick=()=>{const list=rows.map((r,i)=>({...r,time:document.querySelector(`[data-time="${i}"]`).value.trim()})).filter(r=>toSec(r.time)!=null);state.tt[d]??=[];for(const r of list){state.tt[d]=state.tt[d].filter(x=>x.name!==r.name);const mem=state.members.find(m=>m.name===r.name);state.tt[d].push({name:r.name,group:mem?.group||'미지정',time:r.time})}save();closeSheet();render();if(selectedName)renderDetail();toast(`${list.length}명 5K 기록을 반영했습니다.`)}}

init();
