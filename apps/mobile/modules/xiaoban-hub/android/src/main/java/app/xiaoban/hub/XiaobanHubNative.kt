package app.xiaoban.hub

object XiaobanHubNative {
  init {
    System.loadLibrary("xiaoban_mobile")
  }

  @JvmStatic
  external fun start(dataDir: String, locale: String, secrets: String, name: String): Int

  @JvmStatic
  external fun stop()

  @JvmStatic
  fun call(request: String): String = XiaobanOperator.handle(request)
}
