import { money, emptyTotals, addTotals, shiftDate } from "@/lib/reports";

export function ReportSummary({ rows }) {
  const total=rows.reduce((sum,row)=>addTotals(sum,row),emptyTotals());
  const cards=[["Net earnings",total.missing_costs?"Incomplete":money(total.net),"After production costs and expenses"],["Sales before tax",money(total.revenue),`${total.orders} completed order${total.orders===1?"":"s"}`],["Products sold",total.units.toLocaleString("en-GB"),"Units across all products"],["Average order",money(total.orders?total.revenue/total.orders:0),"Sales before tax per order"]];
  return <><div className="report-cards summary-cards">{cards.map(([label,value,caption],i)=><div className={`report-card ${i===0?"featured":""}`} key={label}><small>{label}</small><strong>{value}</strong><span>{caption}</span></div>)}</div>{total.missing_costs>0&&<p className="message">{total.missing_costs} sale items have no saved cost. Net earnings are incomplete.</p>}<div className="report-cost-strip"><span>Production cost <b>{money(total.cost)}</b></span><span>Other income <b>{money(total.income)}</b></span><span>Expenses <b>{money(total.expense)}</b></span><span>Tax collected <b>{money(total.tax)}</b></span></div></>;
}

export function TrendChart({rows, metric, title, subtitle, onSelect, hourly=false}) {
  const width=Math.max(660,rows.length*32+100),height=250,left=88,right=16,top=22,bottom=42;
  const values=rows.map((row)=>metric==="net"&&row.missing_costs?null:row[metric]||0);
  const low=Math.min(0,...values.filter((value)=>value!==null)),high=Math.max(1,...values.filter((value)=>value!==null));
  const y=(value)=>top+(high-value)/(high-low)*(height-top-bottom);
  const step=(width-left-right)/Math.max(1,rows.length),zero=y(0);
  const format=(value)=>metric==="units"||metric==="orders"?value.toLocaleString("en-GB",{maximumFractionDigits:1}):money(value);
  return <section className="report-panel"><div className="report-panel-heading"><div><h2>{title}</h2><p>{subtitle}</p></div><span className="report-unit">{metric==="units"?"Units":metric==="orders"?"Orders":"IDR"}</span></div><div className="trend-scroll"><svg width={width} height={height} role="group" aria-label={title}>
    {[0,1,2,3,4].map((i)=>{const value=low+(high-low)*i/4;return <g key={i}><line x1={left} x2={width-right} y1={y(value)} y2={y(value)} stroke="#e7eeeb"/><text x={left-10} y={y(value)+4} textAnchor="end" fill="#778781" fontSize="10">{metric==="units"||metric==="orders"?value.toFixed(value%1?1:0):new Intl.NumberFormat("en-GB",{notation:"compact",maximumFractionDigits:1}).format(value)}</text></g>;})}
    <line x1={left} x2={width-right} y1={zero} y2={zero} stroke="#b7c9c2"/>
    {rows.map((row,i)=>{const value=values[i],x=left+i*step+step/2,barY=value===null?zero-3:Math.min(zero,y(value)),barHeight=value===null?3:Math.max(3,Math.abs(y(value)-zero));const label=`${row.label}: ${value===null?"Incomplete":format(value)}`;return <g key={row.label}>
      <rect x={x-step*.3} y={barY} width={step*.6} height={barHeight} rx="3" fill={value===null?"#c4ceca":value<0?"#c45151":metric==="units"?"#527ed4":"#168464"}/>
      <rect className="trend-target" x={left+i*step} y={top} width={step} height={height-top} fill="transparent" role={onSelect?"button":undefined} tabIndex={onSelect?0:undefined} aria-label={onSelect?`${label}. Open day report.`:label} onClick={()=>onSelect?.(row.label)} onKeyDown={(e)=>{if(onSelect&&(e.key==="Enter"||e.key===" ")){e.preventDefault();onSelect(row.label);}}}><title>{label}</title></rect>
      <text x={x} y={height-17} textAnchor="middle" fill="#677b73" fontSize="10">{hourly?row.label.slice(0,2):`${row.label.slice(8)}/${row.label.slice(5,7)}`}</text>
    </g>;})}
  </svg></div><p className="chart-help">{onSelect?"Select a date to view its hourly report. ":"Each bar covers one hour in WIB. "}Red bars show a loss. Grey bars have incomplete costs.</p></section>;
}

export function ProductSales({rows}) {
  const products=new Map();
  for(const row of rows){if(!products.has(row.product_id))products.set(row.product_id,{...row,units:0,revenue:0,cost:0,missing_costs:0});const product=products.get(row.product_id);for(const key of ["units","revenue","cost","missing_costs"])product[key]+=row[key]||0;}
  const ranked=[...products.values()].sort((a,b)=>b.units-a.units||b.revenue-a.revenue);
  const allUnits=ranked.reduce((sum,row)=>sum+row.units,0);
  return <section className="report-panel"><div className="report-panel-heading"><div><h2>Products sold</h2><p>Ranked by units sold. Includes selected add-on prices and costs.</p></div><span className="report-unit">{ranked.length} products</span></div><div className="orders-scroll"><table className="orders-table report-table"><thead><tr><th>Product</th><th>Units sold</th><th>Share of units</th><th>Sales before tax</th><th>Production cost</th><th>Gross profit</th></tr></thead><tbody>{ranked.map((row)=><tr key={row.product_id}><td><strong>{row.name}</strong><small>{row.sku}</small></td><td>{row.units.toLocaleString("en-GB")}</td><td><span className="product-share"><i style={{width:`${allUnits?row.units/allUnits*100:0}%`}}/></span>{allUnits?(row.units/allUnits*100).toFixed(1):0}%</td><td>{money(row.revenue)}</td><td>{money(row.cost)}</td><td>{row.missing_costs?"Incomplete":money(row.revenue-row.cost)}</td></tr>)}</tbody></table></div>{!ranked.length&&<div className="empty">No products sold in this period.</div>}</section>;
}

