package app.xiaoban.hub

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.RemoteInput
import android.content.Context
import android.content.Intent
import android.graphics.drawable.Icon
import android.net.Uri
import android.os.Build
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject

object XiaobanNotices {
  private const val TAG = "XiaobanNotices"
  private const val URGENT = "xiaoban.urgent"
  private const val QUIET = "xiaoban.quiet"
  private const val ID = 1
  private const val MAX_ACTIONS = 3
  private const val DONE_TIMEOUT_MS = 8000L
  const val ACTION = "app.xiaoban.hub.NOTICE_ANSWER"
  const val REPLY_KEY = "reply"

  @Volatile
  var foreground = false

  @Volatile
  var listener: ((String) -> Unit)? = null

  private fun manager(context: Context) =
    context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

  private fun channels(context: Context, texts: JSONObject) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = manager(context)
    manager.createNotificationChannel(
      NotificationChannel(URGENT, texts.optString("channelUrgent", URGENT), NotificationManager.IMPORTANCE_HIGH).apply {
        enableVibration(true)
        lockscreenVisibility = Notification.VISIBILITY_PUBLIC
      }
    )
    manager.createNotificationChannel(
      NotificationChannel(QUIET, texts.optString("channelQuiet", QUIET), NotificationManager.IMPORTANCE_LOW).apply {
        setSound(null, null)
        enableVibration(false)
      }
    )
  }

  private fun builder(context: Context, channel: String): Notification.Builder {
    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(context, channel)
    } else {
      @Suppress("DEPRECATION")
      Notification.Builder(context).setPriority(
        if (channel == URGENT) Notification.PRIORITY_HIGH else Notification.PRIORITY_LOW
      ).setDefaults(if (channel == URGENT) Notification.DEFAULT_ALL else 0)
    }
    return builder
      .setSmallIcon(R.drawable.xiaoban_notify)
      .setColor(context.getColor(R.color.xiaoban_accent))
      .setVisibility(Notification.VISIBILITY_PUBLIC)
  }

  private fun opener(context: Context, threadId: String?, tag: String): PendingIntent? {
    val intent = if (threadId.isNullOrEmpty()) {
      context.packageManager.getLaunchIntentForPackage(context.packageName)
    } else {
      Intent(Intent.ACTION_VIEW, Uri.parse("xiaoban://thread/${Uri.encode(threadId)}")).setPackage(context.packageName)
    } ?: return null
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    return PendingIntent.getActivity(
      context,
      tag.hashCode(),
      intent,
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
    )
  }

  private fun answerIntent(context: Context, tag: String, route: String, texts: JSONObject): Intent =
    Intent(context, XiaobanNoticeReceiver::class.java)
      .setAction(ACTION)
      .setPackage(context.packageName)
      .putExtra("tag", tag)
      .putExtra("route", route)
      .putExtra("texts", texts.toString())

  private fun doneText(texts: JSONObject, choice: String): String = when (choice) {
    "no" -> texts.optString("answeredNo")
    "edit" -> texts.optString("answeredEdit")
    else -> texts.optString("answeredYes")
  }

  fun notify(context: Context, request: JSONObject): JSONObject {
    val notice = request.getJSONObject("notice")
    val texts = request.optJSONObject("texts") ?: JSONObject()
    val route = request.optString("route", "local")
    if (foreground) return JSONObject().put("ok", true).put("shown", false)
    channels(context, texts)
    val tag = notice.getString("id")
    val threadId = notice.optString("threadId").takeIf { notice.has("threadId") && !notice.isNull("threadId") }
    val confirmId = notice.optString("confirmId").takeIf { notice.has("confirmId") && !notice.isNull("confirmId") }
    val todoId = notice.optString("todoId").takeIf { notice.has("todoId") && !notice.isNull("todoId") }
    val body = notice.optString("body")
    val builder = builder(context, URGENT)
      .setContentTitle(notice.optString("title"))
      .setContentText(body)
      .setStyle(Notification.BigTextStyle().bigText(body))
      .setSubText(if (todoId != null) texts.optString("todoCategory") else texts.optString("category"))
      .setCategory(
        when (notice.optString("category")) {
          "confirm" -> Notification.CATEGORY_EVENT
          "remind" -> Notification.CATEGORY_REMINDER
          "error" -> Notification.CATEGORY_ERROR
          else -> Notification.CATEGORY_MESSAGE
        }
      )
      .setAutoCancel(true)
      .setOnlyAlertOnce(true)
      .setShowWhen(true)
      .setWhen(System.currentTimeMillis())
    opener(context, threadId, tag)?.let { builder.setContentIntent(it) }
    val choices = notice.optJSONArray("choices") ?: JSONArray()
    if (confirmId != null) {
      for (index in 0 until minOf(choices.length(), MAX_ACTIONS)) {
        val option = choices.getJSONObject(index)
        val choice = option.getString("choice")
        val answer = JSONObject().put("kind", "confirm").put("confirmId", confirmId).put("choice", choice)
        val intent = answerIntent(context, tag, route, texts)
          .putExtra("answer", answer.toString())
          .putExtra("done", doneText(texts, choice))
        val pending = PendingIntent.getBroadcast(
          context,
          "$tag:$choice".hashCode(),
          intent,
          PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        val icon = Icon.createWithResource(context, R.drawable.xiaoban_notify)
        builder.addAction(Notification.Action.Builder(icon, option.optString("label"), pending).build())
      }
    }
    if (todoId != null) {
      for ((action, label) in listOf("done" to "todoDone", "hour" to "todoHour", "tomorrow" to "todoTomorrow")) {
        val answer = JSONObject().put("kind", "todo").put("todoId", todoId).put("action", action)
        val intent = answerIntent(context, tag, route, texts)
          .putExtra("answer", answer.toString())
          .putExtra("done", texts.optString(if (action == "done") "answeredTodoDone" else "answeredTodoLater"))
        val pending = PendingIntent.getBroadcast(
          context,
          "$tag:$action".hashCode(),
          intent,
          PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        val icon = Icon.createWithResource(context, R.drawable.xiaoban_notify)
        builder.addAction(Notification.Action.Builder(icon, texts.optString(label), pending).build())
      }
    }
    if (threadId != null && notice.optBoolean("reply")) {
      val input = RemoteInput.Builder(REPLY_KEY).setLabel(texts.optString("replyHint")).build()
      val answer = JSONObject().put("kind", "reply").put("threadId", threadId)
      val intent = answerIntent(context, tag, route, texts)
        .putExtra("answer", answer.toString())
        .putExtra("done", texts.optString("replied"))
      val flags = PendingIntent.FLAG_UPDATE_CURRENT or
        (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0)
      val pending = PendingIntent.getBroadcast(context, "$tag:reply".hashCode(), intent, flags)
      val icon = Icon.createWithResource(context, R.drawable.xiaoban_notify)
      builder.addAction(
        Notification.Action.Builder(icon, texts.optString("reply"), pending)
          .addRemoteInput(input)
          .build()
      )
    }
    return try {
      manager(context).notify(tag, ID, builder.build())
      JSONObject().put("ok", true).put("shown", true)
    } catch (error: SecurityException) {
      Log.w(TAG, "notifications are not allowed", error)
      JSONObject().put("error", "notifications are not allowed")
    }
  }

  fun withdraw(context: Context, tag: String): JSONObject {
    manager(context).cancel(tag, ID)
    return JSONObject().put("ok", true)
  }

  fun settle(context: Context, tag: String, text: String, texts: JSONObject) {
    channels(context, texts)
    val notification = builder(context, QUIET)
      .setContentText(text)
      .setSubText(texts.optString("category"))
      .setAutoCancel(true)
      .apply { if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) setTimeoutAfter(DONE_TIMEOUT_MS) }
      .build()
    try {
      manager(context).notify(tag, ID, notification)
    } catch (error: SecurityException) {
      Log.w(TAG, "could not update the notification", error)
    }
  }

  fun toApp(answer: String): Boolean {
    val current = listener ?: return false
    current(answer)
    return true
  }
}
