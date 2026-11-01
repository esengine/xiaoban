package app.xiaoban.hub

import android.animation.ValueAnimator
import android.content.Context
import android.content.Intent
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.PixelFormat
import android.graphics.Rect
import android.graphics.RectF
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.os.VibrationEffect
import android.os.Vibrator
import android.text.TextUtils
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.view.animation.DecelerateInterpolator
import android.view.animation.OvershootInterpolator
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import org.json.JSONArray
import org.json.JSONObject
import kotlin.math.abs
import kotlin.math.hypot
import kotlin.math.roundToInt

object PlanBall {
  private const val BALL = 56f
  private const val PAD = 10f
  private const val EDGE = 8f
  private const val TOP = 96f
  private const val BOTTOM = 120f
  private const val ZONE = 200f
  private const val ZONE_DOT = 60f
  private const val ZONE_LIFT = 90f
  private const val ZONE_REACH = 70f
  private const val CARD = 250f
  private const val CARD_PAD = 14f
  private const val SLOP = 4f
  private const val SNAP_MS = 420L
  private const val UNDO_MS = 4000L
  private const val TAP_GUARD_MS = 300L

  private val main = Handler(Looper.getMainLooper())

  @Volatile
  var listener: ((String) -> Unit)? = null

  private var state: JSONObject? = null
  private var parked: JSONObject? = null
  private var busy = false
  private var ball: FrameLayout? = null
  private var face: BallView? = null
  private var zone: FrameLayout? = null
  private var zoneDot: View? = null
  private var card: FrameLayout? = null
  private var toast: FrameLayout? = null
  private var x = -1
  private var y = -1
  private var near = false
  private var snap: ValueAnimator? = null
  private var cardClosedAt = 0L
  private val dropToast = Runnable { removeToast() }

  fun update(raw: String) = main.post {
    val next = runCatching { JSONObject(raw) }.getOrNull()
    state = next?.takeIf { it.optString("mode") == "show" && it.optString("threadId").isNotEmpty() }
    if (state != null) removeToast()
    render()
  }

  fun yieldTo(value: Boolean) = main.post {
    if (busy == value) return@post
    busy = value
    render()
  }

  fun hide() = main.post {
    removeBall()
    removeToast()
  }

  private fun service(): XiaobanOperatorService? = XiaobanOperatorService.current

  private fun manager(context: Context) = context.getSystemService(Context.WINDOW_SERVICE) as WindowManager

  private fun dp(context: Context, value: Float) = value * context.resources.displayMetrics.density

  private fun px(context: Context, value: Float) = dp(context, value).roundToInt()

  private fun tint(context: Context, id: Int) = context.getColor(id)

