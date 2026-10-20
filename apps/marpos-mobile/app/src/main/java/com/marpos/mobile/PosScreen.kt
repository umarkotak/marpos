package com.marpos.mobile

import android.app.AlertDialog
import android.widget.LinearLayout
import org.json.JSONArray
import org.json.JSONObject

fun MainActivity.posScreen(host: android.widget.FrameLayout) {
    val layout=column()
    host.addView(layout,android.widget.FrameLayout.LayoutParams(-1,-1))
    val panels=row(layout); weight(panels,layout)
    val catalogScroll=android.widget.ScrollView(this).apply { isFillViewport=true }
    val cart=column().apply { setBackgroundColor(android.graphics.Color.WHITE) }
    if(!tablet) {
        val tabs=row(layout).apply { setPadding(dp(14),dp(4),dp(14),dp(4)); setBackgroundColor(android.graphics.Color.WHITE) }
        layout.removeView(tabs); layout.addView(tabs,0)
        listOf("catalog" to "Products","order" to "Current order").forEach { (panel,label) ->
            button(tabs,label) { mobilePanel=panel; render() }.apply {
                background=touchSurface(if(mobilePanel==panel) WebUi.secondary else android.graphics.Color.TRANSPARENT,8,null)
            }
        }
    }
    panels.addView(catalogScroll,LinearLayout.LayoutParams(0,-1,1f))
    panels.addView(cart,LinearLayout.LayoutParams(if(tablet) dp(if(resources.configuration.screenWidthDp<=1050) 310 else 390) else -1,-1))
    catalogScroll.visibility=if(tablet || mobilePanel=="catalog") android.view.View.VISIBLE else android.view.View.GONE
    cart.visibility=if(tablet || mobilePanel=="order") android.view.View.VISIBLE else android.view.View.GONE
    val catalog=column().apply { setPadding(dp(if(tablet && resources.configuration.screenWidthDp>1050) 31 else 16),dp(if(tablet) 24 else 20),dp(16),dp(24)) }
    catalogScroll.addView(catalog); body=catalog
    pageHeading(catalog,"Checkout","Point of sale","Choose products to start a sale.")
    button(catalog,"+ " + tr("Add ad hoc product")) { adHoc() }.layoutParams=LinearLayout.LayoutParams(-2,-2).apply { bottomMargin=dp(12) }
    val search=input(catalog,"Search products",catalogSearch).apply { hint=tr("Name or SKU") }
    val products=column(catalog)
    fun drawCatalog() {
        products.removeAllViews()
        val filtered=repo.products().filter { (it.optString("name")+" "+it.optString("sku")).contains(catalogSearch,true) }.sortedBy { it.optString("name") }
        filtered.groupBy { it.optString("category","lainnya").ifBlank { "lainnya" } }.toSortedMap().forEach { (category,rows) ->
            text(products,category.replaceFirstChar { it.uppercase() },17f,true)
            val grid=grid(products,forceTwo=resources.configuration.screenWidthDp<=650)
            rows.forEach { product ->
                val c=column().apply {
                    setPadding(dp(14),dp(14),dp(14),dp(14)); background=touchSurface(android.graphics.Color.WHITE,13)
                    minimumHeight=dp(220); isFocusable=true; contentDescription="${product.optString("name")}, ${money(product.optLong("price"))}"
                    setOnClickListener { if(!isWorking) safe { chooseAddons(product) { addons ->
                        val draft=repo.draft(); draft.getJSONArray("items").put(repo.line(product,addons)); repo.saveDraft(draft); drawCart(cart)
                    } } }
                }
                productImage(c,product)
                text(c,product.optString("name"),15f,true)
                text(c,money(product.optLong("price")),14f,true).setTextColor(WebUi.primary)
                if(product.rows("addon_groups").isNotEmpty()) caption(c,"Add-ons available")
                grid.addView(c)
            }
        }
        if(filtered.isEmpty()) emptyState(products,"package",if(repo.products().isEmpty()) "No products yet" else "No matching products",if(repo.products().isEmpty()) "Add an ad hoc product to start." else "Try another name or SKU.")
    }
    changed(search) { catalogSearch=search.value(); drawCatalog() }
    drawCatalog(); drawCart(cart)
}

