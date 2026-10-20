package com.marpos.mobile

import android.content.Context
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.RippleDrawable
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.*

// Keep these tokens aligned with marpos-web/styles/globals.css.
object WebUi {
    val background = Color.rgb(245,247,248)
    val foreground = Color.rgb(23,37,43)
    val muted = Color.rgb(122,139,144)
    val primary = Color.rgb(15,128,98)
    val secondary = Color.rgb(233,244,239)
    val border = Color.rgb(225,232,231)
    val sidebar = Color.rgb(250,251,251)
}

fun MainActivity.surface(color: Int=Color.WHITE, radius: Int=9, border: Int?=WebUi.border) = GradientDrawable().apply {
    setColor(color); cornerRadius=dp(radius).toFloat()
    border?.let { setStroke(dp(1),it) }
}
fun MainActivity.touchSurface(color: Int=Color.WHITE, radius: Int=9, border: Int?=WebUi.border) = RippleDrawable(
    ColorStateList.valueOf(Color.argb(35,15,128,98)),surface(color,radius,border),surface(Color.WHITE,radius,null)
)
fun MainActivity.divider(parent: LinearLayout) {
    parent.addView(View(this).apply { setBackgroundColor(WebUi.border) },LinearLayout.LayoutParams(-1,dp(1)))
}
fun MainActivity.spacer(parent: LinearLayout,height: Int=12) { parent.addView(View(this),LinearLayout.LayoutParams(1,dp(height))) }
fun MainActivity.weight(view: View, parent: LinearLayout, fixed: Int=0) {
    view.layoutParams=LinearLayout.LayoutParams(if(parent.orientation==LinearLayout.HORIZONTAL) fixed else -1,if(parent.orientation==LinearLayout.VERTICAL) fixed else -2,1f)
}
fun MainActivity.iconButton(parent: LinearLayout,kind: String,label: String,action: () -> Unit): FrameLayout {
    val frame=FrameLayout(this).apply {
        contentDescription=tr(label); tooltipText=tr(label); isFocusable=true
        background=touchSurface(Color.TRANSPARENT,8,null)
        addView(UiIcon(this@iconButton,kind),FrameLayout.LayoutParams(dp(19),dp(19),Gravity.CENTER))
        setOnClickListener { if(!isWorking) safe(action) }
    }
    parent.addView(frame,LinearLayout.LayoutParams(dp(44),dp(48)))
    return frame
}
fun MainActivity.caption(parent: LinearLayout,value: String) = text(parent,value,12f).apply { setTextColor(WebUi.muted) }
fun MainActivity.pageHeading(parent: LinearLayout,eyebrow: String,title: String,description: String="") {
    text(parent,eyebrow.uppercase(),11f,true).apply { setTextColor(WebUi.primary); letterSpacing=.13f }
    heading(parent,title)
    if(description.isNotEmpty()) caption(parent,description).apply { textSize=14f }
    spacer(parent,16)
}
fun MainActivity.emptyState(parent: LinearLayout,kind: String,title: String,description: String) {
    val empty=column(parent).apply { gravity=Gravity.CENTER; setPadding(dp(15),dp(46),dp(15),dp(46)) }
    empty.addView(UiIcon(this,kind,WebUi.muted),LinearLayout.LayoutParams(dp(30),dp(30)))
    text(empty,title,14f,true).apply { gravity=Gravity.CENTER; setTextColor(Color.rgb(101,119,123)) }
    caption(empty,description).gravity=Gravity.CENTER
}
fun MainActivity.totalRow(parent: LinearLayout,label: String,value: String,grand: Boolean=false) {
    val r=row(parent).apply { gravity=Gravity.CENTER_VERTICAL }
    val title=text(r,label,if(grand) 18f else 13f,grand); weight(title,r)
    text(r,value,if(grand) 22f else 13f,true).apply { if(grand) setTextColor(WebUi.primary) }
}

