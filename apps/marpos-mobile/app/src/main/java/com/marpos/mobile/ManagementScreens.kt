package com.marpos.mobile

import android.app.AlertDialog
import org.json.JSONArray
import org.json.JSONObject

fun MainActivity.storesScreen() {
    heading(body,"Manage stores")
    val list=column(body)
    work({ repo.stores() to repo.invitations() }) { (stores,invitations) ->
        text(list,repo.status,13f)
        stores.forEach { store ->
            val c=card(list); text(c,store.getString("name"),20f,true); text(c,store.getString("role"))
            button(c,"Select store",true) { work({ repo.selectStore(store) }) { navigate(if(repo.viewer) "Order history" else "Point of sale") } }
        }
        invitations.forEach { invite ->
            val c=card(list); text(c,invite.optString("store_name"),18f,true); text(c,invite.optString("role"))
            listOf(true,false).forEach { accept -> button(c,if(accept) "Accept" else "Reject") { mutate("/invitations/${invite.getString("id")}/decision","POST",obj("accept" to accept)) } }
        }
    }
    val form=card(body); text(form,"Create store",18f,true)
    val name=input(form,"Store name"); val slug=input(form,"Store slug")
    button(form,"Create store",true) {
        require(name.value().isNotBlank() && name.value().length<=100 && Regex("[a-z0-9]+(-[a-z0-9]+)*").matches(slug.value())) { "Enter a store name and a lowercase slug with letters, numbers, and hyphens." }
        work({ val store=repo.api.request("/stores","POST",obj("name" to name.value(),"slug" to slug.value())) as JSONObject; repo.selectStore(store) }) { navigate("Point of sale") }
    }
}

fun MainActivity.syncScreen() {
    heading(body,"Sync queue")
    text(body,"Pending records stay on this device after the app closes. Keep this device until all records sync.")
    button(body,"Retry sync",true) { work({ repo.refreshSession(); repo.sync() }) { render() } }
    repo.pending().forEach { pending ->
        val c=card(body); text(c,pending.getString("kind"),18f,true); text(c,pending.getString("id"),12f)
        text(c,pending.getJSONObject("payload").optString("created_at",pending.getJSONObject("payload").optString("occurred_at")))
        text(c,pending.optString("error").ifEmpty { tr("Pending sync") })
    }
}

