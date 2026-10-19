package com.marpos.mobile

import android.content.Intent
import android.graphics.Paint
import android.graphics.Typeface
import android.graphics.pdf.PdfDocument
import android.net.Uri
import android.os.Bundle
import android.os.CancellationSignal
import android.os.ParcelFileDescriptor
import android.print.*
import android.widget.LinearLayout
import org.json.JSONArray
import org.json.JSONObject
import java.io.FileOutputStream
import java.time.Instant
import java.time.format.DateTimeFormatter

fun MainActivity.printerSettings(parent: LinearLayout) {
    val c=card(parent); text(c,"Receipt printer",20f,true)
    val key="printer:${repo.store}"
    val settings=repo.db.json(key) ?: obj("method" to "system","paper_width" to 58)
    val methods=listOf("Android print dialog","Android Bluetooth (RawBT)")
    val method=select(c,"Print method",methods,if(settings.optString("method")=="rawbt") methods[1] else methods[0])
    val widths=listOf("58 mm","80 mm"); val width=select(c,"Paper width",widths,if(settings.optInt("paper_width")==80) widths[1] else widths[0])
    text(c,"For Bluetooth printing, pair the printer in Android settings and configure it in RawBT. Marpos cannot confirm that paper was printed.",13f)
    button(c,"Save printer settings") { repo.db.put(key,obj("method" to if(method.selectedItemPosition==1) "rawbt" else "system","paper_width" to if(width.selectedItemPosition==1) 80 else 58)); notice("Printer settings saved") }
    button(c,"Print test receipt") {
        val sale=obj("reference" to "TEST","buyer_name" to "Guest","completed_at" to now(),"cashier_name" to repo.auth!!.optString("name"),"subtotal" to 10000,"tax_applied" to false,"tax_total" to 0,"grand_total" to 10000,"payment_method_note" to "cash")
        printReceipt(obj("sale" to sale,"items" to JSONArray().put(obj("product_name" to "Test item","quantity" to 1,"unit_price" to 10000,"line_total" to 10000))))
    }
}
fun MainActivity.receiptText(detail: JSONObject,width: Int): String {
    val columns=if(width==80) 48 else 32
    val lines=mutableListOf<String>()
    fun line(text: String) {
        val cleaned=text.map { if(it.isISOControl()) ' ' else it }.joinToString("")
        if(cleaned.isEmpty()) lines.add("") else cleaned.codePoints().toArray().toList().chunked(columns).forEach { chunk->lines.add(String(chunk.toIntArray(),0,chunk.size)) }
    }
    fun total(label: String,value: Long) { line(tr(label)); line(money(value).padStart(columns)) }
    val sale=detail.getJSONObject("sale"); val session=repo.auth!!
    line(session.optString("store_name")); if(session.optString("address").isNotEmpty()) line(session.getString("address"))
    line(sale.optString("reference").ifBlank { sale.optString("receipt_number",tr("Pending sync")) })
    line(runCatching { DateTimeFormatter.ofPattern("dd MMM yyyy HH:mm").withZone(wib).format(Instant.parse(sale.getString("completed_at")))+" WIB" }.getOrDefault(sale.optString("completed_at")))
    line("${tr("Cashier")}: ${sale.optString("cashier_name")}")
    listOf("buyer_name","buyer_phone","buyer_email").forEach { if(sale.optString(it).isNotBlank()) line(sale.getString(it)) }
    val payment=when(sale.optString("payment_method_note")) { "cash"->"Tunai";"qris"->"QRIS";"unpaid"->"Piutang";else->"" }
    if(payment.isNotEmpty()) line("${tr("Payment method note")}: $payment")
    if(sale.optInt("revision")>0) line("${tr("Revision")}: ${sale.optInt("revision")}")
    line("-".repeat(columns))
    detail.rows("items").forEach { item ->
        total("${item.optLong("quantity")} x ${item.optString("product_name")}",item.optLong("line_total"))
        line("${item.optLong("quantity")} x ${money(item.optLong("unit_price"))}")
        if(item.optString("product_description").isNotBlank()) line(item.getString("product_description"))
        item.rows("addons").forEach { line("+ ${it.optString("option_name")} ${money(it.optLong("price_delta"))}") }
        if(item.optLong("discount_total")>0) line("${tr("Discount")}: -${money(item.optLong("discount_total"))}")
        if(item.optLong("discount_per_unit")>0) line("${money(item.optLong("discount_per_unit"))} ${tr("Per unit")}")
        line("")
    }
    line("-".repeat(columns)); total("Subtotal",sale.optLong("subtotal")); total("${tr("Tax")} ${if(sale.optBoolean("tax_applied")) sale.optString("tax_percentage")+"%" else tr("Excluded")}",sale.optLong("tax_total")); total("Total",sale.optLong("grand_total")); line(tr("Thank you"))
    return lines.joinToString("\n")+"\n\n\n"
}
fun MainActivity.printReceipt(detail: JSONObject) {
    val settings=repo.db.json("printer:${repo.store}") ?: obj("method" to "system","paper_width" to 58)
    val width=settings.optInt("paper_width",58)
    val receipt=receiptText(detail,width)
    if(settings.optString("method")=="rawbt") {
        val intent=Intent(Intent.ACTION_VIEW,Uri.parse("rawbt:"+Uri.encode(receipt))).setPackage("ru.a402d.rawbtprinter")
        try { startActivity(intent) } catch(e: android.content.ActivityNotFoundException) { notice("Install RawBT and configure the printer in RawBT before printing.") }
    } else {
        val manager=getSystemService(PrintManager::class.java)
        manager.print("Marpos receipt",ReceiptDocument(receipt,width),PrintAttributes.Builder().setMediaSize(PrintAttributes.MediaSize("marpos-$width","$width mm",(width/25.4*1000).toInt(),11000)).setMinMargins(PrintAttributes.Margins.NO_MARGINS).build())
    }
}
private class ReceiptDocument(val text: String,val width: Int): PrintDocumentAdapter() {
    private var attributes: PrintAttributes?=null
    private var lines=text.lines()
    private var pageWidth=if(width==80) 227 else 164
    private var pageHeight=792
    private var perPage=70
    override fun onLayout(old: PrintAttributes?,new: PrintAttributes?,cancellation: CancellationSignal,callback: LayoutResultCallback,extras: Bundle?) {
        if(cancellation.isCanceled) { callback.onLayoutCancelled(); return }
        attributes=new
        new?.mediaSize?.let { pageWidth=it.widthMils*72/1000; pageHeight=it.heightMils*72/1000 }
        perPage=((pageHeight-24)/11).coerceAtLeast(1)
        callback.onLayoutFinished(PrintDocumentInfo.Builder("marpos-receipt.pdf").setContentType(PrintDocumentInfo.CONTENT_TYPE_DOCUMENT).setPageCount((lines.size+perPage-1)/perPage).build(),old!=new)
    }
    override fun onWrite(pages: Array<out PageRange>,destination: ParcelFileDescriptor,cancellation: CancellationSignal,callback: WriteResultCallback) {
        val pdf=PdfDocument()
        try {
            val paint=Paint(Paint.ANTI_ALIAS_FLAG).apply { typeface=Typeface.MONOSPACE; textSize=7f }
            val written=mutableListOf<PageRange>()
            lines.chunked(perPage).forEachIndexed { index,chunk ->
                if(cancellation.isCanceled) { callback.onWriteCancelled(); return }
                if(pages.any { index in it.start..it.end }) {
                    val page=pdf.startPage(PdfDocument.PageInfo.Builder(pageWidth,pageHeight,index+1).create())
                    val available=(pageWidth-20).coerceAtLeast(1).toFloat()
                    val widest=chunk.maxOfOrNull { paint.measureText(it) } ?: 1f
                    page.canvas.save(); if(widest>available) page.canvas.scale(available/widest,1f,10f,0f)
                    chunk.forEachIndexed { row,line -> page.canvas.drawText(line,10f,18f+row*11f,paint) }; page.canvas.restore()
                    pdf.finishPage(page); written.add(PageRange(index,index))
                }
            }
            FileOutputStream(destination.fileDescriptor).use { pdf.writeTo(it) }
            if(cancellation.isCanceled) callback.onWriteCancelled() else callback.onWriteFinished(written.toTypedArray())
        } catch(e: Exception) { callback.onWriteFailed(e.message) } finally { pdf.close() }
    }
}
