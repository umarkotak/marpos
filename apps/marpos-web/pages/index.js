import { AuditLogPage } from "@/components/audit-log";
import { useOrderDrafts } from "@/lib/use-order-drafts";
import { BuyerFields, buyerError } from "@/components/buyer-fields";
import { navigate, pagePaths, useLocation, useQueryState } from "@/lib/navigation";
import Head from "next/head";
import { useCallback, useEffect, useRef, useState } from "react";
import { BarChart3, Wallet, Building2, ChevronDown, CloudUpload, History, LogOut, Minus, Package, Pencil, Plus, Printer, Settings, ShoppingCart, Trash2, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupLabel, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { clearStoreRecords, getMeta, getProducts, markSaleSynced, openLocalDB, pendingSales, putMeta, replaceProducts, saveSale } from "@/lib/local-db";
import { FinancePage, ReportsPage } from "@/components/finance-pages";
import { markFinanceSynced, pendingFinance } from "@/lib/local-db";
import { OrdersPage, PrintReceipt, StoreManagement, TeamPage } from "@/components/pos-pages";
import { IdrInput } from "@/components/idr-input";

const money = (value) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value || 0);
const NOTICE_DURATION_MS = 10_000;
const defaultCategories = ["makanan", "minuman", "lainnya"];
const newProduct = () => ({ name: "", sku: "", category: "lainnya", price: "", cost_breakdown: [], addon_groups: [], image_urls: [] });
const newGroup = () => ({ name: "", selection_mode: "single", required: false, options: [{ name: "", price_delta: "0", cost_delta: "0" }] });

async function api(path, options = {}) {
  const response = await fetch(`/backend${path}`, { credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(8000), headers: { "Content-Type": "application/json" }, ...options });
  const result = await response.json().catch(()=>({success:false,error:{message:"Server is unavailable. Try again when it returns."}}));
  if (!response.ok || !result.success) {
    const error = new Error(result.error?.message || "Request failed.");
    error.status = response.status;
    throw error;
  }
  return result.data;
}

function ProductForm({ product, storeID, categories, onSave, onNotice, busy, uploading, setUploading }) {
  const [form, setForm] = useState(product ? {...product,category:product.category||"lainnya",cost_breakdown:product.cost_breakdown||[],image_urls:product.image_urls||[]} : newProduct());
  const [categoryOptions, setCategoryOptions] = useState(categories);
  const [customCategory, setCustomCategory] = useState("");
  const [categoryOpen, setCategoryOpen] = useState(false);
  useEffect(() => { setForm(product ? {...product,category:product.category||"lainnya",cost_breakdown:product.cost_breakdown||[],image_urls:product.image_urls||[]} : newProduct()); setCustomCategory(""); }, [product]);
  useEffect(() => {
    let active = true;
    api(`/stores/${storeID}/products/categories`)
      .then((list) => { if (active) setCategoryOptions((old) => [...new Set([...list, ...old])]); })
      .catch(() => {});
    return () => { active = false; };
  }, [storeID]);
  function useCustomCategory() {
    const category = customCategory.trim().toLowerCase();
    if (!category || [...category].length > 100 || !/^[\p{L}\p{N} ]+$/u.test(category)) {
      onNotice("Use 1 to 100 letters, numbers, or spaces for the category.");
      return;
    }
    setCategoryOptions((old) => [...new Set([...old, category])]);
    setForm((old) => ({ ...old, category }));
    setCustomCategory("");
    setCategoryOpen(false);
  }
  async function addImages(event) {
    const files=Array.from(event.target.files||[]);event.target.value="";
    if(form.image_urls.length+files.length>10){onNotice("Use at most 10 images per product.");return;}
    setUploading(true);
    try {
      for(const file of files){
        if(file.size>8*1024*1024){onNotice("Choose an image smaller than 8 MB.");continue;}
        const body=new FormData();body.append("image",file);
        try{const result=await api(`/stores/${storeID}/images`,{method:"POST",body,headers:{},signal:AbortSignal.timeout(45000)});setForm((old)=>({...old,image_urls:[...old.image_urls,result.url]}));}
        catch(error){onNotice(error.message);}
      }
    } finally {setUploading(false);}
  }
  function groupChange(index, change) {
    setForm((old) => ({ ...old, addon_groups: old.addon_groups.map((group, i) => i === index ? { ...group, ...change } : group) }));
  }
  function optionChange(groupIndex, optionIndex, change) {
    setForm((old) => ({ ...old, addon_groups: old.addon_groups.map((group, i) => i !== groupIndex ? group : { ...group, options: group.options.map((option, j) => j === optionIndex ? { ...option, ...change } : option) }) }));
  }
  function submit(event) {
    event.preventDefault();
    onSave({ ...form, price: Number(form.price), cost_breakdown:form.cost_breakdown.map((cost)=>({...cost,amount:Number(cost.amount)})), addon_groups: form.addon_groups.map((group) => ({ ...group, options: group.options.map((option) => ({ ...option, price_delta: Number(option.price_delta), cost_delta:Number(option.cost_delta||0) })) })) });
  }
  return <form onSubmit={submit} className="settings-card product-form">
    <header className="settings-profile"><span className="settings-avatar" aria-hidden="true"><Package size={25}/></span><div><small>{product?.id ? "CATALOG / EDIT PRODUCT" : "CATALOG / NEW PRODUCT"}</small><h2>{product?.id ? form.name || "Edit product" : "Create a product"}</h2><p>Set the details customers and cashiers see at checkout.</p></div></header>
    <section className="settings-section" aria-labelledby="product-details-heading"><div className="settings-section-copy"><span>01 / DETAILS</span><h3 id="product-details-heading">Product details</h3><p>Add a clear name, SKU, category, and price.</p></div><div className="settings-fields product-fields">
      <label>Product name<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Iced coffee" /></label>
      <label>SKU<input required value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} placeholder="COFFEE-01" /></label>
      <div className="category-picker"><span>Category</span><DropdownMenu open={categoryOpen} onOpenChange={setCategoryOpen}><DropdownMenuTrigger render={<button type="button" className="category-trigger" aria-label={`Category: ${form.category}`} />}>{form.category}<ChevronDown size={16}/></DropdownMenuTrigger><DropdownMenuContent className="category-menu"><div className="category-options">{[...new Set([...categoryOptions, form.category].filter(Boolean))].map((category)=><DropdownMenuItem key={category} onClick={() => setForm((old) => ({ ...old, category }))}>{category}</DropdownMenuItem>)}</div><DropdownMenuSeparator/><div className="category-add"><input aria-label="New category" maxLength={100} value={customCategory} onChange={(e) => setCustomCategory(e.target.value)} onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") { e.preventDefault(); useCustomCategory(); } }} placeholder="New category" /><button type="button" className="button secondary" aria-label="Use new category" disabled={!customCategory.trim()} onClick={useCustomCategory}><Plus size={18}/></button></div></DropdownMenuContent></DropdownMenu></div>
      <label>Price (IDR)<IdrInput required value={form.price} onValueChange={(price) => setForm({ ...form, price })} /></label>
    </div></section>
    <section className="settings-section" aria-labelledby="product-images-heading"><div className="settings-section-copy"><span>02 / IMAGES</span><h3 id="product-images-heading">Product images</h3><p>Add up to 10 images. The first image appears in the catalog.</p></div><div className="product-section-content"><label className="button secondary image-upload">{uploading?"Uploading…":"Add images"}<input type="file" accept="image/jpeg,image/png,image/gif,image/webp,image/avif" multiple disabled={uploading||busy||form.image_urls.length>=10} onChange={addImages}/></label>{!!form.image_urls.length&&<div className="product-images">{form.image_urls.map((url,index)=><div key={url}><img src={url} alt={`${form.name||"Product"} image ${index+1}`}/><button type="button" className="icon-button danger" aria-label={`Remove image ${index+1}`} onClick={()=>setForm((old)=>({...old,image_urls:old.image_urls.filter((item)=>item!==url)}))}><X size={16}/></button>{index===0&&<small>Catalog image</small>}</div>)}</div>}</div></section>
    <section className="settings-section" aria-labelledby="product-cost-heading"><div className="settings-section-copy"><span>03 / COSTS</span><h3 id="product-cost-heading">Production cost</h3><p>List materials, packaging, and other costs for one unit.</p></div><div className="product-section-content"><button type="button" className="button secondary" onClick={()=>setForm({...form,cost_breakdown:[...form.cost_breakdown,{name:"",amount:"0"}]})}><Plus size={16}/> Add cost</button>
    {form.cost_breakdown.map((cost,i)=><div className="option-fields" key={i}><label>Cost item<input required maxLength={100} value={cost.name} onChange={(e)=>setForm({...form,cost_breakdown:form.cost_breakdown.map((row,j)=>j===i?{...row,name:e.target.value}:row)})} /></label><label>Cost (IDR)<IdrInput required value={cost.amount} onValueChange={(amount)=>setForm({...form,cost_breakdown:form.cost_breakdown.map((row,j)=>j===i?{...row,amount}:row)})} /></label><button type="button" className="icon-button danger" aria-label="Remove cost" onClick={()=>setForm({...form,cost_breakdown:form.cost_breakdown.filter((_,j)=>j!==i)})}><X size={17}/></button></div>)}
    <p className="product-cost-total">Total unit cost <strong>{money(form.cost_breakdown.reduce((sum,cost)=>sum+Number(cost.amount),0))}</strong></p></div></section>
    <section className="settings-section" aria-labelledby="product-addons-heading"><div className="settings-section-copy"><span>04 / ADD-ONS</span><h3 id="product-addons-heading">Add-on groups</h3><p>Offer one choice or several choices with the product.</p></div><div className="product-section-content"><button type="button" className="button secondary" onClick={() => setForm({ ...form, addon_groups: [...form.addon_groups, newGroup()] })}><Plus size={16} /> Add group</button>
    {form.addon_groups.map((group, i) => <div className="addon-editor" key={i}>
      <div className="group-fields">
        <label>Group name<input required value={group.name} onChange={(e) => groupChange(i, { name: e.target.value })} placeholder="Milk" /></label>
        <label>Choice type<select value={group.selection_mode} onChange={(e) => groupChange(i, { selection_mode: e.target.value })}><option value="single">Choose one</option><option value="multiple">Choose several</option></select></label>
        <label className="check-label"><input type="checkbox" checked={group.required} onChange={(e) => groupChange(i, { required: e.target.checked })} /> Required</label>
        <button type="button" className="icon-button danger" aria-label="Remove group" onClick={() => setForm({ ...form, addon_groups: form.addon_groups.filter((_, j) => j !== i) })}><X size={18} /></button>
      </div>
      {group.options.map((option, j) => <div className="option-fields addon-option-fields" key={j}>
        <label>Option<input required value={option.name} onChange={(e) => optionChange(i, j, { name: e.target.value })} placeholder="Oat milk" /></label>
        <label>Price increase<IdrInput required value={option.price_delta} onValueChange={(price_delta) => optionChange(i, j, { price_delta })} /></label>
        <label>Cost increase (IDR)<IdrInput required value={option.cost_delta??0} onValueChange={(cost_delta)=>optionChange(i,j,{cost_delta})} /></label>
        <button type="button" className="icon-button danger" disabled={group.options.length === 1} aria-label="Remove option" onClick={() => groupChange(i, { options: group.options.filter((_, k) => k !== j) })}><X size={17} /></button>
      </div>)}
      <button type="button" className="link-button" onClick={() => groupChange(i, { options: [...group.options, { name: "", price_delta: "0", cost_delta: "0" }] })}><Plus size={15} /> Add option</button>
    </div>)}</div></section>
    <footer className="settings-actions"><span>Changes apply to this store.</span><button className="button primary" disabled={busy||uploading}>{busy ? "Saving..." : product?.id ? "Save product" : "Create product"}</button></footer>
  </form>;
}