fun MainActivity.settingsScreen() {
    pageHeading(body,"Store","Store settings")
    val session=repo.auth!!
    val c=column(body).apply { background=surface(android.graphics.Color.WHITE,16); clipToOutline=true }
    val profile=row(c).apply { gravity=android.view.Gravity.CENTER_VERTICAL; setPadding(dp(24),dp(20),dp(24),dp(20)); setBackgroundColor(android.graphics.Color.rgb(244,250,247)) }
    text(profile,session.optString("store_name").take(1).uppercase(),23f,true).apply {
        gravity=android.view.Gravity.CENTER; background=surface(android.graphics.Color.rgb(220,239,229),14,null)
        layoutParams=android.widget.LinearLayout.LayoutParams(dp(52),dp(52)); setTextColor(WebUi.primary)
    }
    val copy=column(profile).apply { setPadding(dp(16),0,0,0) }; weight(copy,profile)
    caption(copy,"Active store").setTextColor(WebUi.primary)
    text(copy,session.optString("store_name"),20f,true)
    caption(copy,"Manage this store's details and checkout tax.")
    divider(c)
    val identity=settingsSection(c,"01 / STORE","Store identity","Set the name and slug for this store.")
    val fields=mutableMapOf<String,android.widget.EditText>()
    fields["name"]=input(identity,"Store name",session.optString("store_name"))
    fields["slug"]=input(identity,"Slug",session.optString("slug"))
    divider(c)
    val location=settingsSection(c,"02 / LOCATION","Location","Add the address and Google Maps link for this store.")
    fields["address"]=input(location,"Street address",session.optString("address")).apply { setSingleLine(false); minLines=3; layoutParams.height=dp(82) }
    fields["google_maps_url"]=input(location,"Google Maps URL",session.optString("google_maps_url"))
    divider(c)
    val social=settingsSection(c,"03 / SOCIAL","Social links","Show customers where to find your store.")
    listOf("instagram_url" to "Instagram URL","facebook_url" to "Facebook URL","tiktok_url" to "TikTok URL").forEach { (key,label) -> fields[key]=input(social,label,session.optString(key)) }
    divider(c)
    val checkout=settingsSection(c,"04 / CHECKOUT","Tax","Tax is added by default. The cashier can turn it off for one sale.")
    val tax=input(checkout,"Tax percentage",session.optString("tax_percentage","0"),true)
    divider(c)
    val actions=column(c).apply { setPadding(dp(24),dp(14),dp(24),dp(14)) }
    button(actions,"Save store settings",true) {
        val data=obj("tax_percentage" to taxRate(tax.value()))
        fields.forEach { (key,field)->data.put(key,field.value()) }
        work({
            val updated=repo.api.request(repo.path("settings"),"PUT",data) as JSONObject
            val saved=repo.auth!!.copy(); updated.keys().forEach { if(it!="name") saved.put(it,updated.get(it)) }; saved.put("store_name",updated.getString("name")); repo.saveAuth(saved)
        }) { render(); notice("Store settings saved") }
    }
    printerSettings(body)
    if(repo.role=="owner") {
        val danger=card(body)
        button(danger,"Load danger zone") {
            work({ repo.api.request("/auth/config") as JSONObject }) { config ->
                if(config.optJSONObject("features")?.optBoolean("danger_zone")!=true) notice("The danger zone is disabled on the API server.")
                else {
                    text(danger,"These actions remove store records. Enter the store name to confirm.")
                    val name=input(danger,"Store name")
                    listOf("sales" to "Clear all orders","products" to "Clear all products and orders").forEach { (kind,label) ->
                        button(danger,label) {
                            require(name.value()==repo.auth!!.getString("store_name")) { "The store name did not match." }
                            require(repo.pending().none { it.getString("store_id")==repo.store }) { "Sync pending records before clearing this store." }
                            confirm("$label?") { work({ repo.api.request(repo.path(kind),"DELETE",obj("confirm_store_name" to name.value())); repo.db.clearStore(repo.store,kind=="products") }) { render() } }
                        }
                    }
                }
            }
        }
    }
}

fun MainActivity.teamScreen() {
    heading(body,"Team")
    val form=card(body)
    if(repo.role in listOf("owner","admin")) {
        val email=input(form,"Email")
        val roles=if(repo.role=="owner") listOf("cashier","manager","admin") else listOf("cashier","manager")
        val role=select(form,"Role",roles)
        button(form,"Send invitation",true) { confirm("Send a store invitation to ${email.value()}?") { mutate(repo.path("invitations"),"POST",obj("email" to email.value(),"role" to roles[role.selectedItemPosition])) } }
    }
    val list=column(body)
    cachedList(repo.path("members"),list) { members ->
        members.forEach { member ->
            val c=card(list); text(c,member.optString("name"),18f,true); text(c,member.optString("email")); text(c,member.optString("role"))
            if(repo.role in listOf("owner","admin") && member.getString("role")!="owner" && member.getString("user_id")!=repo.user && (repo.role=="owner" || member.getString("role")!="admin")) {
                val roles=if(repo.role=="owner") listOf("cashier","manager","admin") else listOf("cashier","manager")
                val role=select(c,"Role",roles,member.optString("role"))
                button(c,"Save role") { mutate(repo.path("members/${member.getString("user_id")}"),"PUT",obj("role" to roles[role.selectedItemPosition])) }
                button(c,"Remove") { confirm("Remove ${member.optString("name")} from this store?") { mutate(repo.path("members/${member.getString("user_id")}"),"DELETE") } }
            }
        }
    }
}
