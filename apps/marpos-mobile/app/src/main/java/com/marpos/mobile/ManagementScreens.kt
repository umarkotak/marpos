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
    heading(body,"Store settings")
    val session=repo.auth!!
    val c=card(body)
    val fields=listOf("name" to "Store name","slug" to "Store slug","address" to "Address","google_maps_url" to "Google Maps URL","instagram_url" to "Instagram URL","facebook_url" to "Facebook URL","tiktok_url" to "TikTok URL").associate { (key,label) -> key to input(c,label,if(key=="name") session.optString("store_name") else session.optString(key)) }
    val tax=input(c,"Tax percentage",session.optString("tax_percentage","0"),true)
    button(c,"Save store settings",true) {
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