fun MainActivity.drawCart(cart: LinearLayout) {
    cart.removeAllViews()
    val draft=repo.draft()
    val items=draft.rows("items")
    val header=column(cart).apply { setPadding(dp(16),dp(12),dp(16),dp(10)) }
    val title=row(header).apply { gravity=android.view.Gravity.CENTER_VERTICAL }
    val titleCopy=column(title); weight(titleCopy,title)
    text(titleCopy,"${tr("Orders")} ${repo.workspace().rows("drafts").size}",16f,true)
    caption(titleCopy,"${items.size} ${tr("Items")} · ${tr("Saved on this device")}").textSize=11f
    val newOrder=button(title,"+ " + tr("New order")) { repo.startDraft(); drawCart(cart) }
    newOrder.layoutParams=LinearLayout.LayoutParams(-2,-2); newOrder.textSize=12f
    val heldScroll=android.widget.HorizontalScrollView(this).apply { isHorizontalScrollBarEnabled=false }
    header.addView(heldScroll,LinearLayout.LayoutParams(-1,-2))
    val held=LinearLayout(this).apply { orientation=LinearLayout.HORIZONTAL }; heldScroll.addView(held)
    repo.workspace().rows("drafts").forEachIndexed { index,order ->
        val chip=column().apply {
            background=surface(if(order.getString("id")==draft.getString("id")) WebUi.secondary else android.graphics.Color.WHITE,8)
            setPadding(dp(8),0,dp(4),0)
        }
        held.addView(chip,LinearLayout.LayoutParams(dp(140),-2).apply { marginEnd=dp(6); topMargin=dp(8) })
        val r=row(chip)
        val choose=button(r,"${tr("Order")} ${index+1}") { repo.resumeDraft(order.getString("id")); drawCart(cart) }
        choose.background=touchSurface(android.graphics.Color.TRANSPARENT,6,null); choose.textSize=12f
        iconButton(r,"close","Discard this unfinished order") { confirm("Discard this unfinished order?") { repo.discardDraft(order.getString("id")); drawCart(cart) } }
        caption(chip,"${order.optString("buyer_name")} · ${order.rows("items").size} ${tr("Items")}").apply { textSize=11f; maxLines=1 }
    }
    divider(cart)
    val buyer=row(cart).apply { gravity=android.view.Gravity.CENTER_VERTICAL; setPadding(dp(20),dp(4),dp(12),dp(4)); background=touchSurface(android.graphics.Color.WHITE,0,null); isFocusable=true
        contentDescription=tr("Buyer details"); setOnClickListener { if(!isWorking) buyerEditor { drawCart(cart) } }
    }
    val buyerCopy=column(buyer); weight(buyerCopy,buyer)
    caption(buyerCopy,"Buyer details").apply { textSize=11f; setPadding(0,dp(6),0,dp(3)) }
    text(buyerCopy,listOf("buyer_name","buyer_phone","buyer_email").map { draft.optString(it) }.firstOrNull { it.isNotBlank() } ?: tr("Add buyer details"),13f,true)
    buyer.addView(UiIcon(this,"edit"),LinearLayout.LayoutParams(dp(17),dp(17)))
    divider(cart)
    val scroll=android.widget.ScrollView(this).apply { isFillViewport=true }
    cart.addView(scroll,LinearLayout.LayoutParams(-1,0,1f))
    val lines=column().apply { setPadding(dp(20),dp(8),dp(20),dp(8)) }; scroll.addView(lines)
    if(items.isEmpty()) emptyState(lines,"cart","No items yet","Choose a product to add it here.")
    items.forEach { item ->
        val c=column(lines)
        val head=row(c).apply { gravity=android.view.Gravity.CENTER_VERTICAL }
        val name=text(head,item.getString("product_name"),14f,true); weight(name,head)
        iconButton(head,"more","Edit item") { editLine(item) { next ->
            val current=repo.draft(); current.put("items",current.rows("items").map { if(it.getString("id")==next.getString("id")) next else it }.array()); repo.saveDraft(current); drawCart(cart)
        } }
        fun remove() { val current=repo.draft(); current.put("items",current.rows("items").filter { it.getString("id")!=item.getString("id") }.array()); repo.saveDraft(current); drawCart(cart) }
        iconButton(head,"close","Remove item") { remove() }
        if(item.optString("product_description").isNotBlank()) caption(c,item.getString("product_description"))
        item.rows("addons").forEach { caption(c,"+ ${it.optString("option_name")} (${money(it.optLong("price_delta"))})") }
        if(item.optLong("discount_total")>0) caption(c,"${tr("Discount")}: −${money(item.optLong("discount_total"))}")
        val foot=row(c).apply { gravity=android.view.Gravity.CENTER_VERTICAL }
        fun change(delta: Int) {
            if(item.optLong("quantity")+delta<=0) { remove(); return }
            val next=priceLine(item.copy().put("quantity",item.optLong("quantity")+delta))
            val current=repo.draft(); current.put("items",current.rows("items").map { if(it.getString("id")==next.getString("id")) next else it }.array()); repo.saveDraft(current); drawCart(cart)
        }
        iconButton(foot,"minus","Decrease quantity") { change(-1) }
        text(foot,item.optLong("quantity").toString(),13f,true)
        iconButton(foot,"plus","Increase quantity") { change(1) }
        val price=text(foot,money(item.optLong("line_total")),14f,true).apply { gravity=android.view.Gravity.END; setTextColor(WebUi.primary) }; weight(price,foot)
        divider(c)
    }
    divider(cart)
    val summary=column(cart).apply { setPadding(dp(20),dp(8),dp(20),dp(16)) }
    val totals=totals(items,draft.optBoolean("tax_on",true),taxRate(repo.auth!!.optString("tax_percentage","0")))
    val discount=totals.optLong("discount_total")
    if(discount>0) {
        totalRow(summary,"Subtotal before discount",money(totals.getLong("subtotal")+discount))
        totalRow(summary,"Discount","−"+money(discount))
    }
    totalRow(summary,"Subtotal",money(totals.getLong("subtotal")))
    val tax=check(summary,"${tr("Add tax")} (${repo.auth!!.optString("tax_percentage","0")}%)",draft.optBoolean("tax_on",true))
    tax.setOnCheckedChangeListener { _,checked -> safe { repo.saveDraft(repo.draft().put("tax_on",checked)); drawCart(cart) } }
    totalRow(summary,"Tax",money(totals.getLong("tax_total")))
    totalRow(summary,"Total",money(totals.getLong("grand_total")),true)
    button(summary,"${tr("Review sale")}    ${money(totals.getLong("grand_total"))}",true) { reviewSale() }.apply {
        contentDescription=tr("Review sale"); isEnabled=items.isNotEmpty()
    }
}

