package com.zoontek.rnbootsplash

import android.app.Activity
import android.app.Dialog
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.ImageDecoder
import android.graphics.drawable.AnimatedImageDrawable
import android.os.Build
import android.os.Bundle
import android.os.SystemClock
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.ImageView

import androidx.annotation.StyleRes

class RNBootSplashDialog(
  activity: Activity,
  @StyleRes themeResId: Int,
  private val fade: Boolean
) : Dialog(activity, themeResId) {

  // Set when an app-provided animation (theme attr `bootSplashAnimation`) starts
  // playing; both stay 0 when no animation is configured, so the dialog keeps the
  // stock behavior (themed window background only) and reports no time to wait.
  private var animationStartUptimeMs: Long = 0L
  private var animationDurationMs: Long = 0L

  init {
    setOwnerActivity(activity)
    setCancelable(false)
    setCanceledOnTouchOutside(false)
  }

  // Milliseconds remaining before the splash animation finishes a single
  // playthrough; 0 when there is no animation or it has already completed.
  fun remainingAnimationTimeMs(): Long {
    if (animationStartUptimeMs == 0L || animationDurationMs == 0L) {
      return 0L
    }

    val elapsed = SystemClock.uptimeMillis() - animationStartUptimeMs
    return (animationDurationMs - elapsed).coerceAtLeast(0L)
  }

  @Deprecated("Deprecated in favor of OnBackPressedCallback")
  override fun onBackPressed() {
    val activity = ownerActivity
    activity?.moveTaskToBack(true)
  }

  override fun dismiss() {
    if (isShowing) {
      runCatching { super.dismiss() }
    }
  }

  fun dismiss(callback: () -> Unit) {
    if (isShowing) {
      setOnDismissListener { callback() }
      runCatching { super.dismiss() }.onFailure { callback() }
    } else {
      callback()
    }
  }

  override fun show() {
    if (!isShowing) {
      runCatching { super.show() }
    }
  }

  fun show(callback: () -> Unit) {
    if (!isShowing) {
      setOnShowListener { callback() }
      runCatching { super.show() }.onFailure { callback() }
    } else {
      callback()
    }
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    window?.apply {
      setLayout(
        WindowManager.LayoutParams.MATCH_PARENT,
        WindowManager.LayoutParams.MATCH_PARENT
      )

      setWindowAnimations(
        when {
          fade -> R.style.BootSplashFadeOutAnimation
          else -> R.style.BootSplashNoAnimation
        }
      )

      if (RNBootSplashModuleImpl.isSamsungOneUI4()) {
        setBackgroundDrawableResource(R.drawable.compat_splash_screen_oneui_4)
      }
    }

    super.onCreate(savedInstanceState)

    // Only override the stock themed window background when the app opts into an
    // animated splash via the `bootSplashAnimation` theme attribute.
    buildAnimatedSplashView()?.let { setContentView(it) }
  }

  // Builds a full-screen view that plays the app-provided `bootSplashAnimation`
  // (a @raw animated image) over the themed `bootSplashBackground`, mirroring the
  // iOS AnimatedSplashViewController. Returns null when the app has not configured
  // an animation, leaving the stock static window background in place.
  //
  // Uses the framework ImageDecoder (API 28+) so no extra dependency is required;
  // older devices fall back to the first (static) frame on the solid background.
  private fun buildAnimatedSplashView(): ImageView? {
    val typedArray = context.obtainStyledAttributes(
      intArrayOf(
        R.attr.bootSplashAnimation,
        R.attr.bootSplashAnimationDuration,
        R.attr.bootSplashBackground
      )
    )
    val animationResId = typedArray.getResourceId(0, 0)
    val durationMs = typedArray.getInt(1, 0).toLong()
    val backgroundColor = typedArray.getColor(2, Color.TRANSPARENT)
    typedArray.recycle()

    if (animationResId == 0) {
      return null
    }

    val imageView = ImageView(context).apply {
      layoutParams = ViewGroup.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        ViewGroup.LayoutParams.MATCH_PARENT
      )
      scaleType = ImageView.ScaleType.CENTER_CROP
      setBackgroundColor(backgroundColor)
    }

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      runCatching {
        val source = ImageDecoder.createSource(context.resources, animationResId)
        val drawable = ImageDecoder.decodeDrawable(source)
        imageView.setImageDrawable(drawable)

        if (drawable is AnimatedImageDrawable) {
          // Play once, then hold the final frame until hide() dismisses the dialog.
          drawable.repeatCount = 0
          drawable.start()
          animationDurationMs = durationMs
          animationStartUptimeMs = SystemClock.uptimeMillis()
        }
      }
    } else {
      // ImageDecoder is API 28+. On older devices show the first frame statically.
      runCatching {
        val bitmap = context.resources.openRawResource(animationResId).use {
          BitmapFactory.decodeStream(it)
        }

        if (bitmap != null) {
          imageView.setImageBitmap(bitmap)
        }
      }
    }

    return imageView
  }
}
