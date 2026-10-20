package com.marpos.mobile

import android.widget.LinearLayout
import org.json.JSONArray
import org.json.JSONObject

fun MainActivity.ordersScreen(trash: Boolean=false,offset: Int=0) {
    pageHeading(body,"Sales",if(trash) "Deleted orders" else "Order history","View your completed sales and pending orders.")
    if(repo.superadmin) button(body,if(trash) "Active orders" else "Deleted orders") { body.removeAllViews(); ordersScreen(!trash) }
    val list=column(body)
    cachedList(repo.path("sales?trash=$trash&offset=$offset"),list) { remote ->
        val local=if(trash) emptyList() else repo.db.records("sale",repo.store).filter { it.optString("sync_status")=="pending" || (!repo.online && remote.none { r -> r.getString("id")==it.getString("id") }) }
        val sales=(remote+local).distinctBy { it.getString("id") }.sortedByDescending { it.optString("completed_at") }
        val table=table(list,listOf("Reference","Buyer","Date","Cashier","Total","Actions"),listOf(180,150,190,100,140,90))
        sales.forEach { sale ->
            val pending=sale.optString("sync_status")=="pending"
            val reference=sale.optString("reference").ifBlank { sale.optString("receipt_number",tr("Pending sync")) }
            tableRow(table,listOf(reference+if(pending) "\n${tr("Pending sync")}" else "",sale.optString("buyer_name"),displayTime(sale.optString("completed_at")),sale.optString("cashier_name"),money(sale.optLong("grand_total")),tr("View"))) {
                if(pending) orderDetail(obj("sale" to sale,"items" to sale.getJSONArray("items")))
                else work({ repo.cached(repo.path("sales/${sale.getString("id")}"),JSONObject()) as JSONObject }) { detail -> orderDetail(detail) }
            }
        }
        if(sales.isEmpty()) emptyState(list,"history","No orders yet","Completed sales will appear here.")
        if(offset>0) button(list,"Previous") { body.removeAllViews(); ordersScreen(trash,(offset-50).coerceAtLeast(0)) }
        if(remote.size==50) button(list,"Load more orders") { body.removeAllViews(); ordersScreen(trash,offset+50) }
    }
}
fun MainActivity.receiptSummary(parent: LinearLayout,sale: JSONObject,items: List<JSONObject>) {
    text(parent,sale.optString("reference").ifBlank { sale.optString("receipt_number",tr("Pending sync")) },18f,true)
    text(parent,listOf("buyer_name","buyer_phone","buyer_email").map { sale.optString(it) }.filter { it.isNotBlank() }.joinToString(" · "))
    text(parent,"${displayTime(sale.optString("completed_at"))} · ${sale.optString("cashier_name")}",13f)
    val payment=when(sale.optString("payment_method_note")) { "cash"->"Tunai"; "qris"->"QRIS"; "unpaid"->"Piutang";else->"" }
    if(payment.isNotBlank()) text(parent,"${tr("Payment method note")}: $payment")
    items.forEach { item ->
        text(parent,"${item.optLong("quantity")} × ${item.optString("product_name")} · ${money(item.optLong("line_total"))}",16f,true)
        if(item.optString("product_description").isNotBlank()) text(parent,item.getString("product_description"),13f)
        item.rows("addons").forEach { text(parent,"+ ${it.optString("option_name")} · ${money(it.optLong("price_delta"))}",13f) }
        if(item.optLong("discount_total")>0) text(parent,"${tr("Discount")}: −${money(item.optLong("discount_total"))}",13f)
    }
    text(parent,"${tr("Subtotal")}: ${money(sale.optLong("subtotal"))}")
    text(parent,"${tr("Tax")}: ${if(sale.optBoolean("tax_applied")) sale.optString("tax_percentage")+"%" else tr("Excluded")} · ${money(sale.optLong("tax_total"))}")
    text(parent,"${tr("Total")}: ${money(sale.optLong("grand_total"))}",22f,true)
}
fun MainActivity.orderDetail(detail: JSONObject) {
    if(!detail.has("sale")) { notice("Order details are not available on this device. Load the order online first."); return }
    val sale=detail.getJSONObject("sale")
    val local=sale.optString("sync_status")=="pending"
    val deleted=!sale.isNull("deleted_at")
    dialog("Order details") { content,dialog ->
        receiptSummary(content,sale,detail.rows("items"))
        button(content,"Print receipt") { printReceipt(detail) }
        if(!local && !deleted && repo.correct) button(content,"Edit order") { correctionEditor(detail) { dialog.dismiss() } }
        if(local && sale.optString("cashier_id")==repo.user && listOf("buyer_name","buyer_phone","buyer_email").all { sale.optString(it).isBlank() }) {
            button(content,"Add buyer details") {
                dialog("Buyer details") { form,d ->
                    val fields=listOf("buyer_name" to "Buyer name","buyer_phone" to "Buyer phone","buyer_email" to "Buyer email").associate { (key,label)->key to input(form,label,sale.optString(key)) }
                    button(form,"Save",true) {
                        val updated=sale.copy(); fields.forEach { (key,field)->updated.put(key,field.value()) }; validateBuyer(updated)
                        repo.db.queue("sale",updated,repo.store,repo.user); d.dismiss(); dialog.dismiss(); render()
                    }
                }
            }
        }
        if(!local && (if(deleted) repo.superadmin && !repo.viewer else repo.admin)) button(content,if(deleted) "Restore" else "Delete order") {
            confirm(if(deleted) "Restore this order?" else "Delete this order?") {
                mutate(repo.path("sales/${sale.getString("id")}${if(deleted) "/restore" else ""}"),if(deleted) "POST" else "DELETE",done={ dialog.dismiss(); render() })
            }
        }
        text(content,"Order history log",18f,true)
        if(local) text(content,"This sale is waiting for sync. Its server audit record will appear after sync.",13f)
        historyView(content,detail.rows("history"))
    }
}
fun MainActivity.historyView(parent: LinearLayout,entries: List<JSONObject>) {
    entries.forEach { entry ->
        val c=card(parent); text(c,entry.optString("action"),16f,true); text(c,"${entry.optString("actor_name")} · ${entry.optString("actor_email")}",13f); text(c,displayTime(entry.optString("created_at")),13f)
        val meta=entry.optJSONObject("metadata") ?: JSONObject()
        if(meta.optString("reason").isNotBlank()) text(c,meta.getString("reason"))
        if(meta.has("cash_delta")) text(c,"${tr("Cash adjustment")}: ${money(meta.optLong("cash_delta"))}")
        if(meta.has("before")) button(c,"View changes") {
            dialog("View changes") { form,_ ->
                val before=meta.getJSONObject("before"); text(form,"Before",18f,true); receiptSummary(form,before.optJSONObject("sale") ?: before,before.rows("items"))
                val after=meta.getJSONObject("after"); text(form,"After",18f,true); receiptSummary(form,after.optJSONObject("sale") ?: after,after.rows("items"))
            }
        }
    }
}
fun MainActivity.correctionEditor(detail: JSONObject,done:()->Unit) {
    val sale=detail.getJSONObject("sale"); val items=detail.rows("items").map { it.copy() }.toMutableList()
    dialog("Edit order") { form,dialog ->
        text(form,"Changes keep the original receipt reference and create a correction record.")
        val fields=listOf("buyer_name" to "Buyer name","buyer_phone" to "Buyer phone","buyer_email" to "Buyer email").associate { (key,label)->key to input(form,label,sale.optString(key)) }
        val list=column(form)
        fun draw() {
            list.removeAllViews()
            items.forEachIndexed { index,item ->
                val c=card(list); text(c,"${item.getString("product_name")} · ${item.optLong("quantity")} × ${money(item.getLong("unit_price"))}")
                button(c,"Edit item") { editLine(item) { items[index]=it; draw() } }
                button(c,"Remove item") { items.removeAt(index); draw() }
            }
        }
        draw()
        button(form,"Add product") { catalogPicker { items.add(it); draw() } }
        val taxOn=check(form,"Add tax",sale.optBoolean("tax_applied")); val rate=input(form,"Tax percentage",sale.optString("tax_percentage"),true); val reason=input(form,"Reason")
        button(form,"Review correction",true) {
            require(items.isNotEmpty() && reason.value().isNotBlank()) { "Add an item and a reason." }
            val payload=totals(items,taxOn.isChecked,taxRate(rate.value())).put("tax_applied",taxOn.isChecked).put("tax_percentage",taxRate(rate.value())).put("items",items.array()).put("reason",reason.value()).put("revision",sale.optInt("revision"))
            fields.forEach { (key,field)->payload.put(key,field.value()) }; validateBuyer(payload)
            val delta=payload.getLong("grand_total")-sale.getLong("grand_total")
            confirm("${tr("Total")}: ${money(payload.getLong("grand_total"))}\n${tr("Cash adjustment")}: ${money(delta)}\nConfirm the cash received or returned before saving.") {
                mutate(repo.path("sales/${sale.getString("id")}"),"PUT",payload.put("cash_adjustment_confirmed",true),done={ dialog.dismiss(); done(); render() })
            }
        }
    }
}
