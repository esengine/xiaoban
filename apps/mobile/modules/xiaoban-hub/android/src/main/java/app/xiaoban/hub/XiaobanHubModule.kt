package app.xiaoban.hub

import android.content.ComponentName
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.widget.Toast
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

    Function("turnDone") { title: String ->
      if (XiaobanOperator.touched && XiaobanOperatorService.current != null) {
        XiaobanOperator.touched = false
        OperatorOverlay.finished(title)
        true
      } else {
        false
      }
    }

    Function("island") { state: String ->
      OperatorOverlay.external(state)
    }

    Function("openRecognizerSettings") { hint: String ->
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      val service = Settings.Secure.getString(context.contentResolver, "voice_recognition_service")
      val target = service?.let { ComponentName.unflattenFromString(it)?.packageName }
      val intent = if (target != null) {
        Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, android.net.Uri.parse("package:$target"))
      } else {
        Intent(Settings.ACTION_MANAGE_APPLICATIONS_SETTINGS)
      }
      context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      Toast.makeText(context, hint, Toast.LENGTH_LONG).show()
    }

    Function("operatorReady") {
      XiaobanOperatorService.current != null
    }

    Function("openOperatorSettings") { detailHint: String, listHint: String ->
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      val component = ComponentName(context, XiaobanOperatorService::class.java)
      val details = Intent("android.settings.ACCESSIBILITY_DETAILS_SETTINGS")
        .putExtra(Intent.EXTRA_COMPONENT_NAME, component)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      val opened = Build.VERSION.SDK_INT >= Build.VERSION_CODES.R &&
        runCatching { context.startActivity(details) }.isSuccess
      if (opened) Toast.makeText(context, detailHint, Toast.LENGTH_LONG).show()
      if (!opened) {
        val key = component.flattenToString()
        val list = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
          .putExtra(":settings:fragment_args_key", key)
          .putExtra(":settings:show_fragment_args", Bundle().apply { putString(":settings:fragment_args_key", key) })
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(list)
        Toast.makeText(context, listHint, Toast.LENGTH_LONG).show()
      }
    }
  }
}
