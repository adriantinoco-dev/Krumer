const { withDangerousMod, withMainActivity, withMainApplication } = require('@expo/config-plugins');
const fs = require('fs/promises');
const path = require('path');

// Keep the native volume-key handler outside android/ so clean prebuilds restore it.
module.exports = function withVolumeKeys(config) {
  config = withMainApplication(config, (mod) => {
    const registration = 'add(com.adriantinoco.krumer.volume.KrumerVolumeKeysPackage())';
    if (!mod.modResults.contents.includes(registration)) {
      const anchor = /PackageList\(this\)\.packages\.apply\s*\{/;
      if (!anchor.test(mod.modResults.contents)) {
        throw new Error('Cannot register KrumerVolumeKeys: MainApplication package list not found.');
      }
      mod.modResults.contents = mod.modResults.contents.replace(anchor, (match) => `${match}\n          ${registration}`);
    }
    return mod;
  });

  config = withMainActivity(config, (mod) => {
    let contents = mod.modResults.contents.replace(/\r\n/g, '\n');
    const importLine = 'import com.adriantinoco.krumer.volume.KrumerVolumeKeysModule';
    if (!contents.includes('import android.view.KeyEvent')) {
      contents = contents.replace('import android.os.Bundle', 'import android.os.Bundle\nimport android.view.KeyEvent');
    }
    if (!contents.includes('import com.facebook.react.bridge.Arguments')) {
      contents = contents.replace(
        'import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled',
        'import com.facebook.react.bridge.Arguments\nimport com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled',
      );
    }
    if (!contents.includes(importLine)) {
      contents = contents.replace(
        'import com.facebook.react.defaults.DefaultReactActivityDelegate',
        'import com.facebook.react.defaults.DefaultReactActivityDelegate\nimport com.adriantinoco.krumer.volume.KrumerVolumeKeysModule',
      );
    }
    if (!contents.includes('override fun dispatchKeyEvent')) {
      const marker = '  /**\n    * Align the back button behavior';
      if (!contents.includes(marker)) {
        throw new Error('Cannot register KrumerVolumeKeys: MainActivity back-button anchor not found.');
      }
      const handler = `  override fun dispatchKeyEvent(event: KeyEvent): Boolean {
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

`;
      contents = contents.replace(marker, `${handler}${marker}`);
    }
    mod.modResults.contents = contents;
    return mod;
  });

  return withDangerousMod(config, ['android', async (mod) => {
    const destination = path.join(mod.modRequest.platformProjectRoot, 'app/src/main/java/com/adriantinoco/krumer/volume');
    await fs.mkdir(destination, { recursive: true });
    for (const file of ['KrumerVolumeKeysModule.kt', 'KrumerVolumeKeysPackage.kt']) {
      await fs.copyFile(path.join(__dirname, 'volume-keys', file), path.join(destination, file));
    }
    return mod;
  }]);
};
