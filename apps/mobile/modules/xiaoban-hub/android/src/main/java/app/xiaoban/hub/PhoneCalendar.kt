package app.xiaoban.hub

import android.Manifest
import android.content.ContentUris
import android.content.Context
import android.content.pm.PackageManager
import android.provider.CalendarContract
import org.json.JSONArray
import org.json.JSONObject

object PhoneCalendar {
  private const val LIMIT = 200

  fun read(context: Context, from: Long, to: Long): JSONObject {
    if (context.checkSelfPermission(Manifest.permission.READ_CALENDAR) != PackageManager.PERMISSION_GRANTED) {
      return JSONObject().put("status", "denied")
    }
    val uri = CalendarContract.Instances.CONTENT_URI.buildUpon().also {
      ContentUris.appendId(it, from)
      ContentUris.appendId(it, to)
    }.build()
    val columns = arrayOf(
      CalendarContract.Instances.TITLE,
      CalendarContract.Instances.BEGIN,
      CalendarContract.Instances.END,
      CalendarContract.Instances.ALL_DAY,
      CalendarContract.Instances.EVENT_LOCATION,
      CalendarContract.Instances.CALENDAR_DISPLAY_NAME,
      CalendarContract.Instances.VISIBLE,
    )
    val events = JSONArray()
    context.contentResolver.query(uri, columns, null, null, "${CalendarContract.Instances.BEGIN} ASC")?.use { cursor ->
      while (cursor.moveToNext() && events.length() < LIMIT) {
        if (cursor.getInt(6) == 0) continue
        events.put(
          JSONObject()
            .put("title", cursor.getString(0) ?: "")
            .put("start", cursor.getLong(1))
            .put("end", cursor.getLong(2))
            .put("allDay", cursor.getInt(3) == 1)
            .put("location", cursor.getString(4) ?: "")
            .put("calendar", cursor.getString(5) ?: ""),
        )
      }
    }
    return JSONObject().put("status", "ok").put("events", events)
  }
}
