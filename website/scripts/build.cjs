// Static packaging, without a bundler. Copy only public files into dist/.
const fs = require('node:fs/promises');
const path = require('node:path');

async function build() {
  const root = path.resolve(__dirname, '..');
  const files = ['index.html', 'styles.css', 'downloads.js', 'assets/krumer-logo.png', 'assets/krumer-icon.png'];
  for (const file of files) {
    const source = path.join(root, file);
    const destination = path.join(root, 'dist', file);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.copyFile(source, destination);
  }
  console.log('Site estático pronto: website/dist/ (' + files.length + ' arquivos públicos).');
}
build().catch(error => { console.error(error); process.exitCode = 1; });
