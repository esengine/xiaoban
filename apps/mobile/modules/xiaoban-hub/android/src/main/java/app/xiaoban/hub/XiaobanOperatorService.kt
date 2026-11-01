package app.xiaoban.hub

import android.accessibilityservice.AccessibilityService
import android.view.accessibility.AccessibilityEvent

class XiaobanOperatorService : AccessibilityService() {
  override fun onServiceConnected() {
    super.onServiceConnected()
    current = this
  }

  override fun onAccessibilityEvent(event: AccessibilityEvent?) {}

  override fun onInterrupt() {}

  override fun onDestroy() {
    if (current === this) current = null
    OperatorOverlay.hide()
    super.onDestroy()
  }

  companion object {
    @Volatile
    var current: XiaobanOperatorService? = null
  }
}
