package com.zoontek.rnbootsplash

import android.app.Activity
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.ImageDecoder
import android.graphics.drawable.Animatable2
import android.graphics.drawable.AnimatedImageDrawable
import android.graphics.drawable.Drawable
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.view.ContextThemeWrapper
import android.view.View
import android.view.ViewGroup
import android.view.animation.AccelerateInterpolator
import android.widget.ImageView

import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.annotation.StyleRes

// The splash is a view laid over the activity's own content, inside the activity
// window, rather than a separate Dialog window. An AnimatedImageDrawable is advanced
// by the render thread of the window it is drawn in, and the render thread keeps
// delayed callbacks that point at that window's renderer. A Dialog's renderer is
// torn down as soon as the splash is dismissed, while those callbacks may still be
// pending, and running one against the freed renderer crashes the app
// (SIGSEGV in RenderThread::postFrameCallback). The activity's renderer lives for
// as long as the activity does, so the callbacks always land on a live renderer.
class RNBootSplashOverlay(
  private val activity: Activity,
  @StyleRes themeResId: Int
) {
  private val context = ContextThemeWrapper(activity, themeResId)

  private val mainHandler = Handler(Looper.getMainLooper())
  private var stopAnimationRunnable: Runnable? = null
  private var animatedDrawable: AnimatedImageDrawable? = null

  // animationDurationMs stays 0 when no animation is configured, in which case the
  // splash reports no time to wait. animationStartUptimeMs stays 0 until the first
  // frame is actually drawn.
  private var animationDurationMs: Long = 0L
  private var animationStartUptimeMs: Long = 0L

  private val view: View = buildView()

  // The app's content is laid out underneath while the splash is up; keep it hidden
  // from accessibility services until the splash is gone.
  private var contentView: View? = null
  private var contentImportantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_AUTO

  private val backPressedCallback = object : OnBackPressedCallback(true) {
    override fun handleOnBackPressed() {
      activity.moveTaskToBack(true)
    }
  }

  // Must be called on the UI thread.
  fun attach() {
    if (view.parent != null) {
      return
    }

    (activity.window.decorView as ViewGroup).addView(
      view,
      ViewGroup.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        ViewGroup.LayoutParams.MATCH_PARENT
      )
    )

    activity.findViewById<View>(android.R.id.content)?.let {
      contentView = it
      contentImportantForAccessibility = it.importantForAccessibility
      it.importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS
    }

    (activity as? ComponentActivity)?.onBackPressedDispatcher?.addCallback(backPressedCallback)
  }

  // Must be called on the UI thread. The callback runs once the overlay is gone.
  fun dismiss(fade: Boolean, callback: () -> Unit) {
    stopAnimation()
    backPressedCallback.remove()

    contentView?.importantForAccessibility = contentImportantForAccessibility
    contentView = null

    if (view.parent == null) {
      return callback()
    }

    // A fade can't play out while the window is hidden, and the callback would be
    // held back until the app returns to the foreground.
    if (!fade || !view.isAttachedToWindow || view.windowVisibility != View.VISIBLE) {
      removeView()
      return callback()
    }

    view
      .animate()
      .alpha(0f)
      .setDuration(FADE_OUT_DURATION_MS)
      .setInterpolator(AccelerateInterpolator())
      .withEndAction {
        removeView()
        callback()
      }
      .start()
  }

  // Milliseconds remaining before the splash animation finishes a single
  // playthrough; 0 when there is no animation or it has already completed.
  fun remainingAnimationTimeMs(): Long {
    if (animationDurationMs == 0L) {
      return 0L
    }

    if (animationStartUptimeMs == 0L) {
      return animationDurationMs
    }

    val elapsed = SystemClock.uptimeMillis() - animationStartUptimeMs
    return (animationDurationMs - elapsed).coerceAtLeast(0L)
  }

  private fun removeView() {
    view.animate().cancel()
    (view.parent as? ViewGroup)?.removeView(view)
  }

  // Freezes the animation on whatever frame is currently displayed. Idempotent, and
  // a no-op when no animation is configured. Must be called on the UI thread.
  private fun stopAnimation() {
    stopAnimationRunnable?.let {
      mainHandler.removeCallbacks(it)
      stopAnimationRunnable = null
    }

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      animatedDrawable?.stop()
    }
  }

  // Plays the app-provided `bootSplashAnimation` (a @raw animated image) over the
  // themed `bootSplashBackground`, mirroring the iOS AnimatedSplashViewController.
  // Without an animation, shows the stock themed window background (centered logo).
  //
  // Uses the framework ImageDecoder (API 28+) so no extra dependency is required;
  // older devices fall back to the first (static) frame on the solid background.
  private fun buildView(): View {
    val typedArray = context.obtainStyledAttributes(
      intArrayOf(
        R.attr.bootSplashAnimation,
        R.attr.bootSplashAnimationDuration,
        R.attr.bootSplashBackground,
        android.R.attr.windowBackground
      )
    )
    val animationResId = typedArray.getResourceId(0, 0)
    val durationMs = typedArray.getInt(1, 0).toLong()
    val backgroundColor = typedArray.getColor(2, Color.TRANSPARENT)
    val windowBackground: Drawable? = typedArray.getDrawable(3)
    typedArray.recycle()

    if (animationResId == 0) {
      return View(context).apply {
        background = when {
          RNBootSplashModuleImpl.isSamsungOneUI4() ->
            context.getDrawable(R.drawable.compat_splash_screen_oneui_4)
          else -> windowBackground
        }
        blockInteractions()
      }
    }

    val imageView = ImageView(context).apply {
      scaleType = ImageView.ScaleType.CENTER_CROP
      setBackgroundColor(backgroundColor)
      blockInteractions()
    }

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
          // frame long enough to absorb any scheduling jitter on this callback.
          //
          // The overlay is built while the activity is still being created, well before
          // its first frame, so the playthrough is timed from the first drawn frame.
          animatedDrawable = drawable
          animationDurationMs = durationMs
          drawable.repeatCount = AnimatedImageDrawable.REPEAT_INFINITE

          drawable.registerAnimationCallback(object : Animatable2.AnimationCallback() {
            override fun onAnimationStart(d: Drawable?) {
              drawable.unregisterAnimationCallback(this)

              if (animationStartUptimeMs != 0L) {
                return
              }

              animationStartUptimeMs = SystemClock.uptimeMillis()

              if (durationMs > 0) {
                val stopRunnable = Runnable { stopAnimation() }
                stopAnimationRunnable = stopRunnable
                mainHandler.postDelayed(stopRunnable, durationMs)
              }
            }
          })

          drawable.start()
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

  // Keep touches from falling through to the content underneath.
  private fun View.blockInteractions() {
    isClickable = true
    isFocusable = false
    importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS
  }

  private companion object {
    const val FADE_OUT_DURATION_MS = 250L
  }
}
