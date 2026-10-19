package com.marpos.mobile

import org.json.JSONArray
import org.json.JSONObject
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.Instant
import java.time.temporal.ChronoUnit

fun validateRange(from: String,to: String) {
    val start=LocalDate.parse(from); val end=LocalDate.parse(to)
    require(!end.isBefore(start) && ChronoUnit.DAYS.between(start,end)<=365 && !end.isAfter(LocalDate.now(wib))) { "Select up to 366 days, ending today or earlier." }
}
fun MainActivity.financeScreen(trash: Boolean=false,from: String=LocalDate.now(wib).minusDays(29).toString(),to: String=today()) {
    heading(body,if(trash) "Deleted financial records" else "Income and expenses")
    text(body,"Record staff pay and other store income or expenses. Do not record checkout sales again.")
    if(repo.superadmin) button(body,if(trash) "Active records" else "Deleted records") { body.removeAllViews(); financeScreen(!trash,from,to) }
    if(repo.edit && !trash) button(body,"New record",true) { financeEntry() }
    val filter=card(body); val first=input(filter,"From (YYYY-MM-DD)",from); val last=input(filter,"To (YYYY-MM-DD)",to)
    button(filter,"Apply") { validateRange(first.value(),last.value()); body.removeAllViews(); financeScreen(trash,first.value(),last.value()) }
    val list=column(body)
    val path=repo.path("finance?from=$from&to=$to&trash=$trash")
    cachedList(path,list) { remote ->
        val saved=repo.db.json("cache:${repo.user}:$path")?.optString("saved_at","") ?: ""
        val local=if(trash) emptyList() else repo.db.records("finance",repo.store).filter { (it.optString("sync_status")=="pending" || it.optString("synced_at")>saved) && dateOf(it.getString("occurred_at")) in from..to }
        (remote+local).distinctBy { it.getString("id") }.sortedByDescending { it.getString("occurred_at") }.forEach { entry ->
            val c=card(list); text(c,entry.optString("category"),18f,true); text(c,"${tr(entry.optString("mode"))} · ${money(entry.getLong("amount"))}"); text(c,entry.optString("description")); text(c,displayTime(entry.optString("occurred_at")),13f)
            if(entry.optString("sync_status")=="pending") text(c,"Pending sync",13f)
            else if(repo.admin && (!trash || repo.superadmin)) button(c,if(trash) "Restore" else "Delete") { confirm(if(trash) "Restore this record?" else "Move this financial record to deleted records?") { mutate(repo.path("finance/${entry.getString("id")}${if(trash) "/restore" else ""}"),if(trash) "POST" else "DELETE") } }
        }
    }
}
fun MainActivity.financeEntry() {
    dialog("New record") { form,dialog ->
        val modes=listOf("expense","income"); val mode=select(form,"Type",modes)
        val category=input(form,"Category","Staff pay"); val description=input(form,"Description"); val amount=input(form,"Amount (IDR)","",true)
        val date=input(form,"Date (YYYY-MM-DD, WIB)",today()); val time=input(form,"Time (HH:MM, WIB)",java.time.LocalTime.now(wib).withSecond(0).withNano(0).toString().take(5))
        button(form,"Save",true) {
            repo.requireOfflineAccess()
            val value=amount(amount.value()); require(value>0 && category.value().length in 1..80 && description.value().length in 1..1000) { "Check the amount, category, and description." }
            val timestamp=LocalDateTime.parse("${date.value()}T${time.value()}:00").atZone(wib).toInstant(); require(!timestamp.isAfter(Instant.now())) { "Use a date and time that is not in the future." }
            val entry=obj("id" to uuid(),"store_id" to repo.store,"created_by" to repo.user,"mode" to modes[mode.selectedItemPosition],"category" to category.value(),"description" to description.value(),"amount" to value,"occurred_at" to timestamp.toString())
            repo.db.queue("finance",entry,repo.store,repo.user); dialog.dismiss(); render(); retrySyncAfterSale()
        }
    }
}
fun MainActivity.auditScreen(from: String="",to: String="",action: String="",offset: Int=0) {
    heading(body,"Audit log")
    val filter=card(body)
    val actions=listOf("","sale.created","sale.corrected","sale.deleted","sale.restored")
    val selected=select(filter,"Action",actions,action); val first=input(filter,"From (YYYY-MM-DD)",from); val last=input(filter,"To (YYYY-MM-DD)",to)
    button(filter,"Refresh log") {
        if(first.value().isNotEmpty()) LocalDate.parse(first.value())
        if(last.value().isNotEmpty()) LocalDate.parse(last.value())
        require(first.value().isBlank() || last.value().isBlank() || first.value()<=last.value()) { "Check the date range." }
        body.removeAllViews(); auditScreen(first.value(),last.value(),actions[selected.selectedItemPosition])
    }
    val list=column(body)
    cachedList(repo.path("audit-logs?from=$from&to=$to&action=$action&offset=$offset"),list) { rows ->
        rows.forEach { event ->
            historyView(list,listOf(event))
            if(event.optString("entity_type")=="sale" && (!event.optBoolean("entity_deleted") || repo.superadmin)) button(list,event.optString("reference",tr("View order"))) { work({ repo.cached(repo.path("sales/${event.getString("entity_id")}"),JSONObject()) as JSONObject }) { orderDetail(it) } }
        }
        if(offset>0) button(list,"Previous") { body.removeAllViews(); auditScreen(from,to,action,offset-50) }
        if(rows.size==50) button(list,"Next") { body.removeAllViews(); auditScreen(from,to,action,offset+50) }
    }
}
