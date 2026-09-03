const fs = require('node:fs');
const path = require('node:path');

const mobileRoot = path.resolve(__dirname, '..');
const webviewRoot = path.join(mobileRoot, 'node_modules', 'react-native-webview');
const packagePath = path.join(webviewRoot, 'package.json');
const clientPath = path.join(
  webviewRoot,
  'android',
  'src',
  'main',
  'java',
  'com',
  'reactnativecommunity',
  'webview',
  'RNCWebViewClient.java',
);

if (!fs.existsSync(packagePath) || !fs.existsSync(clientPath)) {
  console.warn('[pdf-webview-range] react-native-webview is not installed; skipping range route patch.');
  process.exit(0);
}

const version = JSON.parse(fs.readFileSync(packagePath, 'utf8')).version;
if (version !== '13.16.1') {
  throw new Error(`[pdf-webview-range] Unsupported react-native-webview ${version}; expected 13.16.1.`);
}

let source = fs.readFileSync(clientPath, 'utf8').replace(/\r\n/g, '\n');
const marker = '// KRUMER_PDF_RANGE_ROUTE_START';
if (source.includes(marker)) {
  const endMarker = '// KRUMER_PDF_RANGE_ROUTE_END';
  const routeBlock = new RegExp(
    `\\n(?:[ \\t]*\\n)*${marker}[\\s\\S]*?${endMarker}[ \\t]*\\n*`,
  );
  if (!routeBlock.test(source)) {
    throw new Error('[pdf-webview-range] Existing range patch is incomplete.');
  }
  source = source.replace(routeBlock, '\n');
}

if (!source.includes('import android.net.Uri;')) {
  source = source.replace(
    'import android.graphics.Bitmap;\n',
    'import android.graphics.Bitmap;\nimport android.net.Uri;\n',
  );
}
for (const importLine of [
  'import java.io.ByteArrayInputStream;\n',
  'import java.io.File;\n',
  'import java.io.FileInputStream;\n',
  'import java.io.FilterInputStream;\n',
  'import java.io.IOException;\n',
  'import java.io.InputStream;\n',
  'import java.io.RandomAccessFile;\n',
  'import java.util.HashMap;\n',
  'import java.util.Map;\n',
]) {
  source = source.replaceAll(importLine, '');
}
source = source.replace(
  'import java.util.concurrent.atomic.AtomicReference;\n',
  'import java.io.File;\nimport java.io.FileInputStream;\nimport java.io.FilterInputStream;\nimport java.io.IOException;\nimport java.io.InputStream;\nimport java.util.HashMap;\nimport java.util.Map;\nimport java.util.concurrent.atomic.AtomicReference;\n',
);

const routeMethods = `
${marker}
    private static final long KRUMER_PDF_MAX_RANGE_BYTES = 1024L * 1024L;

    private static boolean isAllowedKrumerPdfPath(WebView view, File file) throws IOException {
        String candidate = file.getCanonicalPath();
        android.content.Context context = view.getContext();
        File[] roots = new File[] {
                context.getCacheDir(),
                context.getFilesDir(),
                context.getNoBackupFilesDir(),
                context.getExternalCacheDir(),
                context.getExternalFilesDir(null),
        };
        for (File root : roots) {
            if (root == null) continue;
            String rootPath = root.getCanonicalPath();
            if (candidate.equals(rootPath) || candidate.startsWith(rootPath + File.separator)) {
                return true;
            }
        }
        return false;
    }

    private static WebResourceResponse interceptKrumerPdfRange(WebView view, String rawUrl) {
        try {
            Uri uri = Uri.parse(rawUrl);
            boolean isLocalHttpRoute = ("http".equalsIgnoreCase(uri.getScheme())
                    || "https".equalsIgnoreCase(uri.getScheme()))
                    && "rangefile.localhost".equalsIgnoreCase(uri.getHost());
            boolean isLegacyFileRoute = "file".equalsIgnoreCase(uri.getScheme());
            if ((!isLocalHttpRoute && !isLegacyFileRoute)
                    || !"1".equals(uri.getQueryParameter("krumerRange"))) {
                return null;
            }
            String path;
            if (isLocalHttpRoute) {
                String source = uri.getQueryParameter("path");
                Uri sourceUri = source == null ? null : Uri.parse(source);
                if (sourceUri == null || !"file".equalsIgnoreCase(sourceUri.getScheme())) {
                    return null;
                }
                path = sourceUri.getPath();
            } else {
                path = uri.getPath();
            }
            String startValue = uri.getQueryParameter("start");
            String endValue = uri.getQueryParameter("end");
            if (path == null || path.indexOf('\\0') >= 0
                    || path.contains("/../") || path.endsWith("/..")
                    || startValue == null || endValue == null) {
                return null;
            }
            long start = Long.parseLong(startValue);
            long end = Long.parseLong(endValue);
            if (start < 0 || end <= start || end - start > KRUMER_PDF_MAX_RANGE_BYTES) {
                return null;
            }

            File file = new File(path);
            long totalSize = file.length();
            if (!file.isFile() || !file.canRead() || !isAllowedKrumerPdfPath(view, file)
                    || start >= totalSize || end > totalSize) {
                return null;
            }
            final long length = end - start;
            FileInputStream input = new FileInputStream(file);
            input.getChannel().position(start);
            InputStream bounded = new FilterInputStream(input) {
                private long remaining = length;

                @Override
                public int read() throws IOException {
                    if (remaining <= 0) return -1;
                    int value = super.read();
                    if (value >= 0) remaining--;
                    return value;
                }

                @Override
                public int read(byte[] buffer, int offset, int count) throws IOException {
                    if (remaining <= 0) return -1;
                    int limitedCount = (int) Math.min((long) count, remaining);
                    int read = super.read(buffer, offset, limitedCount);
                    if (read > 0) remaining -= read;
                    return read;
                }

                @Override
                public long skip(long count) throws IOException {
                    long skipped = super.skip(Math.min(count, remaining));
                    if (skipped > 0) remaining -= skipped;
                    return skipped;
                }
            };

            Map<String, String> headers = new HashMap<>();
            headers.put("Access-Control-Allow-Origin", "*");
            headers.put("Accept-Ranges", "bytes");
            headers.put("Cache-Control", "no-store");
            headers.put("Content-Length", String.valueOf(length));
            headers.put("X-Total-Size", String.valueOf(totalSize));
            return new WebResourceResponse(
                    "application/octet-stream",
                    null,
                    200,
                    "OK",
                    headers,
                    bounded);
        } catch (IOException | NumberFormatException | SecurityException error) {
            Log.w(TAG, "Unable to serve Krumer PDF byte range", error);
            return null;
        }
    }

    @Override
    public WebResourceResponse shouldInterceptRequest(WebView view, String url) {
        WebResourceResponse response = interceptKrumerPdfRange(view, url);
        return response != null ? response : super.shouldInterceptRequest(view, url);
    }

    @TargetApi(Build.VERSION_CODES.N)
    @Override
    public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
        WebResourceResponse response = interceptKrumerPdfRange(view, request.getUrl().toString());
        return response != null ? response : super.shouldInterceptRequest(view, request);
    }
    // KRUMER_PDF_RANGE_ROUTE_END

`;
const anchor = '    @Override\n    public void onReceivedHttpAuthRequest';
if (!source.includes(anchor)) {
  throw new Error('[pdf-webview-range] Could not locate WebViewClient insertion point.');
}
source = source.replace(anchor, `${routeMethods}${anchor}`);
fs.writeFileSync(clientPath, source, 'utf8');
console.log('[pdf-webview-range] Added binary PDF range interception to RNCWebViewClient.');
