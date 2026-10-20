package com.marpos.mobile

import android.annotation.SuppressLint
import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkRequest
import android.net.Uri
import android.os.Bundle
import android.os.CancellationSignal
import android.os.Handler
import android.os.Looper
import android.text.Editable
import android.text.TextWatcher
import android.view.View
import android.view.ViewGroup
import android.widget.*
import androidx.credentials.*
import androidx.credentials.exceptions.*
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import org.json.JSONObject
import java.net.URI
import java.text.NumberFormat
import java.util.Locale
import java.util.concurrent.Executors

class MainActivity : Activity() {
    lateinit var repo: Repository
    lateinit var body: LinearLayout
    lateinit var shell: LinearLayout
    internal lateinit var statusView: TextView
    private val executor = Executors.newSingleThreadExecutor()
    private val uiExecutor = java.util.concurrent.Executor { handler.post(it) }
    private val handler = Handler(Looper.getMainLooper())
    private var busy = false
    private var syncing = false
    internal var screen = "Point of sale"
    internal var sidebarExpanded: Boolean? = null
    internal var catalogSearch = ""
    internal var mobilePanel = "catalog"
    val isWorking get() = busy
    val tablet get() = resources.configuration.screenWidthDp >= 768
    private var pageGeneration = 0
    private var imageResult: ((Uri) -> Unit)? = null
    private var credentialSignal: CancellationSignal? = null
    private val activeDialogs=mutableSetOf<AlertDialog>()
    private var renderedSession: List<String>? = null
    private val prefs by lazy { getSharedPreferences("app", MODE_PRIVATE) }
    private val en by lazy { JSONObject(assets.open("en.json").bufferedReader().use { it.readText() }) }
    private val id by lazy { JSONObject(assets.open("id.json").bufferedReader().use { it.readText() }) }
    private val englishKeys by lazy { en.keys().asSequence().associateBy { en.optString(it) } }
    val language get() = prefs.getString("language","en") ?: "en"
    val green = Color.rgb(13,128,97)
    private val connectivity by lazy { getSystemService(ConnectivityManager::class.java) }
    private val networkCallback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) { handler.post { retrySync() } }
    }
    private val timer = object : Runnable {
        override fun run() { retrySync(); handler.postDelayed(this,60000) }
    }
    override fun onCreate(state: Bundle?) {
        super.onCreate(state)
        val endpoint=prefs.getString("api", "http://10.0.2.2:6030/marpos/api")!!
        repo=Repository(this,Api(this,endpoint))
        screen=state?.getString("screen") ?: "Point of sale"
        catalogSearch=state?.getString("catalogSearch") ?: ""
        mobilePanel=state?.getString("mobilePanel") ?: "catalog"
        if(state?.containsKey("sidebarExpanded")==true) sidebarExpanded=state.getBoolean("sidebarExpanded")
        if(android.os.Build.VERSION.SDK_INT>=33) onBackInvokedDispatcher.registerOnBackInvokedCallback(android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT) { handleBack() }
        render()
        if(repo.auth!=null) retrySync()
        connectivity.registerNetworkCallback(NetworkRequest.Builder().addCapability(android.net.NetworkCapabilities.NET_CAPABILITY_INTERNET).build(),networkCallback)
    }
    override fun onStart() { super.onStart(); handler.postDelayed(timer,60000) }
    override fun onStop() { handler.removeCallbacks(timer); super.onStop() }
    override fun onDestroy() {
        credentialSignal?.cancel()
        connectivity.unregisterNetworkCallback(networkCallback)
        handler.removeCallbacksAndMessages(null)
        activeDialogs.toList().forEach { it.dismiss() }
        executor.shutdown()
        super.onDestroy()
    }
    override fun onSaveInstanceState(out: Bundle) {
        out.putString("screen",screen); out.putString("catalogSearch",catalogSearch); out.putString("mobilePanel",mobilePanel)
        sidebarExpanded?.let { out.putBoolean("sidebarExpanded",it) }
        super.onSaveInstanceState(out)
    }
    override fun onConfigurationChanged(config: android.content.res.Configuration) {
        super.onConfigurationChanged(config)
        // Reparent forms so edits survive rotation, window resizing, and sidebar changes.
        resizeShell()
        resizeDialogs()
    }
    private fun resizeDialogs() {
        activeDialogs.forEach { dialog -> dialog.window?.setLayout(dp(minOf(resources.configuration.screenWidthDp-32,600)),-2) }
    }
    fun tr(text: String): String {
        if(language!="id") return text
        val key=englishKeys[text] ?: englishKeys.entries.firstOrNull { it.key.equals(text,true) }?.value
        return if(key!=null) id.optString(key,text) else text
    }
    fun money(n: Long) = NumberFormat.getCurrencyInstance(Locale.forLanguageTag(if(language=="id") "id-ID" else "en-GB")).apply { currency=java.util.Currency.getInstance("IDR"); maximumFractionDigits=0 }.format(n)
    fun dp(n: Int) = (n*resources.displayMetrics.density).toInt()
    fun column(parent: LinearLayout?=null): LinearLayout = LinearLayout(this).apply { orientation=LinearLayout.VERTICAL; parent?.addView(this,LinearLayout.LayoutParams(-1,-2)) }
    fun row(parent: LinearLayout): LinearLayout = LinearLayout(this).apply { orientation=LinearLayout.HORIZONTAL; parent.addView(this,LinearLayout.LayoutParams(-1,-2)) }
    fun text(parent: LinearLayout, value: String, size: Float=16f, bold: Boolean=false): TextView = TextView(this).apply {
        text=tr(value); textSize=size; setTextColor(WebUi.foreground); includeFontPadding=false
        if(bold) typeface=Typeface.create("sans-serif-medium",Typeface.NORMAL)
        setPadding(0,dp(7),0,dp(7)); parent.addView(this)
    }
    fun heading(parent: LinearLayout,value: String) = text(parent,value,27f,true)
    fun card(parent: LinearLayout): LinearLayout = column().apply {
        setPadding(dp(20),dp(16),dp(20),dp(18)); background=surface(Color.WHITE,14)
        parent.addView(this,LinearLayout.LayoutParams(-1,-2).apply { bottomMargin=dp(14) })
    }
    fun button(parent: LinearLayout,label: String,primary: Boolean=false,action: () -> Unit): Button = Button(this).apply {
        text=tr(label); isAllCaps=false; textSize=14f; letterSpacing=0f; minHeight=dp(44); minimumHeight=dp(44)
        minWidth=0; minimumWidth=0; gravity=android.view.Gravity.CENTER
        typeface=Typeface.create("sans-serif-medium",Typeface.NORMAL)
        setTextColor(if(primary) Color.WHITE else Color.rgb(32,107,85))
        background=touchSurface(if(primary) WebUi.primary else WebUi.secondary,9,null)
        setPadding(dp(12),dp(8),dp(12),dp(8)); stateListAnimator=null
        parent.addView(this,LinearLayout.LayoutParams(if(parent.orientation==LinearLayout.HORIZONTAL) 0 else -1,-2).apply {
            topMargin=dp(4); bottomMargin=dp(4)
            if(parent.orientation==LinearLayout.HORIZONTAL) { weight=1f; marginEnd=dp(6) }
        })
        setOnClickListener { if(!busy) safe(action) }
    }
    fun input(parent: LinearLayout,label: String,value: String="",numeric: Boolean=false): EditText {
        val labelView=text(parent,label,13f,true).apply { setTextColor(Color.rgb(72,90,97)) }
        return EditText(this).apply {
            id=View.generateViewId(); labelView.labelFor=id; hint=tr(label); setText(value); textSize=14f
            setTextColor(WebUi.foreground); setHintTextColor(WebUi.muted); setSingleLine(true)
            background=android.graphics.drawable.StateListDrawable().apply {
                addState(intArrayOf(android.R.attr.state_focused),surface(Color.WHITE,9,Color.rgb(136,205,178)))
                addState(intArrayOf(),surface(Color.WHITE,9,Color.rgb(216,225,226)))
            }
            setPadding(dp(12),0,dp(12),0)
            if(numeric) inputType=android.text.InputType.TYPE_CLASS_NUMBER or android.text.InputType.TYPE_NUMBER_FLAG_DECIMAL
            parent.addView(this,LinearLayout.LayoutParams(-1,dp(44)).apply { bottomMargin=dp(12) })
        }
    }
    fun check(parent: LinearLayout,label: String,value: Boolean=false): CheckBox = CheckBox(this).apply {
        text=tr(label); isChecked=value; minHeight=dp(44); textSize=13f; setTextColor(WebUi.foreground)
        buttonTintList=android.content.res.ColorStateList.valueOf(WebUi.primary); parent.addView(this)
    }
    fun select(parent: LinearLayout,label: String,options: List<String>,selected: String=options.firstOrNull() ?: ""): Spinner {
        text(parent,label,13f,true)
        return Spinner(this).apply {
            adapter=ArrayAdapter(this@MainActivity,android.R.layout.simple_spinner_dropdown_item,options.map { tr(it) })
            setSelection(options.indexOf(selected).coerceAtLeast(0)); background=surface(); setPadding(dp(8),0,dp(8),0)
            parent.addView(this,LinearLayout.LayoutParams(-1,dp(44)).apply { bottomMargin=dp(12) })
        }
    }
    fun EditText.value() = text.toString().trim()
    fun changed(input: EditText, action: () -> Unit) { input.addTextChangedListener(object: TextWatcher { override fun beforeTextChanged(s: CharSequence?,start:Int,count:Int,after:Int) {} ; override fun onTextChanged(s:CharSequence?,start:Int,before:Int,count:Int) { safe(action) }; override fun afterTextChanged(s:Editable?) {} }) }
    fun safe(action: () -> Unit) { try { action() } catch(e: Exception) { notice(e.message ?: "Could not complete the action.") } }
    private fun trackDialog(dialog: AlertDialog) {
        activeDialogs.add(dialog)
        dialog.setOnDismissListener { activeDialogs.remove(dialog) }
    }
    fun notice(message: String) { if(!isDestroyed && !isFinishing) trackDialog(AlertDialog.Builder(this).setMessage(tr(message)).setPositiveButton(android.R.string.ok,null).show()) }
    fun confirm(message: String, action: () -> Unit) { if(!isDestroyed && !isFinishing) trackDialog(AlertDialog.Builder(this).setMessage(tr(message)).setNegativeButton(android.R.string.cancel,null).setPositiveButton(android.R.string.ok) { _,_ -> if(!busy) safe(action) }.show()) }
    fun dialog(title: String, build: (LinearLayout, AlertDialog) -> Unit) {
        val content=column().apply { setPadding(dp(20),dp(8),dp(20),dp(16)) }
        val scroll=ScrollView(this).apply { addView(content) }
        val dialog=AlertDialog.Builder(this).setTitle(tr(title)).setView(scroll).setNegativeButton(android.R.string.cancel,null).create()
        build(content,dialog); dialog.show()
        trackDialog(dialog)
        dialog.window?.apply {
            setBackgroundDrawable(surface(Color.WHITE,16))
            setLayout(dp(minOf(resources.configuration.screenWidthDp-32,600)),-2)
            @Suppress("DEPRECATION")
            setSoftInputMode(android.view.WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE)
        }
    }
    fun <T> work(task: () -> T, done: (T) -> Unit) {
        if(isDestroyed || isFinishing || busy) return
        busy=true; updateStatus()
        executor.execute {
            val result=runCatching(task)
            handler.post {
                if(isDestroyed) return@post
                busy=false
                result.fold({ safe { done(it) } }, { e -> if(e is ApiError && e.status==401) repo.saveAuth(null); if(repo.auth==null) render(); notice(e.message ?: "The server is unavailable.") })
                updateStatus()
            }
        }
    }
    fun updateStatus() {
        if(!::statusView.isInitialized) return
        statusView.text=if(busy) tr("Working…") else if(resources.configuration.screenWidthDp<650) "${if(repo.online) "●" else tr("Offline")} · ${repo.pending().size}" else "● ${tr(if(repo.online) "Connected" else "Offline")}    ↑ ${repo.pending().size} ${tr("Pending") }"
        statusView.setTextColor(if(repo.online) WebUi.primary else Color.rgb(151,106,43))
        statusView.contentDescription="${tr(if(repo.online) "Connected" else "Offline")}. ${repo.pending().size} ${tr("Pending sync")}"
    }
    fun retrySync() {
        if(isDestroyed || isFinishing || busy || syncing || repo.auth==null) return
        syncing=true
        val oldSession=listOf(repo.user,repo.store,repo.role)
        executor.execute {
            runCatching { repo.refreshSession(); repo.sync() }
            handler.post {
                if(isDestroyed) return@post
                syncing=false
                if(repo.auth==null || repo.store.isBlank() || listOf(repo.user,repo.store,repo.role)!=oldSession) render()
                updateStatus()
            }
        }
    }
    fun cachedList(path: String, parent: LinearLayout, show: (List<JSONObject>) -> Unit) {
        val generation=pageGeneration
        work({ (repo.cached(path,org.json.JSONArray()) as org.json.JSONArray).objects() }) { rows -> if(generation==pageGeneration) { text(parent,repo.status,13f); show(rows) } }
    }
    fun mutate(path: String, method: String, data: JSONObject?=null, done: () -> Unit = { render() }) {
        work({
            val result=repo.api.request(path,method,data)
            if(method=="DELETE") Regex("/stores/[a-f0-9-]+/(sales|products|finance)/([a-f0-9-]+)").matchEntire(path)?.let {
                val kind=when(it.groupValues[1]) { "sales"->"sale"; "products"->"product"; else->"finance" }
                repo.db.forget(kind,it.groupValues[2])
            }
            result
        }) { done() }
    }
    fun navigate(name: String) { screen=if(repo.viewer && name=="Point of sale") "Order history" else name; render() }
    fun menu() { showNavigation() }
    fun resizeShell() {
        if(repo.auth==null || (screen=="Point of sale" && !repo.viewer && repo.store.isNotBlank())) { render(); return }
        val existing=body
        val oldScroll=existing.parent?.parent as? ScrollView
        val position=oldScroll?.scrollY ?: 0
        (existing.parent as? ViewGroup)?.removeView(existing)
        val host=buildShell()
        attachPage(host,existing)
        (existing.parent?.parent as? ScrollView)?.post { (existing.parent?.parent as? ScrollView)?.scrollTo(0,position) }
        updateStatus()
    }
    fun render() {
        val session=listOf(repo.api.base,repo.user,repo.store,repo.role)
        if(renderedSession!=session) activeDialogs.toList().forEach { it.dismiss() }
        renderedSession=session
        if(repo.viewer && screen=="Point of sale") screen="Order history"
        pageGeneration++
        val host=buildShell()
        if(repo.auth!=null && repo.store.isNotBlank() && screen=="Point of sale" && !repo.viewer) {
            posScreen(host)
        } else {
            body=column()
            attachPage(host,body)
            if(repo.auth==null) login()
            else if(repo.store.isBlank()) storesScreen()
            else when(screen) {
                "Point of sale", "Order history" -> ordersScreen()
                "Products" -> productsScreen()
                "Income and expenses" -> if(repo.edit||repo.superadmin) financeScreen() else text(body,"Access restricted")
                "Reports" -> if(repo.edit||repo.superadmin) reportsScreen() else text(body,"Access restricted")
                "Audit log" -> if(repo.edit||repo.superadmin) auditScreen() else text(body,"Access restricted")
                "Team" -> if(!repo.viewer) teamScreen() else text(body,"Access restricted")
                "Store settings" -> if(repo.edit) settingsScreen() else text(body,"Access restricted")
                "Sync queue" -> syncScreen()
                else -> storesScreen()
            }
        }
        updateStatus()
    }
    private fun login() {
        val c=card(body).apply { setPadding(dp(32),dp(32),dp(32),dp(32)); background=surface(Color.WHITE,18) }
        text(c,"M",25f,true).apply {
            gravity=android.view.Gravity.CENTER; setTextColor(Color.WHITE); background=surface(green,12,null)
            layoutParams=LinearLayout.LayoutParams(dp(44),dp(44)); setPadding(0,0,0,0)
        }
        spacer(c,14)
        heading(c,"Marpos").textSize=30f
        caption(c,"Sign in online to prepare your register. You can then sell offline for 30 days.").apply { textSize=14f; setLineSpacing(dp(4).toFloat(),1f) }
        spacer(c,16)
        button(c,"Sign in with Google",true) {
            work({ repo.api.request("/auth/config") as JSONObject }) { config ->
                val client=config.optString("google_client_id"); require(client.isNotBlank()) { "Set GOOGLE_CLIENT_ID on the API server." }
                googleSignIn(client)
            }
        }
        button(c,"Server settings") { serverSettings() }
    }
    private fun serverSettings() {
        dialog("Server settings") { content,dialog ->
            val endpoint=input(content,"API URL",repo.api.base)
            button(content,"Save server",true) {
                val url=endpoint.value().trimEnd('/'); val uri=URI(url)
                val debug=(applicationInfo.flags and android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE)!=0
                require(uri.userInfo==null && uri.query==null && uri.fragment==null && uri.host!=null && (uri.scheme=="https" || (debug && uri.scheme=="http" && uri.host in listOf("10.0.2.2","localhost","127.0.0.1")))) { "Use an HTTPS API URL. Debug builds also allow local HTTP." }
                require(url.endsWith("/marpos/api")) { "The API URL must end with /marpos/api." }
                check(prefs.edit().putString("api",url).commit()) { "Could not save the API URL." }
                repo.db.close(); repo=Repository(this,Api(this,url)); dialog.dismiss(); render()
            }
        }
    }
    private fun googleSignIn(client: String) {
        credentialSignal=CancellationSignal()
        val request=GetCredentialRequest.Builder().addCredentialOption(GetSignInWithGoogleOption.Builder(client).build()).build()
        CredentialManager.create(this).getCredentialAsync(this,request,credentialSignal,uiExecutor,object: CredentialManagerCallback<GetCredentialResponse,GetCredentialException> {
            override fun onResult(result: GetCredentialResponse) { safe {
                val credential=result.credential
                require(credential is CustomCredential && credential.type==GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) { "Google returned an unsupported credential." }
                val token=GoogleIdTokenCredential.createFrom(credential.data).idToken
                work({ repo.signIn(token) }) { render() }
            } }
            override fun onError(e: GetCredentialException) { when(e) { is GetCredentialCancellationException -> Unit; is NoCredentialException -> notice("Add a Google account on this device, then try sign-in again."); else -> notice(e.message ?: "Google sign-in failed.") } }
        })
    }
    fun clearCredentials() {
        CredentialManager.create(this).clearCredentialStateAsync(ClearCredentialStateRequest(),null,uiExecutor,object: CredentialManagerCallback<Void?,ClearCredentialException> { override fun onResult(result: Void?) {}; override fun onError(e: ClearCredentialException) {} })
    }
    fun pickImage(callback: (Uri) -> Unit) { imageResult=callback; startActivityForResult(Intent(Intent.ACTION_OPEN_DOCUMENT).apply { type="image/*"; addCategory(Intent.CATEGORY_OPENABLE) },42) }
    override fun onActivityResult(requestCode: Int,resultCode: Int,data: Intent?) { super.onActivityResult(requestCode,resultCode,data); if(requestCode==42 && resultCode==RESULT_OK) data?.data?.let { imageResult?.invoke(it) }; imageResult=null }
    private fun handleBack() {
        if(busy) return
        if(!tablet && screen=="Point of sale" && mobilePanel=="order") { mobilePanel="catalog"; render() }
        else {
            val home=if(repo.viewer) "Order history" else "Point of sale"
            if(screen!=home && repo.store.isNotBlank()) navigate(home) else finish()
        }
    }
    // Android 13+ uses the OnBackInvokedDispatcher registered in onCreate.
    @SuppressLint("GestureBackNavigation")
    @Deprecated("Used only before Android 13")
    override fun onBackPressed() { handleBack() }
}