function StoreSettings({ auth, onSave, dangerZoneEnabled, onClear, clearing }) {
  const [name, setName] = useState(auth.store_name);
  const [slug, setSlug] = useState(auth.slug || "");
  const [address, setAddress] = useState(auth.address || "");
  const [googleMapsURL, setGoogleMapsURL] = useState(auth.google_maps_url || "");
  const [instagramURL, setInstagramURL] = useState(auth.instagram_url || "");
  const [facebookURL, setFacebookURL] = useState(auth.facebook_url || "");
  const [tiktokURL, setTikTokURL] = useState(auth.tiktok_url || "");
  const [tax, setTax] = useState(String(auth.tax_percentage));
  const [busy, setBusy] = useState(false);
  useEffect(() => { setName(auth.store_name); setSlug(auth.slug || ""); setAddress(auth.address || ""); setGoogleMapsURL(auth.google_maps_url || ""); setInstagramURL(auth.instagram_url || ""); setFacebookURL(auth.facebook_url || ""); setTikTokURL(auth.tiktok_url || ""); setTax(String(auth.tax_percentage)); }, [auth.store_name, auth.slug, auth.address, auth.google_maps_url, auth.instagram_url, auth.facebook_url, auth.tiktok_url, auth.tax_percentage]);
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    try { await onSave({ name, slug, address, google_maps_url: googleMapsURL, instagram_url: instagramURL, facebook_url: facebookURL, tiktok_url: tiktokURL, tax_percentage: Number(tax) }); }
    finally { setBusy(false); }
  }
  return <form className="settings-card" onSubmit={submit}>
    <header className="settings-profile"><span className="settings-avatar" aria-hidden="true">{auth.store_name?.charAt(0).toUpperCase() || "S"}</span><div><small>ACTIVE STORE</small><h2>{auth.store_name}</h2><p>Manage this store's details and checkout tax.</p></div></header>
    <section className="settings-section" aria-labelledby="store-identity-heading"><div className="settings-section-copy"><span>01 / STORE</span><h3 id="store-identity-heading">Store identity</h3><p>Set the name and slug for this store.</p></div><div className="settings-fields"><label>Store name<input required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} /></label><label>Slug<input required maxLength={100} pattern="[a-z0-9]+(-[a-z0-9]+)*" value={slug} onChange={(e) => setSlug(e.target.value)} /><small>Use lowercase letters, numbers, and hyphens. The slug must be unique.</small></label></div></section>
    <section className="settings-section" aria-labelledby="store-location-heading"><div className="settings-section-copy"><span>02 / LOCATION</span><h3 id="store-location-heading">Location</h3><p>Add the address and Google Maps link for this store.</p></div><div className="settings-fields"><label>Street address<textarea rows={3} maxLength={500} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street, building, city, and postal code" /></label><label>Google Maps link<input type="url" maxLength={2048} value={googleMapsURL} onChange={(e) => setGoogleMapsURL(e.target.value)} placeholder="https://maps.app.goo.gl/..." /></label></div></section>
    <section className="settings-section" aria-labelledby="store-social-heading"><div className="settings-section-copy"><span>03 / SOCIAL</span><h3 id="store-social-heading">Social links</h3><p>Help customers find your store online. Add only the links you use.</p></div><div className="settings-fields"><label>Instagram<input type="url" maxLength={2048} value={instagramURL} onChange={(e) => setInstagramURL(e.target.value)} placeholder="https://www.instagram.com/yourstore" /></label><label>Facebook<input type="url" maxLength={2048} value={facebookURL} onChange={(e) => setFacebookURL(e.target.value)} placeholder="https://www.facebook.com/yourstore" /></label><label>TikTok<input type="url" maxLength={2048} value={tiktokURL} onChange={(e) => setTikTokURL(e.target.value)} placeholder="https://www.tiktok.com/@yourstore" /></label></div></section>
    <section className="settings-section" aria-labelledby="store-tax-heading"><div className="settings-section-copy"><span>04 / CHECKOUT</span><h3 id="store-tax-heading">Tax</h3><p>Tax is added by default. The cashier can turn it off for one sale.</p></div><div className="settings-fields"><label>Tax percentage<div className="settings-number"><input required type="number" min="0" max="100" step="0.01" value={tax} onChange={(e) => setTax(e.target.value)} /><span aria-hidden="true">%</span></div></label></div></section>
    {dangerZoneEnabled && (auth.role === "owner" || auth.is_superadmin) && <section className="settings-section danger-zone" aria-labelledby="danger-zone-heading"><div className="settings-section-copy"><span>05 / DANGER ZONE</span><h3 id="danger-zone-heading">Danger zone</h3><p>These actions permanently remove store data.</p></div><div className="settings-fields"><div className="danger-action"><div><strong>Clear all orders</strong><p>Delete every order, including deleted orders, from this store.</p></div><button type="button" className="button danger-button" disabled={!!clearing} onClick={() => onClear("sales")}>{clearing === "sales" ? "Clearing…" : "Clear all orders"}</button></div><div className="danger-action"><div><strong>Clear all products and orders</strong><p>Delete every product, image, and order from this store.</p></div><button type="button" className="button danger-button" disabled={!!clearing} onClick={() => onClear("products")}>{clearing === "products" ? "Clearing…" : "Clear all products"}</button></div></div></section>}
    <footer className="settings-actions"><span>Changes apply to this store.</span><button className="button primary" disabled={busy}>{busy ? "Saving..." : "Save changes"}</button></footer>
  </form>;
}

