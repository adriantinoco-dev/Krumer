package com.adriantinoco.krumer.volume

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class KrumerVolumeKeysModule(
  reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {

  init {
    enabled = false
  }

  override fun getName() = NAME

  @ReactMethod
  fun setEnabled(value: Boolean) {
    enabled = value
  }

  @ReactMethod
  fun addListener(eventName: String) = Unit

  @ReactMethod
  fun removeListeners(count: Double) = Unit

  override fun invalidate() {
    enabled = false
    super.invalidate()
  }

  companion object {
    const val NAME = "KrumerVolumeKeys"
    const val EVENT_NAME = "KrumerVolumeKey"

    @Volatile
    var enabled = false
      private set
  }
}
