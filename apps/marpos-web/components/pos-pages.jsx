import { AuditHistory } from "@/components/audit-log";
import { OrderEditor } from "@/components/order-editor";
import { BuyerFields, blankBuyer, buyerError } from "@/components/buyer-fields";
import { saveSale } from "@/lib/local-db";
import { useQueryState } from "@/lib/navigation";
import { useEffect, useState } from "react";
import { localSales } from "@/lib/local-db";

const money = (value) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value || 0);

export function StoreManagement({ stores, invitations, onCreate, onSelect, onDecide, onLogout, notice }) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [busy, setBusy] = useState(false);
  async function create(event) {
    event.preventDefault();
    setBusy(true);
    try { if (await onCreate({ name, slug })) { setName(""); setSlug(""); } } finally { setBusy(false); }
  }
  return <main className="management-screen"><section className="management-card"><span className="logo">M</span>{onLogout && <button className="button secondary" style={{float:"right"}} onClick={onLogout}>Sign out</button>}<h1>Manage stores</h1><p>Create a store or select one you can use.</p>
    {notice && <p className="message" role="status">{notice}</p>}
    {stores.map((store) => <button className="store-choice" key={store.id} onClick={() => onSelect(store)}><span><strong>{store.name}</strong><small>{store.role}</small></span><span>Open →</span></button>)}
    <form onSubmit={create} className="create-store"><label>New store name<input required maxLength={100} value={name} onChange={(event) => setName(event.target.value)} placeholder="My Store" /></label><label>Slug<input required maxLength={100} pattern="[a-z0-9]+(-[a-z0-9]+)*" value={slug} onChange={(event) => setSlug(event.target.value)} placeholder="my-store" /></label><button className="button primary" disabled={busy}>Create store</button></form>
    {invitations.length > 0 && <div className="invitation-list"><h2>Invitations</h2>{invitations.map((invite) => <div className="invitation-row" key={invite.id}><div><strong>{invite.store_name}</strong><small>Role: {invite.role}</small></div><button className="button primary" onClick={() => onDecide(invite.id,true)}>Accept</button><button className="button secondary" onClick={() => onDecide(invite.id,false)}>Reject</button></div>)}</div>}
  </section></main>;
}