function RegisterSidebar({ auth, stores, invitations, tab, setTab, onStore }) {
  const { setOpenMobile } = useSidebar();
  function navigate(nextTab,event) {
    if(event&&(event.metaKey||event.ctrlKey||event.shiftKey||event.altKey))return;
    event?.preventDefault();
    setTab(nextTab);
    setOpenMobile(false);
  }
  return <Sidebar collapsible="icon">
    <SidebarHeader>
      <DropdownMenu>
        <DropdownMenuTrigger render={<button type="button" className="store-switch-button" aria-label={`Choose store. Current store: ${auth.store_name}`} title="Choose store" />}>
          <span className="logo small">M</span>
          <span className="store-switch-name"><strong>{auth.store_name}</strong><small>{auth.role}</small></span>
          <ChevronDown className="store-switch-arrow" aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent className="min-w-56">
          {stores.map((store) => <DropdownMenuItem key={store.id} onClick={() => onStore(store)}>{store.name}{store.id===auth.store_id?" ✓":""}</DropdownMenuItem>)}
          <DropdownMenuSeparator />
          <DropdownMenuItem render={<a href={pagePaths.stores}/>} onClick={(event) => navigate("stores",event)}>Manage stores</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarHeader>
    <SidebarContent><SidebarGroup><SidebarGroupLabel>Store</SidebarGroupLabel><SidebarMenu>
      <SidebarMenuItem><SidebarMenuButton isActive={tab === "pos"} tooltip="Point of sale" render={<a href={pagePaths.pos}/>} onClick={(event) => navigate("pos",event)}><ShoppingCart /> <span>Point of sale</span></SidebarMenuButton></SidebarMenuItem>
      <SidebarMenuItem><SidebarMenuButton isActive={tab === "products"} tooltip="Products" render={<a href={pagePaths.products}/>} onClick={(event) => navigate("products",event)}><Package /> <span>Products</span></SidebarMenuButton></SidebarMenuItem>
      <SidebarMenuItem><SidebarMenuButton isActive={tab === "orders"} tooltip="Order history" render={<a href={pagePaths.orders}/>} onClick={(event) => navigate("orders",event)}><History /> <span>Order history</span></SidebarMenuButton></SidebarMenuItem>
      {(auth.role!=="cashier"||auth.is_superadmin) && <><SidebarMenuItem><SidebarMenuButton isActive={tab==="finance"} tooltip="Income and expenses" render={<a href={pagePaths.finance}/>} onClick={(event)=>navigate("finance",event)}><Wallet/><span>Income and expenses</span></SidebarMenuButton></SidebarMenuItem><SidebarMenuItem><SidebarMenuButton isActive={tab==="reports"} tooltip="Reports" render={<a href={pagePaths.reports}/>} onClick={(event)=>navigate("reports",event)}><BarChart3/><span>Reports</span></SidebarMenuButton></SidebarMenuItem></>}
      {(auth.role!=="cashier"||auth.is_superadmin)&&<SidebarMenuItem><SidebarMenuButton isActive={tab === "audit"} tooltip="Audit log" render={<a href={pagePaths.audit}/>} onClick={(event)=>navigate("audit",event)}><History/><span>Audit log</span></SidebarMenuButton></SidebarMenuItem>}
      <SidebarMenuItem><SidebarMenuButton isActive={tab === "team"} tooltip="Team" render={<a href={pagePaths.team}/>} onClick={(event) => navigate("team",event)}><Users /> <span>Team</span></SidebarMenuButton></SidebarMenuItem>
      {(auth.role !== "cashier" || auth.is_superadmin) && <SidebarMenuItem><SidebarMenuButton isActive={tab === "settings"} tooltip="Store settings" render={<a href={pagePaths.settings}/>} onClick={(event) => navigate("settings",event)}><Settings /> <span>Store settings</span></SidebarMenuButton></SidebarMenuItem>}
      <SidebarMenuItem><SidebarMenuButton isActive={tab === "stores"} tooltip="Manage stores" render={<a href={pagePaths.stores}/>} onClick={(event) => navigate("stores",event)}><Building2 /> <span>Manage stores{invitations.length ? ` (${invitations.length})` : ""}</span></SidebarMenuButton></SidebarMenuItem>
    </SidebarMenu></SidebarGroup></SidebarContent>
    <SidebarFooter><div className="register-details group-data-[collapsible=icon]:hidden"><strong>Register {auth.register_id.slice(0, 8)}</strong><small>Offline until {new Date(auth.offline_expires_at).toLocaleDateString("en-GB")}</small></div></SidebarFooter>
  </Sidebar>;
}

