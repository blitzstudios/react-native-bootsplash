package com.zoontek.rnbootsplash

import android.annotation.SuppressLint
import android.app.Activity
import android.content.res.Configuration
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.TypedValue
import android.view.ViewConfiguration

import androidx.annotation.StyleRes

import com.facebook.common.logging.FLog
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.common.ReactConstants
import com.facebook.react.uimanager.PixelUtil

object RNBootSplashModuleImpl {
  const val NAME = "RNBootSplash"

  private enum class Status {
    HIDDEN,
    HIDING,
    VISIBLE,
  }

  private val mPromiseQueue = RNBootSplashQueue<Promise>()
  private var mStatus = Status.HIDDEN

  @StyleRes
  private var mThemeResId = -1

  private val mMainHandler = Handler(Looper.getMainLooper())
  private var mOverlay: RNBootSplashOverlay? = null

  internal fun init(activity: Activity?, @StyleRes themeResId: Int) {
    if (mThemeResId != -1) {
      return FLog.w(
        ReactConstants.TAG,
        "$NAME: Ignored initialization, module is already initialized."
      )
    }

    mThemeResId = themeResId

    if (activity == null) {
      return FLog.w(
        ReactConstants.TAG,
        "$NAME: Ignored initialization, current activity is null."
      )
    }

    // Apply postBootSplashTheme
    val typedValue = TypedValue()
    val currentTheme = activity.theme

    if (currentTheme.resolveAttribute(R.attr.postBootSplashTheme, typedValue, true)) {
      val finalThemeId = typedValue.resourceId

      if (finalThemeId != 0) {
        activity.setTheme(finalThemeId)
      }
    }

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      // This is not called on Android 12 when activity is started using intent
      // (Android studio / CLI / notification / widget…)
      activity
        .splashScreen
        .setOnExitAnimationListener { view ->
          view.remove() // Remove it immediately, without animation

          activity
            .splashScreen
            .clearOnExitAnimationListener()
        }
    }

    // Attached synchronously (init runs in Activity.onCreate, on the UI thread) so
    // the overlay is part of the activity's very first frame.
    mOverlay = RNBootSplashOverlay(activity, mThemeResId).also { it.attach() }
    mStatus = Status.VISIBLE
  }

  private fun clearPromiseQueue() {
    while (!mPromiseQueue.isEmpty()) {
      mPromiseQueue.shift()?.resolve(true)
    }
  }

  private fun hideAndClearPromiseQueue(fade: Boolean, forced: Boolean) {
    UiThreadUtil.runOnUiThread {
      if (mStatus == Status.HIDING) {
        return@runOnUiThread // wait until fade out end for clearPromiseQueue
      }

      val overlay = mOverlay

      if (mStatus == Status.HIDDEN || overlay == null) {
        clearPromiseQueue()
        return@runOnUiThread
      }

      // Native-owned timing: unless forced, keep the splash visible until its
      // WebP animation has finished playing, then dismiss.
      if (!forced) {
        val remaining = overlay.remainingAnimationTimeMs()

        if (remaining > 0) {
          mMainHandler.postDelayed({ hideAndClearPromiseQueue(fade, forced) }, remaining)
          return@runOnUiThread
        }
      }

      mStatus = Status.HIDING

      overlay.dismiss(fade) {
        // show() may have put up a new overlay while this one was fading out.
        if (mOverlay === overlay) {
          mOverlay = null
          mStatus = Status.HIDDEN
        }

        clearPromiseQueue()
      }
    }
  }

  // From https://stackoverflow.com/a/61062773
  fun isSamsungOneUI4(): Boolean {
    return runCatching {
      val field = Build.VERSION::class.java.getDeclaredField("SEM_PLATFORM_INT")
      val version = (field.getInt(null) - 90000) / 10000
      version == 4
    }.getOrDefault(false)
  }

  internal fun onHostDestroy() {
    mStatus = Status.HIDDEN
    mThemeResId = -1
    clearPromiseQueue()

    val overlay = mOverlay
    mOverlay = null

    if (overlay != null) {
      UiThreadUtil.runOnUiThread { overlay.dismiss(false) {} }
    }
  }

  fun getConstants(reactContext: ReactApplicationContext): Map<String, Any> {
    val resources = reactContext.resources
    val constants = HashMap<String, Any>()

    val uiMode =
      reactContext.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK

    @SuppressLint("InternalInsetResource", "DiscouragedApi") val statusBarHeightResId =
      resources.getIdentifier("status_bar_height", "dimen", "android")

    @SuppressLint("InternalInsetResource", "DiscouragedApi") val navigationBarHeightResId =
      resources.getIdentifier("navigation_bar_height", "dimen", "android")

    val statusBarHeight = when {
      statusBarHeightResId > 0 ->
        PixelUtil.toDIPFromPixel(resources.getDimensionPixelSize(statusBarHeightResId).toFloat())
      else -> 0f
    }

    val navigationBarHeight = when {
      navigationBarHeightResId > 0 && !ViewConfiguration.get(reactContext).hasPermanentMenuKey() ->
        PixelUtil.toDIPFromPixel(resources.getDimensionPixelSize(navigationBarHeightResId).toFloat())
      else -> 0f
    }

    constants["darkModeEnabled"] = uiMode == Configuration.UI_MODE_NIGHT_YES
    constants["logoSizeRatio"] = if (isSamsungOneUI4()) 0.5 else 1.0
    constants["navigationBarHeight"] = navigationBarHeight
    constants["statusBarHeight"] = statusBarHeight

    return constants
  }

  fun hide(reactContext: ReactApplicationContext, fade: Boolean, forced: Boolean, promise: Promise) {
    mPromiseQueue.push(promise)
    hideAndClearPromiseQueue(fade, forced)
  }

  fun show(reactContext: ReactApplicationContext, fade: Boolean, promise: Promise) {
    if (mThemeResId == -1) {
      return promise.resolve(false) // Not initialized
    }

    UiThreadUtil.runOnUiThread {
      val activity = reactContext.currentActivity

      if (activity == null || activity.isFinishing || activity.isDestroyed) {
        promise.resolve(false)
        return@runOnUiThread
      }

      if (mStatus == Status.VISIBLE) {
        promise.resolve(true) // Already visible
        return@runOnUiThread
      }

      mOverlay = RNBootSplashOverlay(activity, mThemeResId).also { it.attach() }
      mStatus = Status.VISIBLE
      promise.resolve(true)
    }
  }

  fun isVisible(promise: Promise) {
    promise.resolve(mStatus != Status.HIDDEN)
  }
}
