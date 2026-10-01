import { updateQuery, useLocation, useQueryState } from "@/lib/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { getMeta, localFinance, localSales, putMeta, saveFinance } from "@/lib/local-db";
import { addTotals, dateRange, emptyTotals, money, reportHours, reportProducts, shiftDate, storeDate } from "@/lib/reports";
import { IdrInput } from "@/components/idr-input";

import { ReportSummary, TrendChart, ProductSales, ReportInsights, ComparisonChart } from "@/components/report-charts";

function RangeFilter({ range, onChange }) {
  const today = storeDate();
  return <div className="report-filter"><label>Period<select value={range.days} onChange={(event) => { const days=event.target.value; onChange(days === "custom" ? {...range,days} : days === "last" ? {days,count:30,from:shiftDate(today,-29),to:today} : {days,from:shiftDate(today,1-Number(days)),to:today}); }}><option value="7">Last 7 days</option><option value="14">Last 14 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="last">Last X days</option><option value="custom">Custom dates</option></select></label>{range.days==="last"&&<label>Days<input type="number" min="1" max="366" step="1" value={range.count} onChange={(e)=>{const count=e.target.value;onChange({...range,count,from:count && Number.isInteger(Number(count)) && Number(count)>=1 && Number(count)<=366?shiftDate(today,1-Number(count)):"",to:today});}}/></label>}<label>From<input type="date" required max={range.to} value={range.from} onChange={(e)=>onChange({...range,days:"custom",from:e.target.value})} /></label><label>To<input type="date" required min={range.from} max={today} value={range.to} onChange={(e)=>onChange({...range,days:"custom",to:e.target.value})} /></label></div>;
}
const initialRange = () => ({days:"30",from:shiftDate(storeDate(),-29),to:storeDate()});
function useRange() {
  const {query}=useLocation();const fallback=initialRange();
  const range={days:query.get("period")||(query.has("from")||query.has("to")?"custom":fallback.days),count:query.get("days")||30,from:query.get("from")??fallback.from,to:query.get("to")??fallback.to};
  return [range,(next)=>updateQuery({period:next.days,days:next.days==="last"?next.count:null,from:next.from,to:next.to})];
}
const validDate=(value)=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(new Date(`${value}T00:00:00Z`).getTime())&&new Date(`${value}T00:00:00Z`).toISOString().slice(0,10)===value;
const validRange=(range)=>validDate(range.from)&&validDate(range.to)&&range.from<=range.to&&range.to<=storeDate()&&(new Date(range.to)-new Date(range.from))/86400000<=365;

