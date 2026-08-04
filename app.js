(() => {
'use strict';
const STORAGE_KEY='banqiaoCommandCenter.v2.2';
const LEGACY_STORAGE_KEYS=['banqiaoCommandCenter.v2.1','banqiaoCommandCenter.m1.snapshots.v1'];
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
const state={monthKey:'',people:[],storeTargets:{},dailyLineSnapshots:{},dailyInsuranceSnapshots:{},meetingNotes:{},lastImport:null,lastImportTotals:null,todayDelta:null,diagnostics:null};
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
  $('meetingWeekSelect').addEventListener('change',()=>{renderMeeting();renderWeeklyReport()});
  $('reportWeekSelect').addEventListener('change',renderWeeklyReport);
  $('meetingCsvBtn').addEventListener('click',exportMeetingCsv);
  $('meetingPrintBtn').addEventListener('click',printMeeting);
  $('downloadWeeklyReportBtn').addEventListener('click',downloadWeeklyReport);
  $('printWeeklyReportBtn').addEventListener('click',printWeeklyReport);
}
function showPage(page){document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x.dataset.page===page));document.querySelectorAll('.page').forEach(x=>x.classList.remove('active'));$(`page-${page}`).classList.add('active')}
function save(show=false){localStorage.setItem(STORAGE_KEY,JSON.stringify(state));if(show)alert('目標與排序已儲存。')}
function load(){try{let raw=localStorage.getItem(STORAGE_KEY);if(!raw){for(const key of LEGACY_STORAGE_KEYS){raw=localStorage.getItem(key);if(raw)break}}const old=JSON.parse(raw||'null');if(old){Object.assign(state,old);state.monthKey=monthKey();if(!state.dailyLineSnapshots)state.dailyLineSnapshots={};if(!state.dailyInsuranceSnapshots)state.dailyInsuranceSnapshots={};if(!state.meetingNotes)state.meetingNotes={};metrics.forEach(m=>{if(state.storeTargets[m.key]===undefined)state.storeTargets[m.key]=0});state.people.forEach(p=>ensurePerson(p.id,p.name));rebuildLineActualsFromSnapshots()}}catch(e){console.warn(e)}}
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
function renderAll(){renderWeekOptions();renderStore();renderForecast();renderAiAnalysis();renderTodayMinimums();renderFocus();renderTodayTargets();renderPeople();renderWeekly();renderLag();renderMeeting();renderWeeklyReport();renderShareCard();renderGoalCard();if(state.lastImport){$('lastUpdated').textContent=new Date(state.lastImport.time).toLocaleString('zh-TW');$('lastUpdated').className='status-chip ok'}save()}
function renderWeekOptions(){const ranges=weekRanges(),html=ranges.map((r,i)=>`<option value="${i+1}">第 ${i+1} 週（${new Date().getMonth()+1}/${r.start}～${new Date().getMonth()+1}/${r.end}）</option>`).join('');['weekSelect','meetingWeekSelect','reportWeekSelect'].forEach(id=>{const select=$(id);if(!select)return;const current=select.value||String(weekOfDate(new Date()));select.innerHTML=html;select.value=current});}
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
function renderWeekly(){const week=Number($('weekSelect').value||weekOfDate(new Date())),el=$('weeklyList');el.innerHTML='';if(!state.people.length){el.innerHTML='<div class="empty-state">請先匯入業績追蹤.xlsx。</div>';return}state.people.forEach(p=>{ensurePerson(p.id,p.name);const card=document.createElement('article');card.className='weekly-card';card.innerHTML=`<div class="weekly-header"><div><strong>${esc(p.name)}</strong><div class="person-id">第 ${week} 週</div></div></div><div class="weekly-metrics"></div>`;const grid=card.querySelector('.weekly-metrics');metrics.forEach(m=>{const d=p.weekly[state.monthKey][week][m.key],r=rate(d.target,d.actual),box=document.createElement('div');box.className='weekly-metric';box.innerHTML=`<strong>${m.label}</strong><div class="weekly-numbers"><label>週目標<input type="number" min="0" value="${num(d.target)}"></label><label>週實績<input type="number" value="${num(d.actual)}" disabled></label></div><span class="rate-pill ${rateClass(r)}">${rateText(r)}</span><small class="weekly-remaining">尚需 ${fmt(Math.max(num(d.target)-num(d.actual),0))}</small>`;box.querySelector('input').addEventListener('change',e=>{d.target=num(e.target.value);renderAll()});grid.appendChild(box)});el.appendChild(card)})}
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
    rows.push({id:p.id,person:p.name,key:m.key,label:m.label,target,actual,gap:target-actual,currentRate:rate(target,actual),forecastRate:rate(num(p.data[m.key].target),forecastValue(num(p.data[m.key].actual)))});
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
  notePeople.forEach(p=>{const n=getMeetingNote(week,p.id),card=document.createElement('article');card.className='meeting-note-card';card.innerHTML=`<div class="meeting-note-head"><strong>${esc(p.name)}</strong><span>第 ${week} 週</span></div><label>本週問題<textarea data-field="issue" placeholder="例如：GA／NP 達成偏低">${esc(n.issue)}</textarea></label><label>下週改善<textarea data-field="action" placeholder="例如：每日主動邀約 1 件 GA／NP">${esc(n.action)}</textarea></label><label>下次追蹤<input data-field="followUp" type="date" value="${esc(n.followUp)}"></label>`;card.querySelectorAll('[data-field]').forEach(el=>el.addEventListener('input',e=>{n[e.target.dataset.field]=e.target.value;save()}));notes.appendChild(card)});
  const nextBody=$('nextWeekBody');nextBody.innerHTML='';const next=Math.min(week+1,4);state.people.forEach(p=>{const tr=document.createElement('tr');const values=coreForecast.map(k=>week<4?num(p.weekly?.[state.monthKey]?.[next]?.[k]?.target):Math.max(num(p.data[k].target)-num(p.data[k].actual),0));tr.innerHTML=`<td><strong>${esc(p.name)}</strong></td>${values.map(v=>`<td>${fmt(v)}</td>`).join('')}`;nextBody.appendChild(tr)});
}
function csvEscape(v){return `"${String(v??'').replace(/"/g,'""')}"`}
function downloadText(filename,text,type='text/plain;charset=utf-8'){const blob=new Blob(['\ufeff'+text],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
function exportMeetingCsv(){
  if(!state.people.length)return alert('請先匯入 Excel。');const week=selectedMeetingWeek(),rows=[['板橋戰情中心','第'+week+'週會議'],[],['本週全店 KPI','目標','實績','完成率','差距']];
  coreForecast.forEach(k=>{const m=metrics.find(x=>x.key===k),t=weekStoreValue(week,k,'target'),a=weekStoreValue(week,k,'actual');rows.push([m.label,t,a,rateText(rate(t,a)),a-t])});
  rows.push([],['本週落後人員','項目','週目標','週實績','完成率','還差','月底預估']);weekLagRows(week).forEach(x=>rows.push([x.person,x.label,x.target,x.actual,rateText(x.currentRate),x.gap,rateText(x.forecastRate)]));
  rows.push([],['改善事項','本週問題','下週改善','下次追蹤']);performancePeople().forEach(p=>{const n=getMeetingNote(week,p.id);if(n.issue||n.action||n.followUp)rows.push([p.name,n.issue,n.action,n.followUp])});
  downloadText(`星期日會議_第${week}週_${dateKey()}.csv`,rows.map(r=>r.map(csvEscape).join(',')).join('\n'),'text/csv;charset=utf-8');
}
function meetingPrintHtml(week){
  const lag=weekLagRows(week),kpis=coreForecast.map(k=>{const m=metrics.find(x=>x.key===k),t=weekStoreValue(week,k,'target'),a=weekStoreValue(week,k,'actual');return `<tr><td>${m.label}</td><td>${fmt(t)}</td><td>${fmt(a)}</td><td>${rateText(rate(t,a))}</td><td>${a>=t?`+${fmt(a-t)}`:`-${fmt(t-a)}`}</td></tr>`}).join('');
  const people=lag.map(x=>`<tr><td>${esc(x.person)}</td><td>${x.label}</td><td>${fmt(x.target)}</td><td>${fmt(x.actual)}</td><td>${rateText(x.currentRate)}</td><td>-${fmt(x.gap)}</td><td>${rateText(x.forecastRate)}</td></tr>`).join('')||'<tr><td colspan="7">本週無落後項目</td></tr>';
  const notes=performancePeople().map(p=>{const n=getMeetingNote(week,p.id);return n.issue||n.action||n.followUp?`<tr><td>${esc(p.name)}</td><td>${esc(n.issue)}</td><td>${esc(n.action)}</td><td>${esc(n.followUp)}</td></tr>`:''}).join('')||'<tr><td colspan="4">尚無改善事項紀錄</td></tr>';
  return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><title>第${week}週會議</title><style>body{font-family:-apple-system,BlinkMacSystemFont,"Microsoft JhengHei",sans-serif;color:#211b2c;padding:28px}h1{margin:0 0 4px}h2{margin-top:26px}p{color:#666}table{width:100%;border-collapse:collapse;margin-top:10px}th,td{border:1px solid #ddd;padding:8px;text-align:left;font-size:12px}th{background:#f3eefb}.ai{padding:14px;background:#f3eefb;border-radius:12px}.ai p{margin:5px 0;color:#211b2c}@media print{button{display:none}}</style></head><body><h1>板橋戰情中心</h1><p>${state.monthKey}｜第 ${week} 週星期日會議</p><h2>本週全店 KPI</h2><table><thead><tr><th>KPI</th><th>週目標</th><th>週實績</th><th>完成率</th><th>差距</th></tr></thead><tbody>${kpis}</tbody></table><h2>本週落後人員</h2><table><thead><tr><th>人員</th><th>項目</th><th>目標</th><th>實績</th><th>完成率</th><th>還差</th><th>月底預估</th></tr></thead><tbody>${people}</tbody></table><h2>店長分析</h2><div class="ai">${meetingAiLines(week).map(x=>`<p>${esc(x)}</p>`).join('')}</div><h2>改善事項</h2><table><thead><tr><th>人員</th><th>本週問題</th><th>下週改善</th><th>下次追蹤</th></tr></thead><tbody>${notes}</tbody></table><script>window.onload=()=>window.print()<\/script></body></html>`;
}
function openPrintWindow(html){const w=window.open('','_blank');if(!w)return alert('瀏覽器阻擋了列印視窗，請允許彈出式視窗。');w.document.open();w.document.write(html);w.document.close()}
function printMeeting(){if(!state.people.length)return alert('請先匯入 Excel。');openPrintWindow(meetingPrintHtml(selectedMeetingWeek()))}
function weeklyReportData(week){
  const range=weekRanges()[week-1],lag=weekLagRows(week),store=coreForecast.map(k=>{const m=metrics.find(x=>x.key===k),target=weekStoreValue(week,k,'target'),actual=weekStoreValue(week,k,'actual');return{label:m.label,target,actual,r:rate(target,actual)}});
  const highlights=store.filter(x=>x.r!==null&&x.r>=100).sort((a,b)=>b.r-a.r),risks=store.filter(x=>x.r!==null&&x.r<100).sort((a,b)=>a.r-b.r);
  return{week,range,store,lag,highlights,risks,ai:meetingAiLines(week)};
}
function weeklyReportText(week){const d=weeklyReportData(week);return [`板橋戰情中心｜第 ${week} 週店長週報`,`期間：${new Date().getMonth()+1}/${d.range.start}～${new Date().getMonth()+1}/${d.range.end}`,'','一、本週 KPI',...d.store.map(x=>`${x.label}：${fmt(x.actual)} / ${fmt(x.target)}（${rateText(x.r)}）`),'','二、本週亮點',...(d.highlights.length?d.highlights.map(x=>`${x.label} 已達標，完成率 ${rateText(x.r)}。`):['本週尚無已達標的全店核心 KPI。']),'','三、落後狀況',...(d.lag.length?d.lag.slice(0,10).map(x=>`${x.person}－${x.label}：${fmt(x.actual)} / ${fmt(x.target)}，還差 ${fmt(x.gap)}。`):['本週無落後項目。']),'','四、店長分析',...d.ai.map(x=>`・${x}`),'','五、下週行動',...performancePeople().map(p=>{const n=getMeetingNote(week,p.id);return n.action?`${p.name}：${n.action}`:''}).filter(Boolean)].join('\n')}
function renderWeeklyReport(){const el=$('weeklyReportContent');if(!el)return;const week=selectedReportWeek(),d=weeklyReportData(week),text=weeklyReportText(week);el.innerHTML=`<header><span class="report-kicker">第 ${week} 週</span><h2>店長週報</h2><p>${new Date().getMonth()+1}/${d.range.start}～${new Date().getMonth()+1}/${d.range.end}</p></header><section><h3>本週 KPI</h3><div class="report-kpi-grid">${d.store.map(x=>`<div><span>${x.label}</span><strong>${fmt(x.actual)} / ${fmt(x.target)}</strong><small class="${rateClass(x.r)}Text">${rateText(x.r)}</small></div>`).join('')}</div></section><section><h3>本週亮點</h3><ul>${(d.highlights.length?d.highlights.map(x=>`${x.label} 已達標，完成率 ${rateText(x.r)}。`):['本週尚無已達標的全店核心 KPI。']).map(x=>`<li>${esc(x)}</li>`).join('')}</ul></section><section><h3>落後與追蹤</h3>${d.lag.length?`<ul>${d.lag.slice(0,10).map(x=>`<li><strong>${esc(x.person)}</strong>｜${esc(x.label)} 還差 ${fmt(x.gap)}，月底預估 ${rateText(x.forecastRate)}</li>`).join('')}</ul>`:'<p>本週無落後項目。</p>'}</section><section><h3>店長分析</h3><ul>${d.ai.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></section><section><h3>下週行動</h3><ul>${performancePeople().map(p=>{const n=getMeetingNote(week,p.id);return n.action?`<li><strong>${esc(p.name)}</strong>：${esc(n.action)}</li>`:''}).filter(Boolean).join('')||'<li>尚未填寫改善事項。</li>'}</ul></section><textarea class="report-source" aria-label="週報純文字">${esc(text)}</textarea>`}
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
  bind();renderAll();
}
function bind(){
  $('importBtn').addEventListener('click',()=>$('fileInput').click());
  $('fileInput').addEventListener('change',e=>{const f=e.target.files?.[0];if(f)importWorkbook(f);e.target.value=''});
  $('scheduleImportBtn')?.addEventListener('click',()=>$('scheduleFileInput').click());
  $('scheduleFileInput')?.addEventListener('change',e=>{const f=e.target.files?.[0];if(f)importScheduleWorkbook(f);e.target.value=''});
  $('scheduleDate')?.addEventListener('change',()=>renderSchedule());
  $('managerIdsInput')?.addEventListener('change',e=>{state.managerIds=String(e.target.value||'5052').split(/[,，\s]+/).filter(Boolean);save();renderAll()});
  $('shareCardBtn').addEventListener('click',exportShareCard);$('goalCardBtn')?.addEventListener('click',exportGoalCard);$('saveBtn').addEventListener('click',()=>save(true));$('autoAllocateBtn').addEventListener('click',autoAllocateRemaining);
  document.querySelectorAll('.tab').forEach(btn=>btn.addEventListener('click',()=>showPage(btn.dataset.page)));
  $('weekSelect').addEventListener('change',renderWeekly);$('meetingWeekSelect').addEventListener('change',()=>{renderMeeting();renderWeeklyReport()});$('reportWeekSelect').addEventListener('change',renderWeeklyReport);
  $('meetingCsvBtn').addEventListener('click',exportMeetingCsv);$('meetingPrintBtn').addEventListener('click',printMeeting);$('downloadWeeklyReportBtn').addEventListener('click',downloadWeeklyReport);$('printWeeklyReportBtn').addEventListener('click',printWeeklyReport);
}
function load(){
  try{let raw=localStorage.getItem(STORAGE_KEY);if(!raw){for(const key of LEGACY_STORAGE_KEYS){raw=localStorage.getItem(key);if(raw)break}}const old=JSON.parse(raw||'null');if(old)Object.assign(state,old)}catch(e){console.warn(e)}
  state.monthKey=monthKey();if(!state.dailyLineSnapshots)state.dailyLineSnapshots={};if(!state.dailyInsuranceSnapshots)state.dailyInsuranceSnapshots={};if(!state.meetingNotes)state.meetingNotes={};if(!state.people)state.people=[];if(!state.storeTargets)state.storeTargets={};
  metrics.forEach(m=>{if(state.storeTargets[m.key]===undefined)state.storeTargets[m.key]=0});state.people.forEach(p=>ensurePerson(p.id,p.name));ensureOpsState();rebuildLineActualsFromSnapshots();
}
function lagRows(){
  const rows=[],expected=expectedRate();performancePeople().forEach(p=>metrics.forEach(m=>{const t=num(p.data[m.key]?.target),a=num(p.data[m.key]?.actual);if(t<=0)return;const expectedActual=t*expected/100;if(a+1e-9<expectedActual){const workdays=Math.max(remainingWorkdays(p.id),1),f=a/workdays*(workdays)+a;rows.push({id:p.id,person:p.name,key:m.key,label:m.label,target:t,actual:a,currentRate:rate(t,a),expectedRate:expected,gap:expectedActual-a,daily:Math.max(t-a,0)/workdays,forecast:forecastValue(a),forecastRate:rate(t,forecastValue(a))})}}));
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
  people.forEach((p,index)=>{const card=document.createElement('article');card.className='person-card';card.innerHTML=`<div class="person-card-header"><div><div class="person-name">${esc(p.name)}</div><div class="person-id">工號 ${esc(p.id)}</div></div><div class="person-actions"><button class="btn btn-soft btn-small" data-up>上移</button><button class="btn btn-soft btn-small" data-down>下移</button></div></div><div class="metric-grid"></div>`;const grid=card.querySelector('.metric-grid');metrics.forEach(m=>{const d=p.data[m.key],r=rate(d.target,d.actual),box=document.createElement('div');box.className='metric-box';box.innerHTML=`<h3>${m.label}</h3><div class="metric-inputs"><label>個人目標<input type="number" min="0" value="${num(d.target)}"></label><label>目前實績<input type="number" value="${num(d.actual)}" disabled></label></div><span class="rate-pill ${rateClass(r)}">${rateText(r)}</span>`;box.querySelector('input').addEventListener('change',e=>{d.target=num(e.target.value);renderAll()});grid.appendChild(box)});card.querySelector('[data-up]').addEventListener('click',()=>moveVisiblePerson(p.id,-1));card.querySelector('[data-down]').addEventListener('click',()=>moveVisiblePerson(p.id,1));el.appendChild(card)})
}
function moveVisiblePerson(id,dir){const visible=performancePeople(),i=visible.findIndex(p=>p.id===id),n=i+dir;if(i<0||n<0||n>=visible.length)return;const ai=state.people.findIndex(p=>p.id===visible[i].id),bi=state.people.findIndex(p=>p.id===visible[n].id);[state.people[ai],state.people[bi]]=[state.people[bi],state.people[ai]];renderAll()}
function renderTodayTargets(){
  const body=$('todayTargetBody');body.innerHTML='';const people=todayWorkingPeople();if(!people.length){body.innerHTML='<tr><td colspan="6">今天沒有可分配目標的銷售人員，或尚未匯入班表。</td></tr>';return}
  people.forEach(p=>{const t=todayTargetsForPerson(p),status=personTodayStatus(p),tr=document.createElement('tr');tr.innerHTML=`<td><strong>${esc(p.name)}</strong></td>${coreForecast.map(k=>`<td><span class="today-number">${fmt(t[k].remaining)}</span><small>今日已完成 ${fmt(t[k].actual)}</small></td>`).join('')}<td><span class="rate-pill ${status.className}">${status.label}</span></td>`;body.appendChild(tr)})
}
function renderShareCard(){
  $('shareDate').textContent=`${new Date().toLocaleDateString('zh-TW')}（${weekdayText()}）`;$('shareWeek').textContent=`第 ${weekOfDate(new Date())} 週`;
  const kpi=$('shareKpiGrid');kpi.innerHTML='';coreForecast.forEach(k=>{const m=metrics.find(x=>x.key===k),a=storeActual(k),t=state.storeTargets[k],r=rate(t,a),div=document.createElement('div');div.className=`share-kpi ${rateClass(r)}`;div.innerHTML=`<span>${m.label}</span><strong>${fmt(a)} / ${fmt(t)}</strong><small>${rateText(r)}</small>`;kpi.appendChild(div)});
  $('shareMinGrid').innerHTML=coreForecast.map(k=>`<div><span>${metrics.find(x=>x.key===k).label}</span><strong>+${fmt(storeTodayMinimum(k))}</strong></div>`).join('');
  const warnings=storeWarnings();$('shareWarnings').innerHTML=warnings.length?warnings.map(x=>`<div class="share-alert">${esc(x.label)}落後 ${fmt(x.gap)} 件</div>`).join(''):'<div class="share-ok">今日進度正常</div>';
  const tracking=lagRows().slice(0,5);$('shareTracking').innerHTML=tracking.length?tracking.map(x=>`<div class="share-track"><strong>${esc(x.person)}｜${esc(x.label)}</strong><span>落後 ${fmt(x.gap)}</span></div>`).join(''):'<div class="share-ok">目前無需追蹤人員</div>';
  $('sharePeople').innerHTML=todayWorkingPeople().map(p=>{const t=todayTargetsForPerson(p);return `<tr><td><strong>${esc(p.name)}</strong></td>${coreForecast.map(k=>`<td>${fmt(t[k].remaining)}</td>`).join('')}</tr>`}).join('')||'<tr><td colspan="5">今日無銷售人員排班</td></tr>';
}

function renderGoalCard(){
  if(!$('goalCard'))return;
  const now=new Date();
  $('goalCardDate').textContent=`${now.toLocaleDateString('zh-TW')}（${weekdayText(now)}）`;
  $('goalCardWeek').textContent=`第 ${weekOfDate(now)} 週`;
  $('goalStoreGrid').innerHTML=coreForecast.map(k=>`<div><span>${esc(metrics.find(m=>m.key===k).label)}</span><strong>${fmt(storeTodayMinimum(k))}</strong></div>`).join('');
  const people=todayWorkingPeople();
  $('goalPeople').innerHTML=people.map(p=>{const t=todayTargetsForPerson(p);return `<tr><td><strong>${esc(p.name)}</strong></td>${coreForecast.map(k=>`<td>${fmt(t[k].remaining)}</td>`).join('')}</tr>`}).join('')||'<tr><td colspan="5">今日無銷售人員排班</td></tr>';
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
    const canvas=await html2canvas($('goalCard'),{scale:2,backgroundColor:'#f6f3fb',useCORS:true});
    const a=document.createElement('a');a.href=canvas.toDataURL('image/png');a.download=`今日目標_${dateKey()}.png`;a.click();
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
function weekLagRows(){
  return performancePeople().flatMap(p=>coreForecast.map(k=>{const t=num(p.data[k]?.target),a=num(p.data[k]?.actual),f=forecastValue(a),fr=rate(t,f);if(t<=0||fr===null||fr>=100)return null;return{id:p.id,person:p.name,key:k,label:metrics.find(m=>m.key===k).label,target:t,actual:a,currentRate:rate(t,a),gap:Math.max(t-a,0),forecastRate:fr}}).filter(Boolean)).sort((a,b)=>a.forecastRate-b.forecastRate||b.gap-a.gap)
}
function renderMeeting(){
  ensureOpsState();const week=selectedMeetingWeek(),lag=weekLagRows(),summary=$('meetingSummary'),peopleCount=new Set(lag.map(x=>x.id)).size,storeRates=coreForecast.map(k=>rate(weekStoreValue(week,k,'target'),weekStoreValue(week,k,'actual'))).filter(x=>x!==null),avg=storeRates.length?storeRates.reduce((a,b)=>a+b,0)/storeRates.length:0;
  summary.innerHTML=`<div class="summary-card"><small>會議週次</small><strong>第 ${week} 週</strong></div><div class="summary-card"><small>本週平均完成率</small><strong>${avg.toFixed(1)}%</strong></div><div class="summary-card"><small>追蹤人員</small><strong>${peopleCount}</strong></div><div class="summary-card"><small>今日可銷售人力</small><strong>${todayManpower().filter(x=>isWorkingStatus(x.status)&&!x.manager).length}</strong></div>`;
  const kpiBody=$('meetingKpiBody');kpiBody.innerHTML='';coreForecast.forEach(k=>{const m=metrics.find(x=>x.key===k),t=weekStoreValue(week,k,'target'),a=weekStoreValue(week,k,'actual'),r=rate(t,a),tr=document.createElement('tr');tr.innerHTML=`<td><strong>${m.label}</strong></td><td>${fmt(t)}</td><td>${fmt(a)}</td><td><span class="rate-pill ${rateClass(r)}">${rateText(r)}</span></td><td class="${a>=t?'positive':'negative'}">${a>=t?`+${fmt(a-t)}`:`-${fmt(t-a)}`}</td>`;kpiBody.appendChild(tr)});
  const peopleBody=$('meetingPeopleBody'),empty=$('meetingPeopleEmpty');peopleBody.innerHTML='';empty.classList.toggle('hidden',lag.length>0);lag.forEach(x=>{const tr=document.createElement('tr');tr.innerHTML=`<td><strong>${esc(x.person)}</strong></td><td>${esc(x.label)}</td><td>${fmt(x.target)}</td><td>${fmt(x.actual)}</td><td><span class="rate-pill ${rateClass(x.currentRate)}">${rateText(x.currentRate)}</span></td><td class="negative">-${fmt(x.gap)}</td><td class="negative">${rateText(x.forecastRate)}</td>`;peopleBody.appendChild(tr)});
  $('meetingAiPanel').innerHTML=`<div class="ai-summary"><div class="ai-icon">AI</div><div>${meetingAiLines(week).map(x=>`<p>${esc(x)}</p>`).join('')}</div></div>`;
  const notes=$('meetingNotesList');notes.innerHTML='';const notePeople=lag.length?[...new Map(lag.map(x=>[x.id,{id:x.id,name:x.person}])).values()]:performancePeople();notePeople.forEach(p=>{const n=getMeetingNote(week,p.id),card=document.createElement('article');card.className='meeting-note-card';card.innerHTML=`<div class="meeting-note-head"><strong>${esc(p.name)}</strong><span>第 ${week} 週</span></div><label>本週問題<textarea data-field="issue">${esc(n.issue)}</textarea></label><label>下週改善<textarea data-field="action">${esc(n.action)}</textarea></label><label>下次追蹤<input data-field="followUp" type="date" value="${esc(n.followUp)}"></label>`;card.querySelectorAll('[data-field]').forEach(el=>el.addEventListener('input',e=>{n[e.target.dataset.field]=e.target.value;save()}));notes.appendChild(card)});
  const nextBody=$('nextWeekBody');nextBody.innerHTML='';const next=Math.min(week+1,4),tr=document.createElement('tr');tr.innerHTML=`<td><strong>全店</strong></td>${coreForecast.map(k=>`<td>${fmt(state.storeWeeklyTargets[state.monthKey][next][k].target)}</td>`).join('')}`;nextBody.appendChild(tr)
}
function renderSchedule(){
  ensureOpsState();const dk=$('scheduleDate')?.value||dateKey(),body=$('scheduleBody'),summary=$('scheduleSummary'),grid=$('scheduleDaysGrid');if(!body)return;body.innerHTML='';const ids=new Set([...Object.keys(scheduleMonth()?.[dk]||{}),...state.people.map(p=>p.id),...Object.keys(state.schedulePeople)]),rows=[];
  ids.forEach(id=>{const sp=state.schedulePeople[id]||{},p=state.people.find(x=>x.id===id),name=sp.name||p?.name||id,code=baseShift(dk,id),status=effectiveScheduleStatus(dk,id),manager=isManagerId(id);rows.push({id,name,code,status,manager})});rows.sort((a,b)=>a.id.localeCompare(b.id));
  const working=rows.filter(x=>isWorkingStatus(x.status)),sales=working.filter(x=>!x.manager),off=rows.filter(x=>!isWorkingStatus(x.status));summary.innerHTML=`<div class="summary-card"><small>當日總人力</small><strong>${working.length}</strong></div><div class="summary-card"><small>可分配業績人員</small><strong>${sales.length}</strong></div><div class="summary-card"><small>店長人力</small><strong>${working.filter(x=>x.manager).length}</strong></div><div class="summary-card"><small>休假／訓練／請假</small><strong>${off.length}</strong></div>`;
  rows.forEach(x=>{const tr=document.createElement('tr'),key=scheduleOverrideKey(dk,x.id),label={work:'上班',off:'休假',training:'教育訓練',annual:'特休',sick:'病假',personal:'事假',otherLeave:'其他請假'}[x.status]||'未設定';tr.innerHTML=`<td>${esc(x.id)}${x.manager?' <span class="manager-badge">店長</span>':''}</td><td><strong>${esc(x.name)}</strong></td><td>${esc(x.code||'—')}</td><td>${esc(label)}</td><td><select class="select-inline"><option value="">依班表</option><option value="work">上班</option><option value="off">休假</option><option value="training">教育訓練</option><option value="annual">特休</option><option value="sick">病假</option><option value="personal">事假</option><option value="otherLeave">其他請假</option></select></td><td>${isWorkingStatus(x.status)&&!x.manager?'✅':x.manager&&isWorkingStatus(x.status)?'計入人力／不列個人業績':'—'}</td>`;const sel=tr.querySelector('select');sel.value=state.scheduleOverrides[key]||'';sel.addEventListener('change',e=>{if(e.target.value)state.scheduleOverrides[key]=e.target.value;else delete state.scheduleOverrides[key];save();renderAll()});body.appendChild(tr)});
  grid.innerHTML='';performancePeople().forEach(p=>{const div=document.createElement('div');div.className='summary-card';div.innerHTML=`<small>${esc(p.name)}</small><strong>${remainingWorkdays(p.id,new Date(dk+'T12:00:00'))}</strong><span>剩餘工作天</span>`;grid.appendChild(div)})
}
function renderAll(){renderWeekOptions();renderStore();renderForecast();renderAiAnalysis();renderTodayMinimums();renderFocus();renderTodayTargets();renderPeople();renderSchedule();renderWeekly();renderLag();renderMeeting();renderWeeklyReport();renderShareCard();renderGoalCard();if(state.lastImport){$('lastUpdated').textContent=new Date(state.lastImport.time).toLocaleString('zh-TW');$('lastUpdated').className='status-chip ok'}save()}

window.addEventListener('load',()=>{init();if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});});
})();