  private fun screen(context: Context): Rect =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      manager(context).currentWindowMetrics.bounds
    } else {
      val metrics = context.resources.displayMetrics
      Rect(0, 0, metrics.widthPixels, metrics.heightPixels)
    }

  private fun round(context: Context, fill: Int, radius: Float) = GradientDrawable().apply {
    setColor(fill)
    cornerRadius = dp(context, radius)
  }

  private fun params(width: Int, height: Int, touchable: Boolean = true, outside: Boolean = false) =
    WindowManager.LayoutParams(
      width,
      height,
      WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
        WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or
        WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or
        WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS or
        (if (touchable) 0 else WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE) or
        (if (outside) WindowManager.LayoutParams.FLAG_WATCH_OUTSIDE_TOUCH else 0),
      PixelFormat.TRANSLUCENT,
    ).apply { gravity = Gravity.TOP or Gravity.START }

  private fun emit(value: JSONObject) {
    val deliver = listener ?: return
    runCatching { deliver(value.toString()) }
  }

  private fun render() {
    val service = service()
    val current = state
    if (service == null || current == null || busy) {
      removeBall()
      return
    }
    showBall(service, current)
    if (card != null) {
      removeCard()
      openCard(service, current, animate = false)
    }
  }

  private fun showBall(service: XiaobanOperatorService, current: JSONObject) {
    if (ball == null) {
      val bounds = screen(service)
      if (x < 0 || y < 0) {
        x = bounds.width() - px(service, BALL + EDGE)
        y = (bounds.height() * 0.62f).roundToInt()
      }
      val holder = FrameLayout(service)
      val view = BallView(service).apply {
        background = GradientDrawable().apply {
          shape = GradientDrawable.OVAL
          setColor(tint(service, R.color.xiaoban_ink))
        }
        elevation = dp(service, 8f)
        setOnTouchListener(Drag(service))
        setOnClickListener { toggleCard() }
      }
      val size = px(service, BALL)
      holder.addView(view, FrameLayout.LayoutParams(size, size, Gravity.CENTER))
      val outer = px(service, BALL + PAD * 2)
      val layout = params(outer, outer).apply {
        this.x = x - px(service, PAD)
        this.y = y - px(service, PAD)
      }
      if (runCatching { manager(service).addView(holder, layout) }.isFailure) return
      ball = holder
      face = view
      view.alpha = 0f
      view.scaleX = 0.6f
      view.scaleY = 0.6f
      view.animate().alpha(1f).scaleX(1f).scaleY(1f).setDuration(220).setInterpolator(OvershootInterpolator(1.6f)).start()
    }
    face?.set(current)
  }

  private fun place(context: Context) {
    val holder = ball ?: return
    val layout = holder.layoutParams as? WindowManager.LayoutParams ?: return
    layout.x = x - px(context, PAD)
    layout.y = y - px(context, PAD)
    runCatching { manager(context).updateViewLayout(holder, layout) }
  }

  private fun removeBall() {
    snap?.cancel()
    snap = null
    removeCard()
    removeZone()
    val holder = ball ?: return
    val service = service()
    if (service != null) runCatching { manager(service).removeView(holder) }
    ball = null
    face = null
  }

  private fun settle(context: Context) {
    val bounds = screen(context)
    val size = px(context, BALL)
    val edge = px(context, EDGE)
    val targetX = if (x + size / 2 < bounds.width() / 2) edge else bounds.width() - size - edge
    val low = px(context, TOP)
    val high = maxOf(low, bounds.height() - size - px(context, BOTTOM))
    val targetY = y.coerceIn(low, high)
    val fromX = x
    val fromY = y
    snap?.cancel()
    snap = ValueAnimator.ofFloat(0f, 1f).apply {
      duration = SNAP_MS
      interpolator = OvershootInterpolator(1.4f)
      addUpdateListener { animator ->
        val step = animator.animatedValue as Float
        x = (fromX + (targetX - fromX) * step).roundToInt()
        y = (fromY + (targetY - fromY) * step).roundToInt()
        place(context)
      }
      start()
    }
  }

  private fun buzz(context: Context) {
    val vibrator = context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator ?: return
    runCatching { vibrator.vibrate(VibrationEffect.createPredefined(VibrationEffect.EFFECT_TICK)) }
  }

  private class Drag(private val context: Context) : View.OnTouchListener {
    private var startX = 0f
    private var startY = 0f
    private var fromX = 0
    private var fromY = 0
    private var moved = false

    override fun onTouch(view: View, event: MotionEvent): Boolean {
      when (event.actionMasked) {
        MotionEvent.ACTION_DOWN -> {
          snap?.cancel()
          startX = event.rawX
          startY = event.rawY
          fromX = x
          fromY = y
          moved = false
        }
        MotionEvent.ACTION_MOVE -> {
          val dx = event.rawX - startX
          val dy = event.rawY - startY
          if (!moved && abs(dx) + abs(dy) < dp(context, SLOP)) return true
          if (!moved) {
            moved = true
            removeCard()
            showZone(context)
            view.animate().scaleX(1.08f).scaleY(1.08f).setDuration(120).start()
          }
          x = fromX + dx.roundToInt()
          y = fromY + dy.roundToInt()
          place(context)
          val bounds = screen(context)
          val half = dp(context, BALL) / 2f
          val reach = hypot(
            x + half - bounds.width() / 2f,
            y + half - (bounds.height() - dp(context, ZONE_LIFT)),
          ) < dp(context, ZONE_REACH)
          if (reach != near) {
            near = reach
            paintZone(context)
            if (reach) buzz(context)
          }
        }
        MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
          view.animate().scaleX(1f).scaleY(1f).setDuration(160).start()
          if (!moved) {
            if (event.actionMasked == MotionEvent.ACTION_UP) view.performClick()
            return true
          }
          removeZone()
          if (near) {
            near = false
            close(context)
          } else {
            settle(context)
          }
        }
      }
      return true
    }
  }

  private fun showZone(context: Context) {
    if (zone != null) return
    val holder = FrameLayout(context).apply {
      background = GradientDrawable(
        GradientDrawable.Orientation.TOP_BOTTOM,
        intArrayOf(tint(context, R.color.xiaoban_zone_fade_top), tint(context, R.color.xiaoban_zone_fade_bottom)),
      )
    }
    val dot = CrossView(context).apply {
      background = GradientDrawable().apply {
        shape = GradientDrawable.OVAL
        setColor(tint(context, R.color.xiaoban_zone_idle))
      }
    }
    val size = px(context, ZONE_DOT)
    holder.addView(
      dot,
      FrameLayout.LayoutParams(size, size, Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL).apply {
        bottomMargin = px(context, ZONE_LIFT - ZONE_DOT / 2)
      },
    )
    val layout = params(ViewGroup.LayoutParams.MATCH_PARENT, px(context, ZONE), touchable = false).apply {
      gravity = Gravity.BOTTOM or Gravity.START
    }
    if (runCatching { manager(context).addView(holder, layout) }.isFailure) return
    zone = holder
    zoneDot = dot
    near = false
    holder.alpha = 0f
    holder.translationY = dp(context, 20f)
    holder.animate().alpha(1f).translationY(0f).setDuration(200).setInterpolator(DecelerateInterpolator()).start()
  }

  private fun paintZone(context: Context) {
    val dot = zoneDot ?: return
    (dot.background as? GradientDrawable)?.setColor(
      tint(context, if (near) R.color.xiaoban_zone_near else R.color.xiaoban_zone_idle),
    )
    val scale = if (near) 1.2f else 1f
    dot.animate().scaleX(scale).scaleY(scale).setDuration(160).start()
  }

  private fun removeZone() {
    val holder = zone ?: return
    val service = service()
    if (service != null) runCatching { manager(service).removeView(holder) }
    zone = null
    zoneDot = null
  }

  private fun close(context: Context) {
    val current = state ?: return
    parked = current
    state = null
    removeBall()
    x = -1
    y = -1
    showToast(context, current)
    emit(JSONObject().put("kind", "closed").put("threadId", current.optString("threadId")))
  }

  private fun restore() {
    val current = parked ?: return
    parked = null
    removeToast()
    state = current
    render()
    emit(JSONObject().put("kind", "restore").put("threadId", current.optString("threadId")))
  }

  private fun showToast(context: Context, current: JSONObject) {
    removeToast()
    val bar = LinearLayout(context).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER_VERTICAL
      background = round(context, tint(context, R.color.xiaoban_ink), 14f)
      elevation = dp(context, 8f)
      setPadding(px(context, 14f), px(context, 2f), px(context, 10f), px(context, 2f))
      minimumHeight = px(context, 46f)
      addView(
        TextView(context).apply {
          text = current.optString("closed")
          textSize = 13f
          setTextColor(tint(context, R.color.xiaoban_surface))
        },
        LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f),
      )
      addView(TextView(context).apply {
        text = current.optString("undo")
        textSize = 13f
        setTextColor(tint(context, R.color.xiaoban_link_dark))
        val pad = px(context, 10f)
        setPadding(px(context, 6f), pad, px(context, 6f), pad)
        setOnClickListener { restore() }
      })
    }
    val holder = FrameLayout(context).apply {
      val side = px(context, 20f)
      setPadding(side, px(context, 10f), side, px(context, 10f))
      clipToPadding = false
      addView(bar, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
    }
    val layout = params(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
      gravity = Gravity.BOTTOM or Gravity.START
      y = px(context, 30f)
    }
    if (runCatching { manager(context).addView(holder, layout) }.isFailure) return
    toast = holder
    bar.alpha = 0f
    bar.translationY = dp(context, 20f)
    bar.animate().alpha(1f).translationY(0f).setDuration(220).setInterpolator(DecelerateInterpolator()).start()
    main.removeCallbacks(dropToast)
    main.postDelayed(dropToast, UNDO_MS)
  }

  private fun removeToast() {
    main.removeCallbacks(dropToast)
    val holder = toast ?: return
    val service = service()
    if (service != null) runCatching { manager(service).removeView(holder) }
    toast = null
    parked = null
  }

  private fun toggleCard() {
    val service = service() ?: return
    val current = state ?: return
    if (card != null) {
      removeCard()
      return
    }
    if (SystemClock.uptimeMillis() - cardClosedAt < TAP_GUARD_MS) return
    openCard(service, current, animate = true)
  }

  private fun removeCard() {
    val holder = card ?: return
    val service = service()
    if (service != null) runCatching { manager(service).removeView(holder) }
    card = null
  }

  private fun openCard(context: Context, current: JSONObject, animate: Boolean) {
    val bounds = screen(context)
    val size = px(context, BALL)
    val width = px(context, CARD)
    val gap = px(context, 10f)
    val right = x > (bounds.width() - size) / 2
    val cardX = if (right) x - width - gap else x + size + gap
    val low = px(context, 100f)
    val high = maxOf(low, bounds.height() - px(context, 280f))
    val cardY = (y - gap).coerceIn(low, high)
    val content = cardContent(context, current)
    val pad = px(context, CARD_PAD)
    val holder = FrameLayout(context).apply {
      setPadding(pad, pad, pad, pad)
      clipToPadding = false
      addView(content, FrameLayout.LayoutParams(width, ViewGroup.LayoutParams.WRAP_CONTENT))
      setOnTouchListener { _, event ->
        if (event.actionMasked == MotionEvent.ACTION_OUTSIDE) {
          cardClosedAt = SystemClock.uptimeMillis()
          removeCard()
        }
        false
      }
    }
    val layout = params(width + pad * 2, ViewGroup.LayoutParams.WRAP_CONTENT, outside = true).apply {
      this.x = cardX - pad
      this.y = cardY - pad
    }
    if (runCatching { manager(context).addView(holder, layout) }.isFailure) return
    card = holder
    if (!animate) return
    content.alpha = 0f
    content.scaleX = 0.85f
    content.scaleY = 0.85f
    content.post {
      content.pivotX = if (right) content.width.toFloat() else 0f
      content.pivotY = 0f
      content.animate().alpha(1f).scaleX(1f).scaleY(1f).setDuration(220).setInterpolator(OvershootInterpolator(1.56f)).start()
    }
  }

  private fun text(context: Context, value: String, size: Float, color: Int, bold: Boolean = false) =
    TextView(context).apply {
      text = value
      textSize = size
      setTextColor(color)
      if (bold) typeface = Typeface.DEFAULT_BOLD
    }

  private fun gapped(context: Context, view: View) = view.apply {
    layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
      topMargin = px(context, 8f)
    }
  }

  private fun cardContent(context: Context, current: JSONObject): View = LinearLayout(context).apply {
    orientation = LinearLayout.VERTICAL
    background = round(context, tint(context, R.color.xiaoban_surface), 18f)
    elevation = dp(context, 12f)
    val pad = px(context, 14f)
    setPadding(pad, pad, pad, pad)
    val threadId = current.optString("threadId")
    addView(LinearLayout(context).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.BOTTOM
      addView(
        text(context, current.optString("title"), 14f, tint(context, R.color.xiaoban_ink), bold = true).apply {
          maxLines = 1
          ellipsize = TextUtils.TruncateAt.END
        },
        LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f),
      )
      addView(text(context, current.optString("count"), 12f, tint(context, R.color.xiaoban_muted)))
    })
    val attention = current.optBoolean("attention")
    addView(gapped(context, text(
      context,
      current.optString("next"),
      12f,
      tint(context, if (attention) R.color.xiaoban_attention_ink else R.color.xiaoban_ink_mid),
    ).apply {
      background = round(context, tint(context, if (attention) R.color.xiaoban_attention_soft else R.color.xiaoban_ground), 8f)
      setPadding(px(context, 8f), px(context, 6f), px(context, 8f), px(context, 6f))
      maxLines = 4
    }))
    val then = current.optString("after")
    if (then.isNotEmpty()) {
      addView(gapped(context, text(context, then, 12f, tint(context, R.color.xiaoban_ink_mid)).apply {
        setLineSpacing(0f, 1.4f)
        maxLines = 3
      }))
    }
    val options = current.optJSONArray("options") ?: JSONArray()
    if (options.length() > 0) {
      addView(gapped(context, LinearLayout(context).apply {
        orientation = LinearLayout.HORIZONTAL
        val count = minOf(options.length(), 3)
        for (index in count - 1 downTo 0) {
          val option = options.optString(index)
          addView(choice(context, option, primary = index == 0) {
            removeCard()
            emit(JSONObject().put("kind", "choose").put("threadId", threadId).put("option", option))
          }, LinearLayout.LayoutParams(0, px(context, 34f), 1f).apply {
            if (index != count - 1) marginStart = px(context, 6f)
          })
        }
      }))
    }
    addView(gapped(context, text(context, current.optString("open"), 12f, tint(context, R.color.xiaoban_accent)).apply {
      setPadding(0, px(context, 4f), 0, px(context, 4f))
      setOnClickListener { openThread(context, threadId) }
    }))
  }

  private fun choice(context: Context, label: String, primary: Boolean, onTap: () -> Unit) =
    text(
      context,
      label,
      12f,
      tint(context, if (primary) R.color.xiaoban_surface else R.color.xiaoban_ink),
    ).apply {
      gravity = Gravity.CENTER
      maxLines = 1
      ellipsize = TextUtils.TruncateAt.END
      setPadding(px(context, 6f), 0, px(context, 6f), 0)
      background = round(context, tint(context, if (primary) R.color.xiaoban_ink else R.color.xiaoban_surface), 10f).apply {
        if (!primary) setStroke(px(context, 1f), tint(context, R.color.xiaoban_line_strong))
      }
      setOnClickListener { onTap() }
    }

  private fun openThread(context: Context, threadId: String) {
    removeCard()
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse("xiaoban://thread/${Uri.encode(threadId)}?plan=open"))
      .setPackage(context.packageName)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    runCatching { context.startActivity(intent) }
  }

  private class BallView(context: Context) : View(context) {
    private var done = 0
    private var total = 0
    private var attention = false
    private var count = ""
    private val track = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      style = Paint.Style.STROKE
      color = context.getColor(R.color.xiaoban_ball_track)
    }
    private val arc = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      style = Paint.Style.STROKE
      strokeCap = Paint.Cap.ROUND
      color = context.getColor(R.color.xiaoban_ball_arc)
    }
    private val label = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = context.getColor(R.color.xiaoban_surface)
      typeface = Typeface.DEFAULT_BOLD
      textAlign = Paint.Align.CENTER
    }
    private val dot = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = context.getColor(R.color.xiaoban_attention) }
    private val rim = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = context.getColor(R.color.xiaoban_ink) }

    fun set(state: JSONObject) {
      done = state.optInt("done")
      total = state.optInt("total")
      attention = state.optBoolean("attention")
      count = state.optString("count")
      contentDescription = state.optString("label")
      invalidate()
    }

    override fun onDraw(canvas: Canvas) {
      val unit = width / BALL
      val cx = width / 2f
      val cy = height / 2f
      val radius = 18f * unit
      track.strokeWidth = 4f * unit
      arc.strokeWidth = 4f * unit
      val box = RectF(cx - radius, cy - radius, cx + radius, cy + radius)
      canvas.drawOval(box, track)
      if (total > 0 && done > 0) canvas.drawArc(box, -90f, 360f * done / total, false, arc)
      label.textSize = (if (count.length > 4) 10f else 12f) * unit
      canvas.drawText(count, cx, cy + 4f * unit, label)
      if (attention) {
        val dx = width - 8f * unit
        val dy = 8f * unit
        canvas.drawCircle(dx, dy, 6f * unit, rim)
        canvas.drawCircle(dx, dy, 4f * unit, dot)
      }
    }
  }

  private class CrossView(context: Context) : View(context) {
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      style = Paint.Style.STROKE
      strokeCap = Paint.Cap.ROUND
      color = context.getColor(R.color.xiaoban_surface)
    }

    override fun onDraw(canvas: Canvas) {
      val unit = width / ZONE_DOT
      paint.strokeWidth = 2.2f * unit
      val half = 7f * unit
      val cx = width / 2f
      val cy = height / 2f
      canvas.drawLine(cx - half, cy - half, cx + half, cy + half, paint)
      canvas.drawLine(cx + half, cy - half, cx - half, cy + half, paint)
    }
  }
}
