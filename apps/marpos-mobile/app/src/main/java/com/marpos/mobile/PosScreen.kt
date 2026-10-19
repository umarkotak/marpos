package com.marpos.mobile

import android.app.AlertDialog
import android.widget.LinearLayout
import org.json.JSONArray
import org.json.JSONObject

fun MainActivity.posScreen() {
    heading(body,"Point of sale")
    val draft=repo.draft()
    val actions=row(body)
    button(actions,"Products") { catalogPicker { line -> val d=repo.draft(); d.getJSONArray("items").put(line); repo.saveDraft(d); render() } }
    button(actions,"Add ad hoc product") { adHoc() }
    val held=row(body)
    button(held,"Hold and start new") { repo.startDraft(); render() }
    button(held,"Held orders") {
        val drafts=repo.workspace().rows("drafts")
        AlertDialog.Builder(this).setTitle(tr("Held orders")).setItems(drafts.map { "${it.optString("buyer_name","Guest")} · ${it.rows("items").size} ${tr("Items")}" }.toTypedArray()) { _,index -> repo.resumeDraft(drafts[index].getString("id")); render() }.show()
    }
    val buyer=card(body)
    text(buyer,"Buyer details",18f,true)
    listOf("buyer_name" to "Buyer name","buyer_phone" to "Buyer phone","buyer_email" to "Buyer email").forEach { (key,label) ->
        val field=input(buyer,label,draft.optString(key)); changed(field) { val d=repo.draft(); d.put(key,field.value()); repo.saveDraft(d) }
    }
    draft.rows("items").forEach { item ->
        val c=card(body)
        text(c,item.getString("product_name"),18f,true)
        if(item.optString("product_description").isNotBlank()) text(c,item.getString("product_description"),13f)
        item.rows("addons").forEach { text(c,"+ ${it.getString("option_name")} · ${money(it.getLong("price_delta"))}",13f) }
        text(c,"${item.getLong("quantity")} × ${money(item.getLong("unit_price"))} = ${money(item.getLong("line_total"))}")
        if(item.optLong("discount_total")>0) text(c,"${tr("Discount")}: −${money(item.getLong("discount_total"))}")
        val buttons=row(c)
        button(buttons,"Edit item") { editLine(item) { next -> val d=repo.draft(); d.put("items",d.rows("items").map { if(it.getString("id")==next.getString("id")) next else it }.array()); repo.saveDraft(d); render() } }
        button(buttons,"Remove") { confirm("Remove this item?") { val d=repo.draft(); d.put("items",d.rows("items").filter { it.getString("id")!=item.getString("id") }.array()); repo.saveDraft(d); render() } }
    }
    val summary=card(body)
    val tax=check(summary,"Add tax",draft.optBoolean("tax_on",true))
    tax.setOnCheckedChangeListener { _,checked -> safe { val d=repo.draft(); d.put("tax_on",checked); repo.saveDraft(d); render() } }
    val totals=totals(draft.rows("items"),draft.optBoolean("tax_on",true),taxRate(repo.auth!!.optString("tax_percentage","0")))
    text(summary,"${tr("Subtotal")}: ${money(totals.getLong("subtotal"))}")
    text(summary,"${tr("Tax")} (${repo.auth!!.optString("tax_percentage")} %): ${money(totals.getLong("tax_total"))}")
    text(summary,"${tr("Total")}: ${money(totals.getLong("grand_total"))}",22f,true)
    val methods=listOf("cash","qris","unpaid")
    val payment=select(summary,"Payment method note",listOf("Tunai","QRIS","Piutang"),when(draft.optString("payment_method_note")){ "qris"->"QRIS"; "unpaid"->"Piutang";else->"Tunai" })
    payment.onItemSelectedListener=object: android.widget.AdapterView.OnItemSelectedListener {
        override fun onNothingSelected(parent: android.widget.AdapterView<*>?) {}
        override fun onItemSelected(parent: android.widget.AdapterView<*>?,view: android.view.View?,position: Int,id: Long) {
            safe { val current=repo.draft(); if(current.getString("id")==draft.getString("id")) repo.saveDraft(current.put("payment_method_note",methods[position])) }
        }
    }
    button(summary,"Review sale",true) {
        val d=repo.draft().put("payment_method_note",methods[payment.selectedItemPosition]); repo.saveDraft(d)
        val sale=repo.sale(d)
        dialog("Review sale") { content,dialog ->
            receiptSummary(content,sale,sale.rows("items"))
            text(content,"This records payment handled outside Marpos. It does not process a payment.",13f)
            button(content,"Print receipt") { printReceipt(obj("sale" to sale.copy().put("reference",tr("Draft receipt")),"items" to sale.getJSONArray("items"))) }
            button(content,"Complete sale",true) {
                repo.checkout(sale); dialog.dismiss(); render()
                notice("Sale saved on this device. Sync will retry when the server returns.")
                retrySyncAfterSale()
            }
        }
    }.isEnabled=draft.rows("items").isNotEmpty()
    button(body,"Discard this unfinished order") { confirm("Discard this unfinished order?") { repo.discardDraft(draft.getString("id")); render() } }
}

fun MainActivity.retrySyncAfterSale() { retrySync() }

