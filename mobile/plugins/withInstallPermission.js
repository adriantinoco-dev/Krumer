const { withAndroidManifest } = require('@expo/config-plugins');

/**
 * Config plugin que garante a permissão REQUEST_INSTALL_PACKAGES
 * no AndroidManifest.xml, necessária para instalar APKs baixados
 * dentro do app (sistema de atualização via GitHub Releases).
 */
function withInstallPermission(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    const ns = 'http://schemas.android.com/apk/res/android';

    if (!manifest['uses-permission']) {
      manifest['uses-permission'] = [];
    }

    const alreadyHas = manifest['uses-permission'].some(
      (perm) => perm.$?.['android:name'] === 'android.permission.REQUEST_INSTALL_PACKAGES',
    );

    if (!alreadyHas) {
      manifest['uses-permission'].push({
        $: { 'android:name': 'android.permission.REQUEST_INSTALL_PACKAGES' },
      });
    }

    return config;
  });
}

module.exports = withInstallPermission;
