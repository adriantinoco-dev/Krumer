const fs = require('node:fs');
const path = require('node:path');

// --- NDK 27 fix (RN 0.86.x requires std::format from NDK 27+) ---
const NDK_VERSION = '27.1.12297006';
const androidBuildGradlePaths = [
  path.join(__dirname, '..', 'android', 'build.gradle'),
  path.join(__dirname, '..', 'android', 'app', 'build.gradle'),
];

for (const gradleFilePath of androidBuildGradlePaths) {
  if (!fs.existsSync(gradleFilePath)) continue;
  let content = fs.readFileSync(gradleFilePath, 'utf8');
  const original = content;
  content = content.replace(/26\.1\.10909125/g, NDK_VERSION);
  if (!content.includes(`ndkVersion "${NDK_VERSION}"`) && !content.includes(`ndkVersion = "${NDK_VERSION}"`)) {
    if (content.includes('ndkVersion')) {
      content = content.replace(/ndkVersion\s+["'].*?["']/, `ndkVersion "${NDK_VERSION}"`);
    }
  }
  content = content.replace(/cppFlags\s+"-std=c\+\+17"/g, 'cppFlags "-std=c++20"');
  content = content.replace(/cppFlags\s+"-std=c\+\+14"/g, 'cppFlags "-std=c++20"');
  if (
    gradleFilePath.endsWith('build.gradle') &&
    gradleFilePath.includes(`${path.sep}android${path.sep}build.gradle`)
  ) {
    if (!content.includes(`rootProject.ext.ndkVersion = "${NDK_VERSION}"`)) {
      content = content.replace(
        /rootProject\.ext\.ndkVersion\s*=\s*["'].*?["']/,
        `rootProject.ext.ndkVersion = "${NDK_VERSION}"`,
      );
    }
  }
  if (content !== original) {
    fs.writeFileSync(gradleFilePath, content, 'utf8');
    console.log(`[ndk-fix] Patched ${path.relative(path.join(__dirname, '..'), gradleFilePath)} -> NDK ${NDK_VERSION} / C++20`);
  }
}

const netInfoRoot = path.join(
  __dirname,
  '..',
  'node_modules',
  '@react-native-community',
  'netinfo',
);
const packagePath = path.join(netInfoRoot, 'package.json');
const gradlePath = path.join(netInfoRoot, 'android', 'build.gradle');

let netInfoAvailable = fs.existsSync(packagePath) && fs.existsSync(gradlePath);
if (!netInfoAvailable) {
  console.warn('[netinfo-gradle9] @react-native-community/netinfo not found, skipping netinfo patch (NDK fix already applied).');
} else {
  const netInfoVersion = JSON.parse(fs.readFileSync(packagePath, 'utf8')).version;
  let gradleSource = fs.readFileSync(gradlePath, 'utf8');

  // Ensure isNewArchitectureEnabled() returns true so NetInfo generates its TurboModule codegen specs
  gradleSource = gradleSource.replace(
    /def isNewArchitectureEnabled\(\) \{[\s\S]*?\}/,
    'def isNewArchitectureEnabled() {\n  return true\n}',
  );

  // Ensure com.facebook.react plugin is applied
  if (gradleSource.includes("apply plugin: 'com.android.library'") && !gradleSource.includes("apply plugin: 'com.facebook.react'")) {
    gradleSource = gradleSource.replace(
      "apply plugin: 'com.android.library'",
      "apply plugin: 'com.android.library'\napply plugin: 'com.facebook.react'",
    );
  }

  // Add task ordering guard so generateCodegenArtifactsFromSchema runs before compile*JavaWithJavac
  const codegenTaskGuard = [
    "",
    "afterEvaluate {",
    "  if (tasks.findByName('generateCodegenArtifactsFromSchema')) {",
    "    tasks.matching { it.name.endsWith('JavaWithJavac') }.configureEach {",
    "      dependsOn('generateCodegenArtifactsFromSchema')",
    "    }",
    "  }",
    "}"
  ].join('\n');

  if (!gradleSource.includes("dependsOn('generateCodegenArtifactsFromSchema')")) {
    gradleSource += codegenTaskGuard;
  }

  fs.writeFileSync(gradlePath, gradleSource, 'utf8');
  console.log(`[netinfo-gradle9] Configured NetInfo ${netInfoVersion} codegen task ordering.`);
}

// Patch React Native 0.86.2 graphicsConversions.h C++ formatting bug (fallback if NDK 26 is still used)
const graphicsConversionsPath = path.join(
  __dirname,
  '..',
  'node_modules',
  'react-native',
  'ReactCommon',
  'react',
  'renderer',
  'core',
  'graphicsConversions.h',
);

if (fs.existsSync(graphicsConversionsPath)) {
  let headerContent = fs.readFileSync(graphicsConversionsPath, 'utf8');
  if (headerContent.includes('return std::format("{}%", dimension.value);')) {
    headerContent = headerContent.replace(
      'return std::format("{}%", dimension.value);',
      'return std::to_string(dimension.value) + "%";'
    );
    fs.writeFileSync(graphicsConversionsPath, headerContent, 'utf8');
    console.log('[netinfo-gradle9] Patched React Native graphicsConversions.h C++ fallback (std::format -> to_string).');
  }
}