fun MainActivity.catalogPicker(onSelect: (JSONObject)->Unit) {
    dialog("Products") { content, dialog ->
        val search=input(content,"Search products")
        val categories=listOf("All")+repo.products().map { it.optString("category","lainnya") }.distinct().sorted()
        val category=select(content,"Category",categories)
        val list=column(content)
        fun draw() {
            list.removeAllViews()
            val found=repo.products().filter { (it.optString("name")+" "+it.optString("sku")).contains(search.value(),true) && (category.selectedItemPosition==0 || it.optString("category")==categories[category.selectedItemPosition]) }.sortedBy { it.optString("name") }
            found.forEach { product ->
                val c=card(list)
                productImage(c,product)
                button(c,"${product.getString("name")} · ${money(product.getLong("price"))}") { chooseAddons(product) { addons -> onSelect(repo.line(product,addons)); dialog.dismiss() } }
            }
            if(found.isEmpty()) text(list,"No products found")
        }
        changed(search) { draw() }
        category.onItemSelectedListener=object: android.widget.AdapterView.OnItemSelectedListener { override fun onNothingSelected(p: android.widget.AdapterView<*>?) {}; override fun onItemSelected(p: android.widget.AdapterView<*>?,v: android.view.View?,position:Int,id:Long) { draw() } }
        button(content,"Refresh products") { work({ repo.refreshCatalog() }) { draw() } }
        draw()
    }
}

fun MainActivity.chooseAddons(product: JSONObject, done:(List<JSONObject>)->Unit) {
    val groups=product.rows("addon_groups")
    if(groups.isEmpty()) { done(emptyList()); return }
    dialog(product.getString("name")) { content,dialog ->
        val choices=mutableMapOf<String,MutableList<String>>()
        groups.forEach { group ->
            text(content,group.getString("name")+if(group.optBoolean("required")) " *" else "",18f,true)
            val selected=mutableListOf<String>(); choices[group.getString("id")]=selected
            val checks=mutableListOf<android.widget.CheckBox>()
            group.rows("options").forEach { option ->
                val c=check(content,"${option.getString("name")} +${money(option.getLong("price_delta"))}"); checks.add(c)
                c.setOnCheckedChangeListener { _,checked ->
                    if(checked) { if(group.getString("selection_mode")=="single") checks.filter { it!==c }.forEach { it.isChecked=false }; selected.add(option.getString("id")) }
                    else selected.remove(option.getString("id"))
                }
            }
        }
        button(content,"Add to order",true) {
            require(groups.none { it.optBoolean("required") && choices[it.getString("id")].isNullOrEmpty() }) { "Select an option in each required group." }
            val addons=groups.flatMap { group -> group.rows("options").filter { it.getString("id") in choices[group.getString("id")]!! }.map { option -> obj("id" to uuid(),"option_id" to option.getString("id"),"group_name" to group.getString("name"),"option_name" to option.getString("name"),"price_delta" to option.getLong("price_delta"),"cost_delta" to option.optLong("cost_delta")) } }
            done(addons); dialog.dismiss()
        }
    }
}

fun MainActivity.editLine(item: JSONObject, done:(JSONObject)->Unit) {
    dialog("Edit item") { content,dialog ->
        text(content,item.getString("product_name"),18f,true)
        val quantity=input(content,"Quantity",item.getLong("quantity").toString(),true)
        val price=input(content,"Unit price (IDR)",item.getLong("unit_price").toString(),true)
        val perUnit=check(content,"Discount per unit",item.optLong("discount_per_unit")>0)
        val discount=input(content,"Discount (IDR)",(item.optLong("discount_per_unit").takeIf { it>0 } ?: item.optLong("discount_total")).toString(),true)
        val addons=item.rows("addons").map { it to input(content,it.optString("option_name")+" (IDR)",it.optLong("price_delta").toString(),true) }
        button(content,"Save",true) {
            val next=item.copy().put("quantity",quantity.value().toLongOrNull() ?: 0).put("unit_price",amount(price.value()))
            val amount=amount(discount.value()); next.put("discount_per_unit",if(perUnit.isChecked) amount else 0).put("discount_total",if(perUnit.isChecked) 0 else amount)
            next.put("addons",addons.map { (addon,field) -> addon.copy().put("price_delta",amount(field.value())) }.array())
            done(priceLine(next)); dialog.dismiss()
        }
    }
}

fun MainActivity.adHoc() {
    dialog("Add ad hoc product") { content,dialog ->
        text(content,"Use Products to reuse an existing product. A new ad hoc product saves in the Ad hoc category.",13f)
        val name=input(content,"Name"); val description=input(content,"Description"); val price=input(content,"Price (IDR)","0",true)
        button(content,"Add to order",true) {
            repo.requireOfflineAccess()
            require(name.value().isNotBlank() && name.value().length<=200 && description.value().length<=2000 && name.value().none { it.isISOControl() } && description.value().none { it.isISOControl() }) { "Check the product name and description." }
            val id=uuid()
            val product=obj("id" to id,"store_id" to repo.store,"sku" to "ADHOC-$id","name" to name.value(),"description" to description.value(),"category" to "ad hoc","price" to amount(price.value()),"cost_configured" to false,"cost_breakdown" to JSONArray(),"addon_groups" to JSONArray(),"image_urls" to JSONArray())
            // Save product and draft together so neither can be lost on process death.
            repo.db.writableDatabase.beginTransaction()
            try { repo.db.queue("product",product,repo.store,repo.user); val d=repo.draft(); d.getJSONArray("items").put(repo.line(product,emptyList())); repo.saveDraft(d); repo.db.writableDatabase.setTransactionSuccessful() } finally { repo.db.writableDatabase.endTransaction() }
            dialog.dismiss(); render()
        }
    }
}
