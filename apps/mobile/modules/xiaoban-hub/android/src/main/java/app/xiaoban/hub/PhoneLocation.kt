package app.xiaoban.hub

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.Geocoder
import android.location.Location
import android.location.LocationManager
import android.os.Build
import android.os.CancellationSignal
import java.util.Locale
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import org.json.JSONObject

object PhoneLocation {
  private const val FRESH_MS = 30 * 60 * 1000L
  private const val WAIT_SECONDS = 10L

  fun locate(context: Context): JSONObject {
    if (context.checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
      return JSONObject().put("status", "denied")
    }
    val manager = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
    val location = recent(manager) ?: current(manager) ?: return JSONObject().put("status", "unavailable")
    val reply = JSONObject()
      .put("status", "found")
      .put("latitude", "%.4f".format(Locale.ROOT, location.latitude))
      .put("longitude", "%.4f".format(Locale.ROOT, location.longitude))
    val address = runCatching {
      @Suppress("DEPRECATION")
      Geocoder(context, Locale.getDefault()).getFromLocation(location.latitude, location.longitude, 1)?.firstOrNull()
    }.getOrNull()
    val city = address?.locality ?: address?.subAdminArea ?: address?.adminArea ?: ""
    reply.put("city", city)
    reply.put("district", address?.subLocality ?: JSONObject.NULL)
    return reply
  }

  private fun providers(manager: LocationManager) =
    listOf(LocationManager.NETWORK_PROVIDER, LocationManager.GPS_PROVIDER, LocationManager.PASSIVE_PROVIDER)
      .filter { runCatching { manager.isProviderEnabled(it) }.getOrDefault(false) }

  @Suppress("MissingPermission")
  private fun recent(manager: LocationManager): Location? =
    providers(manager)
      .mapNotNull { runCatching { manager.getLastKnownLocation(it) }.getOrNull() }
      .filter { System.currentTimeMillis() - it.time < FRESH_MS }
      .maxByOrNull { it.time }

  @Suppress("MissingPermission")
  private fun current(manager: LocationManager): Location? {
    val provider = providers(manager).firstOrNull() ?: return null
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
      return runCatching { manager.getLastKnownLocation(provider) }.getOrNull()
    }
    var found: Location? = null
    val done = CountDownLatch(1)
    val signal = CancellationSignal()
    val executor = Executors.newSingleThreadExecutor()
    manager.getCurrentLocation(provider, signal, executor) { location ->
      found = location
      done.countDown()
    }
    if (!done.await(WAIT_SECONDS, TimeUnit.SECONDS)) signal.cancel()
    executor.shutdown()
    return found ?: runCatching { manager.getLastKnownLocation(provider) }.getOrNull()
  }
}
