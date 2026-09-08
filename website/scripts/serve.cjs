// Local preview only. No API, credentials, or runtime dependencies.
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const contentTypes = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/styles.css': ['styles.css', 'text/css; charset=utf-8'],
  '/downloads.js': ['downloads.js', 'text/javascript; charset=utf-8'],
  '/assets/krumer-logo.png': ['assets/krumer-logo.png', 'image/png'],
  '/assets/krumer-icon.png': ['assets/krumer-icon.png', 'image/png'],
  '/assets/krumer-pc-screenshot.png': ['assets/krumer-pc-screenshot.png', 'image/png'],
  '/assets/krumer-mobile-screenshot.png': ['assets/krumer-mobile-screenshot.png', 'image/png'],
};

function createServer() {
  return http.createServer(async (req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    const entry = contentTypes[pathname];
    if (!entry || !['GET', 'HEAD'].includes(req.method)) {
      res.writeHead(404); res.end('Not found'); return;
    }
    try {
      const bytes = await fs.readFile(path.join(root, entry[0]));
      res.writeHead(200, { 'Content-Type': entry[1], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      res.end(req.method === 'HEAD' ? undefined : bytes);
    } catch { res.writeHead(500); res.end('Preview unavailable'); }
  });
}

if (require.main === module) {
  const server = createServer();
  server.on('error', error => { console.error(error.message); process.exitCode = 1; });
  server.listen(Number(process.env.KRUMER_SITE_PORT || 4173), '127.0.0.1', () => {
    console.log('Local: http://127.0.0.1:' + server.address().port);
  });
}

module.exports = { createServer };
