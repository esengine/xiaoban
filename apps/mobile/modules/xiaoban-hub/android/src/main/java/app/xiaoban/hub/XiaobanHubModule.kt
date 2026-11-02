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

    Events("onNoticeAnswer", "onPlanBall", "onShare")

    OnCreate {
      XiaobanOperator.context = appContext.reactContext?.applicationContext
      XiaobanNotices.listener = { answer -> sendEvent("onNoticeAnswer", mapOf("answer" to answer)) }
      PlanBall.listener = { action -> sendEvent("onPlanBall", mapOf("action" to action)) }
      XiaobanShare.listener = { sendEvent("onShare", mapOf<String, Any>()) }
    }

    OnDestroy {
      XiaobanNotices.listener = null
      PlanBall.listener = null
      XiaobanShare.listener = null
    }

    AsyncFunction("takeShare") {
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      XiaobanShare.take(context.applicationContext)?.toString()
    }

    Function("closeShare") {
      XiaobanShare.close()
    }

    Function("openFromShare") { url: String ->
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      XiaobanShare.open(context.applicationContext, url)
    }

    Function("planBall") { state: String ->
      PlanBall.update(state)
      Unit
    }

    OnActivityEntersForeground {
      XiaobanNotices.foreground = true
    }

    OnActivityEntersBackground {
      XiaobanNotices.foreground = false
    }

    Function("notify") { request: String ->
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      XiaobanNotices.notify(context.applicationContext, JSONObject(request)).toString()
    }

    Function("setForeground") { active: Boolean ->
      XiaobanNotices.foreground = active
    }

    Function("withdrawNotice") { id: String ->
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      XiaobanNotices.withdraw(context.applicationContext, id)
      Unit
    }

    AsyncFunction("start") { locale: String, secrets: String, name: String ->
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      XiaobanOperator.context = context.applicationContext
      val dir = File(context.filesDir, "hub")
      dir.mkdirs()
      HubBoot.save(context.applicationContext, locale, secrets, name)
      XiaobanHubNative.start(dir.absolutePath, locale, secrets, name)
    }

    AsyncFunction("stop") {
      appContext.reactContext?.applicationContext?.let { context ->
        HubBoot.forget(context)
        HubKeeper.wake(context, null)
      }
      XiaobanHubNative.stop()
    }

    Function("backgroundStatus") {
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      val power = context.getSystemService(android.content.Context.POWER_SERVICE) as android.os.PowerManager
      val notices = context.getSystemService(android.app.NotificationManager::class.java).areNotificationsEnabled()
      mapOf(
        "notifications" to notices,
        "battery" to power.isIgnoringBatteryOptimizations(context.packageName),
        "exactAlarms" to HubKeeper.exactAlarms(context),
        "xiaomi" to Build.MANUFACTURER.equals("Xiaomi", ignoreCase = true),
      )
    }

    Function("openBackgroundSetting") { kind: String ->
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      val pkg = context.packageName
      val uri = android.net.Uri.parse("package:$pkg")
      val candidates = when (kind) {
        "battery" -> listOf(
          Intent("miui.intent.action.HIDDEN_APPS_CONFIG_ACTIVITY").putExtra("package_name", pkg).putExtra("package_label", context.applicationInfo.loadLabel(context.packageManager)),
          Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, uri),
          Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, uri),
        )
        "autostart" -> listOf(
          Intent().setComponent(ComponentName("com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity")),
          Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, uri),
        )
        "alarms" -> if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
          listOf(Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, uri), Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, uri))
        } else {
          listOf(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, uri))
        }
        "notifications" -> listOf(
          Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, pkg),
          Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, uri),
        )
        else -> listOf(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, uri))
      }
      candidates.any { intent ->
        runCatching { context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }.isSuccess
      }
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
