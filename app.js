(() => {
'use strict';
const STORAGE_KEY='commandCenter.v3.0.cloud';
const LEGACY_STORAGE_KEYS=['commandCenter.v3.0.cloud','commandCenter.v2.9.cloud','commandCenter.v2.9.cloud','commandCenter.v2.6.cloud','banqiaoCommandCenter.v2.5.cloud','banqiaoCommandCenter.v2.2','banqiaoCommandCenter.v2.1','banqiaoCommandCenter.m1.snapshots.v1'];
const metrics=[
  {key:'phoneInsurance',label:'手機保險'},
  {key:'computerInsurance',label:'電腦保險'},
  {key:'tabletInsurance',label:'平板保險'},
  {key:'watchEarInsurance',label:'手錶／耳機保險'},
  {key:'totalInsurance',label:'總保險'},
  {key:'totalLines',label:'總門號'},
  {key:'ganp',label:'GA／NP'},
  {key:'above999',label:'999以上'},
  {key:'accyNA',label:'Accy(NA)'}
];
const coreForecast=['totalInsurance','totalLines','ganp','above999','accyNA'];
const state={monthKey:'',people:[],storeTargets:{},dailyLineSnapshots:{},dailyInsuranceSnapshots:{},meetingNotes:{},meetingHubRecords:[],currentMeetingRecordId:null,lastImport:null,lastImportTotals:null,todayDelta:null,diagnostics:null,branding:{appName:'Command Center',subtitle:'Retail Operations',brand:'By Pei Yi',storeName:'板橋門市',managerName:'佩佩'},personAliases:{},personDisplayMode:'nickname'};
const FIREBASE_CONFIG={
  apiKey:"AIzaSyAJQ4OIreTU7Xv_SzWk2wDbhhRpodQtqoM",
  authDomain:"command-center-dac9a.firebaseapp.com",
  projectId:"command-center-dac9a",
  storageBucket:"command-center-dac9a.firebasestorage.app",
  messagingSenderId:"828532429347",
  appId:"1:828532429347:web:4a6139ffd63b53a7d69796"
};
const cloud={auth:null,db:null,doc:null,ready:false,applying:false,lastPayload:'',saveTimer:null,unsubscribe:null};
function cloudStatus(text,kind=''){
  const el=document.getElementById('cloudStatus');if(!el)return;
  el.textContent=text;el.className=`status-chip ${kind}`.trim();
}
function showCloudLogin(message='此裝置第一次使用時登入一次，之後會自動保持連線。'){
  const modal=document.getElementById('cloudLoginModal');if(!modal)return;
  document.getElementById('cloudLoginMessage').textContent=message;
  modal.classList.remove('hidden');
}
function hideCloudLogin(){document.getElementById('cloudLoginModal')?.classList.add('hidden')}
async function signInCloud(){
  const email=document.getElementById('cloudEmail')?.value.trim();
  const password=document.getElementById('cloudPassword')?.value||'';
  const msg=document.getElementById('cloudLoginMessage');
  if(!email||!password){msg.textContent='請輸入 Firebase 管理帳號與密碼。';return}
  try{
    msg.textContent='正在連線雲端…';
    await cloud.auth.signInWithEmailAndPassword(email,password);
    document.getElementById('cloudPassword').value='';
  }catch(e){console.error(e);msg.textContent='登入失敗，請確認 Email、密碼與 Firebase Authentication 設定。'}
}
async function initCloud(){
  if(typeof firebase==='undefined'){cloudStatus('雲端元件載入失敗','error');return}
  try{
    if(!firebase.apps.length)firebase.initializeApp(FIREBASE_CONFIG);
    cloud.auth=firebase.auth();cloud.db=firebase.firestore();
    try{await cloud.auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL)}catch(e){console.warn(e)}
    document.getElementById('cloudLoginBtn')?.addEventListener('click',signInCloud);
    document.getElementById('cloudPassword')?.addEventListener('keydown',e=>{if(e.key==='Enter')signInCloud()});
    cloud.auth.onAuthStateChanged(user=>{
      if(!user){cloud.ready=false;cloudStatus('雲端未連線','error');showCloudLogin();return}
      hideCloudLogin();connectCloud(user);
    });
  }catch(e){console.error(e);cloudStatus('雲端初始化失敗','error');showCloudLogin('Firebase 初始化失敗，請重新整理後再試。')}
}
function connectCloud(user){
  if(cloud.unsubscribe)cloud.unsubscribe();
  cloud.doc=cloud.db.collection('stores').doc('banqiao').collection('appState').doc('main');
  cloudStatus('正在同步…');
  cloud.unsubscribe=cloud.doc.onSnapshot(async snap=>{
    if(!snap.exists){
      cloud.ready=true;cloudStatus('雲端已連線','ok');scheduleCloudSave(true);return;
    }
    const data=snap.data()||{},payload=String(data.payload||'');
    cloud.ready=true;cloudStatus('雲端已同步','ok');
    if(!payload||payload===cloud.lastPayload||payload===JSON.stringify(state))return;
    try{
      const remote=JSON.parse(payload);cloud.applying=true;Object.keys(state).forEach(k=>delete state[k]);Object.assign(state,remote);
      state.monthKey=monthKey();if(!state.people)state.people=[];if(!state.storeTargets)state.storeTargets={};
      if(!state.dailyLineSnapshots)state.dailyLineSnapshots={};if(!state.dailyInsuranceSnapshots)state.dailyInsuranceSnapshots={};if(!state.meetingNotes)state.meetingNotes={};
      metrics.forEach(m=>{if(state.storeTargets[m.key]===undefined)state.storeTargets[m.key]=0});state.people.forEach(p=>ensurePerson(p.id,p.name));ensureOpsState();ensureBranding();ensurePeoplePreferences();rebuildLineActualsFromSnapshots();
      cloud.lastPayload=payload;localStorage.setItem(STORAGE_KEY,payload);renderAll();
      setTimeout(()=>{cloud.applying=false},0);
    }catch(e){console.error('Cloud payload error',e);cloudStatus('雲端資料讀取失敗','error');cloud.applying=false}
  },e=>{console.error(e);cloud.ready=false;cloudStatus('雲端同步失敗','error')});
}
function scheduleCloudSave(immediate=false){
  if(!cloud.ready||!cloud.doc||cloud.applying)return;
  clearTimeout(cloud.saveTimer);
  cloud.saveTimer=setTimeout(async()=>{
    const payload=JSON.stringify(state);if(payload===cloud.lastPayload)return;
    try{
      await cloud.doc.set({payload,updatedAt:firebase.firestore.FieldValue.serverTimestamp(),monthKey:state.monthKey},{merge:true});
      cloud.lastPayload=payload;cloudStatus('雲端已同步','ok');
    }catch(e){console.error(e);cloudStatus('等待網路同步','error')}
  },immediate?0:700);
}
const $=id=>document.getElementById(id);
const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0};
const fmt=v=>Math.round(num(v)).toLocaleString('zh-TW');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
function monthKey(d=new Date()){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`}
function dateKey(d=new Date()){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function weekdayText(d=new Date()){return ['日','一','二','三','四','五','六'][d.getDay()]}
function excelDate(v){
  if(v instanceof Date&&!isNaN(v))return v;
  if(typeof v==='number'){const utc=Math.round((v-25569)*86400*1000);return new Date(utc)}
  if(typeof v==='string'&&v.trim()){const d=new Date(v);if(!isNaN(d))return d}
  return null;
}
function personId(v){const m=String(v??'').trim().match(/^(\d{3,})/);return m?m[1]:String(v??'').trim()}

function cleanOfficialName(value,id=''){
  let text=String(value??'').trim();
  if(id)text=text.replace(new RegExp('^'+String(id)+'[-－_\\s]*'),'');
  return text||String(id||'');
}
function ensurePeoplePreferences(){
  if(!state.personAliases||typeof state.personAliases!=='object')state.personAliases={};
  if(!['nickname','both','official'].includes(state.personDisplayMode))state.personDisplayMode='nickname';
  state.people.forEach(p=>{if(!p.officialName)p.officialName=cleanOfficialName(p.name,p.id);});
}
function personDisplay(personOrId,officialName=''){
  ensurePeoplePreferences();
  const supplied=typeof personOrId==='object'&&personOrId?personOrId:null;
  const id=String(supplied?.id??personOrId??'');
  const p=state.people.find(x=>x.id===id)||supplied;
  const official=cleanOfficialName(p?.officialName||p?.name||officialName,id);
  const nickname=String(state.personAliases[id]||'').trim();
  if(state.personDisplayMode==='official'||!nickname)return official;
  if(state.personDisplayMode==='both')return `${nickname}（${official}）`;
  return nickname;
}
function renderPersonAliases(){
  const mode=document.getElementById('settingPersonDisplayMode');if(mode&&document.activeElement!==mode)mode.value=state.personDisplayMode||'nickname';
  const body=document.getElementById('personAliasBody');if(!body)return;body.innerHTML='';
  if(!state.people.length){body.innerHTML='<tr><td colspan="4" class="empty-state">匯入人員資料後，可在這裡設定綽號。</td></tr>';return}
  state.people.forEach(p=>{
    const tr=document.createElement('tr');
    tr.innerHTML=`<td>${esc(p.id)}</td><td>${esc(cleanOfficialName(p.officialName||p.name,p.id))}</td><td><input class="alias-input" type="text" value="${esc(state.personAliases[p.id]||'')}" placeholder="例如：佩佩"></td><td><strong>${esc(personDisplay(p))}</strong></td>`;
    const input=tr.querySelector('input');
    input.addEventListener('change',e=>{const v=e.target.value.trim();if(v)state.personAliases[p.id]=v;else delete state.personAliases[p.id];save();renderAll()});
    body.appendChild(tr);
  });
}

function rate(target,actual){return num(target)>0?num(actual)/num(target)*100:null}
function safeRate(){return Math.max(1,Math.min(100,num(currentConfig?.()?.safeRate)||80))}
function rateClass(r){if(r===null)return'na';if(r>=100)return'good';if(r>=safeRate())return'warn';return'bad'}
function rateText(r){return r===null?'未設定':`${r.toFixed(1)}%`}
function daysInMonth(d=new Date()){return new Date(d.getFullYear(),d.getMonth()+1,0).getDate()}
function currentDay(){return new Date().getDate()}
function weekRanges(d=new Date()){
  const y=d.getFullYear(),m=d.getMonth(),last=daysInMonth(d),firstDow=new Date(y,m,1).getDay();
  const firstSaturday=firstDow===0?7:7-firstDow;
  return [
    {start:1,end:Math.min(firstSaturday,last)},
    {start:Math.min(firstSaturday+1,last),end:Math.min(firstSaturday+7,last)},
    {start:Math.min(firstSaturday+8,last),end:Math.min(firstSaturday+14,last)},
    {start:Math.min(firstSaturday+15,last),end:last}
  ];
}
function weekOfDate(d){const day=d.getDate(),ranges=weekRanges(d);for(let i=0;i<4;i++)if(day>=ranges[i].start&&day<=ranges[i].end)return i+1;return 4}
function emptyMetrics(){const o={};metrics.forEach(m=>o[m.key]={target:0,actual:0});return o}
function emptyWeekly(){const all={};for(let w=1;w<=4;w++){all[w]={};metrics.forEach(m=>all[w][m.key]={target:0,actual:0})}return all}
function ensurePerson(id,name){
  id=String(id);let p=state.people.find(x=>x.id===id);
  if(!p){p={id,name:name||id,officialName:cleanOfficialName(name||id,id),data:emptyMetrics(),weekly:{[state.monthKey]:emptyWeekly()}};state.people.push(p)}
  if(name){p.name=name;p.officialName=cleanOfficialName(name,id)}else if(!p.officialName)p.officialName=cleanOfficialName(p.name,id);
  if(!p.weekly[state.monthKey])p.weekly[state.monthKey]=emptyWeekly();
  metrics.forEach(m=>{if(!p.data[m.key])p.data[m.key]={target:0,actual:0};for(let w=1;w<=4;w++)if(!p.weekly[state.monthKey][w][m.key])p.weekly[state.monthKey][w][m.key]={target:0,actual:0}});
  return p;
}
function ensureBranding(){
  if(!state.branding)state.branding={};
  state.branding.appName=state.branding.appName||'Command Center';
  state.branding.subtitle=state.branding.subtitle||'Retail Operations';
  state.branding.brand='By Pei Yi';
  state.branding.storeName=state.branding.storeName||'板橋門市';
  state.branding.managerName=state.branding.managerName||'佩佩';
}
function renderBranding(){
  ensureBranding();const b=state.branding;
  document.title=b.appName;
  const set=(id,text)=>{const el=document.getElementById(id);if(el)el.textContent=text};
  set('appTitle',b.appName);set('storeDisplay',b.storeName);set('appSubtitleText',b.subtitle);set('headerBrand',b.brand);set('splashBrand',b.brand);
  set('settingsPreviewName',b.appName);set('settingsPreviewSubtitle',`${b.subtitle} · ${b.brand}`);set('settingsPreviewStore',`${b.storeName}｜${b.managerName}`);
  const fields={settingStoreName:b.storeName,settingManagerName:b.managerName,settingAppName:b.appName,settingAppSubtitle:b.subtitle};
  Object.entries(fields).forEach(([id,val])=>{const el=document.getElementById(id);if(el&&document.activeElement!==el)el.value=val});
  const cfg=currentConfig();const sr=document.getElementById('settingSafeRate'),ab=document.getElementById('settingAllocationBasis');if(sr&&document.activeElement!==sr)sr.value=cfg.safeRate||80;if(ab&&document.activeElement!==ab)ab.value=cfg.allocationBasis||'safe';
}
function saveBranding(){
  ensureBranding();
  state.branding.storeName=document.getElementById('settingStoreName')?.value.trim()||'未設定門市';
  state.branding.managerName=document.getElementById('settingManagerName')?.value.trim()||'管理者';
  state.branding.appName=document.getElementById('settingAppName')?.value.trim()||'Command Center';
  state.branding.subtitle=document.getElementById('settingAppSubtitle')?.value.trim()||'Retail Operations';
  state.personDisplayMode=document.getElementById('settingPersonDisplayMode')?.value||'nickname';
  const cfg=currentConfig();cfg.safeRate=Math.max(1,Math.min(100,num(document.getElementById('settingSafeRate')?.value)||80));cfg.allocationBasis=document.getElementById('settingAllocationBasis')?.value==='full'?'full':'safe';
  rebuildProgressWeeklyTargets();save();renderAll();alert(`設定已儲存。目前以 ${cfg.allocationBasis==='safe'?cfg.safeRate+'% 安全線':'100% 完整目標'}分配每日與每週目標。`);
}
function showOpeningSplash(){
  const splash=document.getElementById('appSplash');if(!splash)return;
  const status=document.getElementById('splashStatus');const h=new Date().getHours();
  let line=h<12?'歡迎回來，準備開始今天的營運。':h<18?'同步營運資料中…':'今天辛苦了，正在準備 Dashboard。';
  if(new Date().getDay()===0)line='Sunday Review · Preparing weekly meeting…';
  if(status)status.textContent=line;
  requestAnimationFrame(()=>splash.classList.add('visible'));
  setTimeout(()=>{splash.classList.add('leaving');setTimeout(()=>splash.remove(),500)},1900);
}
function init(){
  state.monthKey=monthKey();metrics.forEach(m=>state.storeTargets[m.key]=0);
  load();ensureBranding();ensurePeoplePreferences();
  $('monthSubtitle').textContent=`${new Date().getFullYear()} 年 ${new Date().getMonth()+1} 月｜第 ${weekOfDate(new Date())} 週｜今日 ${new Date().toLocaleDateString('zh-TW')}`;
  bind();renderAll();
}
function bind(){
  $('importBtn').addEventListener('click',()=>$('fileInput').click());
  $('fileInput').addEventListener('change',e=>{const f=e.target.files?.[0];if(f)importWorkbook(f);e.target.value=''});
  $('shareCardBtn')?.addEventListener('click',exportShareCard);
  $('saveBtn').addEventListener('click',()=>save(true));
  $('autoAllocateBtn').addEventListener('click',autoAllocateRemaining);
  document.querySelectorAll('.tab').forEach(btn=>btn.addEventListener('click',()=>showPage(btn.dataset.page)));
  $('weekSelect').addEventListener('change',renderWeekly);
  $('meetingWeekSelect').addEventListener('change',()=>{renderMeeting();renderWeeklyReport()});
  $('reportWeekSelect').addEventListener('change',renderWeeklyReport);
  $('meetingCsvBtn').addEventListener('click',exportMeetingCsv);
  $('meetingPrintBtn').addEventListener('click',printMeeting);
  $('downloadWeeklyReportBtn').addEventListener('click',downloadWeeklyReport);
  $('printWeeklyReportBtn').addEventListener('click',printWeeklyReport);
}
function setMobileNavActive(action){document.querySelectorAll('.mobile-nav-item').forEach(x=>x.classList.toggle('active',x.dataset.mobileAction===action))}
function showPage(page){document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x.dataset.page===page));document.querySelectorAll('.page').forEach(x=>x.classList.remove('active'));const target=$(`page-${page}`);if(target)target.classList.add('active');setMobileNavActive(page==='meeting'?'meeting':page==='report'?'report':'home')}
function save(show=false){const payload=JSON.stringify(state);localStorage.setItem(STORAGE_KEY,payload);scheduleCloudSave();if(show)alert(cloud.ready?'已儲存並同步至雲端。':'已先儲存在此裝置，連線後會自動同步。')}
function load(){try{let raw=localStorage.getItem(STORAGE_KEY);if(!raw){for(const key of LEGACY_STORAGE_KEYS){raw=localStorage.getItem(key);if(raw)break}}const old=JSON.parse(raw||'null');if(old){Object.assign(state,old);state.monthKey=monthKey();if(!state.dailyLineSnapshots)state.dailyLineSnapshots={};if(!state.dailyInsuranceSnapshots)state.dailyInsuranceSnapshots={};if(!state.meetingNotes)state.meetingNotes={};metrics.forEach(m=>{if(state.storeTargets[m.key]===undefined)state.storeTargets[m.key]=0});state.people.forEach(p=>ensurePerson(p.id,p.name));ensurePeoplePreferences();rebuildLineActualsFromSnapshots()}}catch(e){console.warn(e)}}
function sheetRows(wb,name){const ws=wb.Sheets[name];return ws?XLSX.utils.sheet_to_json(ws,{header:1,defval:'',raw:true}):null}
function categoryKey(c){c=String(c||'').trim();if(c==='手機保險')return'phoneInsurance';if(c==='電腦保險')return'computerInsurance';if(c==='平板保險')return'tabletInsurance';if(c==='手錶保險'||c==='耳機保險'||c==='手錶耳機保險'||c==='手錶／耳機保險')return'watchEarInsurance';if(c==='總保險')return'totalInsurance';return null}
async function importWorkbook(file){
  const status=$('importStatus'),chip=$('lastUpdated');
  if(typeof XLSX==='undefined'){
    status.textContent='Excel 解析元件載入失敗，請確認網路後重新整理。';
    chip.textContent='載入失敗';chip.className='status-chip error';return;
  }
  status.textContent='正在讀取 Excel⋯';chip.textContent='處理中';chip.className='status-chip';
  try{
    const wb=XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:true});
    const required=['Data','對應表','門號表','人員表'];
    const missing=required.filter(n=>!wb.Sheets[n]);
    if(missing.length)throw new Error(`缺少工作表：${missing.join('、')}`);

    const dataRows=sheetRows(wb,'Data');
    const mapRows=sheetRows(wb,'對應表');
    const lineRows=sheetRows(wb,'門號表');
    const staffRows=sheetRows(wb,'人員表');

    const savedPeople=new Map(state.people.map(p=>[p.id,{data:p.data,weekly:p.weekly,name:personDisplay(p)}]));
    state.people=[];

    staffRows.slice(1).forEach(r=>{
      const id=personId(r[0]);if(!id)return;
      const label=String(r[2]||`${id}-${r[1]||''}`).trim();
      const p=ensurePerson(id,label);
      const old=savedPeople.get(id);
      if(old){
        metrics.forEach(m=>p.data[m.key].target=num(old.data?.[m.key]?.target));
        p.weekly=old.weekly||p.weekly;
        ensurePerson(id,label);
      }
    });

    // 每次匯入都由 Excel 重新建立本月保險實績，避免重複累加。
    state.people.forEach(p=>{
      ['phoneInsurance','computerInsurance','tabletInsurance','watchEarInsurance','totalInsurance','accyNA'].forEach(k=>p.data[k].actual=0);
      for(let w=1;w<=4;w++){
        ['phoneInsurance','computerInsurance','tabletInsurance','watchEarInsurance','totalInsurance','accyNA'].forEach(k=>p.weekly[state.monthKey][w][k].actual=0);
      }
    });

    const skuMap=new Map();
    mapRows.slice(1).forEach(r=>{
      const sku=String(r[0]??'').trim().toUpperCase();
      const key=categoryKey(r[2]);
      if(sku&&key)skuMap.set(sku,key);
    });

    const unknownSku=new Map(),unknownPeople=new Set();
    const insuranceSnapshots={};
    let insuranceCount=0,validSalesRows=0,skippedPresale=0,skippedVoid=0,accyGross=0,airPodsExcluded=0,accyNet=0;
    dataRows.slice(1).forEach(r=>{
      const d=excelDate(r[0]);if(!d||monthKey(d)!==state.monthKey)return;
      const staffRaw=String(r[6]??'').trim();
      const id=personId(staffRaw);

      // Accy(NA) 完全依公司報表公式計算，不套用保險交易型態篩選：
      // AG 欄為 Accy 的 I 欄金額總和，扣除 AH 欄為 AirPods 的 I 欄金額。
      // 欄位索引：I=8、AG=32、AH=33（0-based）。
      const accyGroup=String(r[32]??'').trim().toUpperCase();
      const accyItem=String(r[33]??'').trim().replace(/\s/g,'').toUpperCase();
      const saleAmount=num(r[8]);
      if(id&&accyGroup==='ACCY'){
        let p=state.people.find(x=>x.id===id);
        if(!p){p=ensurePerson(id,staffRaw);unknownPeople.add(staffRaw);}
        const isAirPods=accyItem.includes('AIRPODS');
        accyGross+=saleAmount;
        if(isAirPods)airPodsExcluded+=saleAmount;
        else{
          p.data.accyNA.actual+=saleAmount;
          const w=weekOfDate(d);
          p.weekly[state.monthKey][w].accyNA.actual+=saleAmount;
          const dk=dateKey(d);
          if(!insuranceSnapshots[dk])insuranceSnapshots[dk]={};
          if(!insuranceSnapshots[dk][id])insuranceSnapshots[dk][id]={name:personDisplay(p),phoneInsurance:0,computerInsurance:0,tabletInsurance:0,watchEarInsurance:0,totalInsurance:0,accyNA:0};
          insuranceSnapshots[dk][id].accyNA+=saleAmount;
          accyNet+=saleAmount;
        }
      }

      const transactionType=String(r[2]??'').trim();
      if(transactionType.includes('作廢')){skippedVoid++;return;}
      if(transactionType==='預售交易'){skippedPresale++;return;}
      // 保險實績只計一般交易與預售結帳。
      if(transactionType!=='一般交易'&&transactionType!=='預售結帳')return;

      const sku=String(r[3]??'').trim().toUpperCase();
      const qty=num(r[7]);
      if(!id||!sku||qty<=0)return;
      validSalesRows++;
      const key=skuMap.get(sku);
      if(!key){unknownSku.set(sku,String(r[4]||''));return;}
      let p=state.people.find(x=>x.id===id);
      if(!p){p=ensurePerson(id,staffRaw);unknownPeople.add(staffRaw);}
      p.data[key].actual+=qty;
      if(key!=='totalInsurance')p.data.totalInsurance.actual+=qty;
      const w=weekOfDate(d);
      p.weekly[state.monthKey][w][key].actual+=qty;
      if(key!=='totalInsurance')p.weekly[state.monthKey][w].totalInsurance.actual+=qty;
      const dk=dateKey(d);
      if(!insuranceSnapshots[dk])insuranceSnapshots[dk]={};
      if(!insuranceSnapshots[dk][id])insuranceSnapshots[dk][id]={name:personDisplay(p),phoneInsurance:0,computerInsurance:0,tabletInsurance:0,watchEarInsurance:0,totalInsurance:0,accyNA:0};
      insuranceSnapshots[dk][id][key]+=qty;
      if(key!=='totalInsurance')insuranceSnapshots[dk][id].totalInsurance+=qty;
      insuranceCount+=qty;
    });

    // 門號表 A～E：保留本月原始明細，用於重建每日／每週進度。
    const monthSnapshots={};
    let rawRows=0;
    lineRows.slice(1).forEach(r=>{
      const d=excelDate(r[0]);
      if(!d||monthKey(d)!==state.monthKey)return;
      const id=personId(r[3]);
      if(!id)return;
      const display=String(r[4]||r[3]||id).trim();
      const type=String(r[2]||'').trim().toUpperCase();
      const plan=num(r[1]);
      const dateKey=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      if(!monthSnapshots[dateKey])monthSnapshots[dateKey]={};
      if(!monthSnapshots[dateKey][id])monthSnapshots[dateKey][id]={name:display,totalLines:0,ganp:0,above999:0};
      monthSnapshots[dateKey][id].totalLines+=1;
      if(type==='GA'||type==='NP')monthSnapshots[dateKey][id].ganp+=1;
      if(plan>=999)monthSnapshots[dateKey][id].above999+=1;
      rawRows++;
      if(!state.people.find(x=>x.id===id))ensurePerson(id,display);
    });

    // 門號表 I～L 的「月」區塊：I=人員、J=月總門號、K=月GA/NP、L=月999。
    // 月總計優先採用此區塊；若找不到或公式沒有數值，再退回 A～E 明細重算。
    const monthlySummary={};
    let monthHeader=-1;
    for(let i=0;i<lineRows.length;i++){
      if(String(lineRows[i]?.[9]??'').trim()==='月'){monthHeader=i;break;}
    }
    if(monthHeader>=0){
      for(let i=monthHeader+1;i<lineRows.length;i++){
        const r=lineRows[i];
        const personRaw=String(r?.[8]??'').trim();
        if(!personRaw)break;
        const id=personId(personRaw);
        if(!id)continue;
        const totalLines=num(r?.[9]),ganp=num(r?.[10]),above999=num(r?.[11]);
        const hasNumeric=[r?.[9],r?.[10],r?.[11]].some(v=>v!==''&&v!==null&&v!==undefined&&typeof v!=='string');
        if(!hasNumeric)continue;
        monthlySummary[id]={name:personRaw,totalLines,ganp,above999};
        if(!state.people.find(x=>x.id===id))ensurePerson(id,personRaw);
      }
    }

    state.dailyLineSnapshots[state.monthKey]=monthSnapshots;
    state.dailyInsuranceSnapshots[state.monthKey]=insuranceSnapshots;
    rebuildLineActualsFromSnapshots(monthlySummary);
    const summaryCount=Object.keys(monthlySummary).length;
    const snapshotSource=summaryCount
      ? `I～L 月總計 ${summaryCount} 人（每週進度由 A～E ${rawRows} 筆明細計算）`
      : `A～E 本月原始明細，共 ${rawRows} 筆`;

    const newTotals=Object.fromEntries(coreForecast.map(k=>[k,storeActual(k)]));
    state.todayDelta=state.lastImportTotals?Object.fromEntries(coreForecast.map(k=>[k,newTotals[k]-num(state.lastImportTotals[k])])):null;
    state.lastImportTotals=newTotals;
    state.lastImport={file:file.name,time:new Date().toISOString(),snapshotSource};
    state.diagnostics={insuranceCount,validSalesRows,unknownSku:[...unknownSku],unknownPeople:[...unknownPeople],skippedPresale,skippedVoid,accyGross,airPodsExcluded,accyNet,snapshotSource};
    save();renderAll();

    status.innerHTML=`匯入完成：總保險 <strong>${fmt(storeActual('totalInsurance'))}</strong> 件；門號月累計 <strong>${fmt(storeActual('totalLines'))}</strong>；GA／NP <strong>${fmt(storeActual('ganp'))}</strong>；999以上 <strong>${fmt(storeActual('above999'))}</strong>；Accy(NA) <strong>$${fmt(storeActual('accyNA'))}</strong>。Accy 總額 $${fmt(accyGross)}，已排除 AirPods $${fmt(airPodsExcluded)}。門號快照來源：${esc(snapshotSource)}。${unknownSku.size?`另有 ${unknownSku.size} 個未對應料號未計入。`:''}`;
    chip.textContent=new Date().toLocaleString('zh-TW');chip.className='status-chip ok';
  }catch(err){
    console.error(err);status.textContent=`匯入失敗：${err.message}`;chip.textContent='匯入失敗';chip.className='status-chip error';
  }
}

function rebuildLineActualsFromSnapshots(monthlySummary={}){
  state.people.forEach(p=>{
    ['totalLines','ganp','above999'].forEach(k=>p.data[k].actual=0);
    for(let w=1;w<=4;w++)['totalLines','ganp','above999'].forEach(k=>p.weekly[state.monthKey][w][k].actual=0);
  });
  const snapshots=state.dailyLineSnapshots[state.monthKey]||{};
  Object.entries(snapshots).forEach(([dateKey,people])=>{
    const d=new Date(`${dateKey}T12:00:00`);if(isNaN(d)||monthKey(d)!==state.monthKey)return;
    const w=weekOfDate(d);
    Object.entries(people||{}).forEach(([id,v])=>{
      const p=ensurePerson(id,v.name||id);
      ['totalLines','ganp','above999'].forEach(k=>{
        const value=num(v[k]);p.data[k].actual+=value;p.weekly[state.monthKey][w][k].actual+=value;
      });
    });
  });
  // 月總計區塊只覆蓋月累計，不影響由日期明細計算出的每週完成數。
  Object.entries(monthlySummary||{}).forEach(([id,v])=>{
    const p=ensurePerson(id,v.name||id);
    ['totalLines','ganp','above999'].forEach(k=>p.data[k].actual=num(v[k]));
  });
}

function storeActual(key){return state.people.reduce((s,p)=>s+num(p.data[key]?.actual),0)}
function storeRate(key){return rate(state.storeTargets[key],storeActual(key))}
function expectedRate(){return currentDay()/daysInMonth()*100}
function renderAll(){renderWeekOptions();renderStore();renderForecast();renderAiAnalysis();renderTodayMinimums();renderFocus();renderTodayTargets();renderPeople();renderWeekly();renderLag();renderMeeting();renderWeeklyReport();renderMeetingHub();renderShareCard();renderGoalCard();renderPersonAliases();renderBranding();if(state.lastImport){$('lastUpdated').textContent=new Date(state.lastImport.time).toLocaleString('zh-TW');$('lastUpdated').className='status-chip ok'}save()}
function renderWeekOptions(){const ranges=weekRanges(),html=ranges.map((r,i)=>`<option value="${i+1}">第 ${i+1} 週（${new Date().getMonth()+1}/${r.start}～${new Date().getMonth()+1}/${r.end}）</option>`).join('');['weekSelect','meetingWeekSelect','reportWeekSelect'].forEach(id=>{const select=$(id);if(!select)return;const current=select.value||String(weekOfDate(new Date()));select.innerHTML=html;select.value=current});}
function renderStore(){
  const metricIcons={phoneInsurance:'▣',computerInsurance:'▤',tabletInsurance:'▥',watchEarInsurance:'◉',totalInsurance:'◆',totalLines:'▦',ganp:'↗',above999:'★',accyNA:'$'};
  const el=$('storeKpiGrid');el.innerHTML='';metrics.forEach(m=>{const a=storeActual(m.key),t=num(state.storeTargets[m.key]),safe=Math.round(t*safeRate()/100),r=rate(t,a),cls=rateClass(r),card=document.createElement('article');card.className=`kpi-card ${cls}`;card.innerHTML=`<div class="kpi-title"><span class="kpi-label"><i>${metricIcons[m.key]||'•'}</i>${m.label}</span><span class="rate-pill ${cls}">${rateText(r)}</span></div><div class="kpi-values"><span class="kpi-actual">${fmt(a)}</span><span class="kpi-target">/ <input class="target-input" type="number" min="0" value="${t}" aria-label="${m.label}全店目標"></span></div><div class="progress"><span style="width:${Math.min(r||0,100)}%"></span></div><div class="kpi-meta"><span>安全線 ${fmt(safe)}（${safeRate()}%）</span><span>${a>=safe?'已達安全線':`距安全線 ${fmt(Math.max(safe-a,0))}`}</span></div><div class="kpi-meta"><span>完整目標 100%</span><span>還差 ${fmt(Math.max(t-a,0))}</span></div>`;card.querySelector('input').addEventListener('change',e=>{state.storeTargets[m.key]=num(e.target.value);rebuildProgressWeeklyTargets();save();renderAll()});el.appendChild(card)})
}
function forecastValue(actual){const d=Math.max(currentDay(),1);return actual/d*daysInMonth()}
function renderTodayBrief(){
  const greeting=$('heroGreeting'),manager=$('heroManager'),context=$('heroContext'),date=$('heroDate'),grid=$('todayPriorityGrid');
  if(!grid)return;
  const now=new Date(),hour=now.getHours(),brand=state.branding||{};
  greeting.textContent=hour<11?'早安':hour<18?'午安':'晚安';
  manager.textContent=brand.managerName||'管理者';
  date.innerHTML=`<strong>${now.getMonth()+1}月${now.getDate()}日</strong><span>星期${weekdayText(now)} · ${esc(brand.storeName||'目前門市')}</span>`;
  const rows=lagRows();
  const storeRisks=coreForecast.map(k=>{const m=metrics.find(x=>x.key===k),a=storeActual(k),t=num(state.storeTargets[k]),safe=Math.round(t*safeRate()/100);return {label:m?.label||k,gap:Math.max(safe-a,0),a,safe,t}}).filter(x=>x.gap>0).sort((a,b)=>b.gap-a.gap);
  context.textContent=storeRisks.length?`目前有 ${storeRisks.length} 項核心 KPI 尚未到安全線，先處理最關鍵的缺口。`:'核心 KPI 皆已達安全線，今天可以朝 100% 完整目標前進。';
  const items=[];
  if(storeRisks[0])items.push({tone:'bad',icon:'!',title:`${storeRisks[0].label} 距安全線`,value:fmt(storeRisks[0].gap),note:`目前 ${fmt(storeRisks[0].a)}／安全線 ${fmt(storeRisks[0].safe)}`});
  if(rows[0])items.push({tone:'warn',icon:'↗',title:`${rows[0].person}｜${rows[0].label}`,value:`差 ${fmt(rows[0].gap)}`,note:`目前 ${rateText(rows[0].currentRate)}，每日需 ${rows[0].daily.toFixed(1)}`});
  const working=typeof todayManpower==='function'?todayManpower().filter(x=>isWorkingStatus(x.status)).length:0;
  items.push({tone:'info',icon:'人',title:'今日上班人力',value:String(working),note:'含店長人力'});
  const safeCount=coreForecast.filter(k=>{const t=num(state.storeTargets[k]);return t>0&&storeActual(k)>=Math.round(t*safeRate()/100)}).length;
  items.push({tone:'good',icon:'✓',title:'已達安全線',value:`${safeCount}／${coreForecast.length}`,note:`安全標準 ${safeRate()}%`});
  grid.innerHTML=items.slice(0,4).map(x=>`<article class="priority-card ${x.tone}"><span class="priority-icon">${x.icon}</span><div><small>${esc(x.title)}</small><strong>${esc(x.value)}</strong><p>${esc(x.note)}</p></div></article>`).join('');
}
function renderForecast(){const el=$('forecastGrid');el.innerHTML='';coreForecast.forEach(k=>{const m=metrics.find(x=>x.key===k),a=storeActual(k),t=state.storeTargets[k],f=forecastValue(a),r=rate(t,f),card=document.createElement('article');card.className='forecast-card';card.innerHTML=`<span>${m.label}</span><strong>${fmt(f)}</strong><small>目前 ${fmt(a)}｜目標 ${fmt(t)}</small><div class="forecast-rate ${rateClass(r)}Text">預估達成 ${rateText(r)}</div>`;el.appendChild(card)})}
function lagRows(){const rows=[],expected=expectedRate(),remainingDays=Math.max(daysInMonth()-currentDay(),0);state.people.forEach(p=>metrics.forEach(m=>{const t=num(p.data[m.key]?.target),a=num(p.data[m.key]?.actual);if(t<=0)return;const r=rate(t,a),expectedActual=t*expected/100;if(a+1e-9<expectedActual){rows.push({person:personDisplay(p),key:m.key,label:m.label,target:t,actual:a,currentRate:r,expectedRate:expected,gap:expectedActual-a,daily:remainingDays?Math.max(t-a,0)/remainingDays:Math.max(t-a,0),forecast:forecastValue(a),forecastRate:rate(t,forecastValue(a))})}}));return rows.sort((a,b)=>(b.expectedRate-b.currentRate)-(a.expectedRate-a.currentRate)||b.gap-a.gap)}
function renderFocus(){const rows=lagRows().slice(0,5),el=$('focusList');el.innerHTML='';if(!rows.length){el.innerHTML='<div class="empty-state">目前所有已設定目標的項目都在應有進度內。</div>';return}rows.forEach(x=>{const div=document.createElement('div');div.className='focus-item';div.innerHTML=`<div><strong>${esc(x.person)}｜${x.label}</strong><small>目前 ${rateText(x.currentRate)}，今日應達 ${rateText(x.expectedRate)}</small></div><div class="focus-number">落後 ${fmt(x.gap)}<small>每日需 ${x.daily.toFixed(1)}</small></div>`;el.appendChild(div)})}

function todayActualForPerson(p,key){
  const dk=dateKey(),id=p.id;
  if(['totalLines','ganp','above999'].includes(key))return num(state.dailyLineSnapshots?.[state.monthKey]?.[dk]?.[id]?.[key]);
  return num(state.dailyInsuranceSnapshots?.[state.monthKey]?.[dk]?.[id]?.[key]);
}
function currentWeekData(p,key){
  const w=weekOfDate(new Date());
  return p.weekly?.[state.monthKey]?.[w]?.[key]||{target:0,actual:0};
}
function remainingDaysInCurrentWeek(){
  const r=weekRanges()[weekOfDate(new Date())-1];
  return Math.max(r.end-currentDay()+1,1);
}
function todayGoalForPerson(p,key){
  const wd=currentWeekData(p,key),remaining=Math.max(num(wd.target)-num(wd.actual),0);
  if(num(wd.target)<=0){
    const monthRemaining=Math.max(allocationTarget(p.data[key]?.target)-num(p.data[key]?.actual),0);
    return Math.ceil(monthRemaining/Math.max(daysInMonth()-currentDay()+1,1));
  }
  return Math.ceil(remaining/remainingDaysInCurrentWeek());
}
function todayRemainingForPerson(p,key){return Math.max(todayGoalForPerson(p,key)-todayActualForPerson(p,key),0)}
function todayTargetsForPerson(p){
  return Object.fromEntries(coreForecast.map(k=>[k,{goal:todayGoalForPerson(p,k),actual:todayActualForPerson(p,k),remaining:todayRemainingForPerson(p,k)}]));
}
function personTodayStatus(p){
  const t=todayTargetsForPerson(p),left=coreForecast.reduce((s,k)=>s+t[k].remaining,0),max=Math.max(...coreForecast.map(k=>t[k].remaining));
  if(left===0)return{cls:'good',text:'已完成'};
  if(max<=1)return{cls:'warn',text:'接近完成'};
  return{cls:'bad',text:'需追蹤'};
}
function storeTodayMinimum(key){return state.people.reduce((s,p)=>s+todayRemainingForPerson(p,key),0)}
function storeWarnings(){
  return coreForecast.map(k=>{const m=metrics.find(x=>x.key===k),target=num(state.storeTargets[k]),actual=storeActual(k),expected=target*expectedRate()/100,gap=Math.max(expected-actual,0);return{key:k,label:m.label,gap,target,actual}}).filter(x=>x.target>0&&x.gap>0.01).sort((a,b)=>b.gap-a.gap)
}
function renderTodayMinimums(){
  const el=$('todayMinGrid');if(!el)return;el.innerHTML='';coreForecast.forEach(k=>{const m=metrics.find(x=>x.key===k),v=storeTodayMinimum(k),card=document.createElement('article');card.className='today-min-card';card.innerHTML=`<span>${m.label}</span><strong>+${fmt(v)}</strong><small>今日尚需完成</small>`;el.appendChild(card)})
}
function renderTodayTargets(){
  const body=$('todayTargetBody');if(!body)return;body.innerHTML='';
  if(!state.people.length){body.innerHTML='<tr><td colspan="7">請先匯入 Excel。</td></tr>';return}
  state.people.forEach(p=>{const t=todayTargetsForPerson(p),st=personTodayStatus(p),tr=document.createElement('tr');tr.innerHTML=`<td><strong>${esc(personDisplay(p))}</strong></td>${coreForecast.map(k=>`<td><span class="today-number">+${fmt(t[k].remaining)}</span><small>${fmt(t[k].actual)}/${fmt(t[k].goal)}</small></td>`).join('')}<td><span class="rate-pill ${st.cls}">${st.text}</span></td>`;body.appendChild(tr)})
}
function aiAnalysisLines(){
  if(!state.people.length)return['請先匯入業績追蹤.xlsx，系統會依目前進度產生分析。'];
  const store=coreForecast.map(k=>{const m=metrics.find(x=>x.key===k),a=storeActual(k),t=num(state.storeTargets[k]),r=rate(t,a),f=forecastValue(a),fr=rate(t,f);return{key:k,label:m.label,a,t,r,fr,gap:Math.max(t-a,0)}}).filter(x=>x.t>0);
  if(!store.length)return['請先設定全店目標，才能產生有效的進度分析。'];
  const risk=[...store].sort((a,b)=>(a.fr??999)-(b.fr??999))[0],best=[...store].sort((a,b)=>(b.r??-1)-(a.r??-1))[0];
  const lag=lagRows().filter(x=>coreForecast.includes(x.key)).slice(0,3);
  const lines=[];
  if(risk)lines.push(`${risk.label}目前 ${rateText(risk.r)}，月底預估 ${rateText(risk.fr)}${risk.fr!==null&&risk.fr<100?`，預估仍差 ${fmt(Math.max(risk.t-forecastValue(risk.a),0))} 件`:'，照目前速度有機會達標'}。`);
  if(best&&best.key!==risk?.key)lines.push(`${best.label}目前表現最佳，達成率 ${rateText(best.r)}，可維持現有節奏。`);
  if(lag.length)lines.push(`優先追蹤：${lag.map(x=>`${x.person}－${x.label}`).join('、')}。`);else lines.push('目前個人進度沒有明顯落後項目。');
  const focus=storeWarnings()[0];if(focus)lines.push(`今日全店建議優先完成 ${focus.label} +${fmt(storeTodayMinimum(focus.key))}。`);
  return lines;
}
function renderAiAnalysis(){
  const el=$('aiPanel');if(!el)return;const delta=state.todayDelta?coreForecast.filter(k=>num(state.todayDelta[k])!==0).map(k=>`${metrics.find(m=>m.key===k).label} ${num(state.todayDelta[k])>0?'+':''}${fmt(state.todayDelta[k])}`):[];
  el.innerHTML=`<div class="ai-summary"><div class="ai-icon">AI</div><div>${aiAnalysisLines().map(x=>`<p>${esc(x)}</p>`).join('')}${delta.length?`<div class="today-delta">本次匯入變化：${esc(delta.join('、'))}</div>`:''}</div></div>`
}
function renderShareCard(){
  if(!$('shareCard'))return;const now=new Date();$('shareDate').textContent=`${now.getFullYear()}/${String(now.getMonth()+1).padStart(2,'0')}/${String(now.getDate()).padStart(2,'0')}（${weekdayText(now)}）`;$('shareWeek').textContent=`第 ${weekOfDate(now)} 週`;
  const kpi=$('shareKpiGrid');kpi.innerHTML='';coreForecast.forEach(k=>{const m=metrics.find(x=>x.key===k),a=storeActual(k),t=num(state.storeTargets[k]),r=rate(t,a),div=document.createElement('div');div.className=`share-kpi ${rateClass(r)}`;div.innerHTML=`<span>${m.label}</span><strong>${fmt(a)} / ${fmt(t)}</strong><small>${rateText(r)}</small>`;kpi.appendChild(div)});
  $('shareMinGrid').innerHTML=coreForecast.map(k=>`<div><span>${metrics.find(m=>m.key===k).label}</span><strong>+${fmt(storeTodayMinimum(k))}</strong></div>`).join('');
  const warnings=storeWarnings();$('shareWarnings').innerHTML=warnings.length?warnings.slice(0,4).map(x=>`<div class="share-alert">${esc(x.label)}落後應有進度 ${fmt(x.gap)} 件</div>`).join(''):'<div class="share-ok">今日進度正常</div>';
  const tracks=lagRows().filter(x=>coreForecast.includes(x.key)).slice(0,5);$('shareTracking').innerHTML=tracks.length?tracks.map(x=>`<div class="share-track"><strong>${esc(x.person)}</strong><span>${esc(x.label)} -${fmt(x.gap)}</span></div>`).join(''):'<div class="share-ok">目前無需特別追蹤</div>';
  $('sharePeople').innerHTML=state.people.map(p=>{const t=todayTargetsForPerson(p);return`<tr><td>${esc(personDisplay(p))}</td>${coreForecast.map(k=>`<td>+${fmt(t[k].remaining)}</td>`).join('')}</tr>`}).join('');
}
function canvasToPngBlob(canvas){
  return new Promise((resolve,reject)=>{
    if(canvas.toBlob){
      canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('無法建立 PNG 圖片')),'image/png',1);
      return;
    }
    try{
      const dataUrl=canvas.toDataURL('image/png');
      const binary=atob(dataUrl.split(',')[1]);
      const bytes=new Uint8Array(binary.length);
      for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
      resolve(new Blob([bytes],{type:'image/png'}));
    }catch(error){reject(error)}
  });
}
function isMobileDevice(){
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)||window.matchMedia?.('(pointer: coarse)').matches;
}
function closeImagePreview(){
  const modal=document.getElementById('imageSavePreview');
  if(!modal)return;
  const url=modal.dataset.objectUrl;
  if(url)URL.revokeObjectURL(url);
  modal.remove();
}
function showImageSavePreview(blob,filename){
  closeImagePreview();
  const url=URL.createObjectURL(blob);
  const modal=document.createElement('div');
  modal.id='imageSavePreview';
  modal.className='image-save-preview';
  modal.dataset.objectUrl=url;
  modal.innerHTML=`<div class="image-save-card">
    <div class="image-save-header"><div><strong>圖片已產生</strong><small>長按圖片可選擇「儲存到照片」</small></div><button type="button" class="image-save-close" aria-label="關閉">×</button></div>
    <div class="image-save-scroll"><img src="${url}" alt="產生的圖片預覽"></div>
    <div class="image-save-actions"><button type="button" class="btn btn-primary" data-share>開啟分享選單</button><a class="btn btn-soft" href="${url}" download="${filename}">下載到檔案</a></div>
    <p>iPhone：按「開啟分享選單」後選擇「儲存影像」；若未出現該選項，可長按上方圖片儲存到照片。</p>
  </div>`;
  document.body.appendChild(modal);
  modal.querySelector('.image-save-close').addEventListener('click',closeImagePreview);
  modal.addEventListener('click',event=>{if(event.target===modal)closeImagePreview()});
  modal.querySelector('[data-share]').addEventListener('click',async()=>{
    const file=new File([blob],filename,{type:'image/png'});
    try{
      if(navigator.share&&(!navigator.canShare||navigator.canShare({files:[file]}))){
        await navigator.share({files:[file],title:filename.replace(/\.png$/,'')});
      }else alert('此瀏覽器不支援圖片分享，請長按圖片儲存到照片。');
    }catch(error){if(error?.name!=='AbortError'){console.error(error);alert('無法開啟分享選單，請長按圖片儲存到照片。')}}
  });
}
async function saveOrShareCanvas(canvas,filename){
  const blob=await canvasToPngBlob(canvas);
  const file=new File([blob],filename,{type:'image/png'});
  if(isMobileDevice()&&navigator.share&&(!navigator.canShare||navigator.canShare({files:[file]}))){
    try{
      await navigator.share({files:[file],title:filename.replace(/\.png$/,'')});
      return;
    }catch(error){
      if(error?.name==='AbortError')return;
      console.warn('原生分享失敗，改用圖片預覽。',error);
    }
  }
  if(isMobileDevice()){
    showImageSavePreview(blob,filename);
    return;
  }
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1500);
}
async function exportShareCard(){
  if(!state.people.length)return alert('請先匯入 Excel。');
  if(typeof html2canvas==='undefined')return alert('圖片輸出元件尚未載入，請確認網路後重新整理。');
  renderShareCard();const stage=document.querySelector('.share-card-stage');stage.classList.add('capturing');
  try{
    const canvas=await html2canvas($('shareCard'),{scale:2,backgroundColor:'#f6f3fb',useCORS:true,logging:false});
    await saveOrShareCanvas(canvas,`每日戰情_${dateKey()}.png`);
  }catch(e){console.error(e);alert('產生圖片失敗，請重新整理後再試。')}finally{stage.classList.remove('capturing')}
}
function renderPeople(){const el=$('peopleList');el.innerHTML='';if(!state.people.length){el.innerHTML='<div class="empty-state">請先匯入業績追蹤.xlsx。</div>';return}state.people.forEach((p,index)=>{const card=document.createElement('article');card.className='person-card';card.innerHTML=`<div class="person-card-header"><div><div class="person-name">${esc(personDisplay(p))}</div><div class="person-id">工號 ${esc(p.id)}</div></div><div class="person-actions"><button class="btn btn-soft btn-small" data-up>上移</button><button class="btn btn-soft btn-small" data-down>下移</button></div></div><div class="metric-grid"></div>`;const grid=card.querySelector('.metric-grid');metrics.forEach(m=>{const d=p.data[m.key],r=rate(d.target,d.actual),box=document.createElement('div');box.className='metric-box';box.innerHTML=`<h3>${m.label}</h3><div class="metric-inputs"><label>個人目標<input type="number" min="0" value="${num(d.target)}"></label><label>目前實績<input type="number" value="${num(d.actual)}" disabled></label></div><span class="rate-pill ${rateClass(r)}">${rateText(r)}</span>`;box.querySelector('input').addEventListener('change',e=>{d.target=num(e.target.value);renderAll()});grid.appendChild(box)});card.querySelector('[data-up]').addEventListener('click',()=>movePerson(index,-1));card.querySelector('[data-down]').addEventListener('click',()=>movePerson(index,1));el.appendChild(card)})}
function movePerson(i,d){const n=i+d;if(n<0||n>=state.people.length)return;[state.people[i],state.people[n]]=[state.people[n],state.people[i]];renderAll()}
function renderWeekly(){const week=Number($('weekSelect').value||weekOfDate(new Date())),el=$('weeklyList');el.innerHTML='';if(!state.people.length){el.innerHTML='<div class="empty-state">請先匯入業績追蹤.xlsx。</div>';return}state.people.forEach(p=>{ensurePerson(p.id,p.name);const card=document.createElement('article');card.className='weekly-card';card.innerHTML=`<div class="weekly-header"><div><strong>${esc(personDisplay(p))}</strong><div class="person-id">第 ${week} 週</div></div></div><div class="weekly-metrics"></div>`;const grid=card.querySelector('.weekly-metrics');metrics.forEach(m=>{const d=p.weekly[state.monthKey][week][m.key],r=rate(d.target,d.actual),box=document.createElement('div');box.className='weekly-metric';box.innerHTML=`<strong>${m.label}</strong><div class="weekly-numbers"><label>週目標<input type="number" min="0" value="${num(d.target)}"></label><label>週實績<input type="number" value="${num(d.actual)}" disabled></label></div><span class="rate-pill ${rateClass(r)}">${rateText(r)}</span><small class="weekly-remaining">尚需 ${fmt(Math.max(num(d.target)-num(d.actual),0))}</small>`;box.querySelector('input').addEventListener('change',e=>{d.target=num(e.target.value);renderAll()});grid.appendChild(box)});el.appendChild(card)})}
function autoAllocateRemaining(){
  if(!state.people.length)return alert('請先匯入 Excel。');
  const today=new Date(),cw=weekOfDate(today),ranges=weekRanges(today);
  state.people.forEach(p=>metrics.forEach(m=>{
    const monthTarget=num(p.data[m.key].target);if(monthTarget<=0)return;
    const monthActual=num(p.data[m.key].actual);
    const monthGap=Math.max(monthTarget-monthActual,0);
    const current=p.weekly[state.monthKey][cw][m.key];
    const currentNeed=Math.max(num(current.target)-num(current.actual),0);
    const futureGap=Math.max(monthGap-currentNeed,0);

    // 目前週維持原本設定，不把已完成實績加回目標，避免做得多的人目標反而更高。
    // 剩餘缺口只分配到後續週次；落後越多，後續週目標自然越高。
    const future=[];let totalDays=0;
    for(let w=cw+1;w<=4;w++){
      const days=Math.max(ranges[w-1].end-ranges[w-1].start+1,0);
      future.push({w,days});totalDays+=days;
    }
    if(!future.length){
      current.target=num(current.actual)+monthGap;
      return;
    }
    let assigned=0;
    future.forEach((x,idx)=>{
      const value=idx===future.length-1
        ? futureGap-assigned
        : Math.round(futureGap*x.days/Math.max(totalDays,1));
      assigned+=value;
      p.weekly[state.monthKey][x.w][m.key].target=Math.max(value,0);
    });
  }));
  renderAll();
  alert('已修正分配：目前週維持原目標，月底剩餘缺口分配至後續週；落後較多的人會取得較高的後續追趕目標。');
}


function selectedMeetingWeek(){return Number($('meetingWeekSelect')?.value||weekOfDate(new Date()))}
function selectedReportWeek(){return Number($('reportWeekSelect')?.value||selectedMeetingWeek())}
function weekStoreValue(week,key,field){return state.people.reduce((sum,p)=>sum+num(p.weekly?.[state.monthKey]?.[week]?.[key]?.[field]),0)}
function weekLagRows(week){
  const rows=[];
  state.people.forEach(p=>metrics.forEach(m=>{
    const d=p.weekly?.[state.monthKey]?.[week]?.[m.key];if(!d)return;
    const target=num(d.target),actual=num(d.actual);if(target<=0||actual>=target)return;
    rows.push({id:p.id,person:personDisplay(p),key:m.key,label:m.label,target,actual,gap:target-actual,currentRate:rate(target,actual),forecastRate:rate(num(p.data[m.key].target),forecastValue(num(p.data[m.key].actual)))});
  }));
  return rows.sort((a,b)=>b.gap-a.gap||((a.currentRate??999)-(b.currentRate??999)));
}
function meetingNoteKey(week,id){return `${state.monthKey}|${week}|${id}`}
function getMeetingNote(week,id){const key=meetingNoteKey(week,id);if(!state.meetingNotes[key])state.meetingNotes[key]={issue:'',action:'',followUp:''};return state.meetingNotes[key]}
function meetingAiLines(week){
  if(!state.people.length)return['請先匯入業績追蹤.xlsx。'];
  const storeRows=coreForecast.map(k=>({key:k,label:metrics.find(m=>m.key===k).label,target:weekStoreValue(week,k,'target'),actual:weekStoreValue(week,k,'actual')})).filter(x=>x.target>0);
  const lag=weekLagRows(week);
  const lines=[];
  const risk=[...storeRows].sort((a,b)=>(rate(a.target,a.actual)??999)-(rate(b.target,b.actual)??999))[0];
  const best=[...storeRows].sort((a,b)=>(rate(b.target,b.actual)??-1)-(rate(a.target,a.actual)??-1))[0];
  if(risk)lines.push(`本週最需要追蹤的是 ${risk.label}，完成 ${fmt(risk.actual)} / ${fmt(risk.target)}（${rateText(rate(risk.target,risk.actual))}）。`);
  if(best&&best.key!==risk?.key)lines.push(`${best.label}為本週表現最佳項目，完成率 ${rateText(rate(best.target,best.actual))}。`);
  if(lag.length)lines.push(`優先追蹤人員：${[...new Set(lag.slice(0,5).map(x=>x.person))].join('、')}。`);else lines.push('本週所有已設定週目標均已完成。');
  const forecastRisk=lag.filter(x=>x.forecastRate!==null&&x.forecastRate<100).slice(0,3);
  if(forecastRisk.length)lines.push(`月底預估仍有風險：${forecastRisk.map(x=>`${x.person}－${x.label} ${rateText(x.forecastRate)}`).join('、')}。`);
  const nextWeek=Math.min(week+1,4);
  if(week<4)lines.push(`請確認第 ${nextWeek} 週目標是否已完成分配，並針對本週未達項目提高追蹤頻率。`);else lines.push('目前為第 4 週，建議將重點集中在月底剩餘缺口。');
  return lines;
}
function renderMeeting(){
  const summary=$('meetingSummary');if(!summary)return;
  const week=selectedMeetingWeek(),lag=weekLagRows(week),peopleCount=new Set(lag.map(x=>x.id)).size;
  const storeRateAvg=coreForecast.map(k=>rate(weekStoreValue(week,k,'target'),weekStoreValue(week,k,'actual'))).filter(x=>x!==null);
  const avg=storeRateAvg.length?storeRateAvg.reduce((a,b)=>a+b,0)/storeRateAvg.length:0;
  summary.innerHTML=`<div class="summary-card"><small>會議週次</small><strong>第 ${week} 週</strong></div><div class="summary-card"><small>本週平均完成率</small><strong>${avg.toFixed(1)}%</strong></div><div class="summary-card"><small>落後人員</small><strong>${peopleCount}</strong></div><div class="summary-card"><small>落後項目</small><strong>${lag.length}</strong></div>`;
  const kpiBody=$('meetingKpiBody');kpiBody.innerHTML='';coreForecast.forEach(k=>{const m=metrics.find(x=>x.key===k),t=weekStoreValue(week,k,'target'),a=weekStoreValue(week,k,'actual'),r=rate(t,a),tr=document.createElement('tr');tr.innerHTML=`<td><strong>${m.label}</strong></td><td>${fmt(t)}</td><td>${fmt(a)}</td><td><span class="rate-pill ${rateClass(r)}">${rateText(r)}</span></td><td class="${a>=t?'positive':'negative'}">${a>=t?`+${fmt(a-t)}`:`-${fmt(t-a)}`}</td>`;kpiBody.appendChild(tr)});
  const peopleBody=$('meetingPeopleBody'),empty=$('meetingPeopleEmpty');peopleBody.innerHTML='';empty.classList.toggle('hidden',lag.length>0);lag.forEach(x=>{const tr=document.createElement('tr');tr.innerHTML=`<td><strong>${esc(x.person)}</strong></td><td>${esc(x.label)}</td><td>${fmt(x.target)}</td><td>${fmt(x.actual)}</td><td><span class="rate-pill ${rateClass(x.currentRate)}">${rateText(x.currentRate)}</span></td><td class="negative">-${fmt(x.gap)}</td><td class="${x.forecastRate!==null&&x.forecastRate>=100?'positive':'negative'}">${rateText(x.forecastRate)}</td>`;peopleBody.appendChild(tr)});
  $('meetingAiPanel').innerHTML=`<div class="ai-summary"><div class="ai-icon">AI</div><div>${meetingAiLines(week).map(x=>`<p>${esc(x)}</p>`).join('')}</div></div>`;
  const notes=$('meetingNotesList');notes.innerHTML='';const notePeople=lag.length?[...new Map(lag.map(x=>[x.id,{id:x.id,name:x.person}])).values()]:state.people;
  notePeople.forEach(p=>{const n=getMeetingNote(week,p.id),card=document.createElement('article');card.className='meeting-note-card';card.innerHTML=`<div class="meeting-note-head"><strong>${esc(personDisplay(p))}</strong><span>第 ${week} 週</span></div><label>本週問題<textarea data-field="issue" placeholder="例如：GA／NP 達成偏低">${esc(n.issue)}</textarea></label><label>下週改善<textarea data-field="action" placeholder="例如：每日主動邀約 1 件 GA／NP">${esc(n.action)}</textarea></label><label>下次追蹤<input data-field="followUp" type="date" value="${esc(n.followUp)}"></label>`;card.querySelectorAll('[data-field]').forEach(el=>el.addEventListener('input',e=>{n[e.target.dataset.field]=e.target.value;save()}));notes.appendChild(card)});
  const nextBody=$('nextWeekBody');nextBody.innerHTML='';const next=Math.min(week+1,4);state.people.forEach(p=>{const tr=document.createElement('tr');const values=coreForecast.map(k=>week<4?num(p.weekly?.[state.monthKey]?.[next]?.[k]?.target):Math.max(num(p.data[k].target)-num(p.data[k].actual),0));tr.innerHTML=`<td><strong>${esc(personDisplay(p))}</strong></td>${values.map(v=>`<td>${fmt(v)}</td>`).join('')}`;nextBody.appendChild(tr)});
}
function csvEscape(v){return `"${String(v??'').replace(/"/g,'""')}"`}
function downloadText(filename,text,type='text/plain;charset=utf-8'){const blob=new Blob(['\ufeff'+text],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
function exportMeetingCsv(){
  if(!state.people.length)return alert('請先匯入 Excel。');const week=selectedMeetingWeek(),rows=[[state.branding?.appName||'Command Center','第'+week+'週會議'],[],['本週全店 KPI','目標','實績','完成率','差距']];
  coreForecast.forEach(k=>{const m=metrics.find(x=>x.key===k),t=weekStoreValue(week,k,'target'),a=weekStoreValue(week,k,'actual');rows.push([m.label,t,a,rateText(rate(t,a)),a-t])});
  rows.push([],['本週落後人員','項目','週目標','週實績','完成率','還差','月底預估']);weekLagRows(week).forEach(x=>rows.push([x.person,x.label,x.target,x.actual,rateText(x.currentRate),x.gap,rateText(x.forecastRate)]));
  rows.push([],['改善事項','本週問題','下週改善','下次追蹤']);performancePeople().forEach(p=>{const n=getMeetingNote(week,p.id);if(n.issue||n.action||n.followUp)rows.push([p.name,n.issue,n.action,n.followUp])});
  downloadText(`星期日會議_第${week}週_${dateKey()}.csv`,rows.map(r=>r.map(csvEscape).join(',')).join('\n'),'text/csv;charset=utf-8');
}
function meetingPrintHtml(week){
  const lag=weekLagRows(week),kpis=coreForecast.map(k=>{const m=metrics.find(x=>x.key===k),t=weekStoreValue(week,k,'target'),a=weekStoreValue(week,k,'actual');return `<tr><td>${m.label}</td><td>${fmt(t)}</td><td>${fmt(a)}</td><td>${rateText(rate(t,a))}</td><td>${a>=t?`+${fmt(a-t)}`:`-${fmt(t-a)}`}</td></tr>`}).join('');
  const people=lag.map(x=>`<tr><td>${esc(x.person)}</td><td>${x.label}</td><td>${fmt(x.target)}</td><td>${fmt(x.actual)}</td><td>${rateText(x.currentRate)}</td><td>-${fmt(x.gap)}</td><td>${rateText(x.forecastRate)}</td></tr>`).join('')||'<tr><td colspan="7">本週無落後項目</td></tr>';
  const notes=performancePeople().map(p=>{const n=getMeetingNote(week,p.id);return n.issue||n.action||n.followUp?`<tr><td>${esc(personDisplay(p))}</td><td>${esc(n.issue)}</td><td>${esc(n.action)}</td><td>${esc(n.followUp)}</td></tr>`:''}).join('')||'<tr><td colspan="4">尚無改善事項紀錄</td></tr>';
  return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><title>第${week}週會議</title><style>body{font-family:-apple-system,BlinkMacSystemFont,"Microsoft JhengHei",sans-serif;color:#211b2c;padding:28px}h1{margin:0 0 4px}h2{margin-top:26px}p{color:#666}table{width:100%;border-collapse:collapse;margin-top:10px}th,td{border:1px solid #ddd;padding:8px;text-align:left;font-size:12px}th{background:#f3eefb}.ai{padding:14px;background:#f3eefb;border-radius:12px}.ai p{margin:5px 0;color:#211b2c}@media print{button{display:none}}</style></head><body><h1>${esc(state.branding?.appName||'Command Center')}</h1><p>${esc(state.branding?.storeName||'未設定門市')}｜${state.monthKey}｜第 ${week} 週星期日會議</p><h2>本週全店 KPI</h2><table><thead><tr><th>KPI</th><th>週目標</th><th>週實績</th><th>完成率</th><th>差距</th></tr></thead><tbody>${kpis}</tbody></table><h2>本週落後人員</h2><table><thead><tr><th>人員</th><th>項目</th><th>目標</th><th>實績</th><th>完成率</th><th>還差</th><th>月底預估</th></tr></thead><tbody>${people}</tbody></table><h2>店長分析</h2><div class="ai">${meetingAiLines(week).map(x=>`<p>${esc(x)}</p>`).join('')}</div><h2>改善事項</h2><table><thead><tr><th>人員</th><th>本週問題</th><th>下週改善</th><th>下次追蹤</th></tr></thead><tbody>${notes}</tbody></table><script>window.onload=()=>window.print()<\/script></body></html>`;
}
function openPrintWindow(html){const w=window.open('','_blank');if(!w)return alert('瀏覽器阻擋了列印視窗，請允許彈出式視窗。');w.document.open();w.document.write(html);w.document.close()}
function printMeeting(){if(!state.people.length)return alert('請先匯入 Excel。');openPrintWindow(meetingPrintHtml(selectedMeetingWeek()))}
function weeklyReportData(week){
  const range=weekRanges()[week-1],lag=weekLagRows(week),store=coreForecast.map(k=>{const m=metrics.find(x=>x.key===k),target=weekStoreValue(week,k,'target'),actual=weekStoreValue(week,k,'actual');return{label:m.label,target,actual,r:rate(target,actual)}});
  const highlights=store.filter(x=>x.r!==null&&x.r>=100).sort((a,b)=>b.r-a.r),risks=store.filter(x=>x.r!==null&&x.r<100).sort((a,b)=>a.r-b.r);
  return{week,range,store,lag,highlights,risks,ai:meetingAiLines(week)};
}
function weeklyReportText(week){const d=weeklyReportData(week);return [`${state.branding?.appName||'Command Center'}｜${state.branding?.storeName||'未設定門市'}｜第 ${week} 週店長週報`,`期間：${new Date().getMonth()+1}/${d.range.start}～${new Date().getMonth()+1}/${d.range.end}`,'','一、本週 KPI',...d.store.map(x=>`${x.label}：${fmt(x.actual)} / ${fmt(x.target)}（${rateText(x.r)}）`),'','二、本週亮點',...(d.highlights.length?d.highlights.map(x=>`${x.label} 已達標，完成率 ${rateText(x.r)}。`):['本週尚無已達標的全店核心 KPI。']),'','三、落後狀況',...(d.lag.length?d.lag.slice(0,10).map(x=>`${x.person}－${x.label}：${fmt(x.actual)} / ${fmt(x.target)}，還差 ${fmt(x.gap)}。`):['本週無落後項目。']),'','四、店長分析',...d.ai.map(x=>`・${x}`),'','五、下週行動',...performancePeople().map(p=>{const n=getMeetingNote(week,p.id);return n.action?`${personDisplay(p)}：${n.action}`:''}).filter(Boolean)].join('\n')}
function renderWeeklyReport(){const el=$('weeklyReportContent');if(!el)return;const week=selectedReportWeek(),d=weeklyReportData(week),text=weeklyReportText(week);el.innerHTML=`<header><span class="report-kicker">第 ${week} 週</span><h2>店長週報</h2><p>${new Date().getMonth()+1}/${d.range.start}～${new Date().getMonth()+1}/${d.range.end}</p></header><section><h3>本週 KPI</h3><div class="report-kpi-grid">${d.store.map(x=>`<div><span>${x.label}</span><strong>${fmt(x.actual)} / ${fmt(x.target)}</strong><small class="${rateClass(x.r)}Text">${rateText(x.r)}</small></div>`).join('')}</div></section><section><h3>本週亮點</h3><ul>${(d.highlights.length?d.highlights.map(x=>`${x.label} 已達標，完成率 ${rateText(x.r)}。`):['本週尚無已達標的全店核心 KPI。']).map(x=>`<li>${esc(x)}</li>`).join('')}</ul></section><section><h3>落後與追蹤</h3>${d.lag.length?`<ul>${d.lag.slice(0,10).map(x=>`<li><strong>${esc(x.person)}</strong>｜${esc(x.label)} 還差 ${fmt(x.gap)}，月底預估 ${rateText(x.forecastRate)}</li>`).join('')}</ul>`:'<p>本週無落後項目。</p>'}</section><section><h3>店長分析</h3><ul>${d.ai.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></section><section><h3>下週行動</h3><ul>${performancePeople().map(p=>{const n=getMeetingNote(week,p.id);return n.action?`<li><strong>${esc(personDisplay(p))}</strong>：${esc(n.action)}</li>`:''}).filter(Boolean).join('')||'<li>尚未填寫改善事項。</li>'}</ul></section><textarea class="report-source" aria-label="週報純文字">${esc(text)}</textarea>`}
function downloadWeeklyReport(){if(!state.people.length)return alert('請先匯入 Excel。');const week=selectedReportWeek();downloadText(`店長週報_第${week}週_${dateKey()}.txt`,weeklyReportText(week))}
function printWeeklyReport(){if(!state.people.length)return alert('請先匯入 Excel。');const week=selectedReportWeek(),body=$('weeklyReportContent').innerHTML;openPrintWindow(`<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><title>店長週報</title><style>body{font-family:-apple-system,BlinkMacSystemFont,"Microsoft JhengHei",sans-serif;padding:28px;color:#211b2c}.report-kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.report-kpi-grid div{border:1px solid #ddd;padding:12px;border-radius:10px}.report-kpi-grid span,.report-kpi-grid small{display:block}section{margin-top:22px}textarea{display:none}</style></head><body>${body}<script>window.onload=()=>window.print()<\/script></body></html>`)}

function renderLag(){const rows=lagRows(),body=$('lagTableBody'),empty=$('lagEmpty'),summary=$('lagSummary');body.innerHTML='';const peopleCount=new Set(rows.map(x=>x.person)).size;const forecastRisk=rows.filter(x=>x.forecastRate!==null&&x.forecastRate<100).length;summary.innerHTML=`<div class="summary-card"><small>落後人員</small><strong>${peopleCount}</strong></div><div class="summary-card"><small>落後項目</small><strong>${rows.length}</strong></div><div class="summary-card"><small>月底預估未達項目</small><strong>${forecastRisk}</strong></div>`;empty.classList.toggle('hidden',rows.length>0);rows.forEach(x=>{const tr=document.createElement('tr');tr.innerHTML=`<td><strong>${esc(x.person)}</strong></td><td>${x.label}</td><td>${rateText(x.currentRate)}</td><td>${rateText(x.expectedRate)}</td><td class="negative">-${x.gap.toFixed(1)}</td><td>${x.daily.toFixed(1)}</td><td class="${x.forecastRate>=100?'positive':'negative'}">${rateText(x.forecastRate)}</td>`;body.appendChild(tr)})}

// ===== v2.2.5 智慧排班中心／全店週目標 =====
function ensureOpsState(){
  if(!state.schedule)state.schedule={};
  if(!state.scheduleOverrides)state.scheduleOverrides={};
  if(!state.schedulePeople)state.schedulePeople={};
  if(!state.managerIds)state.managerIds=['5052'];
  if(!state.storeWeeklyTargets)state.storeWeeklyTargets={};
  if(!state.storeWeeklyTargets[state.monthKey])state.storeWeeklyTargets[state.monthKey]=emptyWeekly();
  for(let w=1;w<=4;w++)metrics.forEach(m=>{
    const d=state.storeWeeklyTargets[state.monthKey][w][m.key];
    if(typeof d==='number')state.storeWeeklyTargets[state.monthKey][w][m.key]={target:d,actual:0};
    else if(!d)state.storeWeeklyTargets[state.monthKey][w][m.key]={target:0,actual:0};
  });
}
function managerIdSet(){ensureOpsState();return new Set(state.managerIds.map(String))}
function isManagerId(id){return managerIdSet().has(String(id))}
function performancePeople(){return state.people.filter(p=>!isManagerId(p.id))}
function scheduleMonth(){ensureOpsState();return state.schedule[state.monthKey]||{}}
function scheduleOverrideKey(dk,id){return `${dk}|${id}`}
function baseShift(dk,id){return String(scheduleMonth()?.[dk]?.[id]?.code||'').trim().toUpperCase()}
function overrideStatus(dk,id){return state.scheduleOverrides[scheduleOverrideKey(dk,id)]||''}
function statusFromShift(code){code=String(code||'').trim().toUpperCase();return ['N8','D6','A4'].includes(code)?'work':['SR','SS'].includes(code)?'off':code==='U'?'training':code?'off':'unknown'}
function effectiveScheduleStatus(dk,id){return overrideStatus(dk,id)||statusFromShift(baseShift(dk,id))}
function isWorkingStatus(status){return status==='work'}
function isWorkingDate(id,dk){
  ensureOpsState();
  const month=scheduleMonth();
  if(!Object.keys(month).length)return true;
  return isWorkingStatus(effectiveScheduleStatus(dk,id));
}
function remainingWorkdays(id,from=new Date()){
  ensureOpsState();
  let total=0;const y=from.getFullYear(),m=from.getMonth(),last=daysInMonth(from);
  for(let day=from.getDate();day<=last;day++){
    const dk=dateKey(new Date(y,m,day));if(isWorkingDate(id,dk))total++;
  }
  return total;
}
function todayWorkingPeople(){const dk=dateKey();return performancePeople().filter(p=>isWorkingDate(p.id,dk))}
function todayManpower(){
  ensureOpsState();const dk=dateKey(),rows=[];
  const ids=new Set([...Object.keys(scheduleMonth()?.[dk]||{}),...state.people.map(p=>p.id)]);
  ids.forEach(id=>{const s=state.schedulePeople[id]||{},name=s.name||state.people.find(p=>p.id===id)?.name||id,status=effectiveScheduleStatus(dk,id);rows.push({id,name,status,code:baseShift(dk,id),manager:isManagerId(id)})});
  return rows;
}
async function importScheduleWorkbook(file){
  if(typeof XLSX==='undefined')return alert('Excel 解析元件尚未載入。');
  try{
    const wb=XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:true});
    const ws=wb.Sheets[wb.SheetNames[0]];if(!ws)throw new Error('找不到班表工作表');
    const rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:'',raw:true});
    const header=rows[0]||[];const month={};
    rows.slice(1).forEach(r=>{
      const id=personId(r[0]);if(!id)return;const name=String(r[1]||id).trim();state.schedulePeople[id]={id,name};
      for(let c=3;c<header.length;c++){
        const day=Number(header[c]);if(!Number.isFinite(day)||day<1||day>31)continue;
        const dk=`${state.monthKey}-${String(day).padStart(2,'0')}`;
        if(!month[dk])month[dk]={};month[dk][id]={code:String(r[c]||'').trim(),name};
      }
    });
    state.schedule[state.monthKey]=month;state.lastScheduleImport={time:new Date().toISOString(),file:file.name};save();renderAll();
    $('importStatus').textContent=`班表匯入完成：${file.name}。今日人力與個人目標已重新計算。`;
  }catch(e){console.error(e);alert(`班表匯入失敗：${e.message}`)}
}
function init(){
  state.monthKey=monthKey();metrics.forEach(m=>{if(state.storeTargets[m.key]===undefined)state.storeTargets[m.key]=0});
  load();ensureOpsState();
  $('monthSubtitle').textContent=`${new Date().getFullYear()} 年 ${new Date().getMonth()+1} 月｜第 ${weekOfDate(new Date())} 週｜今日 ${new Date().toLocaleDateString('zh-TW')}`;
  if($('scheduleDate'))$('scheduleDate').value=dateKey();
  if($('managerIdsInput'))$('managerIdsInput').value=state.managerIds.join(',');
  bind();renderAll();initCloud();
}
function bind(){
  $('importBtn').addEventListener('click',()=>$('fileInput').click());
  $('fileInput').addEventListener('change',e=>{const f=e.target.files?.[0];if(f)importWorkbook(f);e.target.value=''});
  $('scheduleImportBtn')?.addEventListener('click',()=>$('scheduleFileInput').click());
  $('scheduleFileInput')?.addEventListener('change',e=>{const f=e.target.files?.[0];if(f)importScheduleWorkbook(f);e.target.value=''});
  $('scheduleDate')?.addEventListener('change',()=>renderSchedule());
  $('managerIdsInput')?.addEventListener('change',e=>{state.managerIds=String(e.target.value||'5052').split(/[,，\s]+/).filter(Boolean);save();renderAll()});
  $('shareCardBtn')?.addEventListener('click',exportShareCard);$('goalCardBtn')?.addEventListener('click',exportGoalCard);$('saveBtn').addEventListener('click',()=>save(true));$('autoAllocateBtn').addEventListener('click',autoAllocateRemaining);
  document.querySelectorAll('.tab').forEach(btn=>btn.addEventListener('click',()=>showPage(btn.dataset.page)));
  document.querySelectorAll('[data-jump]').forEach(btn=>btn.addEventListener('click',()=>showPage(btn.dataset.jump)));
  document.querySelectorAll('[data-mobile-action]').forEach(btn=>btn.addEventListener('click',()=>{
    const action=btn.dataset.mobileAction;
    if(action==='home'){showPage('dashboard');requestAnimationFrame(()=>window.scrollTo({top:0,behavior:'smooth'}));setMobileNavActive('home');return}
    if(action==='kpi'){showPage('dashboard');requestAnimationFrame(()=>document.getElementById('coreKpiSection')?.scrollIntoView({behavior:'smooth',block:'start'}));setMobileNavActive('kpi');return}
    if(action==='meeting'){showPage('meeting');requestAnimationFrame(()=>window.scrollTo({top:0,behavior:'smooth'}));return}
    if(action==='report'){showPage('report');requestAnimationFrame(()=>window.scrollTo({top:0,behavior:'smooth'}));return}
  }));
  $('quickTodayTarget')?.addEventListener('click',async()=>{showPage('dashboard');await exportGoalCard()});
  $('quickShareCard')?.addEventListener('click',()=>{showPage('dashboard');requestAnimationFrame(()=>{document.getElementById('todayBattleSection')?.scrollIntoView({behavior:'smooth',block:'start'})})});
  $('weekSelect').addEventListener('change',renderWeekly);$('meetingWeekSelect').addEventListener('change',()=>{renderMeeting();renderWeeklyReport()});$('reportWeekSelect').addEventListener('change',renderWeeklyReport);
  $('meetingCsvBtn').addEventListener('click',exportMeetingCsv);$('meetingPrintBtn').addEventListener('click',printMeeting);$('downloadWeeklyReportBtn').addEventListener('click',downloadWeeklyReport);$('printWeeklyReportBtn').addEventListener('click',printWeeklyReport);
  $('newMeetingRecordBtn')?.addEventListener('click',newMeetingRecord);$('saveMeetingRecordBtn')?.addEventListener('click',saveMeetingRecordFromEditor);$('smartMeetingSummaryBtn')?.addEventListener('click',smartOrganizeMeeting);$('copyMeetingAnnouncementBtn')?.addEventListener('click',copyMeetingAnnouncement);$('downloadMeetingRecordBtn')?.addEventListener('click',downloadMeetingRecord);$('deleteMeetingRecordBtn')?.addEventListener('click',deleteMeetingRecord);$('meetingHubFilter')?.addEventListener('change',renderMeetingHubList);$('meetingHubSearch')?.addEventListener('input',renderMeetingHubList);$('saveBrandingBtn')?.addEventListener('click',saveBranding);$('settingPersonDisplayMode')?.addEventListener('change',e=>{state.personDisplayMode=e.target.value;save();renderAll()});['settingStoreName','settingManagerName','settingAppName','settingAppSubtitle','settingSafeRate','settingAllocationBasis'].forEach(id=>document.getElementById(id)?.addEventListener('input',()=>{const b={storeName:document.getElementById('settingStoreName')?.value||'未設定門市',managerName:document.getElementById('settingManagerName')?.value||'管理者',appName:document.getElementById('settingAppName')?.value||'Command Center',subtitle:document.getElementById('settingAppSubtitle')?.value||'Retail Operations',brand:'By Pei Yi'};document.getElementById('settingsPreviewName').textContent=b.appName;document.getElementById('settingsPreviewSubtitle').textContent=`${b.subtitle} · ${b.brand}`;document.getElementById('settingsPreviewStore').textContent=`${b.storeName}｜${b.managerName}`;}));
}
function load(){
  try{let raw=localStorage.getItem(STORAGE_KEY);if(!raw){for(const key of LEGACY_STORAGE_KEYS){raw=localStorage.getItem(key);if(raw)break}}const old=JSON.parse(raw||'null');if(old)Object.assign(state,old)}catch(e){console.warn(e)}
  state.monthKey=monthKey();if(!state.dailyLineSnapshots)state.dailyLineSnapshots={};if(!state.dailyInsuranceSnapshots)state.dailyInsuranceSnapshots={};if(!state.meetingNotes)state.meetingNotes={};if(!state.meetingHubRecords)state.meetingHubRecords=[];if(state.currentMeetingRecordId===undefined)state.currentMeetingRecordId=null;if(!state.people)state.people=[];if(!state.storeTargets)state.storeTargets={};
  metrics.forEach(m=>{if(state.storeTargets[m.key]===undefined)state.storeTargets[m.key]=0});state.people.forEach(p=>ensurePerson(p.id,p.name));ensureOpsState();ensureBranding();ensurePeoplePreferences();rebuildLineActualsFromSnapshots();
}
function lagRows(){
  const rows=[],expected=expectedRate();performancePeople().forEach(p=>metrics.forEach(m=>{const t=num(p.data[m.key]?.target),a=num(p.data[m.key]?.actual);if(t<=0)return;const expectedActual=t*expected/100;if(a+1e-9<expectedActual){const workdays=Math.max(remainingWorkdays(p.id),1),f=a/workdays*(workdays)+a;rows.push({id:p.id,person:personDisplay(p),key:m.key,label:m.label,target:t,actual:a,currentRate:rate(t,a),expectedRate:expected,gap:expectedActual-a,daily:Math.max(t-a,0)/workdays,forecast:forecastValue(a),forecastRate:rate(t,forecastValue(a))})}}));
  return rows.sort((a,b)=>(b.expectedRate-b.currentRate)-(a.expectedRate-a.currentRate)||b.gap-a.gap)
}
function todayGoalForPerson(p,key){
  if(!isWorkingDate(p.id,dateKey()))return 0;
  const remaining=Math.max(num(p.data[key]?.target)-num(p.data[key]?.actual),0),days=Math.max(remainingWorkdays(p.id),1);
  return remaining>0?Math.ceil(remaining/days):0;
}
function todayRemainingForPerson(p,key){return Math.max(todayGoalForPerson(p,key)-todayActualForPerson(p,key),0)}
function storeTodayMinimum(key){return todayWorkingPeople().reduce((s,p)=>s+todayRemainingForPerson(p,key),0)}
function renderPeople(){
  const el=$('peopleList');el.innerHTML='';const people=performancePeople();if(!people.length){el.innerHTML='<div class="empty-state">請先匯入業績追蹤.xlsx，或確認店長工號設定。</div>';return}
  people.forEach((p,index)=>{const card=document.createElement('article');card.className='person-card';card.innerHTML=`<div class="person-card-header"><div><div class="person-name">${esc(personDisplay(p))}</div><div class="person-id">工號 ${esc(p.id)}</div></div><div class="person-actions"><button class="btn btn-soft btn-small" data-up>上移</button><button class="btn btn-soft btn-small" data-down>下移</button></div></div><div class="metric-grid"></div>`;const grid=card.querySelector('.metric-grid');metrics.forEach(m=>{const d=p.data[m.key],r=rate(d.target,d.actual),box=document.createElement('div');box.className='metric-box';box.innerHTML=`<h3>${m.label}</h3><div class="metric-inputs"><label>個人目標<input type="number" min="0" value="${num(d.target)}"></label><label>目前實績<input type="number" value="${num(d.actual)}" disabled></label></div><span class="rate-pill ${rateClass(r)}">${rateText(r)}</span>`;box.querySelector('input').addEventListener('change',e=>{d.target=num(e.target.value);renderAll()});grid.appendChild(box)});card.querySelector('[data-up]').addEventListener('click',()=>moveVisiblePerson(p.id,-1));card.querySelector('[data-down]').addEventListener('click',()=>moveVisiblePerson(p.id,1));el.appendChild(card)})
}
function moveVisiblePerson(id,dir){const visible=performancePeople(),i=visible.findIndex(p=>p.id===id),n=i+dir;if(i<0||n<0||n>=visible.length)return;const ai=state.people.findIndex(p=>p.id===visible[i].id),bi=state.people.findIndex(p=>p.id===visible[n].id);[state.people[ai],state.people[bi]]=[state.people[bi],state.people[ai]];renderAll()}
function renderTodayTargets(){
  const body=$('todayTargetBody');body.innerHTML='';const people=todayWorkingPeople();if(!people.length){body.innerHTML='<tr><td colspan="7">今天沒有可分配目標的銷售人員，或尚未匯入班表。</td></tr>';return}
  people.forEach(p=>{const t=todayTargetsForPerson(p),status=personTodayStatus(p),tr=document.createElement('tr');tr.innerHTML=`<td><strong>${esc(personDisplay(p))}</strong></td>${coreForecast.map(k=>`<td><span class="today-number">${fmt(t[k].remaining)}</span><small>今日已完成 ${fmt(t[k].actual)}</small></td>`).join('')}<td><span class="rate-pill ${status.className}">${status.label}</span></td>`;body.appendChild(tr)})
}
function renderShareCard(){
  $('shareDate').textContent=`${new Date().toLocaleDateString('zh-TW')}（${weekdayText()}）`;$('shareWeek').textContent=`第 ${weekOfDate(new Date())} 週`;
  const kpi=$('shareKpiGrid');kpi.innerHTML='';coreForecast.forEach(k=>{const m=metrics.find(x=>x.key===k),a=storeActual(k),t=state.storeTargets[k],r=rate(t,a),div=document.createElement('div');div.className=`share-kpi ${rateClass(r)}`;div.innerHTML=`<span>${m.label}</span><strong>${fmt(a)} / ${fmt(t)}</strong><small>${rateText(r)}</small>`;kpi.appendChild(div)});
  $('shareMinGrid').innerHTML=coreForecast.map(k=>`<div><span>${metrics.find(x=>x.key===k).label}</span><strong>+${fmt(storeTodayMinimum(k))}</strong></div>`).join('');
  const warnings=storeWarnings();$('shareWarnings').innerHTML=warnings.length?warnings.map(x=>`<div class="share-alert">${esc(x.label)}落後 ${fmt(x.gap)} 件</div>`).join(''):'<div class="share-ok">今日進度正常</div>';
  const tracking=lagRows().slice(0,5);$('shareTracking').innerHTML=tracking.length?tracking.map(x=>`<div class="share-track"><strong>${esc(x.person)}｜${esc(x.label)}</strong><span>落後 ${fmt(x.gap)}</span></div>`).join(''):'<div class="share-ok">目前無需追蹤人員</div>';
  $('sharePeople').innerHTML=todayWorkingPeople().map(p=>{const t=todayTargetsForPerson(p);return `<tr><td><strong>${esc(personDisplay(p))}</strong></td>${coreForecast.map(k=>`<td>${fmt(t[k].remaining)}</td>`).join('')}</tr>`}).join('')||'<tr><td colspan="6">今日無銷售人員排班</td></tr>';
}

