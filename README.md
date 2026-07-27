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
| 🤖 **Metadados com IA** | Busca título, autor, editora e descrição via Google Gemini |
| 📖 **Leitor embutido** | Lê PDF e EPUB direto no app — sem precisar de outro programa |
| 🗂️ **Organização inteligente** | Arquivos soltos viram *livros*, pastas com capítulos viram *séries* |
| 🔖 **Progresso de leitura** | Salva página atual e percentual por item automaticamente |
| 🏷️ **Tags e avaliações** | Classifique e avalie seus livros de 1 a 5 estrelas |
| 🖼️ **Capas automáticas** | Extrai a capa de cada livro na varredura da biblioteca |

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

## 📁 Como organizar sua biblioteca

O Krumer interpreta a estrutura de pastas automaticamente:

```
Minha Biblioteca/
│
├── livro-avulso.pdf          →  📘 Livro
├── outro-livro.epub          →  📘 Livro
│
└── Nome da Serie/
    ├── capitulo-01.pdf       →  📚 Série  (capítulos agrupados)
    ├── capitulo-02.pdf
    └── capitulo-03.epub
```

---

## 🛠️ Para desenvolvedores

Se quiser rodar o projeto a partir do código-fonte:

### Pré-requisitos

- Python 3.10+
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

> ⚠️ **Nunca suba o `.env` para o GitHub.** Use o `.env.example` como referência e mantenha o `.env` no `.gitignore`.

---

## 📦 Tecnologias

<div align="center">

| Camada | Tecnologia |
|--------|------------|
| Backend | Python · FastAPI · SQLAlchemy · SQLite |
| Leitura de arquivos | PyMuPDF (PDF) · EbookLib (EPUB) |
| Metadados com IA | Google Gemini API |
| Frontend | HTML · CSS · JavaScript |

</div>

---

## 🗺️ Roadmap

- [ ] Suporte a CBZ / CBR (quadrinhos)
- [ ] Sincronização de progresso entre dispositivos
- [ ] Temas claros / personalizáveis
- [ ] Exportar biblioteca como CSV / JSON

---

<div align="center">
  <sub>Feito com ☕ por <a href="https://github.com/adriantinoco-dev">adriantinoco-dev</a></sub>
</div>
