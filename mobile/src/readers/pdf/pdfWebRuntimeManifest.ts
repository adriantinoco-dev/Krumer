/**
 * Contrato de dependências do runtime PDF WebView.
 *
 * As versões permanecem centralizadas para que o bridge e os artefatos
 * vendorizados só mudem juntos em uma nova fase do leitor.
 */
export const PDF_WEB_RUNTIME_MANIFEST = Object.freeze({
  protocolVersion: 1,
  pdfjsVersion: '5.5.207',
  pdfjsPackage: 'pdfjs-dist',
  foliateRepository: 'https://github.com/readest/foliate-js',
  foliateCommit: 'ca3f118269f8d78811ef17a1b147363c321273d7',
  foliateModules: ['pdf.js', 'fixed-layout.js', 'view.js'] as const,
  rangeChunkSize: 256 * 1024,
  maxConcurrentRanges: 2,
});

export type PdfWebRuntimeManifest = typeof PDF_WEB_RUNTIME_MANIFEST;
