package app.xiaoban.hub

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

object HubKeeper {
  private const val TAG = "XiaobanKeeper"
  private const val CHANNEL = "xiaoban.keep"
  private const val PREFS = "xiaoban.keeper"
  const val NOTICE_ID = 7
  const val ACTION_WAKE = "app.xiaoban.hub.WAKE"
  const val ACTION_STOP = "app.xiaoban.hub.STOP_ALL"
  const val ACTION_UPDATE = "app.xiaoban.hub.KEEP"
  private const val WAKE_MARGIN_MS = 5_000L

  @Volatile
  var items: JSONArray = JSONArray()

  @Volatile
  var texts: JSONObject = JSONObject()

  fun keep(context: Context, request: JSONObject): JSONObject {
    items = request.optJSONArray("items") ?: JSONArray()
    request.optJSONObject("texts")?.let { texts = it }
    prefs(context).edit().putString("texts", texts.toString()).apply()
    val intent = Intent(context, HubKeepService::class.java).setAction(ACTION_UPDATE)
    if (items.length() > 0) {
      runCatching { start(context, intent) }.onFailure { Log.w(TAG, "could not keep the hub running", it) }
    } else if (HubKeepService.running) {
      context.startService(intent)
    }
    return JSONObject().put("ok", true)
  }

  fun wake(context: Context, at: Long?): JSONObject {
    val prefs = prefs(context)
    if (at == null || at <= 0) {
      prefs.edit().remove("wakeAt").apply()
      alarms(context).cancel(wakeIntent(context))
    } else {
      prefs.edit().putLong("wakeAt", at).apply()
      arm(context, at)
    }
    return JSONObject().put("ok", true)
  }

  fun rearm(context: Context) {
    val at = prefs(context).getLong("wakeAt", 0)
    if (at > 0) arm(context, maxOf(at, System.currentTimeMillis() + WAKE_MARGIN_MS))
  }

  private fun arm(context: Context, at: Long) {
    val alarms = alarms(context)
    val trigger = at + WAKE_MARGIN_MS
    val exact = Build.VERSION.SDK_INT < Build.VERSION_CODES.S || alarms.canScheduleExactAlarms()
    if (exact) {
      alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, trigger, wakeIntent(context))
    } else {
      alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, trigger, wakeIntent(context))
    }
  }

  fun exactAlarms(context: Context): Boolean =
    Build.VERSION.SDK_INT < Build.VERSION_CODES.S || alarms(context).canScheduleExactAlarms()

  private fun alarms(context: Context) = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager

  private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun savedTexts(context: Context): JSONObject =
    runCatching { JSONObject(prefs(context).getString("texts", "{}") ?: "{}") }.getOrDefault(JSONObject())

  private fun wakeIntent(context: Context): PendingIntent =
    PendingIntent.getBroadcast(
      context,
      1,
      Intent(context, HubWakeReceiver::class.java).setAction(ACTION_WAKE),
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
    )

  fun start(context: Context, intent: Intent) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      context.startForegroundService(intent)
    } else {
      context.startService(intent)
    }
  }

  fun notification(context: Context, waking: Boolean): Notification {
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      manager.createNotificationChannel(
        NotificationChannel(CHANNEL, texts.optString("channel", CHANNEL), NotificationManager.IMPORTANCE_LOW).apply {
          setSound(null, null)
          enableVibration(false)
          setShowBadge(false)
        }
      )
    }
    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(context, CHANNEL)
    } else {
      @Suppress("DEPRECATION")
      Notification.Builder(context).setPriority(Notification.PRIORITY_LOW)
    }
    val count = items.length()
    val title = if (count == 0 && waking) texts.optString("waking") else texts.optString("title")
    val style = Notification.InboxStyle()
    for (index in 0 until count) {
      val item = items.getJSONObject(index)
      style.addLine("${item.optString("title")} · ${texts.optString("working")}")
    }
    val open = context.packageManager.getLaunchIntentForPackage(context.packageName)?.let { intent ->
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
      PendingIntent.getActivity(context, NOTICE_ID, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }
    val stop = PendingIntent.getBroadcast(
      context,
      2,
      Intent(context, HubWakeReceiver::class.java).setAction(ACTION_STOP),
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
    )
    builder
      .setSmallIcon(R.drawable.xiaoban_notify)
      .setColor(context.getColor(R.color.xiaoban_accent))
      .setContentTitle(title)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setShowWhen(false)
      .setVisibility(Notification.VISIBILITY_PUBLIC)
      .setContentIntent(open)
    if (count > 0) {
      val first = items.getJSONObject(0)
      builder.setContentText("${first.optString("title")} · ${texts.optString("working")}")
      builder.setStyle(style)
      builder.addAction(Notification.Action.Builder(null, texts.optString("stop"), stop).build())
    }
    if (open != null) builder.addAction(Notification.Action.Builder(null, texts.optString("open"), open).build())
    return builder.build()
  }
}

