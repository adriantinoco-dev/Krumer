const fs = require('node:fs');
const path = require('node:path');
const { compileModsAsync } = require('@expo/config-plugins');
// Reuse the icon generator shipped with our installed Expo version.
const { withAndroidIcons } = require('@expo/prebuild-config/build/plugins/icons/withAndroidIcons');

async function main() {
  const projectRoot = path.resolve(__dirname, '..');
  if (!fs.existsSync(path.join(projectRoot, 'android/app/src/main/AndroidManifest.xml'))) {
    console.log('Android project not generated yet; Expo prebuild will generate its icons.');
    return;
  }

  const { expo } = require('../app.json');
  // Expo resolves image paths relative to the process working directory.
  process.chdir(projectRoot);
  // Apply only the icon plugin, preserving other native customizations.
  await compileModsAsync(withAndroidIcons(structuredClone(expo)), {
    projectRoot,
    platforms: ['android'],
  });
  console.log(`Android launcher icons synchronized from ${expo.android.adaptiveIcon.foregroundImage}.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
