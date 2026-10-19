package com.marpos.mobile

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant

class Repository(context: Context, val api: Api) {
    val db = LocalStore(context, "marpos-${api.base.hashCode()}.db")
    var auth: JSONObject? = db.json("auth")
        private set
    var online = false
    var status = ""
    val user get() = auth?.optString("user_id") ?: ""
    val store get() = auth?.optString("store_id") ?: ""
    val role get() = auth?.optString("role") ?: ""
    val viewer get() = role == "viewer"
    val superadmin get() = auth?.optBoolean("is_superadmin") == true
    val edit get() = !viewer && (role in listOf("owner", "admin", "manager") || superadmin)
    val admin get() = !viewer && (role in listOf("owner", "admin") || superadmin)
    val correct get() = !viewer && (role == "owner" || superadmin)
    fun saveAuth(value: JSONObject?) {
        if (value == null) db.remove("auth") else db.put("auth", value)
        auth = value
    }
    fun requireOfflineAccess() {
        require(auth != null && store.isNotBlank() && role in listOf("owner","admin","manager","cashier") && runCatching { Instant.parse(auth!!.getString("offline_expires_at")).isAfter(Instant.now()) }.getOrDefault(false)) { "Offline access expired. Sign in online before recording a sale or entry." }
    }
    fun path(suffix: String) = "/stores/$store/$suffix"
    fun get(path: String): Any {
        try { return api.request(path).also { online = true } }
        catch (e: ApiError) { if (e.status == 401) saveAuth(null); throw e }
        catch (e: Exception) { online = false; throw e }
    }
    fun cached(path: String, fallback: Any): Any {
        val key = "cache:$user:$path"
        return try {
            get(path).also { db.put(key, obj("value" to it, "saved_at" to now())); status = "Up to date · WIB" }
        } catch (e: Exception) {
            if (e is ApiError && e.status in listOf(401,403)) throw e
            val cached = db.json(key)
            status = if (cached != null) "Offline · saved ${cached.optString("saved_at")}" else "Offline · only records on this device are available"
            cached?.opt("value") ?: fallback
        }
    }
    fun stores() = (cached("/stores", JSONArray()) as JSONArray).objects()
    fun invitations() = (cached("/invitations", JSONArray()) as JSONArray).objects()
    fun selectStore(row: JSONObject) {
        val session = auth!!.copy()
        row.keys().forEach { if(it!="name") session.put(it, row.get(it)) }
        session.put("store_id", row.getString("id")).put("store_name", row.getString("name"))
        val deviceKey = "device:${row.getString("id")}"
        val device = db.meta(deviceKey) ?: uuid().also { db.put(deviceKey,it) }
        session.put("device_id", device)
        saveAuth(session)
        try {
            if (!viewer) {
                val result = api.request(path("device"), "POST", obj("device_id" to device)) as JSONObject
                session.put("offline_expires_at", result.getString("offline_expires_at"))
                saveAuth(session)
            }
            refreshCatalog()
        } catch (e: Exception) {
            online = false
            if (e is ApiError && e.status in listOf(401,403)) {
                if (e.status == 401) saveAuth(null) else saveAuth(obj("user_id" to session.getString("user_id"), "name" to session.getString("name"), "email" to session.getString("email"), "is_superadmin" to session.optBoolean("is_superadmin"), "offline_expires_at" to session.getString("offline_expires_at")))
                throw e
            }
            status = "Offline · saved catalog"
        }
    }
    fun refreshSession() {
        if (auth == null) return
        try {
            val session = get("/auth/me") as JSONObject
            val oldStore = store
            saveAuth(auth!!.copy().apply { session.keys().forEach { put(it,session.get(it)) } })
            val available = get("/stores") as JSONArray
            db.put("cache:$user:/stores", obj("value" to available, "saved_at" to now()))
            val selected = available.objects().find { it.getString("id") == oldStore }
            if (selected != null) selectStore(selected)
            else saveAuth(session)
        } catch (e: Exception) {
            online = false
            if (e is ApiError && e.status in listOf(401,403)) throw e
            if (auth != null && runCatching { !Instant.parse(auth!!.getString("offline_expires_at")).isAfter(Instant.now()) }.getOrDefault(true)) {
                saveAuth(null)
                error("Offline access expired. Sign in online again.")
            }
        }
    }
    fun signIn(token: String) {
        val device = db.meta("device") ?: uuid().also { db.put("device",it) }
        val session = api.request("/auth/google", "POST", obj("credential" to token, "device_id" to device)) as JSONObject
        saveAuth(session)
        val stores = stores()
        if (stores.isNotEmpty()) selectStore(stores.first())
    }
    fun logout() {
        runCatching { api.request("/auth/logout","POST") }
        api.clearSession()
        saveAuth(null)
    }
    fun products(): List<JSONObject> {
        val cached = db.json("catalog:$store")?.rows("products") ?: emptyList()
        val pending = db.records("product",store).filter { it.optString("sync_status") == "pending" }
        return (cached + pending).distinctBy { it.getString("id") }
    }
    fun refreshCatalog() {
        val products = get(path("products")) as JSONArray
        db.put("catalog:$store", obj("products" to products))
    }
    fun draftKey() = "draft:$user:$store"
    fun workspace(): JSONObject = db.json(draftKey()) ?: newDraft().let { obj("active_id" to it.getString("id"), "drafts" to JSONArray().put(it)).also { workspace -> db.put(draftKey(),workspace) } }
    fun draft(): JSONObject { val w=workspace(); return w.rows("drafts").first { it.getString("id")==w.getString("active_id") } }
    fun saveDraft(row: JSONObject) {
        val w=workspace()
        require(w.rows("drafts").any { it.getString("id")==row.getString("id") }) { "The active draft changed. Reload the order before editing." }
        w.put("drafts",w.rows("drafts").map { if(it.getString("id")==row.getString("id")) row else it }.array())
        db.put(draftKey(),w)
    }
    fun startDraft() { val w=workspace(); val d=newDraft(); w.getJSONArray("drafts").put(d); w.put("active_id",d.getString("id")); db.put(draftKey(),w) }
    fun resumeDraft(id: String) { db.put(draftKey(),workspace().put("active_id",id)) }
    fun discardDraft(id: String) {
        val w=workspace(); var rows=w.rows("drafts").filter { it.getString("id")!=id }
        if(rows.isEmpty()) rows=listOf(newDraft())
        db.put(draftKey(),obj("active_id" to (rows.find { it.getString("id")==w.getString("active_id") } ?: rows.first()).getString("id"), "drafts" to rows.array()))
    }
    fun line(product: JSONObject, addons: List<JSONObject>): JSONObject {
        val costs=product.rows("cost_breakdown").toMutableList()
        addons.filter { it.optLong("cost_delta")>0 }.forEach { costs.add(obj("name" to "${it.getString("group_name")}: ${it.getString("option_name")}", "amount" to it.getLong("cost_delta"))) }
        val configured=product.optBoolean("cost_configured")
        return priceLine(obj("id" to uuid(), "product_id" to product.getString("id"), "product_name" to product.getString("name"), "product_description" to product.optString("description"), "sku" to product.getString("sku"), "quantity" to 1, "unit_price" to product.getLong("price"), "discount_total" to 0, "discount_per_unit" to 0, "addons" to addons.array(), "cost_configured" to configured, "unit_cost" to if(configured) costs.sumOf { it.getLong("amount") } else 0, "cost_breakdown" to if(configured) costs.array() else JSONArray()))
    }
    fun sale(draft: JSONObject): JSONObject {
        requireOfflineAccess(); validateBuyer(draft)
        val items=draft.rows("items"); require(items.isNotEmpty()) { "Add an item first." }
        val session=auth!!; val rate=taxRate(session.optString("tax_percentage","0")); val id=uuid(); val timestamp=now()
        val sale=totals(items,draft.optBoolean("tax_on",true),rate)
        listOf("buyer_name","buyer_phone","buyer_email","payment_method_note").forEach { sale.put(it,draft.optString(it)) }
        return sale.put("id",id).put("operation_id",uuid()).put("store_id",store).put("device_id",session.getString("device_id")).put("register_id",session.getString("register_id")).put("cashier_id",user).put("cashier_name",session.getString("name")).put("receipt_number","${session.getString("register_id").take(8)}-$id").put("created_at",timestamp).put("completed_at",timestamp).put("tax_applied",draft.optBoolean("tax_on",true)).put("tax_percentage",rate).put("items",items.array())
    }
    fun checkout(sale: JSONObject) {
        requireOfflineAccess()
        require(sale.getString("store_id")==store && sale.getString("cashier_id")==user) { "The selected store or account changed. Review the sale again." }
        val w=workspace(); val rows=w.rows("drafts").filter { it.getString("id") != w.getString("active_id") }.ifEmpty { listOf(newDraft()) }
        db.queue("sale",sale,store,user,draftKey(),obj("active_id" to rows.first().getString("id"),"drafts" to rows.array()))
    }
    fun pending(): List<JSONObject> {
        val memberStores=(db.json("cache:$user:/stores")?.rows("value") ?: emptyList()).filter { it.optString("role")!="viewer" }.map { it.getString("id") }.toMutableSet()
        if(store.isNotBlank() && !viewer) memberStores.add(store)
        return db.pending(user,memberStores)
    }
    fun sync() {
        if(auth==null) return
        val owner=user
        val failedProducts=mutableSetOf<String>()
        for (pending in pending()) {
            val row=pending.getJSONObject("payload"); val kind=pending.getString("kind")
            if(kind=="finance" && pending.getString("owner")!=owner) { db.failed(pending,"Sign in as the user who recorded this financial entry."); continue }
            if(kind=="sale" && row.rows("items").any { it.getString("product_id") in failedProducts }) continue
            try {
                val suffix=when(kind) { "product" -> "products/ad-hoc"; "sale" -> "sales"; else -> "finance" }
                val result=api.request("/stores/${pending.getString("store_id")}/$suffix","POST",row) as JSONObject
                db.synced(pending,result); online=true
            } catch(e: Exception) {
                db.failed(pending,e.message ?: "Sync failed")
                if(kind=="product") failedProducts.add(row.getString("id"))
                if(e is ApiError && e.status==401) { saveAuth(null); throw e }
                if(e !is ApiError || e.status>=500) { online=false; break }
            }
        }
    }
}
