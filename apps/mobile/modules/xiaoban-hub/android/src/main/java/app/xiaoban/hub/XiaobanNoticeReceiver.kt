package app.xiaoban.hub

import android.app.RemoteInput
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import org.json.JSONObject

class XiaobanNoticeReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != XiaobanNotices.ACTION) return
    val tag = intent.getStringExtra("tag") ?: return
    val raw = intent.getStringExtra("answer") ?: return
    val route = intent.getStringExtra("route") ?: "local"
    val done = intent.getStringExtra("done") ?: ""
    val texts = runCatching { JSONObject(intent.getStringExtra("texts") ?: "{}") }.getOrDefault(JSONObject())
    val answer = runCatching { JSONObject(raw) }.getOrNull() ?: return
    if (answer.optString("kind") == "reply") {
      val text = RemoteInput.getResultsFromIntent(intent)?.getCharSequence(XiaobanNotices.REPLY_KEY)?.toString()?.trim()
      if (text.isNullOrEmpty()) return
      answer.put("text", text)
    }
    val app = context.applicationContext
    val pending = goAsync()
    Thread {
      try {
        val delivered = if (route == "js") {
          XiaobanNotices.toApp(answer.toString())
        } else {
          val reply = runCatching { JSONObject(XiaobanHubNative.deliver(answer.toString())) }.getOrNull()
          reply != null && !reply.has("error")
        }
        XiaobanNotices.settle(app, tag, if (delivered) done else texts.optString("failed"), texts)
      } catch (error: Throwable) {
        Log.w("XiaobanNotices", "could not hand the answer back", error)
        XiaobanNotices.settle(app, tag, texts.optString("failed"), texts)
      } finally {
        pending.finish()
      }
    }.start()
  }
}
