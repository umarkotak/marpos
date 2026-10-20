package com.marpos.mobile

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.view.View
import android.widget.LinearLayout
import org.json.JSONArray
import org.json.JSONObject
import java.time.LocalDate
import java.time.Instant
import java.time.temporal.ChronoUnit
import kotlin.math.abs

private val reportKeys=listOf("orders","units","revenue","tax","cost","income","expense","missing_costs")
fun addReport(target: JSONObject,row: JSONObject): JSONObject {
    reportKeys.forEach { target.put(it,target.optLong(it)+row.optLong(it)) }
    return target.put("net",target.optLong("revenue")-target.optLong("cost")+target.optLong("income")-target.optLong("expense"))
}
fun MainActivity.reportData(from: String,to: String): JSONObject {
    val remote=repo.cached(repo.path("reports?from=$from&to=$to"),obj("hours" to JSONArray(),"products" to JSONArray())) as JSONObject
    val hours=remote.rows("hours").toMutableList(); val products=remote.rows("products").toMutableList()
    val included=hours.flatMap { it.optJSONArray("ids")?.strings() ?: emptyList() }.toMutableSet()
    val generated=remote.optString("generated_at")
    fun include(row: JSONObject): Boolean = row.optString("sync_status")=="pending" || generated.isEmpty() || runCatching { Instant.parse(row.optString("synced_at")).isAfter(Instant.parse(generated)) }.getOrDefault(false)
    repo.db.records("sale",repo.store).filter(::include).forEach { sale ->
        if(sale.getString("id") !in included) {
            val timestamp=Instant.parse(sale.getString("completed_at")).atZone(wib); val date=timestamp.toLocalDate().toString()
            val items=sale.rows("items")
            hours.add(obj("date" to date,"hour" to timestamp.hour,"orders" to 1,"units" to items.sumOf { it.optLong("quantity") },"revenue" to sale.optLong("subtotal"),"tax" to sale.optLong("tax_total"),"cost" to items.sumOf { it.optLong("unit_cost")*it.optLong("quantity") },"missing_costs" to items.count { !it.optBoolean("cost_configured") }))
            items.forEach { item -> products.add(obj("date" to date,"product_id" to item.optString("product_id"),"name" to item.optString("product_name"),"sku" to item.optString("sku"),"units" to item.optLong("quantity"),"revenue" to item.optLong("line_total"),"cost" to item.optLong("unit_cost")*item.optLong("quantity"),"missing_costs" to if(item.optBoolean("cost_configured")) 0 else 1)) }
            included.add(sale.getString("id"))
        }
    }
    repo.db.records("finance",repo.store).filter(::include).forEach { entry ->
        if(entry.getString("id") !in included) {
            val timestamp=Instant.parse(entry.getString("occurred_at")).atZone(wib)
            hours.add(obj("date" to timestamp.toLocalDate().toString(),"hour" to timestamp.hour,entry.getString("mode") to entry.getLong("amount")))
            included.add(entry.getString("id"))
        }
    }
    return obj("hours" to hours.filter { it.optString("date") in from..to }.array(),"products" to products.filter { it.optString("date") in from..to }.array())
}
fun MainActivity.reportsScreen(from: String=LocalDate.now(wib).minusDays(29).toString(),to: String=today(),comparison: Boolean=false,metric: String="revenue") {
    pageHeading(body,"Store performance","Reports","Understand earnings, product demand, and daily sales patterns.")
    val tabs=row(body)
    button(tabs,"Overview") { body.removeAllViews(); reportsScreen(from,to,false,metric) }
    button(tabs,"Comparison") { body.removeAllViews(); reportsScreen(from,to,true,metric) }
    val filter=grid(body,200,4)
    val startCell=column(); filter.addView(startCell); val first=input(startCell,"From (YYYY-MM-DD)",from)
    val endCell=column(); filter.addView(endCell); val last=input(endCell,"To (YYYY-MM-DD)",to)
    val metrics=listOf("revenue","net","units","orders","expense")
    val metricCell=column(); filter.addView(metricCell); val mode=select(metricCell,"Metric",metrics,metric)
    val daysCell=column(); filter.addView(daysCell); val days=input(daysCell,"Last X days","30",true)
    val actions=row(body)
    button(actions,"Last X days") { val count=days.value().toLongOrNull() ?: 0; require(count in 1..366); body.removeAllViews(); reportsScreen(LocalDate.now(wib).minusDays(count-1).toString(),today(),comparison,metrics[mode.selectedItemPosition]) }
    button(actions,"Apply",true) { validateRange(first.value(),last.value()); body.removeAllViews(); reportsScreen(first.value(),last.value(),comparison,metrics[mode.selectedItemPosition]) }
    val list=column(body)
    val end=LocalDate.parse(to)
    val comparisonStart=end.minusDays((end.dayOfWeek.value-1).toLong()).minusWeeks(3)
    val loadFrom=if(comparison) comparisonStart.toString() else from
    work({ reportData(loadFrom,to) }) { data ->
        text(list,repo.status,13f)
        if(to==today()) text(list,"Today is a partial day.",13f)
        if(comparison) text(list,"Four weeks ending $to. Dates use WIB.",13f)
        val hours=data.rows("hours")
        val total=hours.fold(JSONObject()) { sum,hour -> addReport(sum,hour) }
        reportSummary(list,total)
        reportInsights(list,hours,false)
        val rows=if(comparison) hours.groupBy { LocalDate.parse(it.getString("date")).dayOfWeek.value }.toSortedMap().map { (weekday,values) ->
            val c=card(list); text(c,java.time.DayOfWeek.of(weekday).getDisplayName(java.time.format.TextStyle.FULL,java.util.Locale.forLanguageTag(language)),18f,true)
            (0..3).forEach { week ->
                val date=comparisonStart.plusWeeks(week.toLong()).plusDays((weekday-1).toLong()).toString()
                if(date<=to) { val value=hours.filter { it.optString("date")==date }.fold(JSONObject()) { sum,h->addReport(sum,h) }; button(c,"$date · ${reportValue(value,metric)}") { reportDay(date,data) } }
            }
            val sum=values.fold(JSONObject()) { acc,value->addReport(acc,value) }; weekday.toString() to sum.optLong(metric)
        } else {
            val range=(0..ChronoUnit.DAYS.between(LocalDate.parse(from),end).toInt()).map { LocalDate.parse(from).plusDays(it.toLong()).toString() }
            range.map { date -> val value=hours.filter { it.optString("date")==date }.fold(JSONObject()) { sum,h->addReport(sum,h) }; date to value.optLong(metric) }
        }
        if(!comparison) {
            list.addView(ReportChart(this,rows,green),LinearLayout.LayoutParams(-1,dp(200)))
            rows.forEach { (date,_) -> val value=hours.filter { it.optString("date")==date }.fold(JSONObject()) { sum,h->addReport(sum,h) }; button(list,"$date · ${reportValue(value,metric)}") { reportDay(date,data) } }
        }
        productSales(list,data.rows("products"))
    }
}
fun MainActivity.reportValue(row: JSONObject,metric: String): String = if(metric=="net" && row.optLong("missing_costs")>0) tr("Incomplete") else if(metric in listOf("units","orders")) row.optLong(metric).toString() else money(row.optLong(metric))
fun MainActivity.reportSummary(parent: LinearLayout,row: JSONObject) {
    val cards=grid(parent,170,4)
    listOf("Sales before tax" to money(row.optLong("revenue")),"Net earnings" to reportValue(row,"net"),"Units sold" to row.optLong("units").toString(),"Orders" to row.optLong("orders").toString()).forEachIndexed { index,(label,value) ->
        val featured=index==1
        val c=column().apply { background=surface(if(featured) android.graphics.Color.rgb(18,62,48) else Color.WHITE,12); setPadding(dp(20),dp(18),dp(20),dp(18)) }
        cards.addView(c)
        caption(c,label).apply { if(featured) setTextColor(Color.rgb(190,216,204)) }
        text(c,value,20f,true).apply { if(featured) setTextColor(Color.WHITE) }
    }
    val strip=grid(parent,150,4)
    listOf("Tax" to money(row.optLong("tax")),"Costs" to if(row.optLong("missing_costs")>0) tr("Incomplete") else money(row.optLong("cost")),"Income" to money(row.optLong("income")),"Expenses" to money(row.optLong("expense"))).forEach { (label,value) ->
        val c=column(); strip.addView(c); caption(c,label); text(c,value,13f,true)
    }
    val count=row.optLong("orders"); caption(parent,"${tr("Average order value")}: ${money(if(count>0) kotlin.math.round(row.optLong("revenue").toDouble()/count).toLong() else 0)}")
    val revenue=row.optLong("revenue"); if(revenue>0 && row.optLong("missing_costs")==0L) caption(parent,"${tr("Gross margin")}: ${"%.1f".format(100.0*(revenue-row.optLong("cost"))/revenue)}%")
}
fun MainActivity.productSales(parent: LinearLayout,products: List<JSONObject>) {
    text(parent,"Products sold",20f,true)
    products.groupBy { it.optString("product_id") }.values.map { rows -> obj("name" to rows.first().optString("name"),"units" to rows.sumOf { it.optLong("units") },"revenue" to rows.sumOf { it.optLong("revenue") },"cost" to rows.sumOf { it.optLong("cost") },"missing_costs" to rows.sumOf { it.optLong("missing_costs") }) }.sortedByDescending { it.optLong("units") }.forEach {
        val c=card(parent)
        text(c,it.getString("name"),17f,true)
        text(c,"${tr("Units sold")}: ${it.getLong("units")} · ${tr("Sales before tax")}: ${money(it.getLong("revenue"))}")
        val incomplete=it.optLong("missing_costs")>0
        text(c,"${tr("Production cost")}: ${if(incomplete) tr("Incomplete") else money(it.getLong("cost"))}")
        text(c,"${tr("Profit after cost")}: ${if(incomplete) tr("Incomplete") else money(it.getLong("revenue")-it.getLong("cost"))}")
    }
}
fun MainActivity.reportDay(date: String,data: JSONObject) {
    dialog(date+" WIB") { content,_ ->
        if(date==today()) text(content,"Today is a partial day.",13f)
        val hours=data.rows("hours").filter { it.optString("date")==date }
        reportSummary(content,hours.fold(JSONObject()) { sum,hour -> addReport(sum,hour) })
        reportInsights(content,hours,true)
        val values=(0..23).map { hour -> "%02d:00".format(hour) to hours.filter { it.optInt("hour")==hour }.sumOf { it.optLong("revenue") } }
        content.addView(ReportChart(this,values,green),LinearLayout.LayoutParams(-1,dp(180)))
        val peak=values.maxByOrNull { it.second }; if(peak!=null && peak.second>0) text(content,"${tr("Peak sales time")}: ${peak.first} WIB")
        hours.groupBy { it.optInt("hour") }.toSortedMap().forEach { (hour,rows) -> val sum=rows.fold(JSONObject()) { acc,h->addReport(acc,h) }; text(content,"%02d:00 · %s · %s".format(hour,money(sum.optLong("revenue")),reportValue(sum,"net"))) }
        productSales(content,data.rows("products").filter { it.optString("date")==date })
    }
}
fun MainActivity.reportInsights(parent: LinearLayout,hours: List<JSONObject>,hourly: Boolean) {
    val periods=hours.groupBy { if(hourly) "%02d:00".format(it.optInt("hour")) else it.getString("date") }.map { (label,rows) -> label to rows.fold(JSONObject()) { sum,h->addReport(sum,h) } }
    val best=periods.maxByOrNull { it.second.optLong("revenue") }
    if(best!=null && best.second.optLong("orders")>0) text(parent,"${tr(if(hourly) "Strongest sales hour" else "Strongest sales day")}: ${best.first}")
    val peak=hours.groupBy { it.optInt("hour") }.map { (hour,rows) -> hour to rows.fold(JSONObject()) { sum,h->addReport(sum,h) } }.sortedWith(compareByDescending<Pair<Int,JSONObject>> { it.second.optLong("orders") }.thenByDescending { it.second.optLong("revenue") }).firstOrNull()
    if(peak!=null && peak.second.optLong("orders")>0) text(parent,"${tr("Busiest sales hour")}: %02d:00 WIB · %s".format(peak.first,peak.second.optLong("orders")))
}
private class ReportChart @JvmOverloads constructor(context: Context,val rows: List<Pair<String,Long>> = emptyList(),val color: Int = Color.rgb(13,128,97)): View(context) {
    private val paint=Paint(Paint.ANTI_ALIAS_FLAG)
    init { contentDescription=rows.joinToString { "${it.first}: ${it.second}" }; importantForAccessibility=IMPORTANT_FOR_ACCESSIBILITY_YES }
    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas); if(rows.isEmpty()) return
        val max=rows.maxOf { abs(it.second) }.coerceAtLeast(1).toDouble(); val step=width.toFloat()/rows.size
        val negative=rows.any { it.second<0 }; val baseline=if(negative) height*.5f else height-28f; val scale=if(negative) height*.4f else height*.8f
        paint.color=Color.LTGRAY; paint.strokeWidth=2f; canvas.drawLine(0f,baseline,width.toFloat(),baseline,paint)
        rows.forEachIndexed { index,(_,value) -> val y=baseline-(value/max*scale).toFloat(); paint.color=if(value<0) Color.rgb(181,65,54) else color; canvas.drawRect(index*step+1,minOf(y,baseline),(index+1)*step-1,maxOf(y,baseline)+1,paint) }
        paint.color=Color.DKGRAY; paint.textSize=android.util.TypedValue.applyDimension(android.util.TypedValue.COMPLEX_UNIT_SP,11f,resources.displayMetrics); canvas.drawText(rows.first().first,0f,height-3f,paint); val last=rows.last().first; canvas.drawText(last,(width-paint.measureText(last)).coerceAtLeast(0f),height-3f,paint)
    }
}
