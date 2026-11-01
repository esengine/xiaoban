package app.xiaoban.hub

import android.content.Context
import android.content.Intent
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Path
import android.graphics.PixelFormat
import android.graphics.Rect
import android.graphics.RectF
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.transition.AutoTransition
import android.transition.TransitionManager
import android.view.animation.OvershootInterpolator
import android.os.VibrationEffect
import android.os.Vibrator
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView

object OperatorOverlay {
  private const val IDLE_MS = 8000L
  private const val ROW_MS = 3000L
  private const val DONE_MS = 3000L
  private const val MORPH_MS = 460L
  private const val RING_MS = 700L

  private enum class Mode { Hidden, Compact, Working, Paused, Handover, Notice, Done }

  private val main = Handler(Looper.getMainLooper())
  private var frame: FrameLayout? = null
  private var ring: View? = null
  private var mode = Mode.Hidden
  @Volatile private var ignoreUntil = 0L
  private var operating = false
  private var steps = 0
  private val idle = Runnable {
    if (mode == Mode.Working || mode == Mode.Compact) hideNow()
    operating = false
    XiaobanOperator.idle()
  }
  private val shrink = Runnable {
    if (mode == Mode.Working) show(Mode.Compact) { context -> compact(context) }
  }
  private val fade = Runnable { if (mode == Mode.Done) hideNow() }

  private fun service(): XiaobanOperatorService? = XiaobanOperatorService.current

  private fun color(context: Context, id: Int) = context.getColor(id)

  private fun dp(context: Context, value: Float) = value * context.resources.displayMetrics.density

  private fun round(context: Context, fill: Int, radius: Float) = GradientDrawable().apply {
    setColor(fill)
    cornerRadius = dp(context, radius)
  }

  fun ignoreTouchesFor(ms: Long) {
    ignoreUntil = SystemClock.uptimeMillis() + ms
  }

  fun working(title: String, detail: String) = main.post {
    main.removeCallbacks(idle)
    main.removeCallbacks(shrink)
    operating = true
    steps += 1
    show(Mode.Working) { context -> workingBar(context, title, detail) }
    main.postDelayed(shrink, ROW_MS)
  }

