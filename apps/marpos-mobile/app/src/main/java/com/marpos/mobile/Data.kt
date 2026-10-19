package com.marpos.mobile

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import org.json.JSONArray
import org.json.JSONObject
import java.math.BigDecimal
import java.math.RoundingMode
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.util.UUID

fun obj(vararg pairs: Pair<String, Any?>) = JSONObject().apply { pairs.forEach { put(it.first, it.second ?: JSONObject.NULL) } }
fun JSONObject.copy() = JSONObject(toString())
fun JSONArray.objects() = (0 until length()).map { getJSONObject(it) }
fun JSONArray.strings() = (0 until length()).map { getString(it) }
fun Iterable<JSONObject>.array() = JSONArray(toList())
fun JSONObject.rows(key: String) = optJSONArray(key)?.objects() ?: emptyList()
fun uuid() = UUID.randomUUID().toString()
fun now() = Instant.now().toString()
val wib: ZoneId = ZoneId.of("Asia/Jakarta")
fun today() = LocalDate.now(wib).toString()
fun displayTime(value: String) = runCatching { java.time.format.DateTimeFormatter.ofPattern("dd MMM yyyy HH:mm").withZone(wib).format(Instant.parse(value))+" WIB" }.getOrDefault(value)
fun dateOf(value: String) = Instant.parse(value).atZone(wib).toLocalDate().toString()
const val MAX_MONEY = 1_000_000_000_000L
fun amount(text: String): Long = (text.trim().toLongOrNull() ?: error("Enter a whole IDR amount.")).also {
    require(it in 0..MAX_MONEY) { "Use an IDR amount from 0 to 1,000,000,000,000." }
}
fun taxRate(text: String): BigDecimal = (text.toBigDecimalOrNull() ?: error("Enter a valid tax rate.")).also {
    require(it >= BigDecimal.ZERO && it <= BigDecimal(100) && it.stripTrailingZeros().scale() <= 2) { "Tax must be 0 to 100 with at most two decimal places." }
}
fun priceLine(line: JSONObject): JSONObject {
    val q = line.getLong("quantity")
    require(q in 1..1000) { "Quantity must be 1 to 1000." }
    val unit = line.getLong("unit_price")
    require(unit in 0..MAX_MONEY)
    val addon = line.rows("addons").sumOf { it.getLong("price_delta").also { n -> require(n in 0..MAX_MONEY) } }
    val perUnit = line.optLong("discount_per_unit")
    val discount = if (perUnit > 0) Math.multiplyExact(perUnit, q) else line.optLong("discount_total")
    require(perUnit in 0..MAX_MONEY && discount in 0..MAX_MONEY)
    val total = Math.subtractExact(Math.multiplyExact(q, Math.addExact(unit, addon)), discount)
    require(total in 0..MAX_MONEY) { "Reduce the discount or check item prices." }
    return line.put("discount_total", discount).put("line_total", total)
}
fun totals(items: List<JSONObject>, taxOn: Boolean, rate: BigDecimal): JSONObject {
    items.forEach { priceLine(it) }
    val subtotal = items.sumOf { it.getLong("line_total") }
    val tax = if (taxOn) BigDecimal(subtotal).multiply(rate).divide(BigDecimal(100), 0, RoundingMode.HALF_UP).longValueExact() else 0
    require(subtotal in 0..MAX_MONEY && tax in 0..MAX_MONEY && subtotal + tax <= MAX_MONEY) { "Order total is too large." }
    return obj("subtotal" to subtotal, "discount_total" to items.sumOf { it.optLong("discount_total") }, "tax_total" to tax, "grand_total" to subtotal + tax)
}
fun validateBuyer(row: JSONObject) {
    val name = row.optString("buyer_name").trim()
    val phone = row.optString("buyer_phone").trim()
    val email = row.optString("buyer_email").trim()
    require(name.isNotEmpty() || phone.isNotEmpty() || email.isNotEmpty()) { "Enter a buyer name, phone, or email." }
    require(name.length <= 200 && phone.length <= 50 && email.length <= 254 && listOf(name, phone, email).none { s -> s.any { it.code < 32 || it.code == 127 } }) { "Check the buyer details." }
    require(email.isEmpty() || Regex("[^\\s@]+@[^\\s@]+\\.[^\\s@]+").matches(email)) { "Enter a valid buyer email." }
    require(phone.isEmpty() || (Regex("[0-9+(). -]+").matches(phone) && phone.count { it.isDigit() } >= 3)) { "Enter a valid buyer phone." }
    row.put("buyer_name", name).put("buyer_phone", phone).put("buyer_email", email)
}
fun newDraft() = obj("id" to uuid(), "created_at" to now(), "items" to JSONArray(), "buyer_name" to "Guest", "buyer_phone" to "", "buyer_email" to "", "tax_on" to true, "payment_method_note" to "cash")