function renderGoalCard(){
  if(!$('goalCard'))return;
  const now=new Date();
  $('goalCardDate').textContent=`${now.toLocaleDateString('zh-TW')}（${weekdayText(now)}）`;
  $('goalCardWeek').textContent=`第 ${weekOfDate(now)} 週`;
  $('goalStoreGrid').innerHTML=coreForecast.map(k=>`<div><span>${esc(metrics.find(m=>m.key===k).label)}</span><strong>${fmt(storeTodayMinimum(k))}</strong></div>`).join('');
  const people=todayWorkingPeople();
  $('goalPeople').innerHTML=people.map(p=>{const t=todayTargetsForPerson(p);return `<tr><td><strong>${esc(personDisplay(p))}</strong></td>${coreForecast.map(k=>`<td>${fmt(t[k].remaining)}</td>`).join('')}</tr>`}).join('')||'<tr><td colspan="6">今日無銷售人員排班</td></tr>';
  const manpower=todayManpower().filter(x=>isWorkingStatus(x.status));
  const sales=people.length;
  $('goalManpower').textContent=`今日總人力 ${manpower.length} 人｜個人目標人員 ${sales} 人`;
}
async function exportGoalCard(){
  if(typeof html2canvas==='undefined')return alert('圖片輸出元件尚未載入，請確認網路後重新整理。');
  renderGoalCard();
  const stage=document.querySelector('.goal-card-stage');
  stage.classList.add('capturing');
  try{
    const canvas=await html2canvas($('goalCard'),{scale:2,backgroundColor:'#f6f3fb',useCORS:true,logging:false});
    await saveOrShareCanvas(canvas,`今日目標_${dateKey()}.png`);
  }catch(e){console.error(e);alert('產生今日目標圖失敗，請重新整理後再試。')}
  finally{stage.classList.remove('capturing')}
}

