const path = require('path');
const { spawnSync } = require('child_process');
const { ANDROID_ABIS } = require('../plugins/withAndroidArchitectures');
const {
  validateArtifact,
  validateConfiguration,
} = require('./validate-android-abis.cjs');

const mobileRoot = path.resolve(__dirname, '..');
const androidRoot = path.join(mobileRoot, 'android');
const artifactPath = path.join(
  androidRoot,
  'app',
  'build',
  'outputs',
  'apk',
  'release',
  'app-release.apk',
);

async function main() {
  validateConfiguration();

  const gradleArgs = [
    ':app:assembleRelease',
    `-PreactNativeArchitectures=${ANDROID_ABIS.join(',')}`,
    '--no-daemon',
  ];
  const gradleCommand = process.platform === 'win32'
    ? {
        executable: process.env.ComSpec || 'cmd.exe',
        args: ['/d', '/s', '/c', ['gradlew.bat', ...gradleArgs].join(' ')],
      }
    : {
        executable: './gradlew',
        args: gradleArgs,
      };
  const result = spawnSync(
    gradleCommand.executable,
    gradleCommand.args,
    {
      cwd: androidRoot,
      env: process.env,
      stdio: 'inherit',
    },
  );

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`[android-universal] Gradle encerrou com código ${result.status}.`);
  }

  await validateArtifact(artifactPath);
  console.log(`[android-universal] APK universal gerado em ${artifactPath}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
