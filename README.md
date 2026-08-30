<div align="center">
  <img src="frontend/assets/Krumer-logo.svg" alt="Krumer Logo" width="160"/>

  <h1>Krumer</h1>

  <p><strong>Gerenciador de biblioteca pessoal para leitura de livros e quadrinhos.</strong></p>

  <p>
    <img src="https://img.shields.io/badge/plataforma-Windows-blue?style=flat-square&logo=windows" alt="Windows"/>
    <img src="https://img.shields.io/badge/formatos-PDF%20%7C%20EPUB-f97316?style=flat-square" alt="Formatos"/>
    <img src="https://img.shields.io/badge/IA-Google%20Gemini-4285F4?style=flat-square&logo=google" alt="Gemini"/>
    <img src="https://img.shields.io/badge/licença-MIT-green?style=flat-square" alt="Licença"/>
  </p>

  <br/>

  > Organize, leia e acompanhe seu progresso em livros, HQs e quadrinhos —  
  > tudo em um só lugar, no seu computador.

  <br/>

  [⬇️ Baixar agora](#-instalação) · [✨ Funcionalidades](#-funcionalidades) · [🛠️ Para devs](#️-para-desenvolvedores)

</div>

---

## ✨ Funcionalidades

| | |
|---|---|
| 📂 **Escaneamento automático** | Aponte uma pasta e o Krumer detecta livros e séries sozinho |
| 🔄 **Reescaneamento rápido** | Botão dedicado para reescanear a última pasta configurada sem rediálogos |
| 🤖 **Metadados com IA** | Busca título, autor, editora e sinopse via Google Gemini (2.5 Flash / 2.0 Flash) |
| 📖 **Leitor de PDF** | Modos horizontal (página única) e vertical (rolagem contínua), com tela cheia |
| 📗 **Leitor de EPUB** | Suporte a temas (escuro, claro e sépia), tamanho de fonte e tela cheia |
| 🗂️ **Organização inteligente** | Arquivos soltos viram *livros*, pastas com capítulos viram *séries* |
| 🔖 **Progresso de leitura** | Salva página atual, percentual e posição CFI (EPUB) por item automaticamente |
| 📋 **Listas personalizadas** | Crie listas customizadas e uma lista de favoritos padrão |
| 🏷️ **Tags e avaliações** | Classifique com tags e avalie seus livros de 1 a 5 estrelas |
| 🖼️ **Capas automáticas** | Extrai a capa de cada livro durante a varredura da biblioteca |
| 🌍 **Sinopses multilíngues** | Traduza sinopses para 10 idiomas diretamente nas configurações |
| 🎨 **Temas visuais** | Interface em modo escuro, claro ou sépia |
| 🔍 **Busca e ordenação** | Pesquise por título ou autor, ordene por nome, data, avaliação ou progresso |
| 🔔 **Atualizações automáticas** | O app verifica novas versões diariamente e atualiza com barra de progresso |

---

## 🚀 Instalação

Nenhuma configuração necessária. Baixe, instale e use.

**1.** Acesse a aba **[Releases](../../releases)**  
**2.** Baixe o instalador `.exe` mais recente  
**3.** Execute e siga o assistente de instalação  
**4.** Abra o Krumer — pronto ✅

---

## 🔑 Chave da API Gemini (opcional)

O Krumer usa o **Google Gemini** para buscar metadados automaticamente. Essa funcionalidade é totalmente opcional — a biblioteca funciona sem ela, mas título, autor e descrição precisarão ser preenchidos manualmente.

**Para ativar:**

1. Gere sua chave gratuita em [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
2. No Krumer, vá em **Configurações → API Key**
3. Cole sua chave e salve

> 💡 O plano gratuito do Gemini oferece **1.500 requisições/dia** — mais que suficiente para uso pessoal.

---

## 🌍 Idiomas de sinopse suportados

Nas configurações, você pode escolher o idioma em que as sinopses serão buscadas e exibidas:

`Português (BR)` · `English` · `Español` · `Français` · `Deutsch` · `Italiano` · `日本語` · `中文` · `한국어` · `Русский`

Ao trocar o idioma, o Krumer busca os metadados referente ao seu idioma.

---

## 📁 Como organizar sua biblioteca

O Krumer interpreta a estrutura de pastas automaticamente:

```
Minha Biblioteca/
│
├── livro-avulso.pdf          →  📘 Livro
├── outro-livro.epub          →  📘 Livro
│
└── Nome da Serie/            →  🗂️ Pasta
    ├── 1. capitulo.pdf       →  📚 Série  (capítulos agrupados)
    ├── 2. capitulo.pdf
    └── 3. capitulo.epub
```

---

## 📖 Modos de leitura

### PDF
- **Horizontal** — exibe uma página por vez, navegação com setas ou teclado
- **Vertical** — rolagem contínua, ideal para mangás e quadrinhos
- **Tela cheia** — maximiza a área de leitura ocultando a interface

### EPUB
- **Temas** — escuro, claro ou sépia aplicados diretamente no conteúdo do livro
- **Tamanho de fonte** ajustável durante a leitura
- **Tela cheia** — maximiza a área de leitura ocultando a interface

---

## 🛠️ Para desenvolvedores

Se quiser rodar o projeto a partir do código-fonte:

### Pré-requisitos

- Python 3.10+
- Node.js (para o Electron)
- pip

### Configuração do backend

```bash
# 1. Entre na pasta do backend
cd backend

# 2. Crie e ative o ambiente virtual
python -m venv .venv
.venv\Scripts\activate        # Windows PowerShell

# 3. Instale as dependências
pip install -r requirements.txt

# 4. Configure sua chave de API
cp .env.example .env
# Edite o .env e preencha sua GEMINI_API_KEY

# 5. Inicie o servidor
uvicorn main:app --reload
```

### Frontend

Abra `frontend/index.html` em um servidor local ou via Electron.

### Mobile Android

A versao React Native fica em `mobile/` e consome a mesma API FastAPI do backend. O esqueleto inicial ja separa cliente de API, modelos, telas, componentes, leitores, tema, i18n e preferencias locais.

---

## 📦 Tecnologias

<div align="center">

| Camada | Tecnologia |
|--------|------------|
| Desktop | Electron |
| Backend | Python · FastAPI · SQLAlchemy · SQLite |
| Leitura de PDF | PyMuPDF (fitz) · PDF.js |
| Leitura de EPUB | EbookLib · epub.js |
| Metadados com IA | Google Gemini API (2.5 Flash / 2.0 Flash) |
| Frontend | HTML · CSS · JavaScript (vanilla) |
| Atualizações | electron-updater |
| Mobile Android | React Native |

</div>

---

## 🗺️ Roadmap

- [ ] Suporte a CBZ / CBR (quadrinhos em formato de arquivo compactado)
- [~] Sincronização de progresso entre dispositivos (congelada durante o beta)
- [ ] Exportar biblioteca como CSV / JSON
- [~] Versão mobile via React Native em `mobile/`

---

<div align="center">
  <sub>Feito com ☕ por <a href="https://github.com/adriantinoco-dev">adriantinoco-dev</a></sub>
</div>
