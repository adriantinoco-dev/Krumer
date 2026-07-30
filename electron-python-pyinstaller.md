# Empacotando Python com Electron via PyInstaller

Guia para distribuir um app Electron+Python sem exigir que o usuário instale o Python.

---

## Como funciona

Em vez de chamar `python script.py`, o Electron vai chamar um `.exe` gerado pelo PyInstaller que já contém o interpretador Python embutido. O usuário final não precisa instalar nada além do seu app.

---

## Passo 1 — Instalar o PyInstaller

```powershell
pip install pyinstaller
```

---

## Passo 2 — Gerar o executável do script Python

Na pasta do seu projeto, rode:

```powershell
pyinstaller --onefile seu_script.py
```

O executável será gerado em:

```
dist/
└── seu_script.exe   ✅ standalone, sem dependência de Python
```

> `--onefile` empacota tudo em um único `.exe`. Se preferir uma pasta com arquivos separados (carrega mais rápido), omita essa flag.

---

## Passo 3 — Mover o executável para dentro do projeto Electron

Crie uma pasta `resources/` na raiz do projeto e copie o `.exe` para lá:

```
meu-app/
├── resources/
│   └── seu_script.exe   ← coloque aqui
├── main.js
├── package.json
└── ...
```

---

## Passo 4 — Atualizar o código Electron

Substitua a chamada antiga:

```js
// ❌ Antes — depende do Python instalado no sistema
const { spawn } = require('child_process');
spawn('python', ['seu_script.py']);
```

Pelo novo código que chama o `.exe` diretamente:

```js
// ✅ Depois — usa o executável embutido
const { spawn } = require('child_process');
const path = require('path');

const scriptPath = path.join(__dirname, 'resources', 'seu_script.exe');
const processo = spawn(scriptPath);

processo.stdout.on('data', (data) => {
  console.log(`saída: ${data}`);
});

processo.stderr.on('data', (data) => {
  console.error(`erro: ${data}`);
});
```

---

## Passo 5 — Incluir o `.exe` no build do Electron

No `package.json`, configure o empacotador para incluir a pasta `resources/`:

### Com electron-builder:

```json
{
  "build": {
    "extraResources": [
      {
        "from": "resources/",
        "to": "resources/"
      }
    ]
  }
}
```

E no código, use `process.resourcesPath` para localizar o arquivo em produção:

```js
const isDev = !app.isPackaged;

const scriptPath = isDev
  ? path.join(__dirname, 'resources', 'seu_script.exe')
  : path.join(process.resourcesPath, 'resources', 'seu_script.exe');

const processo = spawn(scriptPath);
```

---

## Resultado

| Antes | Depois |
|---|---|
| Usuário precisa instalar Python | ✅ Sem dependências externas |
| `spawn('python', [...])` | `spawn('seu_script.exe')` |
| Erro `ENOENT` ao abrir o app | ✅ App abre normalmente |

---

## Observações

- O `.exe` gerado pode ter **30–80 MB** dependendo das bibliotecas usadas — é normal.
- Se o script usar bibliotecas como `pandas`, `numpy`, etc., o PyInstaller as detecta automaticamente.
- Para testar, basta rodar `dist/seu_script.exe` diretamente no PowerShell antes de integrar ao Electron.
