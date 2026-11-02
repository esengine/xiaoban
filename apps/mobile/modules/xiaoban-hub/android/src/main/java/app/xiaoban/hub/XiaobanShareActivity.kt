package app.xiaoban.hub

import android.content.Intent
import android.os.Bundle
import com.facebook.react.ReactActivity

class XiaobanShareActivity : ReactActivity() {
  override fun getMainComponentName(): String = "XiaobanShare"

  override fun onCreate(savedInstanceState: Bundle?) {
    XiaobanShare.receive(intent)
    XiaobanShare.attach(this)
    super.onCreate(null)
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    XiaobanShare.receive(intent)
  }

  override fun onDestroy() {
    XiaobanShare.detach(this)
    super.onDestroy()
  }

  override fun finish() {
    super.finish()
    @Suppress("DEPRECATION")
    overridePendingTransition(0, 0)
  }
}
