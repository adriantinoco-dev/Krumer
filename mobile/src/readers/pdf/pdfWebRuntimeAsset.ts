import { Asset } from 'expo-asset';

const PDF_WEB_RUNTIME_ASSET = require('../../../assets/pdf-web/pdf-runtime.html');

let cachedRuntimeUri: string | null = null;
let pendingRuntimeUri: Promise<string> | null = null;

export function getCachedPdfWebRuntimeUri(): string | null {
  return cachedRuntimeUri;
}

export function preparePdfWebRuntime(): Promise<string> {
  if (cachedRuntimeUri) return Promise.resolve(cachedRuntimeUri);
  if (pendingRuntimeUri) return pendingRuntimeUri;

  const asset = Asset.fromModule(PDF_WEB_RUNTIME_ASSET);
  pendingRuntimeUri = asset.downloadAsync()
    .then(() => {
      const uri = asset.localUri ?? asset.uri;
      if (!uri) throw new Error('PDF WebView runtime asset is unavailable.');
      cachedRuntimeUri = uri;
      return uri;
    })
    .finally(() => {
      pendingRuntimeUri = null;
    });
  return pendingRuntimeUri;
}
