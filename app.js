(() => {
'use strict';
const STORAGE_KEY='banqiaoCommandCenter.v2.1';
const LEGACY_STORAGE_KEYS=['banqiaoCommandCenter.m1.snapshots.v1'];
const metrics=[
  {key:'phoneInsurance',label:'手機保險'},
  {key:'computerInsurance',label:'電腦保險'},
  {key:'tabletInsurance',label:'平板保險'},
  {key:'watchEarInsurance',label:'手錶／耳機保險'},
  {key:'totalInsurance',label:'總保險'},
  {key:'totalLines',label:'總門號'},
  {key:'ganp',label:'GA／NP'},
  {key:'above999',label:'999以上'}
];
const coreForecast=['totalInsurance','totalLines','ganp','above999'];
const state={monthKey:'',people:[],storeTargets:{},dailyLineSnapshots:{},dailyInsuranceSnapshots:{},lastImport:null,lastImportTotals:null,todayDelta:null,diagnostics:null};
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
function rate(target,actual){return num(target)>0?num(actual)/num(target)*100:null}
function rateClass(r){if(r===null)return'na';if(r>=100)return'good';if(r>=80)return'warn';return'bad'}
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
  if(!p){p={id,name:name||id,data:emptyMetrics(),weekly:{[state.monthKey]:emptyWeekly()}};state.people.push(p)}
  if(name)p.name=name;
  if(!p.weekly[state.monthKey])p.weekly[state.monthKey]=emptyWeekly();
  metrics.forEach(m=>{if(!p.data[m.key])p.data[m.key]={target:0,actual:0};for(let w=1;w<=4;w++)if(!p.weekly[state.monthKey][w][m.key])p.weekly[state.monthKey][w][m.key]={target:0,actual:0}});
  return p;
}
function init(){
  state.monthKey=monthKey();metrics.forEach(m=>state.storeTargets[m.key]=0);
  load();
  $('monthSubtitle').textContent=`${new Date().getFullYear()} 年 ${new Date().getMonth()+1} 月｜第 ${weekOfDate(new Date())} 週｜今日 ${new Date().toLocaleDateString('zh-TW')}`;
  bind();renderAll();
}
function bind(){
  $('importBtn').addEventListener('click',()=>$('fileInput').click());
  $('fileInput').addEventListener('change',e=>{const f=e.target.files?.[0];if(f)importWorkbook(f);e.target.value=''});
  $('shareCardBtn').addEventListener('click',exportShareCard);
  $('saveBtn').addEventListener('click',()=>save(true));
  $('autoAllocateBtn').addEventListener('click',autoAllocateRemaining);
  document.querySelectorAll('.tab').forEach(btn=>btn.addEventListener('click',()=>showPage(btn.dataset.page)));
  $('weekSelect').addEventListener('change',renderWeekly);
}
function showPage(page){document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x.dataset.page===page));document.querySelectorAll('.page').forEach(x=>x.classList.remove('active'));$(`page-${page}`).classList.add('active')}
function save(show=false){localStorage.setItem(STORAGE_KEY,JSON.stringify(state));if(show)alert('目標與排序已儲存。')}
function load(){try{let raw=localStorage.getItem(STORAGE_KEY);if(!raw){for(const key of LEGACY_STORAGE_KEYS){raw=localStorage.getItem(key);if(raw)break}}const old=JSON.parse(raw||'null');if(old){Object.assign(state,old);state.monthKey=monthKey();if(!state.dailyLineSnapshots)state.dailyLineSnapshots={};if(!state.dailyInsuranceSnapshots)state.dailyInsuranceSnapshots={};metrics.forEach(m=>{if(state.storeTargets[m.key]===undefined)state.storeTargets[m.key]=0});state.people.forEach(p=>ensurePerson(p.id,p.name));rebuildLineActualsFromSnapshots()}}catch(e){console.warn(e)}}
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

    const savedPeople=new Map(state.people.map(p=>[p.id,{data:p.data,weekly:p.weekly,name:p.name}]));
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
      ['phoneInsurance','computerInsurance','tabletInsurance','watchEarInsurance','totalInsurance'].forEach(k=>p.data[k].actual=0);
      for(let w=1;w<=4;w++){
        ['phoneInsurance','computerInsurance','tabletInsurance','watchEarInsurance','totalInsurance'].forEach(k=>p.weekly[state.monthKey][w][k].actual=0);
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
    let insuranceCount=0,validSalesRows=0,skippedPresale=0,skippedVoid=0;
    dataRows.slice(1).forEach(r=>{
      const d=excelDate(r[0]);if(!d||monthKey(d)!==state.monthKey)return;
      const transactionType=String(r[2]??'').trim();
      if(transactionType.includes('作廢')){skippedVoid++;return;}
      if(transactionType==='預售交易'){skippedPresale++;return;}
      // 實際 Excel 只有一般交易、預售結帳、預售交易、作廢交易。
      if(transactionType!=='一般交易'&&transactionType!=='預售結帳')return;

      const sku=String(r[3]??'').trim().toUpperCase();
      const staffRaw=String(r[6]??'').trim();
      const id=personId(staffRaw),qty=num(r[7]);
      if(!sku||!id||qty<=0)return;
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
      if(!insuranceSnapshots[dk][id])insuranceSnapshots[dk][id]={name:p.name,phoneInsurance:0,computerInsurance:0,tabletInsurance:0,watchEarInsurance:0,totalInsurance:0};
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
    state.diagnostics={insuranceCount,validSalesRows,unknownSku:[...unknownSku],unknownPeople:[...unknownPeople],skippedPresale,skippedVoid,snapshotSource};
    save();renderAll();

    status.innerHTML=`匯入完成：總保險 <strong>${fmt(storeActual('totalInsurance'))}</strong> 件；門號月累計 <strong>${fmt(storeActual('totalLines'))}</strong>；GA／NP <strong>${fmt(storeActual('ganp'))}</strong>；999以上 <strong>${fmt(storeActual('above999'))}</strong>。門號快照來源：${esc(snapshotSource)}。${unknownSku.size?`另有 ${unknownSku.size} 個未對應料號未計入。`:''}`;
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
function renderAll(){renderWeekOptions();renderStore();renderForecast();renderAiAnalysis();renderTodayMinimums();renderFocus();renderTodayTargets();renderPeople();renderWeekly();renderLag();renderShareCard();if(state.lastImport){$('lastUpdated').textContent=new Date(state.lastImport.time).toLocaleString('zh-TW');$('lastUpdated').className='status-chip ok'}save()}
function renderWeekOptions(){const select=$('weekSelect'),ranges=weekRanges();const current=select.value||String(weekOfDate(new Date()));select.innerHTML=ranges.map((r,i)=>`<option value="${i+1}">第 ${i+1} 週（${new Date().getMonth()+1}/${r.start}～${new Date().getMonth()+1}/${r.end}）</option>`).join('');select.value=current}
function renderStore(){
  const el=$('storeKpiGrid');el.innerHTML='';metrics.forEach(m=>{const a=storeActual(m.key),t=num(state.storeTargets[m.key]),r=rate(t,a),cls=rateClass(r),card=document.createElement('article');card.className=`kpi-card ${cls}`;card.innerHTML=`<div class="kpi-title"><span>${m.label}</span><span class="rate-pill ${cls}">${rateText(r)}</span></div><div class="kpi-values"><span class="kpi-actual">${fmt(a)}</span><span class="kpi-target">/ <input class="target-input" type="number" min="0" value="${t}" aria-label="${m.label}全店目標"></span></div><div class="progress"><span style="width:${Math.min(r||0,100)}%"></span></div><div class="kpi-meta"><span>今日應達 ${rateText(expectedRate())}</span><span>還差 ${fmt(Math.max(t-a,0))}</span></div>`;card.querySelector('input').addEventListener('change',e=>{state.storeTargets[m.key]=num(e.target.value);renderAll()});el.appendChild(card)})
}
function forecastValue(actual){const d=Math.max(currentDay(),1);return actual/d*daysInMonth()}
function renderForecast(){const el=$('forecastGrid');el.innerHTML='';coreForecast.forEach(k=>{const m=metrics.find(x=>x.key===k),a=storeActual(k),t=state.storeTargets[k],f=forecastValue(a),r=rate(t,f),card=document.createElement('article');card.className='forecast-card';card.innerHTML=`<span>${m.label}</span><strong>${fmt(f)}</strong><small>目前 ${fmt(a)}｜目標 ${fmt(t)}</small><div class="forecast-rate ${rateClass(r)}Text">預估達成 ${rateText(r)}</div>`;el.appendChild(card)})}
function lagRows(){const rows=[],expected=expectedRate(),remainingDays=Math.max(daysInMonth()-currentDay(),0);state.people.forEach(p=>metrics.forEach(m=>{const t=num(p.data[m.key]?.target),a=num(p.data[m.key]?.actual);if(t<=0)return;const r=rate(t,a),expectedActual=t*expected/100;if(a+1e-9<expectedActual){rows.push({person:p.name,key:m.key,label:m.label,target:t,actual:a,currentRate:r,expectedRate:expected,gap:expectedActual-a,daily:remainingDays?Math.max(t-a,0)/remainingDays:Math.max(t-a,0),forecast:forecastValue(a),forecastRate:rate(t,forecastValue(a))})}}));return rows.sort((a,b)=>(b.expectedRate-b.currentRate)-(a.expectedRate-a.currentRate)||b.gap-a.gap)}
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
    const monthRemaining=Math.max(num(p.data[key]?.target)-num(p.data[key]?.actual),0);
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
  if(!state.people.length){body.innerHTML='<tr><td colspan="6">請先匯入 Excel。</td></tr>';return}
  state.people.forEach(p=>{const t=todayTargetsForPerson(p),st=personTodayStatus(p),tr=document.createElement('tr');tr.innerHTML=`<td><strong>${esc(p.name)}</strong></td>${coreForecast.map(k=>`<td><span class="today-number">+${fmt(t[k].remaining)}</span><small>${fmt(t[k].actual)}/${fmt(t[k].goal)}</small></td>`).join('')}<td><span class="rate-pill ${st.cls}">${st.text}</span></td>`;body.appendChild(tr)})
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
  $('sharePeople').innerHTML=state.people.map(p=>{const t=todayTargetsForPerson(p);return`<tr><td>${esc(p.name)}</td>${coreForecast.map(k=>`<td>+${fmt(t[k].remaining)}</td>`).join('')}</tr>`}).join('');
}
async function exportShareCard(){
  if(!state.people.length)return alert('請先匯入 Excel。');
  if(typeof html2canvas==='undefined')return alert('圖片輸出元件尚未載入，請確認網路後重新整理。');
  renderShareCard();const stage=document.querySelector('.share-card-stage');stage.classList.add('capturing');
  try{const canvas=await html2canvas($('shareCard'),{scale:2,backgroundColor:'#f6f3fb',useCORS:true});const a=document.createElement('a');a.href=canvas.toDataURL('image/png');a.download=`每日戰情_${dateKey()}.png`;a.click()}catch(e){console.error(e);alert('產生圖片失敗，請重新整理後再試。')}finally{stage.classList.remove('capturing')}
}
function renderPeople(){const el=$('peopleList');el.innerHTML='';if(!state.people.length){el.innerHTML='<div class="empty-state">請先匯入業績追蹤.xlsx。</div>';return}state.people.forEach((p,index)=>{const card=document.createElement('article');card.className='person-card';card.innerHTML=`<div class="person-card-header"><div><div class="person-name">${esc(p.name)}</div><div class="person-id">工號 ${esc(p.id)}</div></div><div class="person-actions"><button class="btn btn-soft btn-small" data-up>上移</button><button class="btn btn-soft btn-small" data-down>下移</button></div></div><div class="metric-grid"></div>`;const grid=card.querySelector('.metric-grid');metrics.forEach(m=>{const d=p.data[m.key],r=rate(d.target,d.actual),box=document.createElement('div');box.className='metric-box';box.innerHTML=`<h3>${m.label}</h3><div class="metric-inputs"><label>個人目標<input type="number" min="0" value="${num(d.target)}"></label><label>目前實績<input type="number" value="${num(d.actual)}" disabled></label></div><span class="rate-pill ${rateClass(r)}">${rateText(r)}</span>`;box.querySelector('input').addEventListener('change',e=>{d.target=num(e.target.value);renderAll()});grid.appendChild(box)});card.querySelector('[data-up]').addEventListener('click',()=>movePerson(index,-1));card.querySelector('[data-down]').addEventListener('click',()=>movePerson(index,1));el.appendChild(card)})}
function movePerson(i,d){const n=i+d;if(n<0||n>=state.people.length)return;[state.people[i],state.people[n]]=[state.people[n],state.people[i]];renderAll()}
function renderWeekly(){const week=Number($('weekSelect').value||weekOfDate(new Date())),el=$('weeklyList');el.innerHTML='';if(!state.people.length){el.innerHTML='<div class="empty-state">請先匯入業績追蹤.xlsx。</div>';return}state.people.forEach(p=>{ensurePerson(p.id,p.name);const card=document.createElement('article');card.className='weekly-card';card.innerHTML=`<div class="weekly-header"><div><strong>${esc(p.name)}</strong><div class="person-id">第 ${week} 週</div></div></div><div class="weekly-metrics"></div>`;const grid=card.querySelector('.weekly-metrics');metrics.forEach(m=>{const d=p.weekly[state.monthKey][week][m.key],r=rate(d.target,d.actual),box=document.createElement('div');box.className='weekly-metric';box.innerHTML=`<strong>${m.label}</strong><div class="weekly-numbers"><label>週目標<input type="number" min="0" value="${num(d.target)}"></label><label>週實績<input type="number" value="${num(d.actual)}" disabled></label></div><span class="rate-pill ${rateClass(r)}">${rateText(r)}</span>`;box.querySelector('input').addEventListener('change',e=>{d.target=num(e.target.value);renderAll()});grid.appendChild(box)});el.appendChild(card)})}
function autoAllocateRemaining(){
  if(!state.people.length)return alert('請先匯入 Excel。');
  const today=new Date(),cw=weekOfDate(today),ranges=weekRanges(today),totalDays=daysInMonth(today);
  state.people.forEach(p=>metrics.forEach(m=>{
    const monthTarget=num(p.data[m.key].target);if(monthTarget<=0)return;
    const monthActual=num(p.data[m.key].actual),remaining=Math.max(monthTarget-monthActual,0);
    const weights=[];let weightTotal=0;
    for(let w=cw;w<=4;w++){const start=w===cw?today.getDate():ranges[w-1].start,end=ranges[w-1].end,days=Math.max(end-start+1,0);weights.push({w,days});weightTotal+=days}
    let assigned=0;weights.forEach((x,idx)=>{const add=idx===weights.length-1?remaining-assigned:Math.round(remaining*x.days/Math.max(weightTotal,1));assigned+=add;const actual=num(p.weekly[state.monthKey][x.w][m.key].actual);p.weekly[state.monthKey][x.w][m.key].target=x.w===cw?actual+add:add});
  }));renderAll();alert('已依月底剩餘天數分配目前週至第 4 週的目標。')
}
function renderLag(){const rows=lagRows(),body=$('lagTableBody'),empty=$('lagEmpty'),summary=$('lagSummary');body.innerHTML='';const peopleCount=new Set(rows.map(x=>x.person)).size;const forecastRisk=rows.filter(x=>x.forecastRate!==null&&x.forecastRate<100).length;summary.innerHTML=`<div class="summary-card"><small>落後人員</small><strong>${peopleCount}</strong></div><div class="summary-card"><small>落後項目</small><strong>${rows.length}</strong></div><div class="summary-card"><small>月底預估未達項目</small><strong>${forecastRisk}</strong></div>`;empty.classList.toggle('hidden',rows.length>0);rows.forEach(x=>{const tr=document.createElement('tr');tr.innerHTML=`<td><strong>${esc(x.person)}</strong></td><td>${x.label}</td><td>${rateText(x.currentRate)}</td><td>${rateText(x.expectedRate)}</td><td class="negative">-${x.gap.toFixed(1)}</td><td>${x.daily.toFixed(1)}</td><td class="${x.forecastRate>=100?'positive':'negative'}">${rateText(x.forecastRate)}</td>`;body.appendChild(tr)})}
window.addEventListener('load',()=>{init();if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});});
})();
