package app.xiaoban.hub

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.OpenableColumns
import android.webkit.MimeTypeMap
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.lang.ref.WeakReference
import java.util.UUID

object XiaobanShare {
  private const val MAX_FILES = 9
  private const val MAX_BYTES = 20L * 1024 * 1024
  private const val KEEP_MS = 24L * 60 * 60 * 1000

  @Volatile
  private var pending: Intent? = null
  private var activity: WeakReference<Activity>? = null
  var listener: (() -> Unit)? = null

  fun attach(owner: Activity) {
    activity = WeakReference(owner)
  }

  fun detach(owner: Activity) {
    if (activity?.get() === owner) activity = null
  }

  fun receive(intent: Intent?) {
    val action = intent?.action ?: return
    if (action != Intent.ACTION_SEND && action != Intent.ACTION_SEND_MULTIPLE) return
    pending = intent
    listener?.invoke()
  }

  fun close() {
    val owner = activity?.get() ?: return
    owner.runOnUiThread { owner.finish() }
  }

  fun open(context: Context, url: String) {
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
      .setPackage(context.packageName)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    runCatching { context.startActivity(intent) }
    close()
  }

  fun take(context: Context): JSONObject? {
    val intent = pending ?: return null
    pending = null
    val folder = File(context.cacheDir, "share")
    sweep(folder)
    val files = JSONArray()
    var skipped = 0
    for (uri in streams(intent).take(MAX_FILES)) {
      val copied = runCatching { copy(context, uri, intent.type, folder) }.getOrNull()
      if (copied == null) skipped += 1 else files.put(copied)
    }
    return JSONObject()
      .put("text", intent.getCharSequenceExtra(Intent.EXTRA_TEXT)?.toString())
      .put("subject", intent.getStringExtra(Intent.EXTRA_SUBJECT) ?: intent.getStringExtra(Intent.EXTRA_TITLE))
      .put("mime", intent.type)
      .put("files", files)
      .put("skipped", skipped)
  }

  private fun streams(intent: Intent): List<Uri> {
    val found = mutableListOf<Uri>()
    if (intent.action == Intent.ACTION_SEND_MULTIPLE) {
      val list = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri::class.java)
      } else {
        @Suppress("DEPRECATION")
        intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM)
      }
      list?.let { found.addAll(it) }
    } else {
      val single = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java)
      } else {
        @Suppress("DEPRECATION")
        intent.getParcelableExtra(Intent.EXTRA_STREAM)
      }
      single?.let { found.add(it) }
    }
    val clip = intent.clipData
    if (found.isEmpty() && clip != null) {
      for (index in 0 until clip.itemCount) clip.getItemAt(index).uri?.let { found.add(it) }
    }
    return found.distinct()
  }

  private fun sweep(folder: File) {
    val cutoff = System.currentTimeMillis() - KEEP_MS
    folder.listFiles()?.filter { it.lastModified() < cutoff }?.forEach { it.deleteRecursively() }
  }

  private fun copy(context: Context, uri: Uri, fallbackMime: String?, folder: File): JSONObject? {
    val resolver = context.contentResolver
    val mime = resolver.getType(uri) ?: fallbackMime?.takeUnless { it.endsWith("/*") }
    var name: String? = null
    var size = -1L
    resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)?.use { cursor ->
      if (cursor.moveToFirst()) {
        val nameAt = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
        val sizeAt = cursor.getColumnIndex(OpenableColumns.SIZE)
        if (nameAt >= 0) name = cursor.getString(nameAt)
        if (sizeAt >= 0 && !cursor.isNull(sizeAt)) size = cursor.getLong(sizeAt)
      }
    }
    if (size > MAX_BYTES) return null
    val base = (name ?: uri.lastPathSegment ?: "file")
      .substringAfterLast('/')
      .replace(Regex("[\\\\:*?\"<>|]"), "_")
      .trim()
      .ifEmpty { "file" }
    val extension = mime?.let { MimeTypeMap.getSingleton().getExtensionFromMimeType(it) }
    val fileName = if (extension != null && !base.contains('.')) "$base.$extension" else base
    val target = File(File(folder, UUID.randomUUID().toString()).apply { mkdirs() }, fileName)
    val written = resolver.openInputStream(uri)?.use { input ->
      target.outputStream().use { output ->
        val buffer = ByteArray(64 * 1024)
        var total = 0L
        var read = input.read(buffer)
        while (read >= 0 && total <= MAX_BYTES) {
          total += read
          if (total <= MAX_BYTES) output.write(buffer, 0, read)
          read = input.read(buffer)
        }
        if (total > MAX_BYTES) -1L else total
      }
    } ?: return null
    if (written < 0) {
      target.parentFile?.deleteRecursively()
      return null
    }
    return JSONObject()
      .put("uri", Uri.fromFile(target).toString())
      .put("name", fileName)
      .put("size", written)
      .put("mime", mime ?: "application/octet-stream")
  }
}
