const { withAppBuildGradle, withProjectBuildGradle } = require('@expo/config-plugins');

const NDK_VERSION = '27.1.12297006';

/**
 * Config plugin que garante NDK 27.1.12297006 e C++20.
 * Necessário porque React Native 0.86.x usa std::format (C++20) em graphicsConversions.h,
 * e NDK 26.x não possui std::format na libc++.
 *
 * Sem este fix o build falha com:
 *   graphicsConversions.h:71:14: error: no member named 'format' in namespace 'std'
 */
function withNdk27(config) {
  config = withProjectBuildGradle(config, (config) => {
    let contents = config.modResults.contents;
    // Corrige NDK 26 -> 27 no android/build.gradle (rootProject.ext.ndkVersion)
    if (contents.includes('26.1.10909125')) {
      contents = contents.replace(/26\.1\.10909125/g, NDK_VERSION);
    }
    // Garante que rootProject.ext.ndkVersion existe e está correto
    if (!contents.includes(NDK_VERSION)) {
      // Fallback: injeta após linha apply plugin se não encontrar ndkVersion
      if (!contents.includes('ndkVersion')) {
        contents = contents.replace(
          /rootProject\.ext\.ndkVersion\s*=\s*["'].*?["']/,
          `rootProject.ext.ndkVersion = "${NDK_VERSION}"`
        );
        if (!contents.includes(NDK_VERSION)) {
          contents += `\nrootProject.ext.ndkVersion = "${NDK_VERSION}"\n`;
        }
      }
    }
    config.modResults.contents = contents;
    return config;
  });

  config = withAppBuildGradle(config, (config) => {
    let contents = config.modResults.contents;
    // NDK 26 -> 27
    contents = contents.replace(/26\.1\.10909125/g, NDK_VERSION);
    contents = contents.replace(/ndkVersion\s+["']26\..*?["']/g, `ndkVersion "${NDK_VERSION}"`);
    // Garantir ndkVersion dentro do bloco android { }
    if (!contents.includes(`ndkVersion "${NDK_VERSION}"`)) {
      contents = contents.replace(
        /android\s*\{/,
        `android {\n    ndkVersion "${NDK_VERSION}"`
      );
    }
    // C++17 -> C++20 (std::format requer C++20)
    contents = contents.replace(/-std=c\+\+17/g, '-std=c++20');
    contents = contents.replace(/-std=c\+\+14/g, '-std=c++20');
    // Remover duplicação de rootProject.ext.ndkVersion dentro do bloco android, se existir
    // (o app/build.gradle não deve definir rootProject.ext, apenas ndkVersion)
    contents = contents.replace(/^\s*rootProject\.ext\.ndkVersion.*\n/m, '');
    config.modResults.contents = contents;
    return config;
  });

  return config;
}

module.exports = withNdk27;