/** Reflows from measured content width, including split-screen and sidebar changes. */
class ResponsiveGrid @JvmOverloads constructor(context: Context,private val minCell: Int=(170*context.resources.displayMetrics.density).toInt(),private val maxColumns: Int=Int.MAX_VALUE,private val forceTwo: Boolean=false): ViewGroup(context) {
    private val gap=(14*resources.displayMetrics.density).toInt()
    override fun onMeasure(widthMeasureSpec: Int,heightMeasureSpec: Int) {
        val width=MeasureSpec.getSize(widthMeasureSpec)
        val cols=if(forceTwo) 2 else ((width+gap)/(minCell+gap)).coerceIn(1,maxColumns)
        val cell=((width-gap*(cols-1))/cols).coerceAtLeast(0)
        var height=0
        (0 until childCount step cols).forEach { start ->
            var rowHeight=0
            for(i in start until minOf(start+cols,childCount)) {
                getChildAt(i).measure(MeasureSpec.makeMeasureSpec(cell,MeasureSpec.EXACTLY),MeasureSpec.makeMeasureSpec(0,MeasureSpec.UNSPECIFIED))
                rowHeight=maxOf(rowHeight,getChildAt(i).measuredHeight)
            }
            for(i in start until minOf(start+cols,childCount)) getChildAt(i).measure(MeasureSpec.makeMeasureSpec(cell,MeasureSpec.EXACTLY),MeasureSpec.makeMeasureSpec(rowHeight,MeasureSpec.EXACTLY))
            height+=rowHeight+if(start==0) 0 else gap
        }
        setMeasuredDimension(width,resolveSize(height,heightMeasureSpec))
    }
    override fun onLayout(changed: Boolean,l: Int,t: Int,r: Int,b: Int) {
        val cols=if(forceTwo) 2 else ((width+gap)/(minCell+gap)).coerceIn(1,maxColumns)
        var y=0
        for(i in 0 until childCount) {
            val child=getChildAt(i); val x=(i%cols)*(child.measuredWidth+gap)
            child.layout(x,y,x+child.measuredWidth,y+child.measuredHeight)
            if(i%cols==cols-1) y+=child.measuredHeight+gap
        }
    }
    override fun generateDefaultLayoutParams() = LayoutParams(LayoutParams.MATCH_PARENT,LayoutParams.WRAP_CONTENT)
}
fun MainActivity.grid(parent: LinearLayout,minCell: Int=170,maxColumns: Int=Int.MAX_VALUE,forceTwo: Boolean=false) = ResponsiveGrid(this,dp(minCell),maxColumns,forceTwo).also {
    parent.addView(it,LinearLayout.LayoutParams(-1,-2).apply { bottomMargin=dp(20) })
}
fun MainActivity.table(parent: LinearLayout,headers: List<String>,widths: List<Int>): LinearLayout {
    val scroll=HorizontalScrollView(this).apply { isFillViewport=true; background=surface(Color.WHITE,14); clipToOutline=true }
    parent.addView(scroll,LinearLayout.LayoutParams(-1,-2).apply { topMargin=dp(20); bottomMargin=dp(20) })
    val table=column(); scroll.addView(table,ViewGroup.LayoutParams(-1,-2)); table.tag=widths
    tableRow(table,headers,true)
    return table
}
@Suppress("UNCHECKED_CAST")
fun MainActivity.tableRow(table: LinearLayout,values: List<String>,header: Boolean=false,action: (() -> Unit)?=null) {
    val widths=table.tag as List<Int>
    val row=row(table).apply {
        minimumWidth=dp(widths.sum()); gravity=Gravity.CENTER_VERTICAL
        background=if(header) surface(Color.rgb(248,251,250),0,null) else touchSurface(Color.WHITE,0,null)
        if(action!=null) { isFocusable=true; contentDescription=values.joinToString(", "); setOnClickListener { if(!isWorking) safe(action) } }
    }
    values.forEachIndexed { index,value ->
        text(row,if(header) tr(value).uppercase() else value,if(header) 11f else 13f,header || index==0).apply {
            setTextColor(if(header) Color.rgb(102,120,124) else WebUi.foreground)
            setPadding(dp(18),dp(if(header) 12 else 14),dp(18),dp(if(header) 12 else 14))
            layoutParams=LinearLayout.LayoutParams(dp(widths[index]),-2).apply { weight=widths[index].toFloat() }
            if(header) letterSpacing=.05f
            if(action!=null && index==values.lastIndex) setTextColor(WebUi.primary)
        }
    }
    divider(table)
}

/** The same Lucide paths used by marpos-web, rendered as native vectors. */
class UiIcon @JvmOverloads constructor(context: Context,kind: String="sidebar",color: Int=Color.rgb(96,112,120)): ImageView(context) {
    init {
        setImageResource(when(kind) {
            "cart" -> R.drawable.ui_cart; "package" -> R.drawable.ui_package
            "chart" -> R.drawable.ui_chart; "history" -> R.drawable.ui_history
            "users" -> R.drawable.ui_users; "store" -> R.drawable.ui_store
            "settings" -> R.drawable.ui_settings; "wallet" -> R.drawable.ui_wallet
            "cloud" -> R.drawable.ui_cloud; "logout" -> R.drawable.ui_logout
            "close" -> R.drawable.ui_close; "minus" -> R.drawable.ui_minus
            "plus" -> R.drawable.ui_plus; "more" -> R.drawable.ui_more
            "edit" -> R.drawable.ui_edit; else -> R.drawable.ui_sidebar
        })
        imageTintList=ColorStateList.valueOf(color)
        importantForAccessibility=IMPORTANT_FOR_ACCESSIBILITY_NO
    }
}

/** Keeps field instances intact when the window changes between one and two columns. */
class SettingsSection(context: Context): LinearLayout(context) {
    private val copyWide=LayoutParams((240*resources.displayMetrics.density).toInt(),-2).apply { marginEnd=(32*resources.displayMetrics.density).toInt() }
    private val copyNarrow=LayoutParams(-1,-2)
    private val fieldsWide=LayoutParams(0,-2,1f)
    private val fieldsNarrow=LayoutParams(-1,-2)
    private var wasWide: Boolean?=null
    override fun onMeasure(widthMeasureSpec: Int,heightMeasureSpec: Int) {
        val wide=MeasureSpec.getSize(widthMeasureSpec)>=680*resources.displayMetrics.density
        if(childCount==2 && wasWide!=wide) {
            orientation=if(wide) HORIZONTAL else VERTICAL
            getChildAt(0).layoutParams=if(wide) copyWide else copyNarrow
            getChildAt(1).layoutParams=if(wide) fieldsWide else fieldsNarrow
            wasWide=wide
        }
        super.onMeasure(widthMeasureSpec,heightMeasureSpec)
    }
}
fun MainActivity.settingsSection(parent: LinearLayout,number: String,title: String,description: String): LinearLayout {
    val section=SettingsSection(this).apply { setPadding(dp(24),dp(22),dp(24),dp(22)) }
    parent.addView(section,LinearLayout.LayoutParams(-1,-2))
    val copy=column(section)
    text(copy,number,10f,true).apply { setTextColor(WebUi.primary); letterSpacing=.11f }
    text(copy,title,16f,true)
    caption(copy,description)
    return column(section)
}