  fun finished(title: String) = main.post {
    main.removeCallbacks(idle)
    main.removeCallbacks(shrink)
    main.removeCallbacks(fade)
    operating = false
    show(Mode.Done) { context -> doneBar(context, title) }
    main.postDelayed({
      val service = service()
      hideNow()
      service?.let { context ->
        context.packageManager.getLaunchIntentForPackage(context.packageName)?.let { intent ->
          intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)
          context.startActivity(intent)
        }
      }
    }, 1500)
  }

  fun external(raw: String) = main.post {
    if (operating) return@post
    val state = org.json.JSONObject(raw)
    main.removeCallbacks(shrink)
    main.removeCallbacks(fade)
    when (state.optString("mode")) {
      "compact" -> {
        steps = state.optInt("n", steps)
        show(Mode.Compact) { context -> compact(context) }
      }
      "row" -> {
        steps = state.optInt("n", steps)
        show(Mode.Working) { context -> rowBar(context, state.optString("title"), state.optString("detail")) }
        main.postDelayed(shrink, ROW_MS)
      }
      "confirm" -> {
        buzz()
        show(Mode.Notice) { context ->
          handoverCard(context, state.optString("title"), state.optString("detail"), "", state.optString("open"))
        }
      }
      "done" -> {
        show(Mode.Done) { context -> doneBar(context, state.optString("title")) }
        main.postDelayed(fade, DONE_MS)
      }
      else -> hideNow()
    }
  }

  private fun buzz() {
    val service = service() ?: return
    val vibrator = service.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator ?: return
    runCatching { vibrator.vibrate(VibrationEffect.createPredefined(VibrationEffect.EFFECT_TICK)) }
  }

  fun idleLater() = main.post {
    main.removeCallbacks(idle)
    main.postDelayed(idle, IDLE_MS)
  }

  fun paused(title: String, detail: String) = main.post {
    main.removeCallbacks(idle)
    show(Mode.Paused) { context -> pausedBar(context, title, detail) }
  }

  fun handover(title: String, body: String, okLabel: String, backLabel: String) = main.post {
    main.removeCallbacks(idle)
    main.removeCallbacks(shrink)
    buzz()
    show(Mode.Handover) { context -> handoverCard(context, title, body, okLabel, backLabel) }
  }

  fun hide() = main.post { hideNow() }

  private fun hideNow() {
    val service = service()
    val manager = service?.getSystemService(Context.WINDOW_SERVICE) as? WindowManager
    frame?.let { view -> runCatching { manager?.removeView(view) } }
    frame = null
    mode = Mode.Hidden
    steps = 0
  }

  private fun show(next: Mode, build: (Context) -> View) {
    val service = service() ?: return
    val manager = service.getSystemService(Context.WINDOW_SERVICE) as WindowManager
    val holder = frame ?: FrameLayout(service).also { created ->
      val padding = dp(service, 10f).toInt()
      created.setPadding(padding, 0, padding, 0)
      val top = service.resources.getIdentifier("status_bar_height", "dimen", "android")
        .takeIf { it > 0 }?.let { service.resources.getDimensionPixelSize(it) } ?: 0
      val params = WindowManager.LayoutParams(
        WindowManager.LayoutParams.MATCH_PARENT,
        WindowManager.LayoutParams.WRAP_CONTENT,
        WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
        WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
          WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or
          WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
        PixelFormat.TRANSLUCENT,
      ).apply {
        gravity = Gravity.TOP
        y = top + dp(service, 4f).toInt()
      }
      manager.addView(created, params)
      frame = created
    }
    if (holder.childCount > 0) {
      TransitionManager.beginDelayedTransition(
        holder,
        AutoTransition().apply {
          duration = MORPH_MS
          interpolator = OvershootInterpolator(1.1f)
        },
      )
    }
    holder.removeAllViews()
    val content = build(service)
    val width = if (next == Mode.Compact) dp(service, 132f).toInt() else ViewGroup.LayoutParams.MATCH_PARENT
    holder.addView(content, FrameLayout.LayoutParams(width, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER_HORIZONTAL))
    mode = next
  }

  fun highlight(bounds: Rect) = main.post {
    val service = service() ?: return@post
    if (bounds.isEmpty) return@post
    val manager = service.getSystemService(Context.WINDOW_SERVICE) as WindowManager
    ring?.let { runCatching { manager.removeView(it) } }
    val view = RingView(service, RectF(bounds))
    val params = WindowManager.LayoutParams(
      WindowManager.LayoutParams.MATCH_PARENT,
      WindowManager.LayoutParams.MATCH_PARENT,
      WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
        WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE or
        WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or
        WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
      PixelFormat.TRANSLUCENT,
    ).apply { gravity = Gravity.TOP or Gravity.START }
    manager.addView(view, params)
    ring = view
    main.postDelayed({
      runCatching { manager.removeView(view) }
      if (ring === view) ring = null
    }, RING_MS)
  }

  private fun label(context: Context, value: String, size: Float, tint: Int, bold: Boolean = false) =
    TextView(context).apply {
      text = value
      textSize = size
      setTextColor(tint)
      if (bold) typeface = Typeface.DEFAULT_BOLD
      maxLines = 2
    }

  private fun bar(context: Context): LinearLayout = LinearLayout(context).apply {
    orientation = LinearLayout.HORIZONTAL
    gravity = Gravity.CENTER_VERTICAL
    background = round(context, color(context, R.color.xiaoban_ink), 22f)
    elevation = dp(context, 8f)
    val pad = dp(context, 8f).toInt()
    setPadding(dp(context, 10f).toInt(), pad, pad, pad)
  }

  private fun texts(context: Context, title: String, detail: String) = LinearLayout(context).apply {
    orientation = LinearLayout.VERTICAL
    addView(label(context, title, 13f, color(context, R.color.xiaoban_surface), bold = true))
    if (detail.isNotEmpty()) addView(label(context, detail, 12f, color(context, R.color.xiaoban_text_muted)))
    layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply {
      marginStart = dp(context, 10f).toInt()
      marginEnd = dp(context, 10f).toInt()
    }
  }

  private fun circle(context: Context, icon: IconView.Kind, fill: Int, description: String, onTap: () -> Unit) =
    IconView(context, icon).apply {
      background = round(context, fill, 17f)
      contentDescription = description
      setOnClickListener { onTap() }
      val size = dp(context, 34f).toInt()
      layoutParams = LinearLayout.LayoutParams(size, size).apply { marginStart = dp(context, 6f).toInt() }
    }

  private fun pill(context: Context, text: String, filled: Boolean, onTap: () -> Unit) =
    label(
      context,
      text,
      13f,
      color(context, if (filled) R.color.xiaoban_ink else R.color.xiaoban_surface),
      bold = filled,
    ).apply {
      maxLines = 1
      gravity = Gravity.CENTER
      background = round(context, color(context, if (filled) R.color.xiaoban_surface else R.color.xiaoban_glass), 17f)
      val h = dp(context, 12f).toInt()
      setPadding(h, 0, h, 0)
      setOnClickListener { onTap() }
      layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, dp(context, 34f).toInt()).apply {
        marginStart = dp(context, 6f).toInt()
      }
    }

  private fun face(context: Context) = FaceView(context).apply {
    background = round(context, color(context, R.color.xiaoban_accent), 10f)
    val size = dp(context, 30f).toInt()
    layoutParams = LinearLayout.LayoutParams(size, size)
  }

  private fun compact(context: Context): View = LinearLayout(context).apply {
    orientation = LinearLayout.HORIZONTAL
    gravity = Gravity.CENTER_VERTICAL
    background = round(context, color(context, R.color.xiaoban_ink), 18f)
    elevation = dp(context, 8f)
    val pad = dp(context, 6f).toInt()
    setPadding(pad, pad, dp(context, 10f).toInt(), pad)
    minimumHeight = dp(context, 36f).toInt()
    addView(FaceView(context).apply {
      background = round(context, color(context, R.color.xiaoban_accent), 8f)
      val size = dp(context, 24f).toInt()
      layoutParams = LinearLayout.LayoutParams(size, size)
    })
    addView(View(context), LinearLayout.LayoutParams(0, 1, 1f))
    addView(RingView2(context, steps).apply {
      val size = dp(context, 20f).toInt()
      layoutParams = LinearLayout.LayoutParams(size, size)
    })
    setOnClickListener { openApp(context) }
  }

  private fun rowBar(context: Context, title: String, detail: String): View = bar(context).apply {
    addView(face(context))
    addView(texts(context, title, detail))
    setOnClickListener { openApp(context) }
  }

  private fun doneBar(context: Context, title: String): View = bar(context).apply {
    addView(IconView(context, IconView.Kind.Tick).apply {
      background = round(context, color(context, R.color.xiaoban_done), 15f)
      val size = dp(context, 30f).toInt()
      layoutParams = LinearLayout.LayoutParams(size, size)
    })
    addView(texts(context, title, ""))
    setOnClickListener { openApp(context) }
  }

  private fun openApp(context: Context) {
    hideNow()
    context.packageManager.getLaunchIntentForPackage(context.packageName)?.let { intent ->
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
    }
  }

  private fun workingBar(context: Context, title: String, detail: String): View = bar(context).apply {
    addView(face(context))
    addView(texts(context, title, detail))
    addView(circle(context, IconView.Kind.Pause, color(context, R.color.xiaoban_glass), XiaobanOperator.text("pause")) { XiaobanOperator.pause() })
    addView(circle(context, IconView.Kind.Stop, color(context, R.color.xiaoban_surface), XiaobanOperator.text("stop")) { XiaobanOperator.stop() })
  }

  private fun pausedBar(context: Context, title: String, detail: String): View = bar(context).apply {
    addView(face(context))
    addView(texts(context, title, detail))
    addView(pill(context, XiaobanOperator.text("resume"), true) { XiaobanOperator.resume() })
    addView(pill(context, XiaobanOperator.text("end"), false) { XiaobanOperator.stop() })
  }

  private fun handoverCard(context: Context, title: String, body: String, okLabel: String, backLabel: String): View =
    LinearLayout(context).apply {
      orientation = LinearLayout.VERTICAL
      background = round(context, color(context, R.color.xiaoban_ink), 22f)
      elevation = dp(context, 8f)
      val pad = dp(context, 14f).toInt()
      setPadding(pad, pad, pad, pad)
      addView(LinearLayout(context).apply {
        orientation = LinearLayout.HORIZONTAL
        gravity = Gravity.CENTER_VERTICAL
        addView(face(context))
        addView(texts(context, title, ""))
      })
      addView(label(context, body, 13f, color(context, R.color.xiaoban_text_soft)).apply {
        maxLines = 6
        layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
          topMargin = dp(context, 10f).toInt()
        }
      })
      addView(LinearLayout(context).apply {
        orientation = LinearLayout.HORIZONTAL
        layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
          topMargin = dp(context, 10f).toInt()
        }
        val ok = pill(context, okLabel, true) { hideNow() }
        val back = pill(context, backLabel, okLabel.isEmpty()) { openApp(context) }
        for (button in if (okLabel.isEmpty()) listOf(back) else listOf(ok, back)) {
          button.layoutParams = LinearLayout.LayoutParams(0, dp(context, 38f).toInt(), 1f).apply {
            marginEnd = dp(context, 4f).toInt()
            marginStart = dp(context, 4f).toInt()
          }
          addView(button)
        }
      })
    }

  private class RingView(context: Context, private val target: RectF) : View(context) {
    private val glow = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      style = Paint.Style.STROKE
      strokeWidth = 7f * context.resources.displayMetrics.density
      color = context.getColor(R.color.xiaoban_accent_glow)
    }
    private val line = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      style = Paint.Style.STROKE
      strokeWidth = 3f * context.resources.displayMetrics.density
      color = context.getColor(R.color.xiaoban_accent)
    }

    override fun onDraw(canvas: Canvas) {
      val location = IntArray(2).also { getLocationOnScreen(it) }
      val box = RectF(target).apply { offset(-location[0].toFloat(), -location[1].toFloat()) }
      val radius = 12f * resources.displayMetrics.density
      canvas.drawRoundRect(box, radius, radius, glow)
      canvas.drawRoundRect(box, radius, radius, line)
    }
  }

  private class FaceView(context: Context) : View(context) {
    private val stroke = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      style = Paint.Style.STROKE
      strokeCap = Paint.Cap.ROUND
      color = context.getColor(R.color.xiaoban_surface)
    }
    private val dot = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = context.getColor(R.color.xiaoban_surface)
    }

    override fun onDraw(canvas: Canvas) {
      val unit = width / 24f
      stroke.strokeWidth = unit * 1.8f
      canvas.drawCircle(unit * 12f, unit * 12f, unit * 6.5f, stroke)
      canvas.drawCircle(unit * 9.5f, unit * 11f, unit * 0.9f, dot)
      canvas.drawCircle(unit * 14.5f, unit * 11f, unit * 0.9f, dot)
      val smile = Path().apply {
        moveTo(unit * 9.5f, unit * 14.2f)
        quadTo(unit * 12f, unit * 15.8f, unit * 14.5f, unit * 14.2f)
      }
      canvas.drawPath(smile, stroke)
    }
  }

  class IconView(context: Context, private val kind: Kind) : View(context) {
    enum class Kind { Pause, Stop, Tick }

    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)

    override fun onDraw(canvas: Canvas) {
      val unit = width / 34f
      val cx = width / 2f
      val cy = height / 2f
      when (kind) {
        Kind.Pause -> {
          paint.color = context.getColor(R.color.xiaoban_surface)
          canvas.drawRoundRect(cx - unit * 5f, cy - unit * 6f, cx - unit * 1.5f, cy + unit * 6f, unit, unit, paint)
          canvas.drawRoundRect(cx + unit * 1.5f, cy - unit * 6f, cx + unit * 5f, cy + unit * 6f, unit, unit, paint)
        }
        Kind.Tick -> {
          paint.color = context.getColor(R.color.xiaoban_surface)
          paint.style = Paint.Style.STROKE
          paint.strokeWidth = unit * 2.6f
          paint.strokeCap = Paint.Cap.ROUND
          val path = Path().apply {
            moveTo(cx - unit * 6f, cy + unit * 0.5f)
            lineTo(cx - unit * 1.5f, cy + unit * 5f)
            lineTo(cx + unit * 7f, cy - unit * 4.5f)
          }
          canvas.drawPath(path, paint)
          paint.style = Paint.Style.FILL
        }
        Kind.Stop -> {
          paint.color = context.getColor(R.color.xiaoban_ink)
          canvas.drawRoundRect(cx - unit * 5f, cy - unit * 5f, cx + unit * 5f, cy + unit * 5f, unit * 1.5f, unit * 1.5f, paint)
        }
      }
    }
  }

  private class RingView2(context: Context, private val steps: Int) : View(context) {
    private val track = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      style = Paint.Style.STROKE
      color = context.getColor(R.color.xiaoban_glass)
    }
    private val arc = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      style = Paint.Style.STROKE
      strokeCap = Paint.Cap.ROUND
      color = context.getColor(R.color.xiaoban_surface)
    }

    override fun onDraw(canvas: Canvas) {
      val stroke = width * 0.14f
      track.strokeWidth = stroke
      arc.strokeWidth = stroke
      val box = RectF(stroke, stroke, width - stroke, height - stroke)
      canvas.drawOval(box, track)
      val fraction = if (steps <= 0) 0.08f else steps / (steps + 3f)
      canvas.drawArc(box, -90f, 360f * fraction, false, arc)
    }
  }
}
