const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');
const {
  ANDROID_ABIS,
  GRADLE_PROPERTY,
} = require('../plugins/withAndroidArchitectures');

const mobileRoot = path.resolve(__dirname, '..');

function fail(message) {
  throw new Error(`[android-abis] ${message}`);
}

function validateConfiguration() {
  const gradlePropertiesPath = path.join(mobileRoot, 'android', 'gradle.properties');
  const appConfigPath = path.join(mobileRoot, 'app.json');
  const packagePath = path.join(mobileRoot, 'package.json');
  const gradleProperties = fs.readFileSync(gradlePropertiesPath, 'utf8');
  const appConfig = JSON.parse(fs.readFileSync(appConfigPath, 'utf8'));
  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  const propertyPattern = new RegExp(`^${GRADLE_PROPERTY}=(.+)$`, 'm');
  const match = gradleProperties.match(propertyPattern);

  if (!match) {
    fail(`${GRADLE_PROPERTY} não está definido em android/gradle.properties.`);
  }

  const configuredAbis = match[1].split(',').map((abi) => abi.trim()).filter(Boolean);
  const missingConfiguredAbis = ANDROID_ABIS.filter((abi) => !configuredAbis.includes(abi));
  if (missingConfiguredAbis.length > 0) {
    fail(`android/gradle.properties não inclui: ${missingConfiguredAbis.join(', ')}.`);
  }

  if (!appConfig.expo?.plugins?.includes('./plugins/withAndroidArchitectures')) {
    fail('O config plugin ./plugins/withAndroidArchitectures não está registrado no app.json.');
  }

  if (!packageJson.scripts?.['android:universal']?.includes('build-android-universal.cjs')) {
    fail('O comando npm run android:universal não está configurado.');
  }

  console.log(`[android-abis] Configuração válida: ${ANDROID_ABIS.join(', ')}.`);
}

function collectNativeLibraries(zip) {
  const libraries = new Map(ANDROID_ABIS.map((abi) => [abi, new Set()]));

  for (const entry of Object.values(zip.files)) {
    if (entry.dir || !entry.name.endsWith('.so')) continue;

    const match = entry.name.match(/^(?:base\/)?lib\/([^/]+)\/(.+\.so)$/);
    if (!match || !libraries.has(match[1])) continue;
    libraries.get(match[1]).add(match[2]);
  }

  return libraries;
}

function setDifference(left, right) {
  return [...left].filter((value) => !right.has(value));
}

async function validateArtifact(artifactPath) {
  const resolvedPath = path.resolve(artifactPath);
  if (!fs.existsSync(resolvedPath)) {
    fail(`Artefato não encontrado: ${resolvedPath}`);
  }

  const extension = path.extname(resolvedPath).toLowerCase();
  if (extension !== '.apk' && extension !== '.aab') {
    fail(`Extensão inválida para um artefato Android: ${extension || '(sem extensão)'}.`);
  }

  const zip = await JSZip.loadAsync(fs.readFileSync(resolvedPath));
  const libraries = collectNativeLibraries(zip);

  for (const abi of ANDROID_ABIS) {
    if (libraries.get(abi).size === 0) {
      fail(`${path.basename(resolvedPath)} não contém bibliotecas nativas para ${abi}.`);
    }
  }

  const arm32 = libraries.get('armeabi-v7a');
  const arm64 = libraries.get('arm64-v8a');
  const missingOnArm32 = setDifference(arm64, arm32);
  const missingOnArm64 = setDifference(arm32, arm64);

  if (missingOnArm32.length > 0 || missingOnArm64.length > 0) {
    const details = [
      missingOnArm32.length > 0 ? `ausentes em armeabi-v7a: ${missingOnArm32.join(', ')}` : null,
      missingOnArm64.length > 0 ? `ausentes em arm64-v8a: ${missingOnArm64.join(', ')}` : null,
    ].filter(Boolean).join('; ');
    fail(`As bibliotecas ARM de 32 e 64 bits não são equivalentes (${details}).`);
  }

  const summary = ANDROID_ABIS
    .map((abi) => `${abi}=${libraries.get(abi).size}`)
    .join(', ');
  console.log(`[android-abis] ${path.basename(resolvedPath)} válido (${summary}).`);
}

async function main() {
  validateConfiguration();
  const artifactPath = process.argv[2];
  if (artifactPath) {
    await validateArtifact(artifactPath);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  validateArtifact,
  validateConfiguration,
};
