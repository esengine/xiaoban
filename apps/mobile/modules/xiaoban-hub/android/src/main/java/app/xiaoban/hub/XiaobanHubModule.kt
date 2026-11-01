package app.xiaoban.hub

import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

class XiaobanHubModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("XiaobanHub")

    AsyncFunction("start") { locale: String, secrets: String, name: String ->
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      val dir = File(context.filesDir, "hub")
      dir.mkdirs()
      XiaobanHubNative.start(dir.absolutePath, locale, secrets, name)
    }

    AsyncFunction("stop") {
      XiaobanHubNative.stop()
    }
  }
}