export function ReportInsights({rows,hours,hourly=false}) {
  const total=rows.reduce((sum,row)=>addTotals(sum,row),emptyTotals());
  const best=[...rows].filter((row)=>row.orders>0).sort((a,b)=>b.revenue-a.revenue)[0];
  const hourTotals=new Map();
  for(const row of hours){const key=String(row.hour).padStart(2,"0");if(!hourTotals.has(key))hourTotals.set(key,emptyTotals());addTotals(hourTotals.get(key),row);}
  const peak=[...hourTotals].filter(([,row])=>row.orders>0).sort((a,b)=>b[1].orders-a[1].orders||b[1].revenue-a[1].revenue)[0];
  const margin=total.revenue&&!total.missing_costs?`${((total.revenue-total.cost)/total.revenue*100).toFixed(1)}%`:"—";
  return <div className="report-insights"><div><small>{hourly?"Strongest sales hour":"Strongest sales day"}</small><strong>{best?best.label:"No sales yet"}</strong><p>{best?`${money(best.revenue)} before tax`:"Complete a sale to see this insight."}</p></div><div><small>Busiest sales hour</small><strong>{peak?`${peak[0]}:00–${peak[0]}:59 WIB`:"—"}</strong><p>{peak?`${peak[1].orders} order${peak[1].orders===1?"":"s"} ${hourly?"on this day":"across the selected period"}`:"Measured by completed orders."}</p></div><div><small>Gross margin</small><strong>{margin}</strong><p>Sales less production cost, before other income and expenses.</p></div></div>;
}

export function ComparisonChart({daily,endDate,metric,onMetric,onSelect}) {
  const weekday=(new Date(`${endDate}T00:00:00Z`).getUTCDay()+6)%7;
  const monday=shiftDate(endDate,-weekday);
  const weeks=[0,1,2,3].map((week)=>({start:shiftDate(monday,-week*7),color:["#168464","#527ed4","#9872c4","#d59b42"][week]}));
  const max=Math.max(1,...weeks.flatMap((week)=>Array.from({length:7},(_,day)=>Math.abs(daily.get(shiftDate(week.start,day))?.[metric]||0))));
  const format=(row)=>metric==="net"&&row?.missing_costs?"Incomplete":metric==="orders"||metric==="units"?(row?.[metric]||0).toLocaleString("en-GB"):money(row?.[metric]||0);
  return <section className="report-panel report-chart"><div className="report-panel-heading"><div><h2>Weekday comparison</h2><p>Four weeks ending {endDate}. Days after the end date are excluded.</p></div><label>Compare<select value={metric} onChange={(e)=>onMetric(e.target.value)}><option value="revenue">Sales before tax</option><option value="net">Net earnings</option><option value="units">Products sold</option><option value="orders">Orders</option><option value="expense">Expenses</option></select></label></div><div className="chart-legend">{weeks.map((week,i)=><span key={week.start}><i style={{background:week.color}}/>{i===0?"Selected week":`${i} week${i===1?"":"s"} earlier`} · {week.start}</span>)}</div>
    <div className="comparison-grid">{["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((day,i)=><div className="comparison-day" key={day}><div className="comparison-bars">{weeks.map((week)=>{const date=shiftDate(week.start,i),row=daily.get(date),value=row?.[metric]||0,incomplete=metric==="net"&&row?.missing_costs>0;return date>endDate?<span className="future-bar" key={date}/>:<button key={date} className={`comparison-bar ${value<0?"negative":""}`} style={{height:`${incomplete?3:Math.max(3,Math.abs(value)/max*155)}px`,background:incomplete?"#c4ceca":week.color}} aria-label={`${date}: ${format(row)}. Open day report.`} title={`${date}: ${format(row)}`} onClick={()=>onSelect(date)}/>;})}</div><strong>{day}</strong></div>)}</div>
    <p className="chart-help">Select a bar to open the day report. Striped bars show a loss. The selected week is partial when the end date is before Sunday.</p>
    <div className="orders-scroll"><table className="orders-table report-table"><thead><tr><th>Weekday</th>{weeks.map((week)=><th key={week.start}>Week of {week.start}</th>)}</tr></thead><tbody>{["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"].map((day,i)=><tr key={day}><td>{day}</td>{weeks.map((week)=>{const date=shiftDate(week.start,i);return <td key={date}>{date>endDate?"—":<button className="link-button" onClick={()=>onSelect(date)}>{format(daily.get(date))}</button>}</td>;})}</tr>)}</tbody></table></div>
  </section>;
}
