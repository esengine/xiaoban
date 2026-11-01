package app.xiaoban.hub

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.content.Context
import android.content.Intent
import android.graphics.Path
import android.graphics.Rect
import android.os.Build
import android.os.Bundle
import android.os.SystemClock
import android.util.Log
import android.view.accessibility.AccessibilityNodeInfo
import android.view.accessibility.AccessibilityWindowInfo
import org.json.JSONArray
import org.json.JSONObject

object XiaobanOperator {
  private const val TAG = "XiaobanOperator"
  private const val SETTLE_MS = 10000L
  private val SYSTEM_PROMPTS = setOf("android", "com.android.systemui", "com.miui.securitycenter", "com.lbe.security.miui", "com.android.permissioncontroller")
  private const val PAUSE_LIMIT_MS = 10 * 60 * 1000L
  private const val STOP_MEMORY_MS = 8000L
  private const val OWN_ACTION_MS = 1500L

  @Volatile
  var context: Context? = null

  @Volatile
  var strings: JSONObject = JSONObject()

  private val lock = Object()
  private var nodes: List<AccessibilityNodeInfo> = emptyList()
  private var labels: List<String> = emptyList()
  private var step = 0
  private var paused = false
  private var stoppedAt = 0L
  private var handover: Handover? = null
  @Volatile private var lastAction = 0L
  @Volatile var touched = false

  private class Handover(val labels: List<String>, val packages: Set<String>, val words: List<String>)

  fun text(key: String, vararg pairs: Pair<String, String>): String {
    var value = strings.optString(key, "")
    for ((name, replacement) in pairs) value = value.replace("{$name}", replacement)
    return value
  }

  fun handle(raw: String): String {
    val request = JSONObject(raw)
    val op = request.optString("op")
    return try {
      when (op) {
        "ready" -> JSONObject().put("ready", XiaobanOperatorService.current != null)
        "apps" -> apps()
        "open" -> if (XiaobanOperatorService.current == null) {
          failure("the accessibility service is off, so Xiaoban cannot open or use other apps yet; call look_at_app on this app now so the user is asked to turn it on, and only then continue")
        } else {
          open(request.getString("app"))
        }
        "snapshot" -> snapshot(request.getString("app"))
        "act" -> act(request)
        "keys" -> keys(request.getString("keys"))
        "type" -> type(request.getString("text"))
        "locate" -> PhoneLocation.locate(context ?: service())
        "calendar" -> PhoneCalendar.read(context ?: service(), request.getLong("from"), request.getLong("to"))
        "notify" -> XiaobanNotices.notify(context ?: service(), request)
        "withdraw" -> XiaobanNotices.withdraw(context ?: service(), request.getString("id"))
        else -> failure("unknown request")
      }.also { reply -> if (reply.has("error")) Log.w(TAG, "$op: ${reply.optString("error")}") }.toString()
    } catch (error: Exception) {
      Log.w(TAG, "$op failed", error)
      failure(error.message ?: "the phone could not do that").toString()
    }
  }

  private fun failure(message: String) = JSONObject().put("error", message)

  private fun ok() = JSONObject().put("ok", true)

  private fun service(): XiaobanOperatorService =
    XiaobanOperatorService.current
      ?: throw IllegalStateException("the accessibility service is off; ask the user to turn it on")

  private fun rules(): Handover {
    handover?.let { return it }
    val json = strings.optJSONObject("handover") ?: JSONObject()
    fun list(name: String) = json.optJSONArray(name)?.let { array -> List(array.length()) { array.getString(it) } } ?: emptyList()
    val rules = Handover(list("labels"), list("packages").toSet(), list("packageWords"))
    if (rules.labels.isNotEmpty()) handover = rules
    return rules
  }

  private fun blocked(app: String): Boolean {
    val rules = rules()
    val lower = app.lowercase()
    return app in rules.packages || rules.words.any { lower.split('.').contains(it) || lower.contains(".$it") }
  }

  private fun isHandover(label: String): Boolean {
    val lower = label.lowercase()
    return rules().labels.any { word ->
      if (word.all { it.code < 128 }) Regex("\\b${Regex.escape(word.lowercase())}\\b").containsMatchIn(lower)
      else label.contains(word)
    }
  }

  private fun apps(): JSONObject {
    val source = context ?: service()
    val manager = source.packageManager
    val launcher = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
    val list = JSONArray()
    manager.queryIntentActivities(launcher, 0)
      .map { it.activityInfo.packageName to it.loadLabel(manager).toString() }
      .distinctBy { it.first }
      .filter { (id, _) -> id != source.packageName }
      .sortedBy { it.second }
      .forEach { (id, name) ->
        val entry = JSONObject().put("id", id).put("name", name)
        strings.optJSONObject("aliases")?.optJSONArray(id)?.let { entry.put("aliases", it) }
        list.put(entry)
      }
    Log.i(TAG, "apps: ${list.length()}")
    return JSONObject().put("apps", list)
  }

  private fun open(app: String): JSONObject {
    val source = context ?: service()
    val intent = source.packageManager.getLaunchIntentForPackage(app) ?: return failure("this app cannot be opened")
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    source.startActivity(intent)
    return ok()
  }