export function TeamPage({ api, auth, onNotice }) {
  const [members, setMembers] = useState([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("cashier");
  const [busy, setBusy] = useState(false);
  const canManage = auth.role === "owner" || auth.role === "admin";
  const load = () => api(`/stores/${auth.store_id}/members`).then(setMembers).catch((error) => onNotice(error.message));
  useEffect(() => { load(); }, [auth.store_id]);
  async function invite(event) {
    event.preventDefault(); setBusy(true);
    try { await api(`/stores/${auth.store_id}/invitations`, { method:"POST", body:JSON.stringify({email,role}) }); setEmail(""); onNotice("Invitation is ready in the user's app."); }
    catch (error) { onNotice(error.message); }
    finally { setBusy(false); }
  }
  async function change(member, nextRole) {
    try { await api(`/stores/${auth.store_id}/members/${member.user_id}`, { method:"PUT", body:JSON.stringify({role:nextRole}) }); await load(); }
    catch (error) { onNotice(error.message); }
  }
  async function remove(member) {
    if (!confirm(`Remove ${member.name} from this store?`)) return;
    try { await api(`/stores/${auth.store_id}/members/${member.user_id}`, { method:"DELETE" }); await load(); }
    catch (error) { onNotice(error.message); }
  }
  return <section className="products-page"><div className="page-heading"><small>STORE</small><h1>Team</h1><p>Each user has one role in this store.</p></div>
    {canManage && <form className="invite-form" onSubmit={invite}><label>Email<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label><label>Role<select value={role} onChange={(event) => setRole(event.target.value)}><option value="cashier">Cashier</option><option value="manager">Manager</option>{auth.role==="owner" && <option value="admin">Admin</option>}</select></label><button className="button primary" disabled={busy}>Send invitation</button></form>}
    <div className="table-card"><div className="table-head"><strong>{members.length} members</strong></div>{members.map((member) => <div className="team-row" key={member.user_id}><div><strong>{member.name}</strong><small>{member.email}</small></div>{canManage && member.role!=="owner" && member.user_id!==auth.user_id && (auth.role==="owner" || member.role!=="admin") ? <><select aria-label={`Role for ${member.name}`} value={member.role} onChange={(event) => change(member,event.target.value)}><option value="cashier">Cashier</option><option value="manager">Manager</option>{auth.role==="owner" && <option value="admin">Admin</option>}</select><button className="button secondary" onClick={() => remove(member)}>Remove</button></> : <span>{member.role}</span>}</div>)}</div>
  </section>;
}

export function OrdersPage({ api, db, auth, pending, onNotice, onPrint, products=[], onSaved=()=>{} }) {
  const [orders, setOrders] = useState([]);
  const [local, setLocal] = useState([]);
  const [recordStatus,setRecordStatus]=useQueryState("status");
  const trash=recordStatus==="deleted"&&auth.is_superadmin;
  const setTrash=(deleted)=>setRecordStatus(deleted?"deleted":null);
  const [detail, setDetail] = useState(null);
  const [orderID,setOrderID]=useQueryState("order");
  const [more, setMore] = useState(false);
  const admin = auth.role==="owner"||auth.role==="admin"||auth.is_superadmin;
  const canEdit=auth.role==="owner"||auth.is_superadmin;
  const [editing,setEditing]=useState(false);
  const [repair,setRepair]=useState(null),[repairBuyer,setRepairBuyer]=useState(blankBuyer),[repairBusy,setRepairBusy]=useState(false);
  async function load() {
    try { const first=await api(`/stores/${auth.store_id}/sales?trash=${trash}&offset=0`);setOrders(first);setMore(first.length===50); }
    catch (error) { if (error.status!==401) onNotice("Order history is unavailable offline. Local sales are shown."); setOrders([]);setMore(false); }
    if (db) setLocal(await localSales(db,auth.store_id));
  }
  async function loadMore() {
    try { const next=await api(`/stores/${auth.store_id}/sales?trash=${trash}&offset=${orders.length}`);setOrders([...orders,...next]);setMore(next.length===50); }
    catch (error) { onNotice(error.message); }
  }
  useEffect(() => { load(); }, [auth.store_id,trash,db,pending]);
  const remoteIDs=new Set(orders.map((order) => order.id));
  const shown=trash ? orders : [...local.filter((sale) => sale.sync_status==="pending" && !remoteIDs.has(sale.id)).map((sale) => ({...sale, local:true})),...orders].sort((a,b) => b.completed_at.localeCompare(a.completed_at));
  function open(order,edit=false){setEditing(edit);setOrderID(order.id);}
  useEffect(()=>{let active=true;setDetail(null);if(orderID){const sale=local.find((row)=>row.id===orderID&&row.sync_status==="pending");if(sale)setDetail({sale,items:sale.items});else api(`/stores/${auth.store_id}/sales/${orderID}`).then((data)=>{if(active)setDetail(data);}).catch((error)=>{if(active)onNotice(error.message);});}return()=>{active=false;};},[orderID,auth.store_id,local]);
  function closeDetail(){setDetail(null);setOrderID(null);setEditing(false);}
  async function change(order,restore) {
    if (!restore && !confirm(`Move order ${order.reference} to deleted orders?`)) return;
    try { await api(`/stores/${auth.store_id}/sales/${order.id}${restore?"/restore":""}`,{method:restore?"POST":"DELETE"}); closeDetail(); await load(); }
    catch (error) { onNotice(error.message); }
  }
  async function saveCorrection(input){await api(`/stores/${auth.store_id}/sales/${detail.sale.id}`,{method:"PUT",body:JSON.stringify(input)});setEditing(false);closeDetail();await load();onNotice("Order corrected. The original values are in correction history.");}
  async function saveBuyer(event){event.preventDefault();const error=buyerError(repairBuyer);if(error){onNotice(error);return;}setRepairBusy(true);try{await saveSale(db,{...repair,...Object.fromEntries(Object.entries(repairBuyer).map(([key,value])=>[key,value.trim()]))});setRepair(null);await load();onNotice("Buyer details saved. Pending sync will retry.");onSaved();}catch{onNotice("Buyer details were not saved. Try again.");}finally{setRepairBusy(false);}}
  return <section className="products-page"><div className="page-heading heading-row"><div><small>SALES</small><h1>Order history</h1><p>Recent orders for {auth.store_name}.</p></div>{auth.is_superadmin && <button className="button secondary" onClick={() => {setTrash(!trash);closeDetail();}}>{trash?"Active orders":"Deleted orders"}</button>}</div>
    <div className="table-card">
      <div className="table-head"><strong>{shown.length} orders</strong><span>Most recent first</span></div>
      <div className="orders-scroll"><table className="orders-table order-history-table"><thead><tr><th>Reference</th><th>Buyer</th><th>Date</th><th>Cashier</th><th>Total</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>
        {shown.map((order) => <tr key={order.id}>
          <td><strong>{order.reference || "Pending sync"}</strong>{order.local && <small>Temporary receipt {order.receipt_number.slice(-8)}</small>}</td>
          <td><strong>{order.buyer_name||"—"}</strong><small>{order.buyer_phone}</small><small>{order.buyer_email}</small></td>
          <td>{new Date(order.completed_at).toLocaleString("en-GB")}</td>
          <td>{order.local ? "Pending sync" : order.cashier_name}</td>
          <td className="order-amount">{money(order.grand_total)}</td>
          <td><div className="order-actions">{(!trash||auth.is_superadmin) && <button className="button secondary" onClick={() => open(order)}>View</button>}{!trash&&canEdit&&!order.local&&<button className="button secondary" onClick={()=>open(order,true)}>Edit order</button>}{order.local&&(!order.buyer_name&&!order.buyer_phone&&!order.buyer_email)&&order.cashier_id===auth.user_id&&<button className="button secondary" onClick={()=>{setRepairBuyer(blankBuyer());setRepair(order);}}>Add buyer details</button>}{(trash?auth.is_superadmin:admin) && !order.local && <button className="button secondary" onClick={() => change(order,trash)}>{trash?"Restore":"Delete order"}</button>}</div></td>
        </tr>)}
      </tbody></table></div>
      {shown.length===0 && <div className="empty"><strong>No orders found</strong></div>}
      {more && <button className="button secondary" onClick={loadMore}>Load more orders</button>}
    </div>
    {repair&&<div className="overlay"><form className="modal" onSubmit={saveBuyer}><div className="modal-head"><h2>Add buyer details</h2></div><div className="modal-body"><BuyerFields buyer={repairBuyer} onChange={setRepairBuyer} disabled={repairBusy}/></div><div className="modal-foot"><button className="button secondary" type="button" disabled={repairBusy} onClick={()=>setRepair(null)}>Cancel</button><button className="button primary" disabled={repairBusy}>Save buyer details</button></div></form></div>}
    {detail && <div className="overlay" onMouseDown={(event) => {if(event.target===event.currentTarget)closeDetail();}}><section className="modal order-detail" role="dialog" aria-modal="true" aria-label="Order details"><div className="modal-head"><div><small>ORDER</small><h2>{detail.sale.reference || "Pending sync"}</h2><p>{new Date(detail.sale.completed_at).toLocaleString("en-GB")}</p></div><button className="icon-button" onClick={closeDetail}>Close</button></div>{editing?<div className="modal-body"><OrderEditor detail={detail} products={products} onSave={saveCorrection} onCancel={()=>setEditing(false)}/></div>:<><div className="modal-body"><div className="buyer-summary"><strong>{detail.sale.buyer_name||"Buyer"}</strong><p>{detail.sale.buyer_phone} {detail.sale.buyer_email}</p></div>{detail.items.map((item) => <div className="receipt-line" key={item.id}><span>{item.quantity} × {item.product_name}{item.addons?.map((addon) => <small key={addon.id||addon.option_name}>+ {addon.option_name}</small>)}</span><strong>{money(item.line_total)}</strong></div>)}<div className="receipt-line"><span>Subtotal</span><strong>{money(detail.sale.subtotal)}</strong></div><div className="receipt-line"><span>Tax {detail.sale.tax_applied?`(${detail.sale.tax_percentage}%)`:"excluded"}</span><strong>{money(detail.sale.tax_total)}</strong></div><div className="receipt-line grand"><span>Total</span><strong>{money(detail.sale.grand_total)}</strong></div><AuditHistory entries={detail.history||[]} local={detail.sale.sync_status==="pending"}/>
</div><div className="modal-foot"><button className="button secondary" onClick={closeDetail}>Close</button>{canEdit&&!detail.sale.sync_status&&!detail.sale.deleted_at&&<button className="button secondary" onClick={()=>setEditing(true)}>Edit order</button>}<button className="button primary" onClick={() => onPrint(detail)}>Print receipt</button></div></>}</section></div>}
  </section>;
}

export function PrintReceipt({ detail, storeName }) {
  if (!detail) return null;
  const {sale,items}=detail;
  return <section className="print-receipt"><h1>{storeName}</h1><p>{sale.reference || `Temporary receipt ${sale.receipt_number}`}<br />{new Date(sale.completed_at).toLocaleString("en-GB")}</p><p>{[sale.buyer_name,sale.buyer_phone,sale.buyer_email].filter(Boolean).join(" · ")}</p>{sale.revision>0&&<p>Corrected order · Revision {sale.revision}</p>}<hr />{items.map((item) => <div key={item.id}><div className="receipt-line"><span>{item.quantity} × {item.product_name}</span><span>{money(item.line_total)}</span></div>{item.addons?.map((addon) => <small key={addon.id||addon.option_name}>+ {addon.option_name}{addon.price_delta?` ${money(addon.price_delta)}`:""}<br /></small>)}</div>)}<hr /><div className="receipt-line"><span>Subtotal</span><span>{money(sale.subtotal)}</span></div><div className="receipt-line"><span>Tax</span><span>{money(sale.tax_total)}</span></div><div className="receipt-line grand"><span>Total</span><span>{money(sale.grand_total)}</span></div><p>Thank you.</p></section>;
}