function weekActualValue(week,key){return state.people.reduce((sum,p)=>sum+num(p.weekly?.[state.monthKey]?.[week]?.[key]?.actual),0)}
function weekStoreValue(week,key,field){ensureOpsState();return field==='target'?num(state.storeWeeklyTargets[state.monthKey][week][key].target):weekActualValue(week,key)}
function renderWeekly(){
  ensureOpsState();const week=Number($('weekSelect').value||weekOfDate(new Date())),el=$('weeklyList');el.innerHTML='';const card=document.createElement('article');card.className='weekly-card';card.innerHTML=`<div class="weekly-header"><div><strong>全店</strong><div class="person-id">第 ${week} 週｜僅設定全店週目標</div></div></div><div class="weekly-metrics"></div>`;const grid=card.querySelector('.weekly-metrics');metrics.forEach(m=>{const d=state.storeWeeklyTargets[state.monthKey][week][m.key],a=weekActualValue(week,m.key),r=rate(d.target,a),box=document.createElement('div');box.className='weekly-metric';box.innerHTML=`<strong>${m.label}</strong><div class="weekly-numbers"><label>全店週目標<input type="number" min="0" value="${num(d.target)}"></label><label>週實績<input type="number" value="${num(a)}" disabled></label></div><span class="rate-pill ${rateClass(r)}">${rateText(r)}</span><small class="weekly-remaining">尚需 ${fmt(Math.max(num(d.target)-a,0))}</small>`;box.querySelector('input').addEventListener('change',e=>{d.target=num(e.target.value);renderAll()});grid.appendChild(box)});el.appendChild(card)
}
function autoAllocateRemaining(){
  ensureOpsState();const current=weekOfDate(new Date()),ranges=weekRanges(),last=daysInMonth();metrics.forEach(m=>{const monthlyGap=Math.max(num(state.storeTargets[m.key])-storeActual(m.key),0);const futureWeeks=[];for(let w=current;w<=4;w++)futureWeeks.push(w);const totalDays=futureWeeks.reduce((s,w)=>{const r=ranges[w-1],start=w===current?Math.max(currentDay(),r.start):r.start;return s+Math.max(r.end-start+1,0)},0)||1;let assigned=0;futureWeeks.forEach((w,i)=>{const r=ranges[w-1],start=w===current?Math.max(currentDay(),r.start):r.start,days=Math.max(r.end-start+1,0),value=i===futureWeeks.length-1?monthlyGap-assigned:Math.round(monthlyGap*days/totalDays);assigned+=value;state.storeWeeklyTargets[state.monthKey][w][m.key].target=Math.max(weekActualValue(w,m.key)+(w===current?value:0),value)});});renderAll();alert('已依全店月底缺口分配剩餘週目標。')
}
let meetingTrackingMetric='all';
function weekLagRows(week=selectedMeetingWeek(),metricKey=null){
  const trackedMetrics=metricKey&&metricKey!=='all'?metrics.filter(m=>m.key===metricKey):metrics;
  return performancePeople().flatMap(p=>trackedMetrics.map(m=>{
    const k=m.key,target=personWeekCatchupTarget(p,week,k),actual=personWeekActual(p,week,k),monthTarget=num(p.data[k]?.target),f=forecastValue(num(p.data[k]?.actual)),fr=rate(monthTarget,f);
    if(target<=0||actual>=target)return null;
    return{id:p.id,person:personDisplay(p),key:k,label:m.label,target,actual,currentRate:rate(target,actual),gap:Math.max(target-actual,0),forecastRate:fr};
  }).filter(Boolean)).sort((a,b)=>b.gap-a.gap||((a.currentRate??999)-(b.currentRate??999)));
}
function weekLagPeopleSummary(week=selectedMeetingWeek()){
  const grouped=new Map();
  weekLagRows(week).forEach(x=>{
    if(!grouped.has(x.id))grouped.set(x.id,{id:x.id,person:x.person,items:[],count:0,totalGap:0,worstRate:100});
    const row=grouped.get(x.id);row.items.push(x);row.count++;row.totalGap+=x.gap;row.worstRate=Math.min(row.worstRate,x.currentRate??100);
  });
  return [...grouped.values()].sort((a,b)=>b.count-a.count||a.worstRate-b.worstRate||b.totalGap-a.totalGap);
}
function renderMeetingTracking(week){
  const allLag=weekLagRows(week),people=weekLagPeopleSummary(week),filters=$('meetingTrackingFilters'),overview=$('meetingTrackingOverview'),head=$('meetingPeopleHead'),body=$('meetingPeopleBody'),empty=$('meetingPeopleEmpty');
  if(!filters||!overview||!head||!body||!empty)return;
  const counts=Object.fromEntries(metrics.map(m=>[m.key,new Set(allLag.filter(x=>x.key===m.key).map(x=>x.id)).size]));
  filters.innerHTML=[{key:'all',label:'人員總覽',count:people.length},...metrics.map(m=>({key:m.key,label:m.label,count:counts[m.key]}))].map(x=>`<button type="button" class="meeting-tracking-filter ${meetingTrackingMetric===x.key?'active':''}" data-tracking-key="${x.key}">${esc(x.label)}<span class="count">${x.count}</span></button>`).join('');
  filters.querySelectorAll('[data-tracking-key]').forEach(btn=>btn.addEventListener('click',()=>{meetingTrackingMetric=btn.dataset.trackingKey;renderMeetingTracking(week)}));
  const totalItems=allLag.length,worst=people[0],mostRiskMetric=metrics.map(m=>({label:m.label,count:counts[m.key]})).sort((a,b)=>b.count-a.count)[0];
  overview.innerHTML=`<div class="tracking-stat-card"><small>落後人員</small><strong>${people.length}</strong><span>至少一項落後</span></div><div class="tracking-stat-card"><small>落後項目總數</small><strong>${totalItems}</strong><span>九項合計</span></div><div class="tracking-stat-card"><small>最多人落後項目</small><strong>${esc(mostRiskMetric?.label||'—')}</strong><span>${mostRiskMetric?.count||0} 人</span></div><div class="tracking-stat-card"><small>個人最多落後</small><strong>${worst?.count||0} 項</strong><span>${esc(worst?.person||'目前無落後')}</span></div>`;
  body.innerHTML='';
  if(meetingTrackingMetric==='all'){
    head.innerHTML='<tr><th>人員</th><th>落後項目總數</th><th>落後項目</th><th>最嚴重完成率</th><th>總差距</th></tr>';
    empty.textContent='本週九個追蹤項目均已跟上進度。';
    empty.classList.toggle('hidden',people.length>0);
    people.forEach(p=>{const tr=document.createElement('tr');const tags=p.items.sort((a,b)=>(a.currentRate??999)-(b.currentRate??999)).map(x=>`<span class="tracking-item-tag">${esc(x.label)} -${fmt(x.gap)}</span>`).join('');tr.innerHTML=`<td><strong>${esc(p.person)}</strong></td><td><strong>${p.count}</strong> / 9</td><td><div class="tracking-item-tags">${tags}</div></td><td><span class="rate-pill ${rateClass(p.worstRate)}">${rateText(p.worstRate)}</span></td><td class="negative">-${fmt(p.totalGap)}</td>`;body.appendChild(tr)});
  }else{
    const metric=metrics.find(m=>m.key===meetingTrackingMetric),rows=weekLagRows(week,meetingTrackingMetric);
    head.innerHTML=`<tr><th>人員</th><th>項目</th><th>個人追趕目標</th><th>週實績</th><th>完成率</th><th>尚差</th><th>月底預估</th></tr>`;
    empty.textContent=rows.length?`本週 ${metric?.label||''} 落後狀況如下。`:`本週 ${metric?.label||''} 無落後人員。`;
    empty.classList.toggle('hidden',rows.length>0);
    rows.forEach(x=>{const tr=document.createElement('tr');tr.innerHTML=`<td><strong>${esc(x.person)}</strong></td><td>${esc(x.label)}</td><td>${fmt(x.target)}</td><td>${fmt(x.actual)}</td><td><span class="rate-pill ${rateClass(x.currentRate)}">${rateText(x.currentRate)}</span></td><td class="negative">-${fmt(x.gap)}</td><td class="${x.forecastRate!==null&&x.forecastRate>=100?'positive':'negative'}">${rateText(x.forecastRate)}</td>`;body.appendChild(tr)});
  }
}
function renderMeeting(){
  ensureOpsState();const week=selectedMeetingWeek(),lag=weekLagRows(),summary=$('meetingSummary'),peopleCount=new Set(lag.map(x=>x.id)).size,storeRates=coreForecast.map(k=>rate(weekStoreValue(week,k,'target'),weekStoreValue(week,k,'actual'))).filter(x=>x!==null),avg=storeRates.length?storeRates.reduce((a,b)=>a+b,0)/storeRates.length:0;
  summary.innerHTML=`<div class="summary-card"><small>會議週次</small><strong>第 ${week} 週</strong></div><div class="summary-card"><small>本週平均完成率</small><strong>${avg.toFixed(1)}%</strong></div><div class="summary-card"><small>追蹤人員</small><strong>${peopleCount}</strong></div><div class="summary-card"><small>今日可銷售人力</small><strong>${todayManpower().filter(x=>isWorkingStatus(x.status)&&!x.manager).length}</strong></div>`;
  const kpiBody=$('meetingKpiBody');kpiBody.innerHTML='';coreForecast.forEach(k=>{const m=metrics.find(x=>x.key===k),t=weekStoreValue(week,k,'target'),a=weekStoreValue(week,k,'actual'),r=rate(t,a),tr=document.createElement('tr');tr.innerHTML=`<td><strong>${m.label}</strong></td><td>${fmt(t)}</td><td>${fmt(a)}</td><td><span class="rate-pill ${rateClass(r)}">${rateText(r)}</span></td><td class="${a>=t?'positive':'negative'}">${a>=t?`+${fmt(a-t)}`:`-${fmt(t-a)}`}</td>`;kpiBody.appendChild(tr)});
  const peopleBody=$('meetingPeopleBody'),empty=$('meetingPeopleEmpty');peopleBody.innerHTML='';empty.classList.toggle('hidden',lag.length>0);lag.forEach(x=>{const tr=document.createElement('tr');tr.innerHTML=`<td><strong>${esc(x.person)}</strong></td><td>${esc(x.label)}</td><td>${fmt(x.target)}</td><td>${fmt(x.actual)}</td><td><span class="rate-pill ${rateClass(x.currentRate)}">${rateText(x.currentRate)}</span></td><td class="negative">-${fmt(x.gap)}</td><td class="negative">${rateText(x.forecastRate)}</td>`;peopleBody.appendChild(tr)});
  $('meetingAiPanel').innerHTML=`<div class="ai-summary"><div class="ai-icon">AI</div><div>${meetingAiLines(week).map(x=>`<p>${esc(x)}</p>`).join('')}</div></div>`;
  const notes=$('meetingNotesList');notes.innerHTML='';const notePeople=lag.length?[...new Map(lag.map(x=>[x.id,{id:x.id,name:x.person}])).values()]:performancePeople();notePeople.forEach(p=>{const n=getMeetingNote(week,p.id),card=document.createElement('article');card.className='meeting-note-card';card.innerHTML=`<div class="meeting-note-head"><strong>${esc(personDisplay(p))}</strong><span>第 ${week} 週</span></div><label>本週問題<textarea data-field="issue">${esc(n.issue)}</textarea></label><label>下週改善<textarea data-field="action">${esc(n.action)}</textarea></label><label>下次追蹤<input data-field="followUp" type="date" value="${esc(n.followUp)}"></label>`;card.querySelectorAll('[data-field]').forEach(el=>el.addEventListener('input',e=>{n[e.target.dataset.field]=e.target.value;save()}));notes.appendChild(card)});
  const nextBody=$('nextWeekBody');nextBody.innerHTML='';const next=Math.min(week+1,4),tr=document.createElement('tr');tr.innerHTML=`<td><strong>全店</strong></td>${coreForecast.map(k=>`<td>${fmt(state.storeWeeklyTargets[state.monthKey][next][k].target)}</td>`).join('')}`;nextBody.appendChild(tr)
}
function renderSchedule(){
  ensureOpsState();const dk=$('scheduleDate')?.value||dateKey(),body=$('scheduleBody'),summary=$('scheduleSummary'),grid=$('scheduleDaysGrid');if(!body)return;body.innerHTML='';const ids=new Set([...Object.keys(scheduleMonth()?.[dk]||{}),...state.people.map(p=>p.id),...Object.keys(state.schedulePeople)]),rows=[];
  ids.forEach(id=>{const sp=state.schedulePeople[id]||{},p=state.people.find(x=>x.id===id),name=sp.name||p?.name||id,code=baseShift(dk,id),status=effectiveScheduleStatus(dk,id),manager=isManagerId(id);rows.push({id,name,code,status,manager})});rows.sort((a,b)=>a.id.localeCompare(b.id));
  const working=rows.filter(x=>isWorkingStatus(x.status)),sales=working.filter(x=>!x.manager),off=rows.filter(x=>!isWorkingStatus(x.status));summary.innerHTML=`<div class="summary-card"><small>當日總人力</small><strong>${working.length}</strong></div><div class="summary-card"><small>可分配業績人員</small><strong>${sales.length}</strong></div><div class="summary-card"><small>店長人力</small><strong>${working.filter(x=>x.manager).length}</strong></div><div class="summary-card"><small>休假／訓練／請假</small><strong>${off.length}</strong></div>`;
  rows.forEach(x=>{const tr=document.createElement('tr'),key=scheduleOverrideKey(dk,x.id),label={work:'上班',off:'休假',training:'教育訓練',annual:'特休',sick:'病假',personal:'事假',otherLeave:'其他請假'}[x.status]||'未設定';tr.innerHTML=`<td>${esc(x.id)}${x.manager?' <span class="manager-badge">店長</span>':''}</td><td><strong>${esc(personDisplay(x.id,x.name))}</strong></td><td>${esc(x.code||'—')}</td><td>${esc(label)}</td><td><select class="select-inline"><option value="">依班表</option><option value="work">上班</option><option value="off">休假</option><option value="training">教育訓練</option><option value="annual">特休</option><option value="sick">病假</option><option value="personal">事假</option><option value="otherLeave">其他請假</option></select></td><td>${isWorkingStatus(x.status)&&!x.manager?'✅':x.manager&&isWorkingStatus(x.status)?'計入人力／不列個人業績':'—'}</td>`;const sel=tr.querySelector('select');sel.value=state.scheduleOverrides[key]||'';sel.addEventListener('change',e=>{if(e.target.value)state.scheduleOverrides[key]=e.target.value;else delete state.scheduleOverrides[key];save();renderAll()});body.appendChild(tr)});
  grid.innerHTML='';performancePeople().forEach(p=>{const div=document.createElement('div');div.className='summary-card';div.innerHTML=`<small>${esc(personDisplay(p))}</small><strong>${remainingWorkdays(p.id,new Date(dk+'T12:00:00'))}</strong><span>剩餘工作天</span>`;grid.appendChild(div)})
}
function renderAll(){renderWeekOptions();renderStore();renderForecast();renderAiAnalysis();renderTodayMinimums();renderFocus();renderTodayTargets();renderPeople();renderSchedule();renderWeekly();renderLag();renderMeeting();renderWeeklyReport();renderMeetingHub();renderShareCard();renderGoalCard();renderPersonAliases();renderBranding();if(state.lastImport){$('lastUpdated').textContent=new Date(state.lastImport.time).toLocaleString('zh-TW');$('lastUpdated').className='status-chip ok'}save()}



