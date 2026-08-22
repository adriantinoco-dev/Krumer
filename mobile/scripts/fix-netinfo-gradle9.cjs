const fs = require('node:fs');
const path = require('node:path');

const netInfoRoot = path.join(
  __dirname,
  '..',
  'node_modules',
  '@react-native-community',
  'netinfo',
);
const packagePath = path.join(netInfoRoot, 'package.json');
const gradlePath = path.join(netInfoRoot, 'android', 'build.gradle');

if (!fs.existsSync(packagePath) || !fs.existsSync(gradlePath)) {
  throw new Error(
    '[netinfo-gradle9] @react-native-community/netinfo is not installed. Run npm install first.',
  );
}

const netInfoVersion = JSON.parse(fs.readFileSync(packagePath, 'utf8')).version;
const gradleSource = fs.readFileSync(gradlePath, 'utf8');
const pluginsBlock = [
  'plugins {',
  "  id 'com.android.library'",
  "  id 'com.facebook.react'",
  '}',
].join('\n');
const codegenGuard = [
  '',
  '// NetInfo 12.0.1 does not declare reliable Codegen task ordering on Gradle 9.',
  '// Always recreate the generated TurboModule spec before Java compilation.',
  'if (isNewArchitectureEnabled()) {',
  "  tasks.named('generateCodegenArtifactsFromSchema').configure {",
  "    outputs.doNotCacheIf('NetInfo 12 / Gradle 9 Codegen workaround') { true }",
  '    outputs.upToDateWhen { false }',
  '  }',
  '',
  "  tasks.matching { it.name.endsWith('JavaWithJavac') }.configureEach {",
  "    dependsOn('generateCodegenArtifactsFromSchema')",
  '  }',
  '}',
].join('\n');

if (gradleSource.includes(pluginsBlock) && gradleSource.includes(codegenGuard)) {
  console.log(`[netinfo-gradle9] NetInfo ${netInfoVersion} is already compatible.`);
  process.exit(0);
}

const legacyPluginApplication =
  /apply plugin: ['"]com\.android\.library['"]\r?\n\r?\nif \(isNewArchitectureEnabled\(\)\) \{\r?\n\s+apply plugin: ['"]com\.facebook\.react['"]\r?\n\}/;

let patchedGradleSource = gradleSource;

if (legacyPluginApplication.test(patchedGradleSource)) {
  patchedGradleSource = patchedGradleSource.replace(
    legacyPluginApplication,
    pluginsBlock,
  );
} else if (!patchedGradleSource.includes(pluginsBlock)) {
  throw new Error(
    `[netinfo-gradle9] NetInfo ${netInfoVersion} has an unknown Android Gradle layout. ` +
      'Review the upstream package before building.',
  );
}

if (!patchedGradleSource.includes(codegenGuard)) {
  patchedGradleSource = patchedGradleSource.replace(
    pluginsBlock,
    pluginsBlock + codegenGuard,
  );
}

fs.writeFileSync(
  gradlePath,
  patchedGradleSource,
  'utf8',
);

console.log(`[netinfo-gradle9] Applied the Gradle 9 fix to NetInfo ${netInfoVersion}.`);
