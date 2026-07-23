package com.zoontek.rnbootsplash

import android.app.Activity
import android.app.Dialog
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.ImageDecoder
import android.graphics.drawable.AnimatedImageDrawable
import android.graphics.drawable.ColorDrawable
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
  private val fade: Boolean,
  // When set, the dialog renders this frame statically instead of decoding and
  // replaying the `bootSplashAnimation`. Used for the fade-out dialog so it shows
  // the frozen last frame captured from the initial dialog rather than restarting
  // the animation from the beginning during the fade-out.
  private val staticFrame: Bitmap? = null
) : Dialog(activity, themeResId) {

  // The ImageView playing the animation on the initial (non-fade) dialog. Retained
  // so the module can snapshot its current (last) frame before building the
  // fade-out dialog.
  private var animatedImageView: ImageView? = null

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

  // Snapshots the currently displayed animation frame (the settled last frame by the
  // time hide runs) so the fade-out dialog can render it statically instead of
  // replaying the animation. Returns null when there is no animation or the view has
  // not been laid out yet.
  fun captureCurrentFrame(): Bitmap? {
    val view = animatedImageView ?: return null

    if (view.width <= 0 || view.height <= 0) {
      return null
    }

    return runCatching {
      val bitmap = Bitmap.createBitmap(view.width, view.height, Bitmap.Config.ARGB_8888)
      view.draw(Canvas(bitmap))
      bitmap
    }.getOrNull()
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

    // Paint the dialog window itself with the solid background so the themed window
    // background (a centered static logo) never flashes behind the animation before /
    // between frames. The animation's first frame is the same solid color, so the
    // hand-off from the OS cold-start window is seamless.
    window?.setBackgroundDrawable(ColorDrawable(backgroundColor))

    // Fade-out dialog: never decode/replay the animation. Show the frozen last frame
    // captured from the initial dialog (falling back to the solid background) so the
    // fade-out cross-dissolves from the settled splash instead of restarting it.
    if (fade) {
      return ImageView(context).apply {
        layoutParams = ViewGroup.LayoutParams(
          ViewGroup.LayoutParams.MATCH_PARENT,
          ViewGroup.LayoutParams.MATCH_PARENT
        )
        scaleType = ImageView.ScaleType.CENTER_CROP
        setBackgroundColor(backgroundColor)
        staticFrame?.let { setImageBitmap(it) }
      }
    }

    val imageView = ImageView(context).apply {
      layoutParams = ViewGroup.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        ViewGroup.LayoutParams.MATCH_PARENT
      )
      scaleType = ImageView.ScaleType.CENTER_CROP
      setBackgroundColor(backgroundColor)
    }

    animatedImageView = imageView

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      runCatching {
        val source = ImageDecoder.createSource(context.resources, animationResId)
        val drawable = ImageDecoder.decodeDrawable(source)
        imageView.setImageDrawable(drawable)

        if (drawable is AnimatedImageDrawable) {
          // Play through once and freeze on the final frame. AnimatedImageDrawable is
          // unreliable for this on its own: setRepeatCount(0) is honored inconsistently
          // across devices (many replay per the encoded WebP loop count), and a natural
          // end can revert to the first frame. So we let it loop forever and stop() it
          // ourselves at the end of the first pass — stop() retains whatever frame is on
          // screen, which freezes it on the settled last frame. The asset holds its final
          // frame long enough to absorb any cold-start scheduling jitter on this callback.
          drawable.repeatCount = AnimatedImageDrawable.REPEAT_INFINITE
          drawable.start()
          animationDurationMs = durationMs
          animationStartUptimeMs = SystemClock.uptimeMillis()

          if (durationMs > 0) {
            imageView.postDelayed({ drawable.stop() }, durationMs)
          }
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
