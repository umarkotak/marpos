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
    private lateinit var statusView: TextView
    private val executor = Executors.newSingleThreadExecutor()
    private val uiExecutor = java.util.concurrent.Executor { handler.post(it) }
    private val handler = Handler(Looper.getMainLooper())
    private var busy = false
    private var syncing = false
    private var screen = "Point of sale"
    private var pageGeneration = 0
    private var imageResult: ((Uri) -> Unit)? = null
    private var credentialSignal: CancellationSignal? = null
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
        if(android.os.Build.VERSION.SDK_INT>=33) onBackInvokedDispatcher.registerOnBackInvokedCallback(android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT) { handleBack() }
        render()
        if(repo.auth!=null) retrySync()
        connectivity.registerNetworkCallback(NetworkRequest.Builder().addCapability(android.net.NetworkCapabilities.NET_CAPABILITY_INTERNET).build(),networkCallback)
    }
    override fun onStart() { super.onStart(); handler.postDelayed(timer,60000) }
    override fun onStop() { handler.removeCallbacks(timer); super.onStop() }
    override fun onDestroy() { credentialSignal?.cancel(); handler.removeCallbacksAndMessages(null); connectivity.unregisterNetworkCallback(networkCallback); executor.shutdown(); super.onDestroy() }
    override fun onSaveInstanceState(out: Bundle) { out.putString("screen",screen); super.onSaveInstanceState(out) }
    fun tr(text: String): String {
        if(language!="id") return text
        val key=englishKeys[text] ?: englishKeys.entries.firstOrNull { it.key.equals(text,true) }?.value
        return if(key!=null) id.optString(key,text) else text
    }
    fun money(n: Long) = NumberFormat.getCurrencyInstance(Locale.forLanguageTag(if(language=="id") "id-ID" else "en-ID")).apply { currency=java.util.Currency.getInstance("IDR"); maximumFractionDigits=0 }.format(n)
    fun dp(n: Int) = (n*resources.displayMetrics.density).toInt()
    fun column(parent: LinearLayout?=null): LinearLayout = LinearLayout(this).apply { orientation=LinearLayout.VERTICAL; parent?.addView(this,LinearLayout.LayoutParams(-1,-2)) }
    fun row(parent: LinearLayout): LinearLayout = LinearLayout(this).apply { orientation=LinearLayout.HORIZONTAL; parent.addView(this,LinearLayout.LayoutParams(-1,-2)) }
    fun text(parent: LinearLayout, value: String, size: Float=16f, bold: Boolean=false): TextView = TextView(this).apply {
        text=tr(value); textSize=size; setTextColor(Color.rgb(31,48,42)); if(bold) setTypeface(typeface,Typeface.BOLD); setPadding(0,dp(7),0,dp(7)); parent.addView(this)
    }
    fun heading(parent: LinearLayout,value: String) = text(parent,value,24f,true)
    fun card(parent: LinearLayout): LinearLayout = column().apply {
        setPadding(dp(16),dp(8),dp(16),dp(12))
        background=GradientDrawable().apply { setColor(Color.WHITE); cornerRadius=dp(14).toFloat(); setStroke(dp(1),Color.rgb(222,232,226)) }
        parent.addView(this,LinearLayout.LayoutParams(-1,-2).apply { bottomMargin=dp(12) })
    }
    fun button(parent: LinearLayout,label: String,primary: Boolean=false,action: () -> Unit): Button = Button(this).apply {
        text=tr(label); isAllCaps=false; minHeight=dp(48); setTextColor(if(primary) Color.WHITE else green)
        if(primary) backgroundTintList=android.content.res.ColorStateList.valueOf(green)
        parent.addView(this,LinearLayout.LayoutParams(if(parent.orientation==LinearLayout.HORIZONTAL) 0 else -1,-2).apply { if(parent.orientation==LinearLayout.HORIZONTAL) weight=1f })
        setOnClickListener { if(!busy) safe(action) }
    }
    fun input(parent: LinearLayout,label: String,value: String="",numeric: Boolean=false): EditText {
        val labelView=text(parent,label,13f,true)
        return EditText(this).apply { id=View.generateViewId(); labelView.labelFor=id; hint=tr(label); setText(value); textSize=16f; setSingleLine(true); if(numeric) inputType=android.text.InputType.TYPE_CLASS_NUMBER or android.text.InputType.TYPE_NUMBER_FLAG_DECIMAL; parent.addView(this,LinearLayout.LayoutParams(-1,dp(52))) }
    }
    fun check(parent: LinearLayout,label: String,value: Boolean=false): CheckBox = CheckBox(this).apply { text=tr(label); isChecked=value; minHeight=dp(48); parent.addView(this) }
    fun select(parent: LinearLayout,label: String,options: List<String>,selected: String=options.firstOrNull() ?: ""): Spinner {
        text(parent,label,13f,true)
        return Spinner(this).apply { adapter=ArrayAdapter(this@MainActivity,android.R.layout.simple_spinner_dropdown_item,options.map { tr(it) }); setSelection(options.indexOf(selected).coerceAtLeast(0)); parent.addView(this,LinearLayout.LayoutParams(-1,dp(48))) }
    }
    fun EditText.value() = text.toString().trim()
    fun changed(input: EditText, action: () -> Unit) { input.addTextChangedListener(object: TextWatcher { override fun beforeTextChanged(s: CharSequence?,start:Int,count:Int,after:Int) {} ; override fun onTextChanged(s:CharSequence?,start:Int,before:Int,count:Int) { safe(action) }; override fun afterTextChanged(s:Editable?) {} }) }
    fun safe(action: () -> Unit) { try { action() } catch(e: Exception) { notice(e.message ?: "Could not complete the action.") } }
    fun notice(message: String) { if(!isDestroyed) AlertDialog.Builder(this).setMessage(tr(message)).setPositiveButton(android.R.string.ok,null).show() }
    fun confirm(message: String, action: () -> Unit) { AlertDialog.Builder(this).setMessage(tr(message)).setNegativeButton(android.R.string.cancel,null).setPositiveButton(android.R.string.ok) { _,_ -> if(!busy) safe(action) }.show() }
    fun dialog(title: String, build: (LinearLayout, AlertDialog) -> Unit) {
        val content=column().apply { setPadding(dp(20),dp(8),dp(20),dp(16)) }
        val scroll=ScrollView(this).apply { addView(content) }
        val dialog=AlertDialog.Builder(this).setTitle(tr(title)).setView(scroll).setNegativeButton(android.R.string.cancel,null).create()
        build(content,dialog); dialog.show()
    }
    fun <T> work(task: () -> T, done: (T) -> Unit) {
        if(busy) return
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
        statusView.text=if(busy) tr("Working…") else "${tr(if(repo.online) "Connected" else "Offline")} · ${repo.pending().size} ${tr("Pending sync") }"
    }
    fun retrySync() {
        if(busy || syncing || repo.auth==null) return
        syncing=true
        val oldRole=repo.role
        executor.execute {
            runCatching { repo.refreshSession(); repo.sync() }
            handler.post {
                if(isDestroyed) return@post
                syncing=false
                if(repo.auth==null || repo.store.isBlank() || repo.role!=oldRole) render()
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
    fun navigate(name: String) { screen=name; render() }
    fun menu() {
        val names= mutableListOf<String>()
        if(!repo.viewer) names.add("Point of sale")
        names.addAll(listOf("Products","Order history"))
        if(repo.edit || repo.superadmin) names.addAll(listOf("Income and expenses","Reports","Audit log"))
        if(!repo.viewer) names.add("Team")
        if(repo.edit) names.add("Store settings")
        names.addAll(listOf("Manage stores","Sync queue","Language","Sign out"))
        AlertDialog.Builder(this).setTitle("Marpos").setItems(names.map { tr(it) }.toTypedArray()) { _,index ->
            when(val name=names[index]) {
                "Language" -> { prefs.edit().putString("language",if(language=="en") "id" else "en").apply(); render() }
                "Sign out" -> confirm("Sign out? Pending records stay on this device and need this account to sync.") { work({ repo.logout() }) { render(); clearCredentials() } }
                else -> navigate(name)
            }
        }.show()
    }
    fun render() {
        pageGeneration++
        shell=column().apply { setPadding(dp(16),0,dp(16),0); setBackgroundColor(Color.rgb(243,246,244)) }
        shell.setOnApplyWindowInsetsListener { view,insets ->
            if(android.os.Build.VERSION.SDK_INT>=30) {
                val edges=insets.getInsets(android.view.WindowInsets.Type.systemBars() or android.view.WindowInsets.Type.ime())
                view.setPadding(dp(16),edges.top,dp(16),edges.bottom)
            } else {
                @Suppress("DEPRECATION")
                view.setPadding(dp(16),insets.systemWindowInsetTop,dp(16),insets.systemWindowInsetBottom)
            }
            insets
        }
        setContentView(shell)
        val top=row(shell)
        button(top,"☰ Marpos") { menu() }.isEnabled=repo.auth!=null
        button(top,if(language=="en") "ID" else "EN") { prefs.edit().putString("language",if(language=="en") "id" else "en").apply(); render() }
        statusView=text(shell,"",12f)
        statusView.setOnClickListener { if(!busy && repo.auth!=null) navigate("Sync queue") }
        val scroll=ScrollView(this).apply { isFillViewport=true; shell.addView(this,LinearLayout.LayoutParams(-1,0,1f)) }
        body=column(); scroll.addView(body)
        if(repo.auth==null) login()
        else {
            text(body,repo.auth!!.optString("store_name",repo.auth!!.optString("name")),13f,true)
            if(repo.store.isBlank()) storesScreen()
            else when(screen) {
                "Point of sale" -> if(repo.viewer) ordersScreen() else posScreen()
                "Products" -> productsScreen()
                "Order history" -> ordersScreen()
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
        heading(body,"Welcome to Marpos")
        text(body,"Sign in online first. Saved orders and checkout remain available offline for 30 days after your last online sign-in.")
        val c=card(body)
        val endpoint=input(c,"API URL",repo.api.base)
        button(c,"Save server") {
            val url=endpoint.value().trimEnd('/'); val uri=URI(url)
            val debug=(applicationInfo.flags and android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE)!=0
            require(uri.userInfo==null && uri.query==null && uri.fragment==null && uri.host!=null && (uri.scheme=="https" || (debug && uri.scheme=="http" && uri.host in listOf("10.0.2.2","localhost","127.0.0.1")))) { "Use an HTTPS API URL. Debug builds also allow local HTTP." }
            require(url.endsWith("/marpos/api")) { "The API URL must end with /marpos/api." }
            check(prefs.edit().putString("api",url).commit()) { "Could not save the API URL." }; repo.db.close(); repo=Repository(this,Api(this,url)); render()
        }
        button(c,"Sign in with Google",true) {
            work({ repo.api.request("/auth/config") as JSONObject }) { config ->
                val client=config.optString("google_client_id"); require(client.isNotBlank()) { "Set GOOGLE_CLIENT_ID on the API server." }
                googleSignIn(client)
            }
        }
        text(c,"The API URL points to the Go server. For the Android emulator, use http://10.0.2.2:6030/marpos/api.",13f)
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
    private fun clearCredentials() {
        CredentialManager.create(this).clearCredentialStateAsync(ClearCredentialStateRequest(),null,uiExecutor,object: CredentialManagerCallback<Void?,ClearCredentialException> { override fun onResult(result: Void?) {}; override fun onError(e: ClearCredentialException) {} })
    }
    fun pickImage(callback: (Uri) -> Unit) { imageResult=callback; startActivityForResult(Intent(Intent.ACTION_OPEN_DOCUMENT).apply { type="image/*"; addCategory(Intent.CATEGORY_OPENABLE) },42) }
    override fun onActivityResult(requestCode: Int,resultCode: Int,data: Intent?) { super.onActivityResult(requestCode,resultCode,data); if(requestCode==42 && resultCode==RESULT_OK) data?.data?.let { imageResult?.invoke(it) }; imageResult=null }
    private fun handleBack() { if(busy) return; if(screen!="Point of sale" && repo.store.isNotBlank()) navigate("Point of sale") else finish() }
    // Android 13+ uses the OnBackInvokedDispatcher registered in onCreate.
    @SuppressLint("GestureBackNavigation")
    @Deprecated("Used only before Android 13")
    override fun onBackPressed() { handleBack() }
}
