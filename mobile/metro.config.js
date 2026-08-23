const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Stub nativo que quebra na web: react-native-pdf depende de
// react-native/Libraries/Utilities/codegenNativeComponent (native-only).
// Em web, redireciona para um módulo vazio para não envenenar o cache do Metro
// e não quebrar `expo start --web` nem `expo run:android`.
const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && moduleName === 'react-native-pdf') {
    return {
      filePath: path.resolve(__dirname, 'src/readers/__stubs__/PdfStub.web.js'),
      type: 'sourceFile',
    };
  }
  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