// ===== v3.0 公司進度／目標／設定整合 =====
function ensureOpsState(){
  if(!state.schedule)state.schedule={};
  if(!state.scheduleOverrides)state.scheduleOverrides={};
  if(!state.schedulePeople)state.schedulePeople={};
  if(!state.managerIds)state.managerIds=['5052'];
  if(!state.roles)state.roles={};
  if(!state.progressByMonth)state.progressByMonth={};
  if(!state.configByMonth)state.configByMonth={};
  if(!state.storeWeeklyTargets)state.storeWeeklyTargets={};
  if(!state.storeWeeklyTargets[state.monthKey])state.storeWeeklyTargets[state.monthKey]=emptyWeekly();
  if(!state.configByMonth[state.monthKey])state.configByMonth[state.monthKey]={workingCodes:['N8','D6','A4'],nonWorkingCodes:['SS','SR','SH','U'],warningThreshold:.02,managerInStoreKpi:true,managerInGoal:false,managerInTracking:false,managerInManpower:true,minDailyTarget:1,reallocateWeekly:true,safeRate:80,allocationBasis:'safe'};
  const activeCfg=state.configByMonth[state.monthKey];if(activeCfg.safeRate===undefined)activeCfg.safeRate=80;if(!activeCfg.allocationBasis)activeCfg.allocationBasis='safe';
  for(let w=1;w<=4;w++)metrics.forEach(m=>{
    const d=state.storeWeeklyTargets[state.monthKey][w][m.key];
    if(typeof d==='number')state.storeWeeklyTargets[state.monthKey][w][m.key]={target:d,actual:0};
    else if(!d)state.storeWeeklyTargets[state.monthKey][w][m.key]={target:0,actual:0};
  });
}
function currentConfig(){ensureOpsState();return state.configByMonth[state.monthKey]}
function allocationFactor(){const cfg=currentConfig();return cfg.allocationBasis==='full'?1:Math.max(0.01,Math.min(1,num(cfg.safeRate||80)/100))}
function allocationTarget(v){return num(v)*allocationFactor()}
function normalizeShift(v){return String(v||'').trim().toUpperCase().replace(/\(.+?\)/g,'')}
function managerIdSet(){ensureOpsState();const ids=new Set(state.managerIds.map(String));Object.entries(state.roles).forEach(([id,r])=>{if(String(r).toLowerCase()==='manager')ids.add(String(id))});return ids}
function statusFromShift(code){const c=normalizeShift(code),cfg=currentConfig();if(cfg.workingCodes.map(normalizeShift).includes(c))return'work';if(c==='U')return'training';if(cfg.nonWorkingCodes.map(normalizeShift).includes(c))return'off';return c?'off':'unknown'}
function storePeople(){const cfg=currentConfig();return cfg.managerInStoreKpi?state.people:state.people.filter(p=>!isManagerId(p.id))}
function performancePeople(){return state.people.filter(p=>!isManagerId(p.id))}
function storeActual(key){return storePeople().reduce((s,p)=>s+num(p.data[key]?.actual),0)}
function progressMonth(){ensureOpsState();return state.progressByMonth[state.monthKey]||{}}
function progressForDay(day){const p=progressMonth()[Number(day)];return p||{cumulative:day/daysInMonth(),daily:1/daysInMonth()}}
function expectedRate(){return Math.max(0,Math.min(100,num(progressForDay(currentDay()).cumulative)*100))}
function forecastValue(actual){const p=Math.max(num(progressForDay(currentDay()).cumulative),1/daysInMonth());return actual/p}
function metricKeyFromTargetHeader(v){const s=String(v||'').replace(/\s/g,'').toUpperCase();if(s.includes('總保險')||s==='保險')return'totalInsurance';if(s.includes('總門號')||s==='門號')return'totalLines';if(s.includes('GA/NP')||s.includes('GA／NP')||s==='GA')return'ganp';if(s.includes('999'))return'above999';if(s.includes('ACCY(NA)')||s.includes('ACCYNA')||s==='ACCY')return'accyNA';return null}
function parseMonthDay(v){if(v instanceof Date&&!isNaN(v))return v.getDate();const m=String(v||'').match(/(?:\d{4}[\/\-.])?(\d{1,2})月?(\d{1,2})日?/);if(m)return Number(m[2]);const m2=String(v||'').match(/^(\d{1,2})月(\d{1,2})日$/);return m2?Number(m2[2]):null}
function yes(v){return ['是','YES','Y','TRUE','1'].includes(String(v||'').trim().toUpperCase())}
async function importScheduleWorkbook(file){
  if(typeof XLSX==='undefined')return alert('Excel 解析元件尚未載入。');
  try{
    const wb=XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:true});
    const required=['班表','進度表','本月目標','設定'];const missing=required.filter(n=>!wb.Sheets[n]);if(missing.length)throw new Error(`缺少工作表：${missing.join('、')}`);
    ensureOpsState();
    // 設定
    const sr=sheetRows(wb,'設定'),headers=sr[0]||[],values=sr[1]||[],cfg=currentConfig();
    const idx=name=>headers.findIndex(x=>String(x||'').trim()===name);
    const managerRaw=values[idx('店長工號')];if(managerRaw){state.managerIds=[personId(managerRaw)]}
    const wc=idx('目前計算上班班別'),nc=idx('不計算上班班別');
    cfg.workingCodes=sr.slice(1).map(r=>normalizeShift(r[wc])).filter(Boolean);
    cfg.nonWorkingCodes=sr.slice(1).map(r=>normalizeShift(r[nc])).filter(Boolean);
    cfg.warningThreshold=num(values[idx('安全/警戒區門檻')])||.02;
    cfg.managerInStoreKpi=yes(values[idx('店長是否參與全店KPI')]);
    cfg.managerInGoal=yes(values[idx('店長是否顯示於個人目標')])||yes(values[idx('目標圖是否顯示店長')]);
    cfg.managerInTracking=yes(values[idx('店長是否顯示於追蹤名單')]);
    cfg.managerInManpower=yes(values[idx('店長計入今日人力')]);
    cfg.minDailyTarget=Math.max(0,num(values[idx('個人每日目標最小值')]));
    cfg.reallocateWeekly=String(values[idx('每週是否重新分配追趕目標')]||'').includes('是');
    const excelSafe=num(values[idx('安全達成率')]);if(excelSafe>0)cfg.safeRate=Math.max(1,Math.min(100,excelSafe));
    // 角色表
    state.roles={};let roleRow=sr.findIndex(r=>String(r[0]).trim()==='工號'&&String(r[1]).trim()==='角色');
    if(roleRow>=0)sr.slice(roleRow+1).forEach(r=>{const id=personId(r[0]);if(id)state.roles[id]=String(r[1]||'Staff').trim()});
    // 班表
    const rows=sheetRows(wb,'班表'),header=rows[0]||[],month={};
    rows.slice(1).forEach(r=>{const id=personId(r[0]);if(!id)return;const name=String(r[1]||id).trim();state.schedulePeople[id]={id,name};ensurePerson(id,`${id}-${name}`);for(let c=3;c<header.length;c++){const day=Number(header[c]);if(!Number.isFinite(day)||day<1||day>31)continue;const dk=`${state.monthKey}-${String(day).padStart(2,'0')}`;if(!month[dk])month[dk]={};month[dk][id]={code:String(r[c]||'').trim(),name}}});
    state.schedule[state.monthKey]=month;
    // 公司進度
    const pr=sheetRows(wb,'進度表'),progress={};
    pr.slice(1).forEach(r=>{const day=parseMonthDay(r[0]);if(day)progress[day]={cumulative:num(r[2]),daily:num(r[3])}});state.progressByMonth[state.monthKey]=progress;
    // 目標
    const tr=sheetRows(wb,'本月目標'),th=tr[0]||[],cols={};th.forEach((h,i)=>{const k=metricKeyFromTargetHeader(h);if(k)cols[k]=i});
    tr.slice(1).forEach(r=>{const label=String(r[0]||'').trim();if(!label)return;if(label.includes('全店')){Object.entries(cols).forEach(([k,i])=>state.storeTargets[k]=num(r[i]));return}const id=personId(label);if(!id)return;const p=ensurePerson(id,label);Object.entries(cols).forEach(([k,i])=>p.data[k].target=num(r[i]))});
    // 依進度表建立原定週目標
    rebuildProgressWeeklyTargets();
    state.lastScheduleImport={time:new Date().toISOString(),file:file.name};save();renderAll();
    $('importStatus').textContent=`每月設定匯入完成：${file.name}。班表、目標、公司進度與角色設定已更新。`;
  }catch(e){console.error(e);alert(`每月設定匯入失敗：${e.message}`)}
}
function rebuildProgressWeeklyTargets(){ensureOpsState();const ranges=weekRanges(),pm=progressMonth();for(let w=1;w<=4;w++){const r=ranges[w-1];coreForecast.forEach(k=>{let weight=0;for(let d=r.start;d<=r.end;d++)weight+=num(pm[d]?.daily);state.storeWeeklyTargets[state.monthKey][w][k].target=Math.round(num(state.storeTargets[k])*weight)})}}
function cumulativeActualToDay(key,day){
  let total=0;const end=`${state.monthKey}-${String(day).padStart(2,'0')}`;
  const source=key==='totalLines'||key==='ganp'||key==='above999'?state.dailyLineSnapshots:state.dailyInsuranceSnapshots;
  Object.entries(source||{}).forEach(([dk,people])=>{if(!dk.startsWith(state.monthKey)||dk>end)return;Object.entries(people||{}).forEach(([id,v])=>{if(!currentConfig().managerInStoreKpi&&isManagerId(id))return;total+=num(v[key])})});return total
}
function originalDailyTarget(key,day=currentDay()){return Math.max(0,Math.round(num(state.storeTargets[key])*num(progressForDay(day).daily)))}
function storeTodayRequired(key){const expected=Math.ceil(allocationTarget(state.storeTargets[key])*num(progressForDay(currentDay()).cumulative));return Math.max(expected-storeActual(key),0)}
function weekOriginalTarget(week,key){const r=weekRanges()[week-1];let wt=0;for(let d=r.start;d<=r.end;d++)wt+=num(progressForDay(d).daily);return Math.round(allocationTarget(state.storeTargets[key])*wt)}
function weekCumulativeExpected(week,key){const end=weekRanges()[week-1].end;return Math.round(num(state.storeTargets[key])*num(progressForDay(end).cumulative))}
function weekCatchupTarget(week,key){const original=weekOriginalTarget(week,key);if(week<=1)return original;const priorEnd=weekRanges()[week-2].end,priorGap=Math.max(Math.round(allocationTarget(state.storeTargets[key])*num(progressForDay(priorEnd).cumulative))-cumulativeActualToDay(key,priorEnd),0);return original+(currentConfig().reallocateWeekly?priorGap:0)}
function allocateInteger(total,items){
  total=Math.max(0,Math.round(total));if(!items.length||!total)return Object.fromEntries(items.map(x=>[x.id,0]));
  let weights=items.map(x=>Math.max(num(x.weight),0)),sum=weights.reduce((a,b)=>a+b,0);if(sum<=0){weights=items.map(()=>1);sum=items.length}
  const raw=weights.map(w=>total*w/sum),vals=raw.map(Math.floor),remain=total-vals.reduce((a,b)=>a+b,0);raw.map((x,i)=>({i,frac:x-vals[i]})).sort((a,b)=>b.frac-a.frac).slice(0,remain).forEach(x=>vals[x.i]++);
  return Object.fromEntries(items.map((x,i)=>[x.id,vals[i]]))
}
function todayAllocation(key){
  const cfg=currentConfig(),working=todayWorkingPeople().filter(p=>cfg.managerInGoal||!isManagerId(p.id));const total=storeTodayRequired(key);
  const items=working.map(p=>({id:p.id,weight:Math.max(num(p.data[key]?.target)-num(p.data[key]?.actual),0)}));return allocateInteger(total,items)
}
function todayGoalForPerson(p,key){return num(todayAllocation(key)[p.id])}
function storeTodayMinimum(key){return storeTodayRequired(key)}
function lagRows(){const rows=[],expected=expectedRate(),remainingDays=Math.max(daysInMonth()-currentDay(),0);performancePeople().forEach(p=>coreForecast.forEach(k=>{const t=num(p.data[k]?.target),a=num(p.data[k]?.actual);if(t<=0)return;const expectedActual=t*expected/100;if(a+1e-9<expectedActual){rows.push({person:personDisplay(p),id:p.id,key:k,label:metrics.find(m=>m.key===k).label,target:t,actual:a,currentRate:rate(t,a),expectedRate:expected,gap:expectedActual-a,daily:remainingWorkdays(p.id)?Math.max(t-a,0)/remainingWorkdays(p.id):Math.max(t-a,0),forecast:forecastValue(a),forecastRate:rate(t,forecastValue(a))})}}));return rows.sort((a,b)=>(b.expectedRate-b.currentRate)-(a.expectedRate-a.currentRate)||b.gap-a.gap)}
function renderProgressHealth(){const el=$('progressHealthGrid');if(!el)return;el.innerHTML='';const threshold=currentConfig().warningThreshold*100;coreForecast.forEach(k=>{const m=metrics.find(x=>x.key===k),t=num(state.storeTargets[k]),a=storeActual(k),actualPct=t?100*a/t:0,expected=expectedRate(),diff=actualPct-expected,cls=diff>=0?'good':diff>=-threshold?'warn':'bad',div=document.createElement('article');div.className=`forecast-card ${cls}`;div.innerHTML=`<span>${m.label}</span><strong>${diff>=0?'+':''}${diff.toFixed(1)}%</strong><small>公司應達 ${expected.toFixed(1)}%｜實際 ${actualPct.toFixed(1)}%</small><div class="forecast-rate ${cls}Text">${diff>=0?'超前':Math.abs(diff)<=threshold?'警戒':'落後'}</div>`;el.appendChild(div)})}
function renderGoalCard(){if(!$('goalCard'))return;const now=new Date();$('goalCardDate').textContent=`${now.toLocaleDateString('zh-TW')}（${weekdayText(now)}）`;const store=$('goalStoreGrid');store.innerHTML=coreForecast.map(k=>`<div><span>${metrics.find(m=>m.key===k).label}</span><strong>${fmt(storeTodayRequired(k))}</strong></div>`).join('');const people=todayWorkingPeople().filter(p=>currentConfig().managerInGoal||!isManagerId(p.id));$('goalPeople').innerHTML=people.map(p=>`<tr><td><strong>${esc(personDisplay(p))}</strong></td>${coreForecast.map(k=>`<td>${fmt(todayGoalForPerson(p,k))}</td>`).join('')}</tr>`).join('')||'<tr><td colspan="6">今日無銷售人員排班</td></tr>'}
function personWeekOriginalTarget(p,week,key){
  const r=weekRanges()[week-1];let weight=0;for(let d=r.start;d<=r.end;d++)weight+=num(progressForDay(d).daily);
  return Math.max(0,Math.round(allocationTarget(p.data[key]?.target)*weight));
}
function personWeekActual(p,week,key){return num(p.weekly?.[state.monthKey]?.[week]?.[key]?.actual)}
function personActualBeforeWeek(p,week,key){let total=0;for(let w=1;w<week;w++)total+=personWeekActual(p,w,key);return total}
function personWeekCatchupTarget(p,week,key){
  const original=personWeekOriginalTarget(p,week,key);if(week<=1||!currentConfig().reallocateWeekly)return original;
  const priorEnd=weekRanges()[week-2].end;
  const priorExpected=Math.round(allocationTarget(p.data[key]?.target)*num(progressForDay(priorEnd).cumulative));
  const priorGap=Math.max(priorExpected-personActualBeforeWeek(p,week,key),0);
  return original+priorGap;
}
function renderWeekly(){
  ensureOpsState();const week=Number($('weekSelect').value||weekOfDate(new Date())),el=$('weeklyList');el.innerHTML='';
  const storeCard=document.createElement('article');storeCard.className='weekly-card';storeCard.innerHTML=`<div class="weekly-header"><div><strong>全店</strong><div class="person-id">第 ${week} 週｜依公司進度表</div></div></div><div class="weekly-metrics"></div>`;
  const storeGrid=storeCard.querySelector('.weekly-metrics');coreForecast.forEach(k=>{const m=metrics.find(x=>x.key===k),original=weekOriginalTarget(week,k),catchup=weekCatchupTarget(week,k),actual=weekActualValue(week,k),r=rate(catchup,actual),box=document.createElement('div');box.className='weekly-metric';box.innerHTML=`<strong>${m.label}</strong><div class="weekly-numbers"><label>分配基準<input value="${original}" disabled></label><label>追趕目標<input value="${catchup}" disabled></label><label>週實績<input value="${actual}" disabled></label></div><span class="rate-pill ${rateClass(r)}">${rateText(r)}</span><small class="weekly-remaining">尚需 ${fmt(Math.max(catchup-actual,0))}</small>`;storeGrid.appendChild(box)});el.appendChild(storeCard);
  performancePeople().forEach(p=>{const card=document.createElement('article');card.className='weekly-card';card.innerHTML=`<div class="weekly-header"><div><strong>${esc(personDisplay(p))}</strong><div class="person-id">第 ${week} 週個人目標｜依個人月目標與公司進度</div></div></div><div class="weekly-metrics"></div>`;const grid=card.querySelector('.weekly-metrics');coreForecast.forEach(k=>{const m=metrics.find(x=>x.key===k),original=personWeekOriginalTarget(p,week,k),catchup=personWeekCatchupTarget(p,week,k),actual=personWeekActual(p,week,k),r=rate(catchup,actual),box=document.createElement('div');box.className='weekly-metric';box.innerHTML=`<strong>${m.label}</strong><div class="weekly-numbers"><label>分配基準<input value="${original}" disabled></label><label>個人追趕<input value="${catchup}" disabled></label><label>週實績<input value="${actual}" disabled></label></div><span class="rate-pill ${rateClass(r)}">${rateText(r)}</span><small class="weekly-remaining">尚需 ${fmt(Math.max(catchup-actual,0))}</small>`;grid.appendChild(box)});el.appendChild(card)})
}
function autoAllocateRemaining(){rebuildProgressWeeklyTargets();renderAll();alert('已依公司進度表重新建立全店週目標與追趕目標。')}
function renderMeeting(){
  ensureOpsState();const week=selectedMeetingWeek(),range=weekRanges()[week-1],summary=$('meetingSummary');const storeRows=coreForecast.map(k=>({k,label:metrics.find(m=>m.key===k).label,original:weekOriginalTarget(week,k),catchup:weekCatchupTarget(week,k),actual:weekActualValue(week,k),cumExpected:weekCumulativeExpected(week,k),cumActual:cumulativeActualToDay(k,Math.min(range.end,currentDay()))}));
  const risks=storeRows.filter(x=>x.actual<x.catchup),avg=storeRows.length?storeRows.reduce((s,x)=>s+(rate(x.catchup,x.actual)||0),0)/storeRows.length:0;
  summary.innerHTML=`<div class="summary-card"><small>會議週次</small><strong>第 ${week} 週</strong></div><div class="summary-card"><small>本週平均完成率</small><strong>${avg.toFixed(1)}%</strong></div><div class="summary-card"><small>落後 KPI</small><strong>${risks.length}</strong></div><div class="summary-card"><small>公司累計應達</small><strong>${(num(progressForDay(range.end).cumulative)*100).toFixed(1)}%</strong></div>`;
  const body=$('meetingKpiBody');body.innerHTML='';storeRows.forEach(x=>{const tr=document.createElement('tr'),r=rate(x.catchup,x.actual);tr.innerHTML=`<td><strong>${x.label}</strong><small style="display:block">原定 ${fmt(x.original)}｜追趕 ${fmt(x.catchup)}</small></td><td>${fmt(x.catchup)}</td><td>${fmt(x.actual)}</td><td><span class="rate-pill ${rateClass(r)}">${rateText(r)}</span></td><td class="${x.actual>=x.catchup?'positive':'negative'}">${x.actual>=x.catchup?'+':''}${fmt(x.actual-x.catchup)}</td>`;body.appendChild(tr)});
  const lag=weekLagRows();renderMeetingTracking(week);
  const lines=[];risks.slice().sort((a,b)=>(b.catchup-b.actual)-(a.catchup-a.actual)).forEach(x=>lines.push(`${x.label}本週追趕目標 ${fmt(x.catchup)}，實際 ${fmt(x.actual)}，尚差 ${fmt(x.catchup-x.actual)}。`));if(!lines.length)lines.push('本週核心 KPI 均已跟上公司進度。');$('meetingAiPanel').innerHTML=`<div class="ai-summary"><div class="ai-icon">AI</div><div>${lines.map(x=>`<p>${esc(x)}</p>`).join('')}</div></div>`;
  const notes=$('meetingNotesList');notes.innerHTML='';const notePeople=lag.length?[...new Map(lag.map(x=>[x.id,{id:x.id,name:x.person}])).values()]:performancePeople();notePeople.forEach(p=>{const n=getMeetingNote(week,p.id),card=document.createElement('article');card.className='meeting-note-card';card.innerHTML=`<div class="meeting-note-head"><strong>${esc(personDisplay(p))}</strong><span>第 ${week} 週</span></div><label>本週問題<textarea data-field="issue">${esc(n.issue)}</textarea></label><label>下週改善<textarea data-field="action">${esc(n.action)}</textarea></label><label>下次追蹤<input data-field="followUp" type="date" value="${esc(n.followUp)}"></label>`;card.querySelectorAll('[data-field]').forEach(el=>el.addEventListener('input',e=>{n[e.target.dataset.field]=e.target.value;save()}));notes.appendChild(card)});
  const next=Math.min(week+1,4),nextBody=$('nextWeekBody');nextBody.innerHTML=`<tr><td><strong>全店追趕目標</strong></td>${coreForecast.map(k=>`<td>${fmt(weekCatchupTarget(next,k))}</td>`).join('')}</tr>`;performancePeople().forEach(p=>{const tr=document.createElement('tr');tr.innerHTML=`<td><strong>${esc(personDisplay(p))}</strong></td>${coreForecast.map(k=>`<td>${fmt(personWeekCatchupTarget(p,next,k))}</td>`).join('')}`;nextBody.appendChild(tr)})
}

