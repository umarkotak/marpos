export const money = (value) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value || 0);
export function storeDate(value = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}
export function shiftDate(date, days) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
export function dateRange(from, to) {
  const days = [];
  for (let date = from; date <= to; date = shiftDate(date, 1)) days.push(date);
  return days;
}
export const emptyTotals = () => ({ orders: 0, units: 0, revenue: 0, tax: 0, cost: 0, income: 0, expense: 0, missing_costs: 0, net: 0 });
export function addTotals(target, row) {
  for (const key of ["orders", "units", "revenue", "tax", "cost", "income", "expense", "missing_costs"]) target[key] += row[key] || 0;
  target.net = target.revenue - target.cost + target.income - target.expense;
  return target;
}
export function reportHours(remote, sales, entries) {
  const included = new Set(remote.flatMap((row) => row.ids || []));
  const rows = remote.map((row) => ({ ...row }));
  function append(record, values, date) {
    if (included.has(record.id)) return;
    const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jakarta", hour: "2-digit", hourCycle: "h23" }).format(new Date(date)));
    rows.push({ ...emptyTotals(), ...values, date: storeDate(date), hour, ids: [record.id] });
    included.add(record.id);
  }
  for (const sale of sales) append(sale, {
    orders: 1, units:sale.items.reduce((sum,item)=>sum+item.quantity,0), revenue: sale.subtotal, tax: sale.tax_total,
    cost: sale.items.reduce((sum, item) => sum + (item.unit_cost || 0) * item.quantity, 0),
    missing_costs: sale.items.filter((item) => !item.cost_configured).length,
  }, sale.completed_at);
  for (const entry of entries) append(entry, { [entry.mode]: entry.amount }, entry.occurred_at);
  return rows;
}

export function reportProducts(remote, sales, includedIDs) {
 const rows=remote.map((row)=>({...row}));
 const included=new Set(includedIDs);
 for(const sale of sales) {
  if(included.has(sale.id))continue;
  for(const item of sale.items)rows.push({date:storeDate(sale.completed_at),product_id:item.product_id,name:item.product_name,sku:item.sku,units:item.quantity,revenue:item.line_total,cost:(item.unit_cost||0)*item.quantity,missing_costs:item.cost_configured?0:1});
  included.add(sale.id);
 }
 return rows;
}