class LocalStore(context: Context, name: String) : SQLiteOpenHelper(context, name, null, 1) {
    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL("CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
        db.execSQL("CREATE TABLE records (kind TEXT NOT NULL, id TEXT NOT NULL, store_id TEXT NOT NULL, owner TEXT NOT NULL, status TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(kind,id))")
        db.execSQL("CREATE TABLE outbox (kind TEXT NOT NULL, id TEXT NOT NULL, store_id TEXT NOT NULL, owner TEXT NOT NULL, payload TEXT NOT NULL, error TEXT NOT NULL DEFAULT '', PRIMARY KEY(kind,id))")
    }
    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) = Unit
    fun meta(key: String): String? = readableDatabase.rawQuery("SELECT value FROM meta WHERE key=?", arrayOf(key)).use { if (it.moveToFirst()) it.getString(0) else null }
    fun json(key: String) = meta(key)?.let { JSONObject(it) }
    fun put(key: String, value: String) { writableDatabase.insertWithOnConflict("meta", null, ContentValues().apply { put("key", key); put("value", value) }, SQLiteDatabase.CONFLICT_REPLACE).also { check(it != -1L) { "Could not save local data." } } }
    fun put(key: String, value: JSONObject) = put(key, value.toString())
    fun remove(key: String) { writableDatabase.delete("meta", "key=?", arrayOf(key)) }
    fun record(kind: String, row: JSONObject, store: String, owner: String, status: String) {
        val payload = row.copy().put("sync_status", status)
        check(writableDatabase.insertWithOnConflict("records", null, ContentValues().apply {
            put("kind", kind); put("id", row.getString("id")); put("store_id", store); put("owner", owner); put("status", status); put("payload", payload.toString())
        }, SQLiteDatabase.CONFLICT_REPLACE) != -1L) { "Could not save record." }
    }
    fun records(kind: String, store: String): List<JSONObject> = readableDatabase.rawQuery("SELECT payload FROM records WHERE kind=? AND store_id=?", arrayOf(kind, store)).use { c -> buildList { while(c.moveToNext()) add(JSONObject(c.getString(0))) } }
    fun queue(kind: String, row: JSONObject, store: String, owner: String, draftKey: String? = null, workspace: JSONObject? = null) {
        writableDatabase.beginTransaction()
        try {
            record(kind, row, store, owner, "pending")
            check(writableDatabase.insertWithOnConflict("outbox", null, ContentValues().apply {
                put("kind", kind); put("id", row.getString("id")); put("store_id", store); put("owner", owner); put("payload", row.toString()); put("error", "")
            }, SQLiteDatabase.CONFLICT_REPLACE) != -1L) { "Could not queue record." }
            if (draftKey != null && workspace != null) put(draftKey, workspace)
            writableDatabase.setTransactionSuccessful()
        } finally { writableDatabase.endTransaction() }
    }
    fun pending(owner: String, memberStores: Set<String>): List<JSONObject> = readableDatabase.rawQuery("SELECT kind,id,store_id,payload,error,owner FROM outbox ORDER BY CASE kind WHEN 'product' THEN 0 WHEN 'sale' THEN 1 ELSE 2 END,rowid", emptyArray()).use { c -> buildList { while(c.moveToNext()) if(c.getString(5)==owner || c.getString(2) in memberStores) add(obj("kind" to c.getString(0), "id" to c.getString(1), "store_id" to c.getString(2), "payload" to JSONObject(c.getString(3)), "error" to c.getString(4), "owner" to c.getString(5))) } }
    fun synced(pending: JSONObject, result: JSONObject) {
        val owner=pending.getString("owner")
        val row = pending.getJSONObject("payload").put("synced_at", now())
        result.keys().forEach { row.put(it, result.get(it)) }
        writableDatabase.beginTransaction()
        try {
            record(pending.getString("kind"), row, pending.getString("store_id"), owner, "synced")
            if(pending.getString("kind")=="product") {
                val key="catalog:${pending.getString("store_id")}"
                val products=json(key)?.rows("products") ?: emptyList()
                put(key,obj("products" to (products.filter { it.getString("id")!=row.getString("id") }+row).array()))
            }
            writableDatabase.delete("outbox", "kind=? AND id=? AND owner=?", arrayOf(pending.getString("kind"), pending.getString("id"), owner))
            writableDatabase.setTransactionSuccessful()
        } finally { writableDatabase.endTransaction() }
    }
    fun forget(kind: String,id: String) { writableDatabase.delete("records", "kind=? AND id=? AND status!='pending'", arrayOf(kind,id)) }
    fun failed(row: JSONObject, error: String) { writableDatabase.update("outbox", ContentValues().apply { put("error", error) }, "kind=? AND id=?", arrayOf(row.getString("kind"), row.getString("id"))) }
    fun clearStore(store: String, products: Boolean) {
        writableDatabase.beginTransaction()
        try {
            val kinds = if (products) "('sale','product')" else "('sale')"
            listOf("records", "outbox").forEach { writableDatabase.delete(it, "store_id=? AND kind IN $kinds", arrayOf(store)) }
            writableDatabase.delete("meta", "key LIKE ? OR key LIKE ? OR key LIKE ?", arrayOf("cache:%/stores/$store/%", "draft:%:$store", "detail:%:$store:%"))
            if (products) remove("catalog:$store")
            writableDatabase.setTransactionSuccessful()
        } finally { writableDatabase.endTransaction() }
    }
}