export default function Home() {
  const [db, setDB] = useState(null);
  const [auth, setAuth] = useState(null);
  const [stores, setStores] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [products, setProducts] = useState([]);
  const {pathname}=useLocation();
  const tab=pathname.startsWith("/reports")?"reports":pathname.startsWith("/products/")?"products":Object.keys(pagePaths).find((key)=>pagePaths[key]===pathname)||"pos";
  const setTab=(next)=>navigate(pagePaths[next]);
  const [search, setSearch] = useQueryState("q");
  const [productSearch, setProductSearch] = useState("");
  const [productCategory, setProductCategory] = useState("all");
  const [productSort, setProductSort] = useState("name");
  const [selected, setSelected] = useState(null);
  const [choices, setChoices] = useState({});
  const productID=pathname.match(/^\/products\/([^/]+)\/edit$/)?.[1];
  const editing=products.find((product)=>product.id===productID);
  const [productUploading, setProductUploading] = useState(false);
  const productTrash=pathname==="/products/deleted"&&auth?.is_superadmin;
  const [deletedProducts, setDeletedProducts] = useState([]);
  const [printDetail, setPrintDetail] = useState(null);
  const [lastReceipt, setLastReceipt] = useState(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(0);
  const [online, setOnline] = useState(false);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), NOTICE_DURATION_MS);
    return () => clearTimeout(timer);
  }, [notice]);
  const [appConfig, setAppConfig] = useState(null);
  const clientID = appConfig?.google_client_id || "";
  const [clearing, setClearing] = useState("");
  const [googleReady, setGoogleReady] = useState(false);
  useEffect(()=>{if(location.hash.startsWith("#reports/"))navigate("/"+location.hash.slice(1).replace("reports/overview","reports"),true);else if(location.pathname==="/")navigate("/pos"+location.search,true);},[]);
  useEffect(()=>{if(auth&&!auth.store_id&&pathname!=="/stores")navigate("/stores",true);},[auth,pathname]);
  const draftOrders=useOrderDrafts(db,auth,setNotice);
  const {cart,setCart,buyer,setBuyer,taxOn,setTaxOn}=draftOrders;
  const [buyerOpen,setBuyerOpen]=useState(false);
  const [previewOpen,setPreviewOpen]=useState(false);
  const [buyerDraft,setBuyerDraft]=useState({buyer_name:"",buyer_phone:"",buyer_email:""});
  const [mobilePanel,setMobilePanel]=useState("catalog");
  const checkoutLock=useRef(false);
  const [checkingOut,setCheckingOut]=useState(false);
  const googleButton = useRef(null);
  const syncing = useRef(false);
  const clearingStore = useRef(false);

  const loadCatalog = useCallback(async (localDB, session) => {
    const catalog = await api(`/stores/${session.store_id}/products`);
    await replaceProducts(localDB, session.store_id, catalog);
    setProducts(catalog);
    setOnline(true);
  }, []);

  const prepareStore = useCallback(async (localDB, session, store, storeList) => {
    const deviceKey = `device_id:${store.id}`;
    const deviceID = await getMeta(localDB,deviceKey) || (session.store_id===store.id ? session.device_id : null) || crypto.randomUUID();
    await putMeta(localDB,deviceKey,deviceID);
    const saved = { ...session, ...store, store_id:store.id, store_name:store.name, register_id:store.register_id, tax_percentage:store.tax_percentage, role:store.role, device_id:deviceID, stores:storeList };
    setAuth(saved);
    setProducts(await getProducts(localDB,store.id));
    setLastReceipt(null);
    await putMeta(localDB,"auth",saved);
    try {
      const device = await api(`/stores/${store.id}/device`,{method:"POST",body:JSON.stringify({device_id:deviceID})});
      const onlineSession={...saved,offline_expires_at:device.offline_expires_at};
      setAuth(onlineSession);
      await putMeta(localDB,"auth",onlineSession);
      await loadCatalog(localDB,onlineSession);
    } catch (error) {
      setOnline(false);
      if (error.status===403) {
        const available=storeList.filter((item)=>item.id!==store.id);
        const noStore={user_id:session.user_id,name:session.name,email:session.email,device_id:deviceID,offline_expires_at:session.offline_expires_at,stores:available};
        setStores(available);setAuth(noStore);await putMeta(localDB,"auth",noStore);
        setNotice("You no longer have access to this store.");
      }
    }
  },[loadCatalog]);

  const syncSales = useCallback(async (localDB, session) => {
    if (!localDB || !session || syncing.current || clearingStore.current) return;
    syncing.current = true;
    try {
      const queued = await pendingSales(localDB);
      const entries=await pendingFinance(localDB);
      setPending(queued.length+entries.length);
      let failed=0;
      for (const sale of queued) {
        try {
          const result = await api(`/stores/${sale.store_id}/sales`, { method: "POST", body: JSON.stringify(sale) });
          await markSaleSynced(localDB, sale, result);
          setLastReceipt((old) => old?.sale.id === sale.id ? { ...old, sale: { ...old.sale, order_number: result.order_number, reference: result.reference } } : old);
          setPending((count) => count - 1);
        } catch(error) {
          if(!error.status || error.status===401 || error.status>=500) throw error;
          failed++;
        }
      }
      for (const entry of entries.filter((entry)=>entry.created_by===session.user_id)) {
        try {
          await api(`/stores/${entry.store_id}/finance`,{method:"POST",body:JSON.stringify(entry)});
          await markFinanceSynced(localDB,entry);
          setPending((count)=>count-1);
        } catch(error) {
          if(!error.status || error.status===401 || error.status>=500) throw error;
          failed++;
        }
      }
      if(failed) setNotice(`${failed} records could not sync. Check store access and record data. Records stay on this device.`);
      else if(entries.some((entry)=>entry.created_by!==session.user_id)) setNotice("Some pending financial records need the user who created them to sign in.");
      setOnline(true);
    } catch (error) {
      setOnline(false);
      if (error.status && error.status!==401) setNotice(`Sync failed: ${error.message} Records stay on this device.`);
      if (error.status === 401) {
        await putMeta(localDB, "auth", null);
        setAuth(null);
        setNotice("Sign in again to sync pending sales.");
      }
    } finally { syncing.current = false; }
  }, []);

  useEffect(() => {
    let active = true;
    async function start() {
      try {
        const localDB = await openLocalDB();
        if (!active) return;
        setDB(localDB);
        const cached = await getMeta(localDB, "auth");
        if (cached && new Date(cached.offline_expires_at).getTime() > Date.now()) {
          setAuth(cached);
          setStores(cached.stores || []);
          if (cached.store_id) setProducts(await getProducts(localDB,cached.store_id));
          setPending((await pendingSales(localDB)).length+(await pendingFinance(localDB)).length);
          try {
            const session=await api("/auth/me");
            const available=await api("/stores");
            const invites=await api("/invitations");
            setStores(available);setInvitations(invites);
            const store=available.find((item)=>item.id===cached.store_id) || available[0];
            if (store) { await prepareStore(localDB,{...session,device_id:cached.device_id},store,available); syncSales(localDB,cached); }
            else { const saved={...session,device_id:cached.device_id,stores:[]};setAuth(saved);await putMeta(localDB,"auth",saved); }
          }
          catch (error) {
            setOnline(false);
            if (error.status === 401) { await putMeta(localDB, "auth", null); setAuth(null); setNotice("Sign in again to continue."); }
          }
        } else if (cached) {
          await putMeta(localDB, "auth", null);
          setNotice("Offline access expired. Sign in online again.");
        }
      } catch { setNotice("This browser cannot save sales. Use a browser with IndexedDB."); }
      try { const config = await api("/auth/config"); if (active) setAppConfig(config); } catch { setOnline(false); }
    }
    start();
    let prepareShell;
    if ("serviceWorker" in navigator) {
      prepareShell = () => {
        const urls = ["/", ...Array.from(document.querySelectorAll("script[src],link[rel=stylesheet],link[rel=preload]"), (element) => element.src || element.href)]
          .filter((url) => url === "/" || new URL(url).origin === location.origin);
        navigator.serviceWorker.controller?.postMessage({ type: "CACHE_SHELL", urls });
      };
      navigator.serviceWorker.addEventListener("controllerchange", prepareShell);
      navigator.serviceWorker.register("/sw.js").then(() => navigator.serviceWorker.ready).then(prepareShell).catch(() => {});
      window.addEventListener("online", prepareShell);
    }
    return () => {
      active = false;
      if (prepareShell) {
        navigator.serviceWorker.removeEventListener("controllerchange", prepareShell);
        window.removeEventListener("online", prepareShell);
      }
    };
  }, [prepareStore, syncSales]);

  useEffect(() => {
    if (auth || !clientID) return;
    if (window.google?.accounts?.id) { setGoogleReady(true); return; }
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = () => setGoogleReady(true);
    document.head.appendChild(script);
    return () => { script.onload = null; };
  }, [auth, clientID]);

  useEffect(() => {
    if (!googleReady || !clientID || auth || !googleButton.current || !db) return;
    window.google.accounts.id.initialize({ client_id: clientID, callback: async ({ credential }) => {
      try {
        let deviceID = await getMeta(db, "device_id");
        if (!deviceID) { deviceID = crypto.randomUUID(); await putMeta(db, "device_id", deviceID); }
        const session = await api("/auth/google", { method: "POST", body: JSON.stringify({ credential, device_id: deviceID }) });
        const available=await api("/stores");
        const invites=await api("/invitations");
        setStores(available);setInvitations(invites);
        const saved = { ...session, device_id: deviceID, stores:available };
        await putMeta(db,"auth",saved);
        if (available.length) { await prepareStore(db,saved,available[0],available); syncSales(db,saved); }
        else setAuth(saved);
        setNotice("");
      } catch (error) { setNotice(error.message); }
    } });
    googleButton.current.replaceChildren();
    window.google.accounts.id.renderButton(googleButton.current, { theme: "outline", size: "large", width: 280 });
  }, [googleReady, clientID, auth, db, prepareStore, syncSales]);

  useEffect(() => {
    if (!db || !auth?.store_id) return;
    const retry = () => { syncSales(db, auth); loadCatalog(db, auth).catch(() => setOnline(false)); };
    window.addEventListener("online", retry);
    const timer = setInterval(retry, 60_000);
    return () => { window.removeEventListener("online", retry); clearInterval(timer); };
  }, [db, auth, syncSales, loadCatalog]);

  useEffect(() => {
    if (!auth || !db) return;
    const refresh=async () => {
      try {
        const [available,invites]=await Promise.all([api("/stores"),api("/invitations")]);
        setStores(available);setInvitations(invites);
        if (auth.store_id && !available.some((store)=>store.id===auth.store_id)) {
          const noStore={user_id:auth.user_id,name:auth.name,email:auth.email,device_id:auth.device_id,offline_expires_at:auth.offline_expires_at,stores:available};
          setAuth(noStore);await putMeta(db,"auth",noStore);setProducts([]);
          setNotice("Your access to this store has ended.");
        }
      } catch {}
    };
    const timer=setInterval(refresh,60_000);
    if (tab==="stores") refresh();
    return () => clearInterval(timer);
  },[auth?.user_id,auth?.store_id,db,tab]);

  const customCategories = [...new Set(products.map((product)=>product.category).filter((category)=>category&&!defaultCategories.includes(category)))].sort((a,b)=>a.localeCompare(b));
  const categories = [...defaultCategories, ...customCategories];
  const filtered = products.filter((product) => `${product.name} ${product.sku}`.toLowerCase().includes(search.toLowerCase()));
  const listedProducts = productTrash ? deletedProducts : products;
  const listCategories = [...new Set(listedProducts.map((product) => product.category || "lainnya"))].sort((a, b) => a.localeCompare(b));
  const selectedCategory = listCategories.includes(productCategory) ? productCategory : "all";
  const productQuery = productSearch.trim().toLocaleLowerCase();
  const visibleProducts = listedProducts.filter((product) =>
    (selectedCategory === "all" || (product.category || "lainnya") === selectedCategory) &&
    `${product.name} ${product.sku} ${product.category || "lainnya"}`.toLocaleLowerCase().includes(productQuery)
  ).sort((a, b) => productSort === "price-asc" ? a.price - b.price || a.name.localeCompare(b.name)
    : productSort === "price-desc" ? b.price - a.price || a.name.localeCompare(b.name)
    : a.name.localeCompare(b.name));
  const hasProductFilters = !!productSearch || selectedCategory !== "all" || productSort !== "name";
  const productsByCategory = new Map();
  for (const product of filtered) {
    const category = product.category || "lainnya";
    if (!productsByCategory.has(category)) productsByCategory.set(category, []);
    productsByCategory.get(category).push(product);
  }
  const subtotal = cart.reduce((sum, item) => sum + item.line_total, 0);
  const tax = taxOn && auth ? Math.round(subtotal * auth.tax_percentage / 100) : 0;
  const total = subtotal + tax;

  function addLine(product, addons) {
    const costs=[...(product.cost_breakdown||[]),...addons.filter((addon)=>addon.cost_delta>0).map((addon)=>({name:`${addon.group_name}: ${addon.option_name}`,amount:addon.cost_delta}))];
    const configured=product.cost_configured===true;
    setCart((old) => [...old, { cost_breakdown:configured?costs:[],cost_configured:configured,unit_cost:configured?costs.reduce((sum,cost)=>sum+cost.amount,0):0,id: crypto.randomUUID(), product_id: product.id, product_name: product.name, sku: product.sku, quantity: 1, unit_price: product.price, line_total: product.price + addons.reduce((sum, addon) => sum + addon.price_delta, 0), addons }]);
    setSelected(null);
  }
  function chooseProduct(product) {
    if(!draftOrders.ready||checkingOut)return;
    if (product.addon_groups.length) { setSelected(product); setChoices({}); }
    else addLine(product, []);
  }
  function confirmChoices() {
    for (const group of selected.addon_groups) if (group.required && !(choices[group.id] || []).length) { setNotice(`Choose an option in ${group.name}.`); return; }
    const addons = selected.addon_groups.flatMap((group) => (choices[group.id] || []).map((id) => {
      const option = group.options.find((entry) => entry.id === id);
      return { id: crypto.randomUUID(), option_id: option.id, group_name: group.name, option_name: option.name, price_delta: option.price_delta,cost_delta:option.cost_delta||0 };
    }));
    addLine(selected, addons);
    setNotice("");
  }
  function changeQuantity(id, delta) {
    if(checkingOut)return;
    setCart((old) => old.map((item) => {
      if (item.id !== id) return item;
      const quantity = Math.max(1, Math.min(1000, item.quantity + delta));
      return { ...item, quantity, line_total: quantity * (item.unit_price + item.addons.reduce((sum, addon) => sum + addon.price_delta, 0)) };
    }));
  }
  function openCheckoutPreview() {
    const error=buyerError(buyer);
    if(error){setNotice(error);openBuyer();return;}
    setPreviewOpen(true);
  }
  async function checkout() {
    if (!db || !auth || !cart.length || !draftOrders.ready || checkoutLock.current) return;
    const error=buyerError(buyer);if(error){setPreviewOpen(false);setNotice(error);openBuyer();return;}
    if (new Date(auth.offline_expires_at).getTime() <= Date.now()) { setNotice("Offline access expired. Sign in online before checkout."); return; }
    checkoutLock.current=true;setCheckingOut(true);
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const sale = { operation_id: crypto.randomUUID(), device_id: auth.device_id, id, store_id: auth.store_id, register_id: auth.register_id, cashier_id: auth.user_id,
      receipt_number: `${auth.register_id.slice(0, 8)}-${id}`, created_at: now, completed_at: now, tax_applied: taxOn,
      tax_percentage: auth.tax_percentage, subtotal, tax_total: tax, grand_total: total, ...Object.fromEntries(Object.entries(buyer).map(([key,value])=>[key,value.trim()])),items: cart };
    try {
      await draftOrders.complete(sale);
      setPreviewOpen(false);
      setLastReceipt({sale,items:cart});
        setPending((count) => count + 1);
      setNotice(`Sale saved. Temporary receipt ${sale.receipt_number.slice(-8)}.`);
      syncSales(db, auth);
    } catch { setNotice("Sale was not saved. Keep the cart and try again."); }
    finally {checkoutLock.current=false;setCheckingOut(false);}
  }
  function openBuyer(){setBuyerDraft({...buyer});setBuyerOpen(true);}
  function saveBuyer(event){event.preventDefault();const error=buyerError(buyerDraft);if(error){setNotice(error);return;}setBuyer(Object.fromEntries(Object.entries(buyerDraft).map(([key,value])=>[key,value.trim()])));setBuyerOpen(false);setNotice("");}
  async function saveProduct(input) {
    setBusy(true);
    try {
      await api(`/stores/${auth.store_id}/products${productID ? `/${productID}` : ""}`, { method: productID ? "PUT" : "POST", body: JSON.stringify(input) });
      await loadCatalog(db, auth);
      navigate(pagePaths.products,true);
      setNotice("Product saved.");
    } catch (error) { setNotice(error.message); }
    finally { setBusy(false); }
  }
  async function saveSettings(input) {
    try {
      const settings = await api(`/stores/${auth.store_id}/settings`, { method: "PUT", body: JSON.stringify(input) });
      const updatedStores = stores.map((store) => store.id === auth.store_id ? { ...store, ...settings } : store);
      const saved = { ...auth, ...settings, store_name: settings.name, stores: updatedStores };
      await putMeta(db, "auth", saved);
      setStores(updatedStores);
      setAuth(saved);
      setNotice("Store settings saved.");
    } catch (error) { setNotice(error.message); }
  }
  async function clearStore(kind) {
    if (clearingStore.current || draftOrders.saving || checkingOut || syncing.current) { setNotice("Wait for current saves and sync to finish."); return; }
    const label = kind === "products" ? "all products and orders" : "all orders";
    const confirmation = window.prompt(`Permanently delete ${label} from ${auth.store_name}? Type the store name to confirm.`);
    if (confirmation === null) return;
    if (confirmation !== auth.store_name) { setNotice("The store name did not match."); return; }
    clearingStore.current = true;
    setClearing(kind);
    try {
      await api(`/stores/${auth.store_id}/${kind}`, { method: "DELETE", body: JSON.stringify({ confirm_store_name: confirmation }) });
      await clearStoreRecords(db, auth.store_id, kind === "products");
      if (kind === "products" && "caches" in window) {
        try {
          const images = await caches.open("marpos-images-v1");
          const keys = await images.keys();
          await Promise.all(keys.filter((request) => new URL(request.url).pathname.startsWith(`/backend/images/${auth.store_id}/`)).map((request) => images.delete(request)));
        } catch {}
      }
      window.location.reload();
    } catch (error) { setNotice(error.message); }
    finally { clearingStore.current = false; setClearing(""); }
  }
  async function createStore(input) {
    try {
      const store=await api("/stores",{method:"POST",body:JSON.stringify(input)});
      const available=[...stores,store];
      setStores(available);
      await prepareStore(db,auth,store,available);
      setTab("pos");
      setNotice("Store created.");
      return true;
    } catch(error) { setNotice(error.message); return false; }
  }
  async function selectStore(store) {
    if(draftOrders.saving){setNotice("Wait for the draft to save before you switch stores.");return;}
    await prepareStore(db,auth,store,stores);
    setTab("pos");
  }
  async function decideInvitation(id,accept) {
    try {
      await api(`/invitations/${id}/decision`,{method:"POST",body:JSON.stringify({accept})});
      const [available,invites]=await Promise.all([api("/stores"),api("/invitations")]);
      setStores(available);setInvitations(invites);
      setNotice(accept?"Store invitation accepted.":"Store invitation rejected.");
    } catch(error) { setNotice(error.message); }
  }
  async function loadDeletedProducts() {
    try { setDeletedProducts(await api(`/stores/${auth.store_id}/products?trash=true`)); }
    catch(error) { setNotice(error.message); }
  }
  useEffect(()=>{if(productTrash&&auth?.store_id)loadDeletedProducts();},[productTrash,auth?.store_id]);
  async function changeProduct(product,restore) {
    if (!restore && !confirm(`Delete ${product.name}?`)) return;
    try {
      await api(`/stores/${auth.store_id}/products/${product.id}${restore?"/restore":""}`,{method:restore?"POST":"DELETE"});
      await loadCatalog(db,auth);
      if (productTrash) await loadDeletedProducts();
      setNotice(restore?"Product restored.":"Product deleted.");
    } catch(error) { setNotice(error.message); }
  }
  function printReceipt(detail) {
    setPrintDetail(detail);
    requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
  }
  async function logout() {
    try { await api("/auth/logout", { method: "POST" }); } catch {}
    await putMeta(db, "auth", null);
    setAuth(null);
    setStores([]);
    setInvitations([]);
    setProducts([]);
  }

  return <>
    <Head><title>Marpos · Point of Sale</title><meta name="viewport" content="width=device-width, initial-scale=1" /><meta name="description" content="Marpos keeps store sales available offline." /><meta name="theme-color" content="#0d8061" /><meta name="apple-mobile-web-app-capable" content="yes" /><meta name="apple-mobile-web-app-status-bar-style" content="default" /><link rel="manifest" href="/manifest.webmanifest" /><link rel="icon" href="/icons/icon-192.png" type="image/png" /><link rel="apple-touch-icon" href="/icons/icon-180.png" /></Head>
    {!auth ? <main className="login-screen"><div className="login-card"><span className="logo">M</span><h1>Marpos</h1><p>Sign in online to prepare your register. You can then sell offline for 30 days.</p>{notice && <div className="message">{notice}</div>}{clientID ? <div ref={googleButton} /> : <div className="message">Set GOOGLE_CLIENT_ID in the API to enable Google sign-in.</div>}</div></main> : !auth.store_id ? <StoreManagement stores={stores} invitations={invitations} onCreate={createStore} onSelect={selectStore} onDecide={decideInvitation} onLogout={logout} notice={notice} /> :
    <SidebarProvider className={tab==="pos"?"app-shell pos-screen":"app-shell"}>
      <RegisterSidebar auth={auth} stores={stores} invitations={invitations} tab={tab} setTab={setTab} onStore={selectStore} />
      <SidebarInset className="app-main">
      <header className="topbar"><div className="topbar-left"><SidebarTrigger /><Separator orientation="vertical" className="h-5" /><div className="topbar-title"><strong>{pathname==="/products/new"?"New product":productID?"Edit product":productTrash?"Deleted products":{pos:"Point of sale",products:"Products",orders:"Order history",team:"Team",settings:"Store settings",stores:"Manage stores",finance:"Income and expenses",reports:"Reports",audit:"Audit log"}[tab]}</strong><small>{auth.store_name}</small></div></div><div className="topbar-right"><span className={online ? "signal online" : "signal"} aria-label={online ? "Connected" : "Offline"} title={online ? "Connected" : "Offline"}><span className="dot" /><span className="signal-label">{online ? "Connected" : "Offline"}</span></span><span className="pending" aria-label={`${pending} pending sync`} title={`${pending} pending sync`}><CloudUpload size={16} /><span className="pending-label">{pending} pending</span><span className="pending-count">{pending}</span></span><Button variant="ghost" size="sm" onClick={logout} title="Sign out" aria-label="Sign out"><LogOut size={16} /><span className="sign-out-label">Sign out</span></Button></div></header>
      {tab === "pos" ? <div className={`pos-layout show-${mobilePanel}`}>
        <div className="pos-mobile-switch" role="group" aria-label="Point of sale view">
          <button className={mobilePanel==="catalog"?"active":""} onClick={()=>setMobilePanel("catalog")}>Products</button>
          <button className={mobilePanel==="order"?"active":""} onClick={()=>setMobilePanel("order")}>Current order · {cart.length}</button>
        </div>
        <section className="catalog">
          <div className="page-heading"><small>CHECKOUT</small><h1>Point of sale</h1><p>Choose products to start a sale.</p></div>
          <label className="search">Search products<input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or SKU" /></label>
          {categories.map((category)=>productsByCategory.has(category)&&<div className="catalog-category" key={category}><h2>{category}</h2><div className="product-grid">{productsByCategory.get(category).map((product) => <button className="product-card" key={product.id} disabled={!draftOrders.ready||checkingOut} onClick={() => chooseProduct(product)}>{product.image_urls?.[0]?<img className="product-photo" src={product.image_urls[0]} alt={product.name}/>:<span className="product-icon">{product.name.slice(0, 1).toUpperCase()}</span>}<strong>{product.name}</strong><b>{money(product.price)}</b>{product.addon_groups.length > 0 && <em>Add-ons available</em>}</button>)}</div></div>)}
          {filtered.length === 0 && <div className="empty"><Package size={30} /><strong>{products.length ? "No matching products" : "No products yet"}</strong><p>{products.length ? "Try another name or SKU." : "Ask a manager to add products before checkout."}</p></div>}
        </section>
        <aside className="cart" aria-label="Current order">
          <div className="cart-head">
            <div className="cart-head-row"><div><h2>Orders <span>{draftOrders.drafts.length}</span></h2><small>{cart.length} {cart.length===1?"item":"items"} · {draftOrders.saving?"Saving…":"Saved on this device"}</small></div><div className="cart-actions">{lastReceipt&&<button className="icon-button" title="Print last receipt" aria-label="Print last receipt" onClick={()=>printReceipt(lastReceipt)}><Printer size={19}/></button>}<button className="button secondary" disabled={!draftOrders.ready||checkingOut} onClick={()=>{draftOrders.start();setBuyerOpen(false);setMobilePanel("catalog");}}><Plus size={15}/> New order</button></div></div>
            <div className="draft-list" aria-label="Open orders">{draftOrders.drafts.map((row,index)=><div key={row.id} className={row.id===draftOrders.activeID?"active":""}>
              <button className="draft-select" aria-current={row.id===draftOrders.activeID?"true":undefined} disabled={checkingOut} onClick={()=>{draftOrders.resume(row.id);setBuyerOpen(false);}}><strong>{row.buyer.buyer_name||row.buyer.buyer_phone||row.buyer.buyer_email||`Order ${index+1}`}</strong><small>{row.items.length} {row.items.length===1?"item":"items"}</small></button>
              <button className="draft-discard" aria-label={`Discard ${row.buyer.buyer_name||`order ${index+1}`}`} disabled={checkingOut} onClick={()=>draftOrders.discard(row.id)}><X size={13}/></button>
            </div>)}</div>
          </div>
          <button className="buyer-summary" disabled={!draftOrders.ready||checkingOut} onClick={openBuyer}><span><small>BUYER DETAILS</small><strong>{buyer.buyer_name||buyer.buyer_phone||buyer.buyer_email||"Add buyer details"}</strong>{(buyer.buyer_phone||buyer.buyer_email)&&buyer.buyer_name&&<small>{[buyer.buyer_phone,buyer.buyer_email].filter(Boolean).join(" · ")}</small>}</span><Pencil size={17}/></button>
          <div className="cart-items" aria-label="Order items">{cart.length===0?<div className="empty"><ShoppingCart size={30}/><strong>No items yet</strong><p>Choose a product to add it here.</p></div>:cart.map((item)=><div className="cart-item" key={item.id}><div className="item-head"><strong>{item.product_name}</strong><button className="icon-button danger" aria-label={`Remove ${item.product_name}`} disabled={checkingOut} onClick={()=>setCart((old)=>old.filter((entry)=>entry.id!==item.id))}><X size={16}/></button></div>{item.addons.map((addon)=><small key={addon.id}>+ {addon.option_name}{addon.price_delta?` (${money(addon.price_delta)})`:""}</small>)}<div className="item-foot"><div className="quantity"><button disabled={checkingOut||item.quantity<=1} onClick={()=>changeQuantity(item.id,-1)} aria-label={`Decrease ${item.product_name} quantity`}><Minus size={14}/></button>{item.quantity}<button disabled={checkingOut||item.quantity>=1000} onClick={()=>changeQuantity(item.id,1)} aria-label={`Increase ${item.product_name} quantity`}><Plus size={14}/></button></div><strong>{money(item.line_total)}</strong></div></div>)}</div>
          <div className="totals"><div><span>Subtotal</span><strong>{money(subtotal)}</strong></div><label className="tax-switch"><span>Include tax ({auth.tax_percentage}%)</span><input type="checkbox" checked={taxOn} disabled={checkingOut} onChange={(e)=>setTaxOn(e.target.checked)}/></label><div><span>Tax</span><strong>{money(tax)}</strong></div><div className="total"><span>Total</span><strong>{money(total)}</strong></div><button className="button primary checkout" disabled={!cart.length||!db||!draftOrders.ready||checkingOut} onClick={openCheckoutPreview}>Review sale <span>{money(total)}</span></button></div>
        </aside>
      </div> :
        tab === "orders" ? <OrdersPage api={api} db={db} auth={auth} pending={pending} onNotice={setNotice} onPrint={printReceipt} products={products} onSaved={()=>syncSales(db,auth)} /> :
        tab === "finance" && (auth.role!=="cashier"||auth.is_superadmin) ? <FinancePage api={api} db={db} auth={auth} pending={pending} onNotice={setNotice} onSaved={()=>{setPending((count)=>count+1);syncSales(db,auth);}} /> :
        tab === "reports" && (auth.role!=="cashier"||auth.is_superadmin) ? <ReportsPage api={api} db={db} auth={auth} pending={pending} /> :
        tab === "audit" && (auth.role!=="cashier"||auth.is_superadmin) ? <AuditLogPage api={api} db={db} auth={auth}/> :
        tab === "team" ? <TeamPage api={api} auth={auth} onNotice={setNotice} /> :
        ["finance","reports","settings","audit"].includes(tab)&&auth.role==="cashier"&&!auth.is_superadmin ? <section className="products-page"><h1>Access restricted</h1><p>Your store role cannot open this page.</p></section> :
        tab === "settings" ? <section className="products-page settings-page"><div className="page-heading"><small>STORE</small><h1>Store settings</h1><p>Manage how this store appears and works.</p></div><StoreSettings auth={auth} onSave={saveSettings} dangerZoneEnabled={appConfig?.features?.danger_zone} onClear={clearStore} clearing={clearing} /></section> :
        tab === "stores" ? <StoreManagement stores={stores} invitations={invitations} onCreate={createStore} onSelect={selectStore} onDecide={decideInvitation} notice={notice} /> :
        <section className="products-page">
          {pathname!==pagePaths.products && <button className="link-button report-back" onClick={() => navigate(pagePaths.products,true)}>← Back to products</button>}
          <div className="page-heading heading-row"><div><small>CATALOG</small><h1>{pathname==="/products/new"?"New product":productID?"Edit product":productTrash?"Deleted products":"Products"}</h1><p>{productTrash?"Restore products for this store.":pathname==="/products/new"||productID?"Manage product details, images, costs, and add-ons.":"Set prices and add-on choices for this store."}</p></div>
            {pathname===pagePaths.products && (auth.role !== "cashier" || auth.is_superadmin) && <button className="button primary" onClick={() => navigate("/products/new")}><Plus size={18} /> New product</button>}
          </div>
          {pathname==="/products/deleted"&&!auth.is_superadmin ? <p>Access restricted.</p> : pathname==="/products/new" || productID ? (auth.role === "cashier" && !auth.is_superadmin ? <p>Access restricted.</p> : productID&&!editing ? <p>Product not found.</p> : <ProductForm key={productID||"new"} product={editing} storeID={auth.store_id} categories={categories} onSave={saveProduct} onNotice={setNotice} busy={busy} uploading={productUploading} setUploading={setProductUploading} />) : <>
          <div className="product-list-controls"><label>Search products<input type="search" value={productSearch} onChange={(event) => setProductSearch(event.target.value)} placeholder="Name, SKU, or category" /></label><label>Category<select value={selectedCategory} onChange={(event) => setProductCategory(event.target.value)}><option value="all">All categories</option>{listCategories.map((category) => <option key={category} value={category}>{category}</option>)}</select></label><label>Sort by<select value={productSort} onChange={(event) => setProductSort(event.target.value)}><option value="name">Name A–Z</option><option value="price-asc">Price: low to high</option><option value="price-desc">Price: high to low</option></select></label>{hasProductFilters && <button type="button" className="link-button" onClick={() => { setProductSearch(""); setProductCategory("all"); setProductSort("name"); }}>Clear filters</button>}</div>
          <div className="table-card product-list"><div className="table-head"><strong>{visibleProducts.length} of {listedProducts.length} products</strong><span>Prices in IDR</span>
            {auth.is_superadmin && !productTrash && <button className="button secondary" onClick={() => navigate("/products/deleted")}>Deleted products</button>}
          </div>
          {visibleProducts.map((product) => <div className="product-row" key={product.id}>{product.image_urls?.[0]?<img className="product-photo compact" src={product.image_urls[0]} alt={product.name}/>:<span className="product-icon compact">{product.name.slice(0, 1).toUpperCase()}</span>}<div><strong>{product.name}</strong><small>{product.category||"lainnya"} · {product.sku} · {product.addon_groups.length} add-on groups · {product.image_urls?.length||0} images</small></div><strong>{money(product.price)}</strong>
            {productTrash ? auth.is_superadmin&&<button className="button secondary" onClick={() => changeProduct(product,true)}>Restore</button> : <div className="product-actions">
              {(auth.role === "owner" || auth.role === "admin" || auth.is_superadmin) && <button className="icon-button danger" aria-label={`Delete ${product.name}`} onClick={() => changeProduct(product,false)}><Trash2 size={17} /></button>}
              {(auth.role !== "cashier" || auth.is_superadmin) && <button className="icon-button" aria-label={`Edit ${product.name}`} onClick={() => navigate(`/products/${product.id}/edit`)}><Pencil size={17} /></button>}
            </div>}
          </div>)}
          {visibleProducts.length === 0 && <div className="empty"><Package size={30} /><strong>{listedProducts.length ? "No matching products" : "No products found"}</strong><p>{listedProducts.length ? "Try another search or category." : productTrash ? "No deleted products in this store." : "Create a product to add it to this store."}</p>{listedProducts.length > 0 && hasProductFilters && <button type="button" className="button secondary" onClick={() => { setProductSearch(""); setProductCategory("all"); setProductSort("name"); }}>Clear filters</button>}</div>}</div></>}
        </section>}

      </SidebarInset>
      <PrintReceipt detail={printDetail} storeName={auth.store_name} />
      {notice && <div className="toast" role="status">{notice}<button onClick={() => setNotice("")} aria-label="Close notice"><X size={16} /></button></div>}
      {previewOpen && <div className="overlay" onMouseDown={(event)=>{if(event.target===event.currentTarget&&!checkingOut)setPreviewOpen(false);}}><section className="modal sale-preview" role="dialog" aria-modal="true" aria-label="Review sale" onKeyDown={(event)=>{if(event.key==="Escape"&&!checkingOut)setPreviewOpen(false);}}><div className="modal-head"><div><small>FINAL CHECK</small><h2>Review sale</h2><p>Check the order before you complete the sale.</p></div><button className="icon-button" aria-label="Close" autoFocus disabled={checkingOut} onClick={()=>setPreviewOpen(false)}><X size={20}/></button></div><div className="modal-body"><div className="sale-preview-buyer"><strong>Buyer</strong><span>{[buyer.buyer_name,buyer.buyer_phone,buyer.buyer_email].filter(Boolean).join(" · ")}</span></div><h3>Items ({cart.length})</h3>{cart.map((item)=><div className="sale-preview-item" key={item.id}><div><strong>{item.product_name}</strong><small>{item.quantity} × {money(item.unit_price)}</small>{item.addons.map((addon)=><small key={addon.id}>+ {addon.option_name}{addon.price_delta?` · ${money(addon.price_delta)} each`:" · Free"}</small>)}</div><strong>{money(item.line_total)}</strong></div>)}</div><div className="sale-preview-footer"><div><span>Subtotal</span><strong>{money(subtotal)}</strong></div><div><span>Tax {taxOn?`(${auth.tax_percentage}%)`:"(excluded)"}</span><strong>{money(tax)}</strong></div><div className="sale-preview-total"><span>Total</span><strong>{money(total)}</strong></div><div className="modal-foot"><button className="button secondary" disabled={checkingOut} onClick={()=>setPreviewOpen(false)}>Back to order</button><button className="button primary" disabled={checkingOut} onClick={checkout}>{checkingOut?"Saving sale…":"Complete cash sale"}</button></div></div></section></div>}
      {buyerOpen && <div className="overlay" onMouseDown={(event)=>{if(event.target===event.currentTarget)setBuyerOpen(false);}}><form className="modal buyer-modal" role="dialog" aria-modal="true" aria-label="Buyer details" onSubmit={saveBuyer} onKeyDown={(event)=>{if(event.key==="Escape")setBuyerOpen(false);}}><div className="modal-head"><div><small>CURRENT ORDER</small><h2>Buyer details</h2></div><button type="button" className="icon-button" aria-label="Close" onClick={()=>setBuyerOpen(false)}><X size={20}/></button></div><div className="modal-body"><BuyerFields buyer={buyerDraft} onChange={setBuyerDraft}/></div><div className="modal-foot"><button type="button" className="button secondary" onClick={()=>setBuyerOpen(false)}>Cancel</button><button className="button primary">Save buyer</button></div></form></div>}
      {selected && <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setSelected(null); }}><section className="modal" role="dialog" aria-modal="true" aria-label={`Choose add-ons for ${selected.name}`}><div className="modal-head"><div><small>ADD-ONS</small><h2>{selected.name}</h2><p>Base price {money(selected.price)}</p></div><button className="icon-button" onClick={() => setSelected(null)} aria-label="Close"><X size={20} /></button></div><div className="modal-body">{selected.addon_groups.map((group) => <div className="choice-group" key={group.id}><strong>{group.name}</strong><small>{group.required ? "Required" : "Optional"} · {group.selection_mode === "single" ? "Choose one" : "Choose several"}</small>{group.options.map((option) => <label className="choice-option" key={option.id}><input type={group.selection_mode === "single" ? "radio" : "checkbox"} name={group.id} checked={(choices[group.id] || []).includes(option.id)} onChange={() => setChoices((old) => ({ ...old, [group.id]: group.selection_mode === "single" ? [option.id] : (old[group.id] || []).includes(option.id) ? old[group.id].filter((id) => id !== option.id) : [...(old[group.id] || []), option.id] }))} /><span>{option.name}</span><strong>{option.price_delta ? `+ ${money(option.price_delta)}` : "Free"}</strong></label>)}</div>)}</div><div className="modal-foot"><button className="button secondary" onClick={() => setSelected(null)}>Cancel</button><button className="button primary" onClick={confirmChoices}>Add to sale</button></div></section></div>}
    </SidebarProvider>}
  </>;
}
