package com.marpos.mobile

import android.app.AlertDialog
import android.graphics.BitmapFactory
import android.net.Uri
import android.widget.ImageView
import android.widget.LinearLayout
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

private val imageExecutor=Executors.newFixedThreadPool(2)
fun MainActivity.productImage(parent: LinearLayout,product: JSONObject,compact: Boolean=false) {
    val frame=android.widget.FrameLayout(this).apply { background=surface(android.graphics.Color.rgb(230,244,236),9,null); clipToOutline=true }
    parent.addView(frame,LinearLayout.LayoutParams(if(compact) dp(64) else -1,dp(if(compact) 64 else 120)))
    frame.addView(android.widget.TextView(this).apply {
        text=product.optString("name").take(1).uppercase(); textSize=if(compact) 24f else 38f
        gravity=android.view.Gravity.CENTER; setTextColor(WebUi.primary); typeface=android.graphics.Typeface.DEFAULT_BOLD
    },android.widget.FrameLayout.LayoutParams(-1,-1))
    val path=product.optJSONArray("image_urls")?.optString(0) ?: return
    if(!path.startsWith("/backend/images/${repo.store}/") || !Regex("/backend/images/[a-f0-9-]+/[a-f0-9-]+\\.avif").matches(path)) return
    val view=ImageView(this).apply { contentDescription=product.optString("name"); scaleType=ImageView.ScaleType.CENTER_CROP; frame.addView(this,android.widget.FrameLayout.LayoutParams(-1,-1)) }
    val base=repo.api.base
    val imageFile=File(filesDir,"images/${base.hashCode()}/${path.substringAfter("/backend/images/")}")
    imageExecutor.execute {
        runCatching {
            if(!imageFile.exists() || System.currentTimeMillis()-imageFile.lastModified()>7L*24*60*60*1000) {
                runCatching {
                    val connection=URL(base+path.removePrefix("/backend")).openConnection() as HttpURLConnection
                    try {
                        connection.connectTimeout=8000; connection.readTimeout=8000; connection.instanceFollowRedirects=false
                        check(connection.responseCode==200)
                        val data=connection.inputStream.use { it.readBytesLimited(8*1024*1024) }
                        imageFile.parentFile!!.mkdirs(); val temp=File(imageFile.path+".tmp-${uuid()}"); temp.writeBytes(data); check(temp.renameTo(imageFile))
                    } finally { connection.disconnect() }
                }
            }
            val bounds=BitmapFactory.Options().apply { inJustDecodeBounds=true }
            BitmapFactory.decodeFile(imageFile.path,bounds)
            val options=BitmapFactory.Options().apply {
                inSampleSize=1
                while(bounds.outWidth/inSampleSize>512 || bounds.outHeight/inSampleSize>512) inSampleSize*=2
            }
            BitmapFactory.decodeFile(imageFile.path,options)
        }.getOrNull()?.let { bitmap -> runOnUiThread { if(!isDestroyed) view.setImageBitmap(bitmap) } }
    }
}
fun java.io.InputStream.readBytesLimited(limit: Int): ByteArray {
    val out=java.io.ByteArrayOutputStream(); val buffer=ByteArray(8192)
    while(true) { val n=read(buffer); if(n<0) break; require(out.size()+n<=limit) { "Choose an image smaller than 8 MB." }; out.write(buffer,0,n) }
    return out.toByteArray()
}
fun MainActivity.productsScreen(trash: Boolean=false) {
    pageHeading(body,"Catalog",if(trash) "Deleted products" else "Products",if(trash) "Restore products for this store." else "Set prices and add-on choices for this store.")
    val actions=row(body)
    if(repo.edit && !trash) button(actions,"New product",true) { productEditor(null) }
    if(repo.superadmin) button(actions,if(trash) "Active products" else "Deleted products") { body.removeAllViews(); productsScreen(!trash) }
    val controls=grid(body,220,3)
    val searchCell=column(); controls.addView(searchCell)
    val search=input(searchCell,"Search products")
    val categories=listOf("All categories")+repo.products().map { it.optString("category","lainnya") }.distinct().sorted()
    val categoryCell=column(); controls.addView(categoryCell)
    val category=select(categoryCell,"Category",categories)
    val sorts=listOf("Name","Price: low to high","Price: high to low")
    val sortCell=column(); controls.addView(sortCell)
    val sort=select(sortCell,"Sort by",sorts)
    val list=column(body).apply { background=surface(android.graphics.Color.WHITE,14); clipToOutline=true }
    fun show(products: List<JSONObject>) {
        list.removeAllViews()
        val visible=products.filter { (it.optString("name")+" "+it.optString("sku")+" "+it.optString("category")).contains(search.value(),true) && (category.selectedItemPosition==0 || it.optString("category")==categories[category.selectedItemPosition]) }.let { rows -> when(sort.selectedItemPosition) { 1->rows.sortedBy { it.getLong("price") }; 2->rows.sortedByDescending { it.getLong("price") }; else->rows.sortedBy { it.optString("name") } } }
        val count=row(list).apply { setPadding(dp(22),dp(12),dp(22),dp(12)) }
        val result=text(count,"${visible.size} / ${products.size} ${tr("Products")}",13f,true); weight(result,count)
        caption(count,"Prices in IDR")
        divider(list)
        visible.forEach { product ->
            val c=column(list).apply { setPadding(dp(if(tablet) 22 else 13),dp(15),dp(if(tablet) 22 else 13),dp(15)) }
            val r=row(c).apply { gravity=android.view.Gravity.CENTER_VERTICAL }
            productImage(r,product,true)
            val info=column(r).apply { setPadding(dp(14),0,dp(10),0) }; weight(info,r)
            text(info,product.getString("name"),15f,true)
            caption(info,"${product.getString("sku")} · ${product.optString("category")}")
            if(product.optString("description").isNotEmpty()) caption(info,product.getString("description"))
            text(info,money(product.getLong("price")),14f,true).setTextColor(WebUi.primary)
            if(repo.edit) {
                val actions=if(tablet) column(r).apply { layoutParams=LinearLayout.LayoutParams(dp(130),-2) } else row(c)
                if(!trash) button(actions,"Edit product") { productEditor(product) }
                if(!trash || repo.superadmin) button(actions,if(trash) "Restore" else "Delete") {
                    confirm(if(trash) "Restore this product?" else "Delete this product?") { mutate(repo.path("products/${product.getString("id")}${if(trash) "/restore" else ""}"),if(trash) "POST" else "DELETE",done={ work({ repo.refreshCatalog() }) { render() } }) }
                }
            }
            divider(list)
        }
        if(visible.isEmpty()) emptyState(list,"package","No matching products","Try another name or SKU.")
    }
    var products=repo.products(); show(products)
    changed(search) { show(products) }
    val filters=object: android.widget.AdapterView.OnItemSelectedListener {
        override fun onNothingSelected(p: android.widget.AdapterView<*>?) {}
        override fun onItemSelected(p: android.widget.AdapterView<*>?,v: android.view.View?,position:Int,id:Long) { show(products) }
    }
    category.onItemSelectedListener=filters; sort.onItemSelectedListener=filters
    work({ if(trash) (repo.get(repo.path("products?trash=true")) as JSONArray).objects() else { repo.refreshCatalog(); repo.products() } }) { products=it; show(products) }
}

