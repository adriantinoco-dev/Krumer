const { withDangerousMod, withMainApplication } = require('@expo/config-plugins');
const fs = require('fs/promises');
const path = require('path');

// Keep custom native sources outside android/ so clean prebuilds restore them.
module.exports = function withPdfThumbnail(config) {
  config = withMainApplication(config, (mod) => {
    const registration = 'add(com.adriantinoco.krumer.pdf.KrumerPdfThumbnailPackage())';
    if (!mod.modResults.contents.includes(registration)) {
      const anchor = /PackageList\(this\)\.packages\.apply\s*\{/;
      if (!anchor.test(mod.modResults.contents)) {
        throw new Error('Cannot register KrumerPdfThumbnail: MainApplication package list not found.');
      }
      mod.modResults.contents = mod.modResults.contents.replace(anchor, (match) => `${match}\n          ${registration}`);
    }
    return mod;
  });

  return withDangerousMod(config, ['android', async (mod) => {
    const destination = path.join(mod.modRequest.platformProjectRoot, 'app/src/main/java/com/adriantinoco/krumer/pdf');
    await fs.mkdir(destination, { recursive: true });
    for (const file of ['KrumerPdfThumbnailModule.kt', 'KrumerPdfThumbnailPackage.kt']) {
      await fs.copyFile(path.join(__dirname, 'pdf-thumbnail', file), path.join(destination, file));
    }
    return mod;
  }]);
};