function weeklyReportData(week){
  const range=weekRanges()[week-1],store=coreForecast.map(k=>{const m=metrics.find(x=>x.key===k),target=weekCatchupTarget(week,k),original=weekOriginalTarget(week,k),actual=weekActualValue(week,k);return{key:k,label:m.label,target,original,actual,r:rate(target,actual)}}),lag=weekLagRows(),highlights=store.filter(x=>x.r!==null&&x.r>=100).sort((a,b)=>b.r-a.r),risks=store.filter(x=>x.r!==null&&x.r<100).sort((a,b)=>a.r-b.r);const ai=risks.length?risks.map(x=>`${x.label}公司原定 ${fmt(x.original)}、追趕目標 ${fmt(x.target)}，目前尚差 ${fmt(Math.max(x.target-x.actual,0))}。`):['本週核心 KPI 均已跟上公司進度。'];return{week,range,store,lag,highlights,risks,ai}
}
function weeklyReportText(week){const d=weeklyReportData(week);return [`${state.branding?.appName||'Command Center'}｜${state.branding?.storeName||'未設定門市'}｜第 ${week} 週店長週報`,`期間：${new Date().getMonth()+1}/${d.range.start}～${new Date().getMonth()+1}/${d.range.end}`,'','一、本週 KPI',...d.store.map(x=>`${x.label}：實際 ${fmt(x.actual)}／公司原定 ${fmt(x.original)}／追趕目標 ${fmt(x.target)}（${rateText(x.r)}）`),'','二、本週亮點',...(d.highlights.length?d.highlights.map(x=>`${x.label} 已跟上追趕目標，完成率 ${rateText(x.r)}。`):['本週尚無已完成追趕目標的核心 KPI。']),'','三、落後狀況',...(d.lag.length?d.lag.slice(0,10).map(x=>`${x.person}－${x.label}：月實績 ${fmt(x.actual)}／目標 ${fmt(x.target)}，月底尚差 ${fmt(x.gap)}。`):['本週無個人追蹤項目。']),'','四、店長分析',...d.ai.map(x=>`・${x}`),'','五、下週行動',...performancePeople().map(p=>{const n=getMeetingNote(week,p.id);return n.action?`${personDisplay(p)}：${n.action}`:''}).filter(Boolean)].join('\n')}


