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

  // Set once the animated WebP starts playing (0 if there is no animation, e.g.
  // on API < 28 or when decoding fails). Used to wait for playback to finish.
  private var animationStartUptimeMs: Long = 0L

  init {
    setOwnerActivity(activity)
    setCancelable(false)
    setCanceledOnTouchOutside(false)
  }

  // Milliseconds remaining before the splash animation finishes a single
  // playthrough; 0 when not animated or already complete.
  fun remainingAnimationTimeMs(): Long {
    if (animationStartUptimeMs == 0L) {
      return 0L
    }

    val elapsed = SystemClock.uptimeMillis() - animationStartUptimeMs
    return (SPLASH_ANIMATION_DURATION_MS - elapsed).coerceAtLeast(0L)
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

    setContentView(buildAnimatedSplashView())
  }

  // Full-screen animated splash: the WebP plays over a solid background, matching
  // the iOS AnimatedSplashViewController. CENTER_CROP mirrors iOS scaleAspectFill.
  // Uses the framework ImageDecoder (API 28+) so no extra dependency is required;
  // older devices fall back to the first (static) frame on the solid background.
  private fun buildAnimatedSplashView(): ImageView {
    val imageView = ImageView(context).apply {
      layoutParams = ViewGroup.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        ViewGroup.LayoutParams.MATCH_PARENT
      )
      scaleType = ImageView.ScaleType.CENTER_CROP
      setBackgroundColor(SPLASH_BACKGROUND_COLOR)
    }

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      runCatching {
        val source = ImageDecoder.createSource(context.resources, R.raw.splash_loadin)
        val drawable = ImageDecoder.decodeDrawable(source)
        imageView.setImageDrawable(drawable)

        if (drawable is AnimatedImageDrawable) {
          // Respect the WebP's intent: play once, then hold the final frame until hide().
          drawable.repeatCount = 0
          drawable.start()
          animationStartUptimeMs = SystemClock.uptimeMillis()
        }
      }
    } else {
      // ImageDecoder is API 28+. On older devices show the first frame statically.
      runCatching {
        val bitmap = context.resources.openRawResource(R.raw.splash_loadin).use {
          BitmapFactory.decodeStream(it)
        }

        if (bitmap != null) {
          imageView.setImageBitmap(bitmap)
        }
      }
    }

    return imageView
  }

  companion object {
    // Matches ColorsV2.SPLASH_BACKGROUND_COLOR (#102131) used across the app.
    private val SPLASH_BACKGROUND_COLOR = Color.parseColor("#102131")

    // Total single-playthrough duration of splash_loadin.webp (67 frames).
    // Keep in sync with the asset if it is re-exported.
    private const val SPLASH_ANIMATION_DURATION_MS = 3820L
  }
}