fun MainActivity.buyerEditor(done: () -> Unit) {
    val draft=repo.draft()
    dialog("Buyer details") { content,dialog ->
        val fields=listOf("buyer_name" to "Buyer name","buyer_phone" to "Buyer phone","buyer_email" to "Buyer email").associate { (key,label) -> key to input(content,label,draft.optString(key)) }
        button(content,"Save",true) {
            val current=repo.draft(); require(current.getString("id")==draft.getString("id")) { "The active draft changed. Reload the order before editing." }
            fields.forEach { (key,field) -> current.put(key,field.value()) }; repo.saveDraft(current); dialog.dismiss(); done()
        }
    }
}
fun MainActivity.reviewSale() {
    val draft=repo.draft()
    val draftId=draft.getString("id")
    val sale=repo.sale(draft)
    if(sale.optString("payment_method_note").isBlank()) sale.put("payment_method_note","cash")
    dialog("Review sale") { content,dialog ->
        receiptSummary(content,sale,sale.rows("items"))
        text(content,"Payment method note",13f,true)
        val options=android.widget.RadioGroup(this).apply { orientation=LinearLayout.HORIZONTAL }; content.addView(options)
        listOf("unpaid" to "Piutang","qris" to "QRIS","cash" to "Tunai").forEach { (key,label) ->
            val radio=android.widget.RadioButton(this).apply { id=android.view.View.generateViewId(); text=label; textSize=13f; minHeight=dp(48); buttonTintList=android.content.res.ColorStateList.valueOf(WebUi.primary) }
            options.addView(radio,LinearLayout.LayoutParams(0,-2,1f))
            radio.isChecked=sale.optString("payment_method_note","cash")==key
            radio.setOnCheckedChangeListener { _,checked -> if(checked) safe {
                val current=repo.draft()
                require(current.getString("id")==draftId) { "The active draft changed. Review the sale again." }
                repo.saveDraft(current.put("payment_method_note",key)); sale.put("payment_method_note",key)
            } }
        }
        caption(content,"This records payment handled outside Marpos. It does not process a payment.")
        button(content,"Print receipt") { printReceipt(obj("sale" to sale.copy().put("reference",tr("Draft receipt")),"items" to sale.getJSONArray("items"))) }
        button(content,"Complete sale",true) {
            repo.checkout(sale,draftId); dialog.dismiss(); mobilePanel="catalog"; render()
            notice("Sale saved on this device. Sync will retry when the server returns."); retrySyncAfterSale()
        }
    }
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
