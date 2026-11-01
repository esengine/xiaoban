package app.xiaoban.hub

import android.content.ComponentName
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONObject
import java.io.File

class XiaobanHubModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("XiaobanHub")

    OnCreate {
      XiaobanOperator.context = appContext.reactContext?.applicationContext
    }

    AsyncFunction("start") { locale: String, secrets: String, name: String ->
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      XiaobanOperator.context = context.applicationContext
      val dir = File(context.filesDir, "hub")
      dir.mkdirs()
      XiaobanHubNative.start(dir.absolutePath, locale, secrets, name)
    }

    AsyncFunction("stop") {
      XiaobanHubNative.stop()
    }

    Function("setStrings") { strings: String ->
      XiaobanOperator.strings = JSONObject(strings)
    }

    Function("island") { state: String ->
      OperatorOverlay.external(state)
    }

    Function("operatorReady") {
      XiaobanOperatorService.current != null
    }

    Function("openOperatorSettings") {
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      val component = ComponentName(context, XiaobanOperatorService::class.java)
      val details = Intent("android.settings.ACCESSIBILITY_DETAILS_SETTINGS")
        .putExtra(Intent.EXTRA_COMPONENT_NAME, component)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      val opened = Build.VERSION.SDK_INT >= Build.VERSION_CODES.R &&
        runCatching { context.startActivity(details) }.isSuccess
      if (!opened) {
        val key = component.flattenToString()
        val list = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
          .putExtra(":settings:fragment_args_key", key)
          .putExtra(":settings:show_fragment_args", Bundle().apply { putString(":settings:fragment_args_key", key) })
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(list)
      }
    }
  }
}