  private fun windowOf(app: String): AccessibilityNodeInfo? {
    val service = service()
    service.rootInActiveWindow?.takeIf { it.packageName?.toString() == app }?.let { return it }
    return runCatching {
      service.windows
        .filter { it.type == AccessibilityWindowInfo.TYPE_APPLICATION }
        .firstNotNullOfOrNull { window -> window.root?.takeIf { it.packageName?.toString() == app } }
    }.getOrNull()
  }

  private fun foreground(app: String): AccessibilityNodeInfo {
    windowOf(app)?.let { return it }
    val opened = open(app)
    if (opened.has("error")) throw IllegalStateException(opened.getString("error"))
    val deadline = SystemClock.uptimeMillis() + SETTLE_MS
    while (SystemClock.uptimeMillis() < deadline) {
      Thread.sleep(200)
      windowOf(app)?.let { return it }
    }
    val front = service().rootInActiveWindow?.packageName?.toString()
    if (front != null && front in SYSTEM_PROMPTS) {
      throw IllegalStateException("a system prompt is asking whether Xiaoban may open this app; ask the user to tap Allow (ideally choose to always allow), then look at the app again")
    }
    throw IllegalStateException("the app is still starting (splash screen or ad); wait a moment and call look_at_app again before giving up")
  }

  private fun relocate(stale: AccessibilityNodeInfo, label: String): AccessibilityNodeInfo? {
    val app = stale.packageName?.toString() ?: return null
    val root = windowOf(app) ?: return null
    val queue = ArrayDeque(listOf(root))
    while (queue.isNotEmpty()) {
      val node = queue.removeFirst()
      for (index in 0 until node.childCount) node.getChild(index)?.let { queue.addLast(it) }
      if (!node.isVisibleToUser) continue
      if (labelOf(node) == label && node.isEditable == stale.isEditable &&
        (node.isClickable == stale.isClickable || node.isEditable)
      ) return node
    }
    return null
  }