fun MainActivity.productEditor(product: JSONObject?) {
    val model=product?.copy() ?: obj("cost_breakdown" to JSONArray(),"addon_groups" to JSONArray(),"image_urls" to JSONArray())
    dialog(if(product==null) "New product" else "Edit product") { content,dialog ->
        val name=input(content,"Name",model.optString("name")); val sku=input(content,"SKU",model.optString("sku")); val description=input(content,"Description",model.optString("description"))
        val category=input(content,"Category",model.optString("category","lainnya")); val price=input(content,"Price (IDR)",model.optString("price","0"),true)
        val extras=column(content)
        fun draw() {
            extras.removeAllViews()
            text(extras,"Production costs",18f,true)
            model.rows("cost_breakdown").forEachIndexed { index,cost ->
                button(extras,"${cost.getString("name")} · ${money(cost.getLong("amount"))} ×") { model.put("cost_breakdown",model.rows("cost_breakdown").filterIndexed { i,_ -> i!=index }.array()); draw() }
            }
            button(extras,"Add cost") {
                dialog("Add cost") { form,d -> val label=input(form,"Name"); val amount=input(form,"Amount (IDR)","0",true)
                    button(form,"Save",true) { require(label.value().isNotEmpty()); model.getJSONArray("cost_breakdown").put(obj("name" to label.value(),"amount" to amount(amount.value()))); d.dismiss(); draw() }
                }
            }
            text(extras,"Add-on groups",18f,true)
            model.rows("addon_groups").forEachIndexed { index,group ->
                val c=card(extras); text(c,group.getString("name"),16f,true); text(c,group.rows("options").joinToString { it.getString("name") })
                button(c,"Edit") { groupEditor(group) { updated -> model.put("addon_groups",model.rows("addon_groups").mapIndexed { i,g -> if(i==index) updated else g }.array()); draw() } }
                button(c,"Remove") { model.put("addon_groups",model.rows("addon_groups").filterIndexed { i,_ -> i!=index }.array()); draw() }
            }
            button(extras,"Add group") { groupEditor(null) { model.getJSONArray("addon_groups").put(it); draw() } }
            text(extras,"Product images",18f,true)
            (model.optJSONArray("image_urls") ?: JSONArray()).strings().forEachIndexed { index,url ->
                productImage(extras,obj("name" to name.value(),"image_urls" to JSONArray().put(url)))
                button(extras,"${index+1} · ${tr("Remove image")}") { model.put("image_urls",JSONArray(model.getJSONArray("image_urls").strings().filterIndexed { i,_ -> i!=index })); draw() }
            }
            button(extras,"Upload image") {
                require(model.getJSONArray("image_urls").length()<10) { "Use at most 10 images per product." }
                pickImage { uri -> safe {
                    val mime=contentResolver.getType(uri) ?: "application/octet-stream"
                    require(mime in listOf("image/jpeg","image/png","image/gif","image/webp","image/avif")) { "Choose JPEG, PNG, GIF, WebP, or AVIF." }
                    work({ val bytes=contentResolver.openInputStream(uri)!!.use { it.readBytesLimited(8*1024*1024) }; repo.api.upload(repo.path("images"),bytes,mime) }) { result -> model.getJSONArray("image_urls").put(result.getString("url")); draw() }
                } }
            }
        }
        draw()
        button(content,"Save product",true) {
            require(name.value().isNotEmpty() && sku.value().isNotEmpty()) { "Enter a name and SKU." }
            require(category.value().length in 1..100 && category.value().all { it.isLetterOrDigit() || it==' ' }) { "Use 1 to 100 letters, numbers, or spaces for the category." }
            model.put("name",name.value()).put("sku",sku.value()).put("description",description.value()).put("category",category.value().lowercase()).put("price",amount(price.value()))
            work({ repo.api.request(repo.path("products"+(product?.let { "/${it.getString("id")}" } ?: "")),if(product==null) "POST" else "PUT",model); repo.refreshCatalog() }) { dialog.dismiss(); render() }
        }
    }
}
fun MainActivity.groupEditor(group: JSONObject?, done:(JSONObject)->Unit) {
    val model=group?.copy() ?: obj("id" to uuid(),"options" to JSONArray())
    dialog("Add-on group") { form,dialog ->
        val name=input(form,"Name",model.optString("name")); val modes=listOf("single","multiple"); val mode=select(form,"Selection mode",modes,model.optString("selection_mode","single")); val required=check(form,"Required",model.optBoolean("required"))
        val options=column(form)
        fun draw() {
            options.removeAllViews()
            model.rows("options").forEachIndexed { index,option ->
                val c=card(options); text(c,"${option.getString("name")} +${money(option.getLong("price_delta"))}")
                button(c,"Remove") { model.put("options",model.rows("options").filterIndexed { i,_ -> i!=index }.array()); draw() }
                button(c,"Edit") { optionEditor(option) { updated -> model.put("options",model.rows("options").mapIndexed { i,o -> if(i==index) updated else o }.array()); draw() } }
            }
        }
        draw()
        button(form,"Add option") { optionEditor(null) { model.getJSONArray("options").put(it); draw() } }
        button(form,"Save group",true) {
            require(name.value().isNotEmpty() && model.rows("options").isNotEmpty()) { "Each add-on group needs a name and at least one option." }
            done(model.put("name",name.value()).put("selection_mode",modes[mode.selectedItemPosition]).put("required",required.isChecked)); dialog.dismiss()
        }
    }
}
fun MainActivity.optionEditor(option: JSONObject?, done:(JSONObject)->Unit) {
    dialog("Add-on option") { form,d ->
        val name=input(form,"Name",option?.optString("name") ?: ""); val price=input(form,"Price increase (IDR)",option?.optString("price_delta") ?: "0",true); val cost=input(form,"Cost increase (IDR)",option?.optString("cost_delta") ?: "0",true)
        button(form,"Save",true) { require(name.value().isNotEmpty()); done(obj("id" to (option?.optString("id") ?: uuid()),"name" to name.value(),"price_delta" to amount(price.value()),"cost_delta" to amount(cost.value()))); d.dismiss() }
    }
}
