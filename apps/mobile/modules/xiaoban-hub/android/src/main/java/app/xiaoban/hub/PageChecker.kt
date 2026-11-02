package app.xiaoban.hub

import android.annotation.SuppressLint
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.view.View
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import org.json.JSONObject
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

object PageChecker {
  private const val HEIGHT_DP = 800
  private const val TIMEOUT_SECONDS = 12L

  private class Receiver(private val result: AtomicReference<String?>, private val latch: CountDownLatch) {
    @JavascriptInterface
    fun done(json: String) {
      result.compareAndSet(null, json)
      latch.countDown()
    }
  }

  @SuppressLint("SetJavaScriptEnabled")
  fun check(context: Context, html: String, widthDp: Int): JSONObject {
    if (Looper.myLooper() == Looper.getMainLooper()) {
      return JSONObject().put("error", "cannot check a page on the main thread")
    }
    val result = AtomicReference<String?>(null)
    val latch = CountDownLatch(1)
    val main = Handler(Looper.getMainLooper())
    val view = AtomicReference<WebView?>(null)
    main.post {
      runCatching {
        val density = context.resources.displayMetrics.density
        val width = (widthDp * density).toInt()
        val height = (HEIGHT_DP * density).toInt()
        val web = WebView(context.applicationContext)
        web.settings.javaScriptEnabled = true
        web.settings.domStorageEnabled = true
        web.settings.allowFileAccess = false
        web.settings.allowContentAccess = false
        web.settings.useWideViewPort = true
        web.settings.loadWithOverviewMode = false
        web.webViewClient = object : WebViewClient() {
          override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean = true
        }
        web.addJavascriptInterface(Receiver(result, latch), "XiaobanCheck")
        web.measure(
          View.MeasureSpec.makeMeasureSpec(width, View.MeasureSpec.EXACTLY),
          View.MeasureSpec.makeMeasureSpec(height, View.MeasureSpec.EXACTLY)
        )
        web.layout(0, 0, width, height)
        web.loadDataWithBaseURL("https://page.xiaoban.local/", html, "text/html", "utf-8", null)
        view.set(web)
      }.onFailure {
        result.compareAndSet(null, JSONObject().put("error", it.message ?: "could not open a browser").toString())
        latch.countDown()
      }
    }
    val finished = latch.await(TIMEOUT_SECONDS, TimeUnit.SECONDS)
    main.post {
      view.getAndSet(null)?.let { web ->
        web.stopLoading()
        web.removeJavascriptInterface("XiaobanCheck")
        web.destroy()
      }
    }
    if (!finished) {
      return JSONObject()
        .put("errors", org.json.JSONArray().put("the page did not finish loading within $TIMEOUT_SECONDS seconds"))
        .put("clicked", org.json.JSONArray())
        .put("overflow", false)
        .put("text", "")
    }
    return runCatching { JSONObject(result.get() ?: "{}") }.getOrDefault(JSONObject().put("error", "the browser gave no answer"))
  }
}
