package com.marpos.mobile

import android.app.Dialog
import android.graphics.Color
import android.graphics.Typeface
import android.view.Gravity
import android.view.View
import android.widget.*
import java.time.Instant

fun MainActivity.navigationItems(): List<Pair<String,String>> = buildList {
    if(!repo.viewer) add("Point of sale" to "cart")
    add("Products" to "package"); add("Order history" to "history")
    if(repo.edit || repo.superadmin) { add("Income and expenses" to "wallet"); add("Reports" to "chart"); add("Audit log" to "history") }
    if(!repo.viewer) add("Team" to "users")
    if(repo.edit) add("Store settings" to "settings")
    add("Manage stores" to "store")
}
fun MainActivity.signOut() {
    confirm("Sign out? Pending records stay on this device and need this account to sync.") {
        work({ repo.logout() }) { render(); clearCredentials() }
    }
}
fun MainActivity.chooseStore() {
    dialog("Choose store") { content,dialog ->
        work({ repo.stores() }) { stores ->
            stores.forEach { store ->
                button(content,store.getString("name")+if(store.getString("id")==repo.store) " ✓" else "") {
                    work({ repo.selectStore(store) }) { dialog.dismiss(); navigate(if(repo.viewer) "Order history" else "Point of sale") }
                }
            }
            button(content,"Manage stores") { dialog.dismiss(); navigate("Manage stores") }
        }
    }
}
fun MainActivity.navigation(expanded: Boolean,close: () -> Unit = {}): LinearLayout {
    val nav=column().apply { setBackgroundColor(WebUi.sidebar); setPadding(dp(8),dp(8),dp(8),dp(8)) }
    val brand=row(nav).apply { gravity=Gravity.CENTER_VERTICAL; minimumHeight=dp(56); isFocusable=true; background=touchSurface(Color.TRANSPARENT,10,null)
        contentDescription=tr("Choose store"); setOnClickListener { close(); chooseStore() }
    }
    text(brand,"M",20f,true).apply {
        gravity=Gravity.CENTER; setTextColor(Color.WHITE); background=surface(green,10,null)
        layoutParams=LinearLayout.LayoutParams(dp(36),dp(36)); setPadding(0,0,0,0)
    }
    if(expanded) {
        val copy=column(brand).apply { setPadding(dp(10),0,0,0) }; weight(copy,brand)
        text(copy,repo.auth?.optString("store_name") ?: "Marpos",15f,true).apply { maxLines=1; ellipsize=android.text.TextUtils.TruncateAt.END }
        caption(copy,tr(repo.role.replaceFirstChar { it.uppercase() })).apply { setPadding(0,dp(3),0,0) }
    }
    val scroll=ScrollView(this).apply { isFillViewport=false; isVerticalScrollBarEnabled=false }
    nav.addView(scroll,LinearLayout.LayoutParams(-1,0,1f))
    val links=column(); scroll.addView(links)
    if(expanded) caption(links,"Store").apply { setPadding(dp(8),dp(20),0,dp(8)) }
    navigationItems().forEach { (name,icon) ->
        val selected=name==screen
        val r=row(links).apply {
            gravity=Gravity.CENTER_VERTICAL; minimumHeight=dp(44)
            background=touchSurface(if(selected) Color.rgb(234,240,239) else Color.TRANSPARENT,8,null)
            setPadding(dp(if(expanded) 8 else 0),0,dp(if(expanded) 8 else 0),0)
            isFocusable=true; isSelected=selected; contentDescription=tr(name); tooltipText=tr(name)
            setOnClickListener { if(!isWorking) { close(); navigate(name) } }
        }
        r.addView(UiIcon(this,icon,if(selected) WebUi.primary else WebUi.foreground),LinearLayout.LayoutParams(dp(20),dp(20)).apply { if(!expanded) gravity=Gravity.CENTER; marginStart=dp(if(expanded) 0 else 2) })
        if(expanded) text(r,name,14f,selected).apply { setPadding(dp(10),0,0,0) }
    }
    if(expanded) {
        val footer=column(nav).apply { setPadding(dp(7),dp(10),dp(7),dp(10)) }
        text(footer,"${tr("Register")} ${repo.auth?.optString("register_id")?.take(8) ?: ""}",12f,true)
        val expiry=runCatching { Instant.parse(repo.auth?.optString("offline_expires_at")).atZone(wib).toLocalDate().toString() }.getOrDefault("")
        caption(footer,"${tr("Offline until")} $expiry")
    }
    return nav
}
fun MainActivity.showNavigation() {
    if(repo.auth==null) return
    val drawer=Dialog(this)
    val nav=navigation(true) { drawer.dismiss() }
    drawer.setContentView(nav)
    drawer.window?.apply { setBackgroundDrawableResource(android.R.color.transparent); setGravity(Gravity.START or Gravity.TOP) }
    drawer.show()
    drawer.window?.setLayout(dp(minOf(288,resources.configuration.screenWidthDp-48)),-1)
}
fun MainActivity.buildShell(): FrameLayout {
    shell=column().apply { setBackgroundColor(WebUi.background) }
    shell.setOnApplyWindowInsetsListener { view,insets ->
        if(android.os.Build.VERSION.SDK_INT>=30) {
            val edges=insets.getInsets(android.view.WindowInsets.Type.systemBars() or android.view.WindowInsets.Type.ime())
            view.setPadding(edges.left,edges.top,edges.right,edges.bottom)
        } else {
            @Suppress("DEPRECATION")
            view.setPadding(insets.systemWindowInsetLeft,insets.systemWindowInsetTop,insets.systemWindowInsetRight,insets.systemWindowInsetBottom)
        }
        insets
    }
    setContentView(shell); shell.requestApplyInsets()
    val layout=row(shell); weight(layout,shell)
    val signedIn=repo.auth!=null && repo.store.isNotBlank()
    val expanded=sidebarExpanded ?: (resources.configuration.screenWidthDp>1050)
    if(tablet && signedIn) {
        val nav=navigation(expanded)
        layout.addView(nav,LinearLayout.LayoutParams(dp(if(expanded) 256 else 52),-1))
        layout.addView(View(this).apply { setBackgroundColor(WebUi.border) },LinearLayout.LayoutParams(dp(1),-1))
    }
    val main=column(layout); main.layoutParams=LinearLayout.LayoutParams(0,-1,1f)
    val top=row(main).apply {
        gravity=Gravity.CENTER_VERTICAL; setPadding(dp(if(tablet) 16 else 8),dp(8),dp(if(tablet) 20 else 8),dp(8))
        minimumHeight=dp(if(signedIn) 70 else 56); setBackgroundColor(if(signedIn) Color.WHITE else WebUi.background)
    }
    if(signedIn) iconButton(top,"sidebar","Toggle sidebar") { if(tablet) { sidebarExpanded=!expanded; resizeShell() } else showNavigation() }
    val title=column(top); weight(title,top)
    if(signedIn) {
        text(title,screen,if(resources.configuration.screenWidthDp<390) 13f else 15f,true).apply { maxLines=1; ellipsize=android.text.TextUtils.TruncateAt.END; setPadding(0,0,0,dp(3)) }
        if(resources.configuration.screenWidthDp>=650) caption(title,repo.auth!!.optString("store_name")).setPadding(0,0,0,0)
    }
    val language=button(top,if(this.language=="en") "English ▾" else "Indonesia ▾") { showLanguage() }
    language.textSize=12f; language.layoutParams=LinearLayout.LayoutParams(-2,dp(44)).apply { marginEnd=dp(6) }
    language.background=touchSurface(Color.TRANSPARENT,8,null)
    statusView=text(top,"",12f).apply { isFocusable=true; setPadding(dp(4),0,dp(4),0)
        setOnClickListener { if(!isWorking && repo.auth!=null) navigate("Sync queue") }
    }
    if(!signedIn) statusView.visibility=View.GONE
    if(repo.auth!=null) iconButton(top,"logout","Sign out") { signOut() }
    divider(main)
    return FrameLayout(this).also { main.addView(it,LinearLayout.LayoutParams(-1,0,1f)) }
}
fun MainActivity.showLanguage() {
    android.app.AlertDialog.Builder(this).setTitle(tr("Language")).setItems(arrayOf("English","Bahasa Indonesia")) { _,index ->
        getSharedPreferences("app",android.content.Context.MODE_PRIVATE).edit().putString("language",if(index==0) "en" else "id").apply(); render()
    }.show()
}
fun MainActivity.attachPage(host: FrameLayout,page: LinearLayout) {
    val scroll=ScrollView(this).apply { isFillViewport=true; clipToPadding=false }
    host.addView(scroll,FrameLayout.LayoutParams(-1,-1))
    val centered=column().apply { gravity=if(repo.auth==null) Gravity.CENTER else Gravity.TOP or Gravity.CENTER_HORIZONTAL }
    scroll.addView(centered)
    val loggedOut=repo.auth==null
    val maxWidth=if(loggedOut) 482 else if(screen=="Store settings") 1040 else Int.MAX_VALUE
    val available=resources.configuration.screenWidthDp-(if(tablet && !loggedOut) if(sidebarExpanded ?: (resources.configuration.screenWidthDp>1050)) 256 else 52 else 0)
    centered.addView(page,LinearLayout.LayoutParams(if(maxWidth<available) dp(maxWidth) else -1,-2))
    page.setPadding(dp(if(tablet) 31 else 14),dp(if(tablet) 31 else 20),dp(if(tablet) 31 else 14),dp(24))
}