class HubKeepService : Service() {
  companion object {
    @Volatile
    var running = false
    private const val SETTLE_MS = 90_000L
    private const val LIMIT_MS = 15 * 60_000L
  }

  private val handler = Handler(Looper.getMainLooper())
  private var wokeAt = 0L

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val waking = intent?.action == HubKeeper.ACTION_WAKE
    if (waking) {
      wokeAt = System.currentTimeMillis()
      if (HubKeeper.texts.length() == 0) HubKeeper.texts = HubKeeper.savedTexts(this)
    }
    if (!waking && HubKeeper.items.length() == 0 && !settling()) {
      finish()
      return START_NOT_STICKY
    }
    val notice = HubKeeper.notification(this, waking || settling())
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      startForeground(HubKeeper.NOTICE_ID, notice, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
    } else {
      startForeground(HubKeeper.NOTICE_ID, notice)
    }
    running = true
    if (waking) {
      Thread { HubBoot.ensure(applicationContext) }.start()
      handler.removeCallbacksAndMessages(null)
      handler.postDelayed(::check, SETTLE_MS)
    }
    return START_NOT_STICKY
  }

  private fun settling() = wokeAt > 0 && System.currentTimeMillis() - wokeAt < SETTLE_MS

  private fun check() {
    val elapsed = System.currentTimeMillis() - wokeAt
    if (HubKeeper.items.length() == 0 || elapsed > LIMIT_MS) {
      wokeAt = 0
      finish()
    } else {
      handler.postDelayed(::check, SETTLE_MS)
    }
  }

  private fun finish() {
    handler.removeCallbacksAndMessages(null)
    running = false
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      stopForeground(STOP_FOREGROUND_REMOVE)
    } else {
      @Suppress("DEPRECATION")
      stopForeground(true)
    }
    stopSelf()
  }

  override fun onDestroy() {
    running = false
    handler.removeCallbacksAndMessages(null)
    super.onDestroy()
  }
}

class HubWakeReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val app = context.applicationContext
    when (intent.action) {
      HubKeeper.ACTION_WAKE -> runCatching {
        HubKeeper.start(app, Intent(app, HubKeepService::class.java).setAction(HubKeeper.ACTION_WAKE))
      }.onFailure { Log.w("XiaobanKeeper", "could not wake the hub", it) }
      HubKeeper.ACTION_STOP -> {
        val pending = goAsync()
        Thread {
          try {
            XiaobanHubNative.deliver(JSONObject().put("kind", "stop_all").toString())
          } finally {
            pending.finish()
          }
        }.start()
      }
      Intent.ACTION_BOOT_COMPLETED, Intent.ACTION_MY_PACKAGE_REPLACED -> HubKeeper.rearm(app)
    }
  }
}

object HubBoot {
  private const val ALIAS = "xiaoban.hub.boot"
  private const val FILE = "hub-boot.bin"
  private const val TAG_BITS = 128

  private fun key(): SecretKey {
    val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    (store.getEntry(ALIAS, null) as? KeyStore.SecretKeyEntry)?.let { return it.secretKey }
    val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
    generator.init(
      KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .build()
    )
    return generator.generateKey()
  }

  fun save(context: Context, locale: String, secrets: String, name: String) {
    runCatching {
      val cipher = Cipher.getInstance("AES/GCM/NoPadding")
      cipher.init(Cipher.ENCRYPT_MODE, key())
      val plain = JSONObject().put("locale", locale).put("secrets", secrets).put("name", name).toString()
      val sealed = cipher.doFinal(plain.toByteArray())
      val blob = JSONObject()
        .put("iv", Base64.encodeToString(cipher.iv, Base64.NO_WRAP))
        .put("data", Base64.encodeToString(sealed, Base64.NO_WRAP))
      File(context.filesDir, FILE).writeText(blob.toString())
    }.onFailure { Log.w("XiaobanKeeper", "could not remember how to start the hub", it) }
  }

  fun forget(context: Context) {
    File(context.filesDir, FILE).delete()
  }

  fun ensure(context: Context) {
    runCatching {
      val file = File(context.filesDir, FILE)
      if (!file.exists()) return
      val blob = JSONObject(file.readText())
      val cipher = Cipher.getInstance("AES/GCM/NoPadding")
      cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(TAG_BITS, Base64.decode(blob.getString("iv"), Base64.NO_WRAP)))
      val plain = JSONObject(String(cipher.doFinal(Base64.decode(blob.getString("data"), Base64.NO_WRAP))))
      XiaobanOperator.context = context
      val dir = File(context.filesDir, "hub").apply { mkdirs() }
      XiaobanHubNative.start(dir.absolutePath, plain.getString("locale"), plain.getString("secrets"), plain.getString("name"))
    }.onFailure { Log.w("XiaobanKeeper", "could not start the hub in the background", it) }
  }
}
