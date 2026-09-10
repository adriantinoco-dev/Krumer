const { withGradleProperties } = require('@expo/config-plugins');

const ANDROID_ABIS = ['armeabi-v7a', 'arm64-v8a', 'x86', 'x86_64'];
const GRADLE_PROPERTY = 'reactNativeArchitectures';

function withAndroidArchitectures(config) {
  return withGradleProperties(config, (mod) => {
    let found = false;

    mod.modResults = mod.modResults.filter((entry) => {
      if (entry.type !== 'property' || entry.key !== GRADLE_PROPERTY) {
        return true;
      }

      if (found) {
        return false;
      }

      entry.value = ANDROID_ABIS.join(',');
      found = true;
      return true;
    });

    if (!found) {
      mod.modResults.push({
        type: 'property',
        key: GRADLE_PROPERTY,
        value: ANDROID_ABIS.join(','),
      });
    }

    return mod;
  });
}

module.exports = withAndroidArchitectures;
module.exports.ANDROID_ABIS = ANDROID_ABIS;
module.exports.GRADLE_PROPERTY = GRADLE_PROPERTY;