function meetingRecordId(){return `meeting-${Date.now()}-${Math.random().toString(36).slice(2,8)}`}
function blankMeetingRecord(){return{id:meetingRecordId(),type:'區內週會',date:dateKey(),title:'',raw:'',privateNotes:'',summary:[],announcement:'',tasks:[],createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}}
function meetingRecords(){if(!Array.isArray(state.meetingHubRecords))state.meetingHubRecords=[];return state.meetingHubRecords}
function currentMeetingRecord(){return meetingRecords().find(x=>x.id===state.currentMeetingRecordId)||null}
function newMeetingRecord(){const r=blankMeetingRecord();meetingRecords().unshift(r);state.currentMeetingRecordId=r.id;save();renderMeetingHub()}
function selectMeetingRecord(id){state.currentMeetingRecordId=id;save();renderMeetingHub()}
function editorValue(id){return document.getElementById(id)?.value||''}
function saveMeetingRecordFromEditor(show=true){let r=currentMeetingRecord();if(!r){r=blankMeetingRecord();meetingRecords().unshift(r);state.currentMeetingRecordId=r.id}r.type=editorValue('meetingRecordType')||'區內週會';r.date=editorValue('meetingRecordDate')||dateKey();r.title=editorValue('meetingRecordTitle').trim();r.raw=editorValue('meetingRecordRaw').trim();r.privateNotes=editorValue('meetingRecordPrivate').trim();r.updatedAt=new Date().toISOString();save();renderMeetingHubList();if(show)alert('會議紀錄已儲存並同步。');return r}
function normalizeMeetingLines(text){return String(text||'').replace(/\r/g,'\n').split(/\n+/).map(x=>x.replace(/^\s*[-•▪◦※★☆✓✔☐\d.、()（）]+\s*/,'').trim()).filter(Boolean)}
function meetingSentences(text){return String(text||'').replace(/\r/g,'').split(/[。！？!?；;\n]+/).map(x=>x.trim()).filter(x=>x.length>2)}
function uniqueTexts(items){const out=[];items.forEach(x=>{const key=x.replace(/\s+/g,'');if(key&&!out.some(y=>y.replace(/\s+/g,'')===key))out.push(x)});return out}
function smartMeetingResult(text){
  const lines=normalizeMeetingLines(text),sentences=meetingSentences(text),all=uniqueTexts([...lines,...sentences]);
  const taskWords=/請|需|務必|完成|執行|追蹤|確認|回報|改善|調整|提醒|截止|於.+前|每天|每週|下週|本月|目標/;
  const priorityWords=/重點|重要|注意|政策|規定|異動|活動|主推|稽核|客訴|風險|落後|達成|保險|門號|GA|NP|999|評論|舊換新|喇叭/i;
  const task=all.filter(x=>taskWords.test(x)).slice(0,10);
  const priority=all.filter(x=>priorityWords.test(x));
  const summary=uniqueTexts([...priority,...all]).slice(0,6);
  const fallback=all.slice(0,6);
  const finalSummary=summary.length?summary:fallback;
  const finalTasks=task.length?task:all.filter(x=>x.length<=60).slice(0,5);
  const announceLines=finalSummary.slice(0,5);
  const announcement=announceLines.length?`本次會議請大家留意以下事項：\n${announceLines.map((x,i)=>`${i+1}. ${x}`).join('\n')}${finalTasks.length?`\n\n執行事項：\n${finalTasks.slice(0,5).map(x=>`☐ ${x}`).join('\n')}`:''}`:'尚無可整理內容。';
  return{summary:finalSummary,tasks:finalTasks,announcement};
}
function smartOrganizeMeeting(){const r=saveMeetingRecordFromEditor(false);if(!r.raw){alert('請先貼上或輸入原始會議內容。');return}const result=smartMeetingResult(r.raw);r.summary=result.summary;r.tasks=result.tasks;r.announcement=result.announcement;r.updatedAt=new Date().toISOString();save();renderMeetingHub();}
function renderMeetingHub(){if(!document.getElementById('page-meetinghub'))return;if(!currentMeetingRecord()&&meetingRecords().length)state.currentMeetingRecordId=meetingRecords()[0].id;renderMeetingHubList();renderMeetingHubEditor()}
function renderMeetingHubList(){const el=document.getElementById('meetingRecordList');if(!el)return;const filter=document.getElementById('meetingHubFilter')?.value||'all',q=(document.getElementById('meetingHubSearch')?.value||'').trim().toLowerCase();const rows=meetingRecords().filter(r=>(filter==='all'||r.type===filter)&&(!q||`${r.title} ${r.raw} ${r.announcement} ${r.type}`.toLowerCase().includes(q))).sort((a,b)=>String(b.date).localeCompare(String(a.date))||String(b.updatedAt).localeCompare(String(a.updatedAt)));el.innerHTML='';if(!rows.length){el.innerHTML='<div class="empty-state">尚無符合的會議紀錄。</div>';return}rows.forEach(r=>{const btn=document.createElement('button');btn.type='button';btn.className=`meeting-record-item ${r.id===state.currentMeetingRecordId?'active':''}`;const preview=(r.summary?.[0]||r.raw||'尚未輸入內容').slice(0,64);btn.innerHTML=`<span class="meeting-record-type">${esc(r.type)}</span><strong>${esc(r.title||'未命名會議')}</strong><small>${esc(r.date||'')}</small><p>${esc(preview)}</p>`;btn.addEventListener('click',()=>selectMeetingRecord(r.id));el.appendChild(btn)})}
function outputHtml(items,empty='尚未整理。'){if(Array.isArray(items)&&items.length)return `<ul>${items.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`;if(typeof items==='string'&&items.trim())return esc(items).replace(/\n/g,'<br>');return `<span class="empty-copy">${empty}</span>`}
function renderMeetingHubEditor(){const r=currentMeetingRecord();const ids=['meetingRecordType','meetingRecordDate','meetingRecordTitle','meetingRecordRaw','meetingRecordPrivate'];if(!r){ids.forEach(id=>{const e=document.getElementById(id);if(e)e.value=id==='meetingRecordDate'?dateKey():''});document.getElementById('meetingRecordSummary').innerHTML='<span class="empty-copy">請新增一筆會議紀錄。</span>';document.getElementById('meetingRecordAnnouncement').innerHTML='<span class="empty-copy">請新增一筆會議紀錄。</span>';document.getElementById('meetingRecordTasks').innerHTML='<span class="empty-copy">請新增一筆會議紀錄。</span>';return}document.getElementById('meetingRecordType').value=r.type||'區內週會';document.getElementById('meetingRecordDate').value=r.date||dateKey();document.getElementById('meetingRecordTitle').value=r.title||'';document.getElementById('meetingRecordRaw').value=r.raw||'';document.getElementById('meetingRecordPrivate').value=r.privateNotes||'';document.getElementById('meetingRecordSummary').innerHTML=outputHtml(r.summary);document.getElementById('meetingRecordAnnouncement').innerHTML=outputHtml(r.announcement);document.getElementById('meetingRecordTasks').innerHTML=outputHtml(r.tasks)}
async function copyMeetingAnnouncement(){const r=saveMeetingRecordFromEditor(false);const text=r.announcement||smartMeetingResult(r.raw).announcement;if(!text||text==='尚無可整理內容。'){alert('請先輸入內容並執行智慧整理。');return}try{await navigator.clipboard.writeText(text);alert('店內佈達內容已複製。')}catch(e){const ta=document.createElement('textarea');ta.value=text;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();alert('店內佈達內容已複製。')}}
function meetingRecordText(r){return [`會議類型：${r.type||''}`,`日期：${r.date||''}`,`主題：${r.title||''}`,'','一、原始內容',r.raw||'','', '二、會議摘要',...(r.summary||[]).map(x=>`・${x}`),'','三、店內佈達',r.announcement||'','', '四、執行與追蹤事項',...(r.tasks||[]).map(x=>`☐ ${x}`),'','五、店長私人備註',r.privateNotes||''].join('\n')}
function downloadMeetingRecord(){const r=saveMeetingRecordFromEditor(false);const blob=new Blob([meetingRecordText(r)],{type:'text/plain;charset=utf-8'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`${r.date||dateKey()}_${r.title||r.type||'會議紀錄'}.txt`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
function deleteMeetingRecord(){const r=currentMeetingRecord();if(!r)return;if(!confirm(`確定刪除「${r.title||r.type}」嗎？`))return;state.meetingHubRecords=meetingRecords().filter(x=>x.id!==r.id);state.currentMeetingRecordId=state.meetingHubRecords[0]?.id||null;save();renderMeetingHub()}
function renderAll(){renderWeekOptions();renderTodayBrief();renderStore();renderProgressHealth();renderForecast();renderAiAnalysis();renderTodayMinimums();renderFocus();renderTodayTargets();renderPeople();renderSchedule();renderWeekly();renderLag();renderMeeting();renderWeeklyReport();renderMeetingHub();renderShareCard();renderGoalCard();renderPersonAliases();renderBranding();if(state.lastImport){$('lastUpdated').textContent=new Date(state.lastImport.time).toLocaleString('zh-TW');$('lastUpdated').className='status-chip ok'}save()}

window.addEventListener('load',()=>{showOpeningSplash();init();if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});});
window.addEventListener('online',()=>{cloudStatus('正在重新同步…');scheduleCloudSave(true)});
})();
