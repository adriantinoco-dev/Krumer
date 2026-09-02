package com.adriantinoco.krumer

import android.os.Build
import android.os.Bundle
import android.view.KeyEvent
import android.view.WindowManager

import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.bridge.Arguments
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate
import com.adriantinoco.krumer.volume.KrumerVolumeKeysModule

import expo.modules.ReactActivityDelegateWrapper

class MainActivity : ReactActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    // Set the theme to AppTheme BEFORE onCreate to support
    // coloring the background, status bar, and navigation bar.
    // This is required for expo-splash-screen.
    setTheme(R.style.AppTheme);
    super.onCreate(null)

    window.attributes = window.attributes.apply {
      rotationAnimation = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        WindowManager.LayoutParams.ROTATION_ANIMATION_SEAMLESS
      } else {
        WindowManager.LayoutParams.ROTATION_ANIMATION_JUMPCUT
      }
    }
  }

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "main"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate {
    return ReactActivityDelegateWrapper(
          this,
          BuildConfig.IS_NEW_ARCHITECTURE_ENABLED,
          object : DefaultReactActivityDelegate(
              this,
              mainComponentName,
              fabricEnabled
          ){})
  }

  override fun dispatchKeyEvent(event: KeyEvent): Boolean {
    val isVolumeKey = event.keyCode == KeyEvent.KEYCODE_VOLUME_UP ||
      event.keyCode == KeyEvent.KEYCODE_VOLUME_DOWN

    if (KrumerVolumeKeysModule.enabled && isVolumeKey) {
      if (event.action == KeyEvent.ACTION_DOWN || event.action == KeyEvent.ACTION_UP) {
        val direction = if (event.keyCode == KeyEvent.KEYCODE_VOLUME_UP) "next" else "previous"
        val phase = when {
          event.action == KeyEvent.ACTION_UP -> "release"
          event.repeatCount > 0 -> "repeat"
          else -> "press"
        }
        val eventValue = Arguments.createMap().apply {
          putString("direction", direction)
          putString("phase", phase)
          putInt("repeatCount", event.repeatCount)
          putDouble("eventTime", event.eventTime.toDouble())
        }
        (application as? MainApplication)
          ?.reactHost
          ?.currentReactContext
          ?.emitDeviceEvent(KrumerVolumeKeysModule.EVENT_NAME, eventValue)
      }
      return true
    }

    return super.dispatchKeyEvent(event)
  }

  /**
    * Align the back button behavior with Android S
    * where moving root activities to background instead of finishing activities.
    * @see <a href="https://developer.android.com/reference/android/app/Activity#onBackPressed()">onBackPressed</a>
    */
  override fun invokeDefaultOnBackPressed() {
      if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.R) {
          if (!moveTaskToBack(false)) {
              // For non-root activities, use the default implementation to finish them.
              super.invokeDefaultOnBackPressed()
          }
          return
      }

      // Use the default back button implementation on Android S
      // because it's doing more than [Activity.moveTaskToBack] in fact.
      super.invokeDefaultOnBackPressed()
  }
}
