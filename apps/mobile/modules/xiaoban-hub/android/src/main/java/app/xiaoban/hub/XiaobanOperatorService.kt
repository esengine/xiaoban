package app.xiaoban.hub

import android.accessibilityservice.AccessibilityService
import android.view.accessibility.AccessibilityEvent

class XiaobanOperatorService : AccessibilityService() {
  override fun onServiceConnected() {
    super.onServiceConnected()
    current = this
  }

  override fun onAccessibilityEvent(event: AccessibilityEvent?) {
    val kind = event?.eventType ?: return
    val human = kind == AccessibilityEvent.TYPE_VIEW_CLICKED ||
      kind == AccessibilityEvent.TYPE_VIEW_LONG_CLICKED ||
      kind == AccessibilityEvent.TYPE_VIEW_TEXT_CHANGED
    if (human && event.packageName?.toString() != packageName) XiaobanOperator.userActed()
  }

  override fun onInterrupt() {}

  override fun onDestroy() {
    if (current === this) current = null
    OperatorOverlay.hide()
    PlanBall.hide()
    super.onDestroy()
  }

  companion object {
    @Volatile
    var current: XiaobanOperatorService? = null
  }
}