  private fun labelOf(node: AccessibilityNodeInfo): String {
    val hint = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) node.hintText else null
    return listOf(node.text, node.contentDescription, hint, node.viewIdResourceName?.substringAfterLast('/'))
      .firstOrNull { !it.isNullOrBlank() }
      ?.toString()
      ?.trim()
      ?: ""
  }

  private fun snapshot(app: String): JSONObject {
    if (blocked(app)) return failure("this is a chat, payment or banking app: Xiaoban may open it for the user but never reads or operates it (it does not look at chat records, payments or bank details). Tell the user that plainly, offer to just open it, and let them do the rest themselves")
    touched = true
    val root = foreground(app)
    val found = mutableListOf<AccessibilityNodeInfo>()
    val queue = ArrayDeque(listOf(root))
    while (queue.isNotEmpty()) {
      val node = queue.removeFirst()
      for (index in 0 until node.childCount) node.getChild(index)?.let { queue.addLast(it) }
      if (!node.isVisibleToUser || node.isPassword) continue
      val useful = node.isClickable || node.isEditable || node.isCheckable || labelOf(node).isNotEmpty()
      if (useful && (node.isEditable || labelOf(node).isNotEmpty())) found.add(node)
    }
    synchronized(lock) {
      nodes = found
      labels = found.map { labelOf(it) }
    }
    val elements = JSONArray()
    for (node in found) {
      val role = when {
        node.isEditable -> "text field"
        node.isCheckable -> "checkbox"
        node.isClickable -> "button"
        else -> "text"
      }
      val element = JSONObject().put("role", role).put("label", labelOf(node))
      if (node.isEditable) element.put("value", node.text?.toString() ?: "")
      if (!node.isEnabled) element.put("disabled", true)
      elements.put(element)
    }
    val manager = service().packageManager
    val name = runCatching { manager.getApplicationLabel(manager.getApplicationInfo(app, 0)).toString() }.getOrDefault(app)
    return JSONObject().put("app", name).put("elements", elements)
  }

  private fun gate(): JSONObject? {
    synchronized(lock) {
      val deadline = SystemClock.uptimeMillis() + PAUSE_LIMIT_MS
      while (paused && SystemClock.uptimeMillis() < deadline) lock.wait(500)
      if (paused) {
        paused = false
        stoppedAt = SystemClock.uptimeMillis()
      }
      if (SystemClock.uptimeMillis() - stoppedAt < STOP_MEMORY_MS) {
        return failure("the user stopped Xiaoban from operating the phone; do not continue, tell them where you stopped")
      }
    }
    return null
  }

  fun pause() = synchronized(lock) {
    paused = true
    OperatorOverlay.paused(text("paused-title"), text("paused-detail", "n" to step.toString()))
  }

  fun resume() = synchronized(lock) {
    paused = false
    lock.notifyAll()
    OperatorOverlay.working(text("working", "n" to step.toString()), "")
  }

  fun stop() = synchronized(lock) {
    paused = false
    stoppedAt = SystemClock.uptimeMillis()
    lock.notifyAll()
    OperatorOverlay.hide()
  }

  fun idle() = synchronized(lock) { step = 0 }

  fun userActed() {
    if (step == 0 || paused) return
    if (SystemClock.uptimeMillis() - lastAction < OWN_ACTION_MS) return
    pause()
  }

  private fun act(request: JSONObject): JSONObject {
    gate()?.let { return it }
    val index = request.getInt("index")
    val remembered = synchronized(lock) { nodes.getOrNull(index) }
      ?: return failure("that element is gone; look at the app again")
    val known = synchronized(lock) { labels.getOrNull(index) } ?: ""
    val node = if (remembered.refresh()) remembered else relocate(remembered, known)
      ?: return failure("the page reloaded and that element is no longer on screen; call look_at_app again and continue, the app itself works fine")
    val label = labelOf(node)
    val press = request.optString("do") == "press"
    if (press && isHandover(label)) {
      OperatorOverlay.handover(
        text("handover-title"),
        text("handover-body", "label" to label),
        text("handover-ok"),
        text("handover-back"),
      )
      return failure("this is the payment or order step; Xiaoban must not press it. The user has been asked to check and finish it themselves. Stop here and tell them.")
    }
    step += 1
    OperatorOverlay.working(
      text("working", "n" to step.toString()),
      text(if (press) "working-press" else "working-fill", "label" to label),
    )
    val bounds = Rect().also { node.getBoundsInScreen(it) }
    OperatorOverlay.highlight(bounds)
    lastAction = SystemClock.uptimeMillis()
    Thread.sleep(350)
    gate()?.let { return it }
    lastAction = SystemClock.uptimeMillis()
    val done = if (press) press(node, bounds) else {
      val arguments = Bundle().apply {
        putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, request.optString("text"))
      }
      node.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, arguments)
    }
    OperatorOverlay.idleLater()
    return if (done) ok() else failure("the phone did not accept that action; look at the app again")
  }

  private fun press(node: AccessibilityNodeInfo, bounds: Rect): Boolean {
    var target: AccessibilityNodeInfo? = node
    while (target != null && !target.isClickable) target = target.parent
    if (target != null && target.performAction(AccessibilityNodeInfo.ACTION_CLICK)) return true
    if (bounds.isEmpty) return false
    val path = Path().apply { moveTo(bounds.exactCenterX(), bounds.exactCenterY()) }
    val gesture = GestureDescription.Builder().addStroke(GestureDescription.StrokeDescription(path, 0, 60)).build()
    OperatorOverlay.ignoreTouchesFor(600)
    return service().dispatchGesture(gesture, null, null)
  }

  private fun keys(combo: String): JSONObject {
    gate()?.let { return it }
    lastAction = SystemClock.uptimeMillis()
    val service = service()
    val done = when (combo.trim().lowercase()) {
      "back", "escape", "esc" -> service.performGlobalAction(AccessibilityService.GLOBAL_ACTION_BACK)
      "home" -> service.performGlobalAction(AccessibilityService.GLOBAL_ACTION_HOME)
      "enter", "return", "search" -> {
        val focus = service.rootInActiveWindow?.findFocus(AccessibilityNodeInfo.FOCUS_INPUT)
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.R &&
          focus?.performAction(AccessibilityNodeInfo.AccessibilityAction.ACTION_IME_ENTER.id) == true
      }
      "scroll down", "scroll up", "page down", "page up" -> {
        val forward = combo.trim().lowercase().endsWith("down")
        val target = scrollable(service.rootInActiveWindow)
          ?: return failure("nothing on this screen can scroll")
        lastAction = SystemClock.uptimeMillis()
        target.performAction(
          if (forward) AccessibilityNodeInfo.ACTION_SCROLL_FORWARD else AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD,
        )
      }
      else -> return failure("on a phone the keys are: back, home, enter, scroll down, scroll up")
    }
    return if (done) ok() else failure("the phone did not accept that key")
  }

  private fun scrollable(root: AccessibilityNodeInfo?): AccessibilityNodeInfo? {
    root ?: return null
    var best: AccessibilityNodeInfo? = null
    var area = 0
    val queue = ArrayDeque(listOf(root))
    val bounds = Rect()
    while (queue.isNotEmpty()) {
      val node = queue.removeFirst()
      for (index in 0 until node.childCount) node.getChild(index)?.let { queue.addLast(it) }
      if (!node.isScrollable || !node.isVisibleToUser) continue
      node.getBoundsInScreen(bounds)
      val size = bounds.width() * bounds.height()
      if (size > area) {
        area = size
        best = node
      }
    }
    return best
  }

  private fun type(value: String): JSONObject {
    gate()?.let { return it }
    lastAction = SystemClock.uptimeMillis()
    val focus = service().rootInActiveWindow?.findFocus(AccessibilityNodeInfo.FOCUS_INPUT)
      ?: return failure("no text field is focused; use type_text on a field instead")
    if (focus.isPassword) return failure("Xiaoban never types into password fields; ask the user to do it")
    val arguments = Bundle().apply { putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, value) }
    return if (focus.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, arguments)) ok()
    else failure("the phone did not accept the text")
  }
}