export function FinancePage({ api, db, auth, pending, onNotice, onSaved }) {
  const [range,setRange]=useRange();
  const [rows,setRows]=useState([]);
  const [recordStatus,setRecordStatus]=useQueryState("status");
  const trash=recordStatus==="deleted"&&auth.is_superadmin;
  const setTrash=(deleted)=>setRecordStatus(deleted?"deleted":null);
  const [status,setStatus]=useState("");
  const [busy,setBusy]=useState(false);
  const generation=useRef(0);
  const blank=()=>({mode:"expense",category:"Staff pay",description:"",amount:"",date:storeDate(),hour:new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Jakarta",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(new Date())});
  const [form,setForm]=useState(blank);
  const admin=["owner","admin"].includes(auth.role)||auth.is_superadmin;
  const cacheKey=`finance:${auth.store_id}:${range.from}:${range.to}:${trash}`;
  async function load() {
    if (!db || !validRange(range)) return;
    const current=++generation.current;
    let cached=await getMeta(db,cacheKey),remote=Array.isArray(cached)?cached:cached?.entries||[];
    try {remote=await api(`/stores/${auth.store_id}/finance?from=${range.from}&to=${range.to}&trash=${trash}`);cached={entries:remote,generated_at:new Date().toISOString()};await putMeta(db,cacheKey,cached);setStatus("Synced records and pending records on this device.");}
    catch {setStatus("Offline. Cached records and pending records on this device are shown.");}
    const local=trash?[]:(await localFinance(db,auth.store_id)).filter((row)=>(row.sync_status==="pending" || row.synced_at && new Date(row.synced_at)>new Date(cached?.generated_at||0)) && storeDate(row.occurred_at)>=range.from && storeDate(row.occurred_at)<=range.to);
    const ids=new Set(remote.map((row)=>row.id));
    if(current!==generation.current)return;
    setRows([...remote,...local.filter((row)=>!ids.has(row.id))].sort((a,b)=>new Date(b.occurred_at)-new Date(a.occurred_at)));
  }
  useEffect(()=>{load();return()=>{generation.current++;};},[db,auth.store_id,range.from,range.to,trash,pending]);
  async function save(event) {
    event.preventDefault();
    if (!db || busy) return;
    if (new Date(auth.offline_expires_at)<=new Date()) {onNotice("Sign in online again before you record an entry.");return;}
    const amount=Number(form.amount);
    const occurredAt=new Date(`${form.date}T${form.hour}:00+07:00`);
    if (!Number.isSafeInteger(amount) || amount<1 || amount>1e12 || !form.category.trim() || !form.description.trim() || !Number.isFinite(occurredAt.getTime()) || occurredAt>new Date()) {onNotice("Check the amount, category, description, and date.");return;}
    setBusy(true);
    try {
      await saveFinance(db,{id:crypto.randomUUID(),store_id:auth.store_id,created_by:auth.user_id,mode:form.mode,category:form.category.trim(),description:form.description.trim(),amount,occurred_at:occurredAt.toISOString()});
      setForm(blank());onNotice("Record saved on this device.");onSaved();load().catch(()=>onNotice("Record saved. Reload the page to see the list."));
    } catch {onNotice("Record was not saved. Keep the form and try again.");}
    finally {setBusy(false);}
  }
  async function change(row) {
    if (!trash && !confirm("Move this financial record to deleted records?")) return;
    try {await api(`/stores/${auth.store_id}/finance/${row.id}${trash?"/restore":""}`,{method:trash?"POST":"DELETE"});await load();}
    catch (error) {onNotice(error.message);}
  }
  return <section className="products-page"><div className="page-heading"><small>FINANCES</small><h1>Income and expenses</h1><p>Record staff pay and other store income or expenses. Do not record checkout sales again.</p></div>
    <form className="form-card product-form" onSubmit={save}><h2>New record</h2><div className="form-grid"><label>Type<select value={form.mode} onChange={(e)=>setForm({...form,mode:e.target.value})}><option value="expense">Expense</option><option value="income">Income</option></select></label><label>Category<input required list="finance-categories" maxLength={80} value={form.category} onChange={(e)=>setForm({...form,category:e.target.value})}/><datalist id="finance-categories">{["Staff pay","Rent","Utilities","Transport","Supplies","Other income","Other"].map((category)=><option key={category} value={category}/>)}</datalist></label><label>Amount (IDR)<IdrInput required min={1} value={form.amount} onValueChange={(amount)=>setForm({...form,amount})}/></label><label>Date (WIB)<input required type="date" max={storeDate()} value={form.date} onChange={(e)=>setForm({...form,date:e.target.value})}/></label><label>Time (WIB)<input required type="time" value={form.hour} onChange={(e)=>setForm({...form,hour:e.target.value})}/></label><label>Description<input required maxLength={1000} placeholder="Daily pay for two staff" value={form.description} onChange={(e)=>setForm({...form,description:e.target.value})}/></label></div><div className="form-actions"><button className="button primary" disabled={busy||!db}>{busy?"Saving…":"Save record"}</button></div></form>
    <div className="heading-row"><RangeFilter range={range} onChange={setRange}/>{auth.is_superadmin&&<button className="button secondary" onClick={()=>setTrash(!trash)}>{trash?"Active records":"Deleted records"}</button>}</div>
    {!validRange(range)?<p className="message">Select up to 366 days, ending today or earlier.</p>:<><p className="report-status" role="status">{status}</p><div className="table-card orders-scroll"><table className="orders-table finance-table"><thead><tr><th>Date (WIB)</th><th>Type</th><th>Category</th><th>Description</th><th>Amount</th><th>Status</th>{admin&&<th>Action</th>}</tr></thead><tbody>{rows.map((row)=><tr key={row.id}><td>{new Date(row.occurred_at).toLocaleString("en-GB",{timeZone:"Asia/Jakarta"})}</td><td>{row.mode}</td><td>{row.category}</td><td>{row.description}</td><td>{money(row.amount)}</td><td>{row.sync_status==="pending"?"Pending sync":trash?"Deleted":"Synced"}</td>{admin&&<td>{row.sync_status!=="pending"&&(!trash||auth.is_superadmin)&&<button className="button secondary" onClick={()=>change(row)}>{trash?"Restore":"Delete"}</button>}</td>}</tr>)}</tbody></table>{!rows.length&&<div className="empty">No records in this period.</div>}{rows.length>=5000&&<p className="message">Only the latest 5,000 records are shown. Select a shorter period.</p>}</div></>}
  </section>;
}

function ReportDataTable({rows,onSelect,hourly=false,earningsMode="gross"}) {
  return <div className="table-card orders-scroll"><table className="orders-table report-table"><thead><tr><th>{hourly?"Hour (WIB)":"Date (WIB)"}</th><th>Orders</th><th>Units sold</th>{earningsMode==="net"&&<><th>Sales before tax</th><th>Costs</th><th>Income</th><th>Expenses</th></>}<th>{earningsMode==="gross"?"Gross earnings":"Net earnings"}</th></tr></thead><tbody>{rows.map((row)=><tr key={row.label}><td>{onSelect?<button className="link-button" onClick={()=>onSelect(row.label)}>{row.label}</button>:row.label}</td><td>{row.orders}</td><td>{row.units.toLocaleString("en-GB")}</td>{earningsMode==="net"&&<><td>{money(row.revenue)}</td><td>{row.missing_costs?"Incomplete":money(row.cost)}</td><td>{money(row.income)}</td><td>{money(row.expense)}</td></>}<td>{earningsMode==="gross"?money(row.revenue):row.missing_costs?"Incomplete":money(row.net)}</td></tr>)}</tbody></table></div>;
}

export function ReportsPage({api,db,auth,pending}) {
  const [range,setRange]=useRange();
  const [hours,setHours]=useState([]);
  const [products,setProducts]=useState([]);
  const [status,setStatus]=useState("Loading report…");
  const {pathname,query}=useLocation();
  const reportTab=pathname==="/reports/comparison"||query.get("view")==="comparison"?"comparison":"overview";
  const earningsMode=query.get("earnings")==="net"?"net":"gross";
  const day=pathname.match(/^\/reports\/day\/(\d{4}-\d{2}-\d{2})$/)?.[1];
  const selected=day&&validDate(day)&&day<=storeDate()?day:null;
  const queryMetric=query.get("metric") || (earningsMode==="net"?"net":"revenue");
  const metric=["revenue","net","units","orders","expense"].includes(queryMetric)?queryMetric:"revenue";
  const [refresh,setRefresh]=useState(0);
  const [busy,setBusy]=useState(false);
  const heading=useRef(null);
  const today=storeDate();
  const valid=validRange(range);

  useEffect(()=>{heading.current?.focus({preventScroll:true});heading.current?.scrollIntoView({block:"start"});},[selected]);
  function openDay(date){updateQuery({view:reportTab,period:range.days,from:range.from,to:range.to},false,`/reports/day/${date}`);}
  function returnToReport(){updateQuery({view:null},false,reportTab==="comparison"?"/reports/comparison":"/reports");}
  function changeTab(tab){updateQuery({view:null},false,tab==="comparison"?"/reports/comparison":"/reports");}
  function changeEarningsMode(mode){updateQuery({earnings:mode==="net"?"net":null,metric:mode==="net"?"net":"revenue"});}
  function changeMetric(value){updateQuery({metric:value,earnings:value==="net"?"net":value==="revenue"?null:query.get("earnings")});}
  const comparisonStart=valid?shiftDate(range.to,-((new Date(`${range.to}T00:00:00Z`).getUTCDay()+6)%7)-21):range.from;
  const loadRange=selected?{from:selected<range.from&&selected<comparisonStart?selected:range.from,to:selected>range.to?selected:range.to}:range;

  useEffect(()=>{
    let active=true;
    async function load() {
      if(!db||!valid)return;
      setBusy(true);setStatus("Loading report…");
      const key=`report:${auth.store_id}:${loadRange.from}:${loadRange.to}:${today}`;
      try {
        let cached=await getMeta(db,key),online=false;
        try {cached=await api(`/stores/${auth.store_id}/reports?from=${loadRange.from}&to=${loadRange.to}`);await putMeta(db,key,cached);online=true;} catch(error) {if(error.status===403||error.status===401)throw error;}
        const sales=await localSales(db,auth.store_id),entries=await localFinance(db,auth.store_id);
        const localOnly=!cached;
        const include=(row)=>localOnly||row.sync_status==="pending"||new Date(row.synced_at)>new Date(cached.generated_at);
        const local=sales.filter(include);
        const data=reportHours(cached?.hours||[],local,entries.filter(include));
        const productData=reportProducts(cached?.products||[],local,(cached?.hours||[]).flatMap((row)=>row.ids||[]));
        if(active){
          setHours(data);setProducts(productData);
          setStatus(online?"Up to date · Includes pending records on this device.":cached?`Offline · Saved ${new Date(cached.generated_at).toLocaleString("en-GB",{timeZone:"Asia/Jakarta"})}. Includes local records.`:"Offline · Only records on this device are available. This is a partial report.");
          if(cached&&!cached.products)setStatus((text)=>`${text} Product detail needs an online refresh.`);
        }
      } catch(error){if(active){setHours([]);setProducts([]);setStatus(error.message);}}
      finally {if(active)setBusy(false);}
    }
    load();return()=>{active=false;};
  },[db,auth.store_id,loadRange.from,loadRange.to,valid,pending,refresh,today]);
  const daily=useMemo(()=>{
    const map=new Map();
    for(const row of hours){if(!map.has(row.date))map.set(row.date,emptyTotals());addTotals(map.get(row.date),row);}
    return map;
  },[hours]);
  const days=valid?dateRange(range.from,range.to).map((date)=>({...emptyTotals(),...daily.get(date),label:date})):[];
  const periodHours=hours.filter((row)=>row.date>=range.from&&row.date<=range.to);
  const periodProducts=products.filter((row)=>row.date>=range.from&&row.date<=range.to);
  const dayHours=selected?hours.filter((row)=>row.date===selected):[];
  const hourly=selected?Array.from({length:24},(_,hour)=>({...dayHours.filter((row)=>row.hour===hour).reduce((sum,row)=>addTotals(sum,row),emptyTotals()),label:`${String(hour).padStart(2,"0")}:00`})):[];
  const refreshButton=<button className="button secondary" disabled={busy||!valid} onClick={()=>setRefresh((n)=>n+1)}>{busy?"Loading…":"Refresh report"}</button>;
  const earningsTabs=<div className="report-tabs earnings-tabs" role="group" aria-label="Earnings view"><button className={earningsMode==="gross"?"active":""} aria-pressed={earningsMode==="gross"} onClick={()=>changeEarningsMode("gross")}>Gross earnings</button><button className={earningsMode==="net"?"active":""} aria-pressed={earningsMode==="net"} onClick={()=>changeEarningsMode("net")}>Net earnings</button></div>;
  if(pathname.startsWith("/reports/day/")&&!selected)return <section className="products-page"><h1>Invalid report date</h1><p>Use a valid date, ending today or earlier.</p><button className="button secondary" onClick={returnToReport}>Back to reports</button></section>;
  if(selected)return <section className="products-page reports-page"><button className="link-button report-back" onClick={returnToReport}>← Back to {reportTab==="overview"?"overview":"comparison"}</button><div className="page-heading heading-row"><div><small>DAY REPORT · WIB</small><h1 ref={heading} tabIndex={-1}>{new Date(`${selected}T00:00:00Z`).toLocaleDateString("en-GB",{timeZone:"UTC",weekday:"long",day:"numeric",month:"long",year:"numeric"})}</h1><p>{selected===today?"Today is still in progress. ":""}Sales, products, and earnings for this day.</p></div>{refreshButton}</div>{earningsTabs}<p className="report-status" role="status">{status}</p><ReportSummary rows={hourly} earningsMode={earningsMode}/><ReportInsights rows={hourly} hours={dayHours} hourly earningsMode={earningsMode}/><TrendChart rows={hourly} metric={earningsMode==="gross"?"revenue":"net"} title="Hourly earnings and products sold" subtitle={earningsMode==="gross"?"Sales before tax and units sold.":"Net earnings and units sold."} hourly/><ProductSales rows={products.filter((row)=>row.date===selected)} earningsMode={earningsMode}/><div className="page-heading"><h2>Hourly detail</h2><p>All 24 hours in Asia/Jakarta (WIB).</p></div><ReportDataTable rows={hourly} hourly earningsMode={earningsMode}/></section>;
  return <section className="products-page reports-page"><div className="page-heading"><small>STORE PERFORMANCE</small><h1 ref={heading} tabIndex={-1}>Reports</h1><p>Understand earnings, product demand, and daily sales patterns.</p></div><div className="report-tabs" role="group" aria-label="Report views"><button className={reportTab==="overview"?"active":""} aria-pressed={reportTab==="overview"} onClick={()=>changeTab("overview")}>Overview</button><button className={reportTab==="comparison"?"active":""} aria-pressed={reportTab==="comparison"} onClick={()=>changeTab("comparison")}>Comparison</button></div>{earningsTabs}<div className="heading-row"><RangeFilter range={range} onChange={setRange}/>{refreshButton}</div><p className="report-status" role="status">{status} Dates use WIB.</p>
    {!valid?<p className="message">Select up to 366 days, ending today or earlier.</p>:<><ReportSummary rows={days} earningsMode={earningsMode}/>{reportTab==="overview"?<><ReportInsights rows={days} hours={periodHours} earningsMode={earningsMode}/><TrendChart rows={days} metric={earningsMode==="gross"?"revenue":"net"} title="Daily earnings and products sold" subtitle={`${range.from} to ${range.to}`} onSelect={openDay}/><ProductSales rows={periodProducts} earningsMode={earningsMode}/></>:<ComparisonChart daily={daily} endDate={range.to} metric={metric} onMetric={changeMetric} onSelect={openDay}/>}<div className="page-heading"><h2>Daily detail</h2><p>Select a date to open its day summary and hourly charts. Earnings exclude tax.</p></div><ReportDataTable rows={[...days].reverse()} onSelect={openDay} earningsMode={earningsMode}/></>}
  </section>;
}
