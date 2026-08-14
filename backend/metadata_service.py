"""
Serviço de busca de metadados via API Gemini.
Metadados são retornados para preview/aplicação no banco — arquivos originais não são alterados.
"""

import json
import os
import re
import time
import datetime
from pathlib import Path
from typing import Generator

from database import LIBRARIAN_DIR

ENV_PATH = LIBRARIAN_DIR / ".env"
LOCAL_ENV_PATH = Path(__file__).parent / ".env"

try:
    from dotenv import load_dotenv
    if LOCAL_ENV_PATH.exists():
        load_dotenv(dotenv_path=LOCAL_ENV_PATH, override=True)
    if ENV_PATH.exists():
        load_dotenv(dotenv_path=ENV_PATH, override=True)
except ImportError:
    pass

try:
    from google import genai
    from google.genai import types
except ImportError:
    genai = None
    types = None

CACHE_PATH = LIBRARIAN_DIR / "metadados_cache.json"
DAILY_COUNT_PATH = LIBRARIAN_DIR / "metadata_daily_count.json"
DAILY_LIMIT = 1500
RATE_LIMIT_SLEEP = 2.5

TOKENS_PARA_REMOVER = [
    "pt-br", "ptbr", "scan", "hq", "cbr", "v1", "v2", "v3",
    "ed", "edicao", "ebook", "digital", "completo", "revisado",
]

SYSTEM_INSTRUCTION = """Você é um assistente especializado em metadados de livros e graphic novels.
Suas respostas devem conter APENAS a estrutura JSON especificada."""

SYNOPSIS_LANG_MAP = {
    "pt-br": "português do Brasil",
    "en": "English",
    "es": "español",
    "fr": "français",
    "de": "Deutsch",
    "it": "italiano",
    "ja": "japonês",
    "zh": "chinês simplificado",
    "ko": "coreano",
    "ru": "russo",
}

PROMPT_TEMPLATE = """Com base no título "{titulo_limpo}", busque e retorne as seguintes informações em JSON:

{{
  "nome_da_obra": "",
  "autor": "",
  "data_de_lancamento": "",
  "sinopse": ""
}}

Regras:
- Retorne APENAS o JSON, sem texto adicional de introdução ou formatação externa.
- Se houver mais de um autor (ex: roteirista e ilustrador), liste ambos no campo "autor".
- Se não encontrar algum campo, deixe como null.
- A sinopse deve ser completa, em {lang_name}."""

MODELOS = [
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-flash-latest",
]


class MetadataServiceError(Exception):
    """Erro de configuração ou limite do serviço de metadados."""


def get_api_key() -> str | None:
    if ENV_PATH.exists():
        try:
            from dotenv import load_dotenv
            load_dotenv(dotenv_path=ENV_PATH, override=True)
        except ImportError:
            pass
    return os.environ.get("GEMINI_API_KEY")


def limpar_nome_arquivo(nome_arquivo: str) -> str:
    """Limpa o nome de um arquivo de livro removendo extensão, separadores e tokens irrelevantes."""
    nome, _ = os.path.splitext(nome_arquivo)
    nome = nome.lower()
    nome = re.sub(r"[\_.]", " ", nome)

    for token in TOKENS_PARA_REMOVER:
        pattern = r"(?<!\S)" + re.escape(token) + r"(?!\S)"
        nome = re.sub(pattern, " ", nome)

    nome = re.sub(r"[\-]", " ", nome)
    nome = re.sub(r"\s+", " ", nome).strip()
    return nome


def _load_json_file(path: Path) -> dict:
    if path.exists():
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def _save_json_file(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def limpar_cache_negativo(cache_path: Path = CACHE_PATH) -> int:
    """
    Remove do arquivo de cache qualquer entrada que seja 'not_found' ou tenha metadados None.
    Retorna a quantidade de entradas removidas.
    """
    if not cache_path.exists():
        return 0
    cache = _load_json_file(cache_path)
    if not isinstance(cache, dict):
        return 0
    chaves_para_remover = [
        k for k, v in cache.items()
        if isinstance(v, dict) and (v.get("status") == "not_found" or v.get("metadados") is None)
    ]
    if chaves_para_remover:
        for k in chaves_para_remover:
            del cache[k]
        _save_json_file(cache_path, cache)
    return len(chaves_para_remover)


def _check_daily_limit() -> None:
    today = datetime.date.today().isoformat()
    data = _load_json_file(DAILY_COUNT_PATH)
    if data.get("date") != today:
        data = {"date": today, "count": 0}
    if data.get("count", 0) >= DAILY_LIMIT:
        raise MetadataServiceError(
            f"Limite diário de {DAILY_LIMIT} requisições à API Gemini atingido. Tente novamente amanhã."
        )


def _increment_daily_count() -> None:
    today = datetime.date.today().isoformat()
    data = _load_json_file(DAILY_COUNT_PATH)
    if data.get("date") != today:
        data = {"date": today, "count": 0}
    data["count"] = data.get("count", 0) + 1
    _save_json_file(DAILY_COUNT_PATH, data)


def obter_metadados_gemini(titulo_limpo: str, api_key: str | None = None, language: str = "en") -> dict | None:
    """Consulta o Gemini para obter metadados em JSON."""
    if genai is None or types is None:
        raise MetadataServiceError(
            "A biblioteca 'google-genai' não está instalada. Execute: pip install google-genai"
        )

    key = api_key or get_api_key()
    if not key:
        raise MetadataServiceError("GEMINI_API_KEY não encontrada nas variáveis de ambiente.")

    _check_daily_limit()

    lang_name = SYNOPSIS_LANG_MAP.get(language, "English")
    prompt = PROMPT_TEMPLATE.format(titulo_limpo=titulo_limpo, lang_name=lang_name)
    client = genai.Client(api_key=key)
    config = types.GenerateContentConfig(
        response_mime_type="application/json",
        system_instruction=SYSTEM_INSTRUCTION,
    )

    rate_limited = False

    for modelo in MODELOS:
        try:
            response = client.models.generate_content(
                model=modelo, contents=prompt, config=config
            )
            raw_text = (response.text or "").strip()
            if raw_text.startswith("```"):
                raw_text = re.sub(r"^```(?:json)?\s*", "", raw_text)
                raw_text = re.sub(r"\s*```$", "", raw_text).strip()
            _increment_daily_count()
            return json.loads(raw_text)
        except MetadataServiceError:
            raise
        except Exception as e:
            err_str = str(e)
            if "429" in err_str or "RESOURCE_EXHAUSTED" in err_str:
                rate_limited = True
                continue
            if "404" in err_str or "NOT_FOUND" in err_str:
                continue
            continue

    if rate_limited:
        raise MetadataServiceError(
            "Limite de requisições à API Gemini excedido. "
            "O plano gratuito permite aproximadamente 20 requisições por minuto. "
            "Aguarde alguns minutos e tente novamente."
        )

    return None


def processar_arquivo_livro(
    nome_arquivo: str,
    item_id: int | None = None,
    api_key: str | None = None,
    use_cache: bool = True,
    query_direta: str | None = None,
    language: str = "en",
) -> dict:
    """
    Processa um livro ou obra agrupada e busca metadados via Gemini.

    Se `query_direta` for fornecido (ex: título limpo de uma série),
    ele é usado diretamente como query — sem passar pelo `limpar_nome_arquivo`.
    Caso contrário, `nome_arquivo` é limpo normalmente.
    """
    # A chave de cache usa a query final, garantindo hits corretos para séries e arquivos
    cache_key = query_direta if query_direta else nome_arquivo

    if use_cache:
        limpar_cache_negativo(CACHE_PATH)
        cache = _load_json_file(CACHE_PATH)
        if cache_key in cache:
            cached = cache[cache_key]
            if isinstance(cached, dict):
                metadados = cached.get("metadados")
                status = cached.get("status")
                cached_lang = cached.get("language")
                if metadados is not None and status != "not_found" and cached_lang == language:
                    nome_da_obra = metadados.get("nome_da_obra") if isinstance(metadados, dict) else None
                    if nome_da_obra:
                        return {
                            "item_id": item_id,
                            "arquivo_original": nome_arquivo,
                            "titulo_limpo": cached.get("titulo_limpo", cache_key),
                            "metadados": metadados,
                        }

    # Usa query_direta se disponível; caso contrário, limpa o nome do arquivo
    titulo_limpo = query_direta if query_direta else limpar_nome_arquivo(nome_arquivo)
    metadados = obter_metadados_gemini(titulo_limpo, api_key=api_key, language=language)

    resultado = {
        "item_id": item_id,
        "arquivo_original": nome_arquivo,
        "titulo_limpo": titulo_limpo,
        "metadados": metadados,
    }

    if use_cache:
        cache = _load_json_file(CACHE_PATH)
        if metadados is not None:
            nome_da_obra = metadados.get("nome_da_obra") if isinstance(metadados, dict) else None
            if nome_da_obra:
                cache[cache_key] = {
                    "status": "found",
                    "titulo_limpo": titulo_limpo,
                    "language": language,
                    "metadados": metadados,
                }
                _save_json_file(CACHE_PATH, cache)
            elif cache_key in cache:
                del cache[cache_key]
                _save_json_file(CACHE_PATH, cache)
        elif cache_key in cache:
            del cache[cache_key]
            _save_json_file(CACHE_PATH, cache)

    return resultado


def processar_lote_com_progresso(
    itens: list[dict],
    api_key: str | None = None,
    language: str = "en",
) -> Generator[tuple[int, int, dict], None, None]:
    """
    Processa uma lista de itens (máx. 10) e emite progresso após cada item.

    Cada item deve ter: { "item_id": int, "nome_arquivo": str }
    Opcionalmente pode ter: { "query_direta": str } — usado para obras agrupadas
    (séries) onde o título já está limpo e não precisa de processamento de filename.
    """
    total = len(itens)

    for index, item in enumerate(itens, start=1):
        resultado = processar_arquivo_livro(
            item["nome_arquivo"],
            item_id=item["item_id"],
            api_key=api_key,
            use_cache=True,
            query_direta=item.get("query_direta"),
            language=language,
        )
        yield index, total, resultado

        if index < total:
            time.sleep(RATE_LIMIT_SLEEP)


def extrair_ano(data_de_lancamento: str | None) -> int | None:
    """Extrai um ano (4 dígitos) de uma string de data de lançamento."""
    if not data_de_lancamento:
        return None
    match = re.search(r"\b(19|20)\d{2}\b", str(data_de_lancamento))
    return int(match.group()) if match else None


def mapear_metadados_para_item(metadados: dict) -> dict:
    """Mapeia campos Gemini para campos do modelo Item."""
    nome = metadados.get("nome_da_obra")
    return {
        "title": nome,
        "metadata_title": nome,
        "author": metadados.get("autor") or None,
        "year": extrair_ano(metadados.get("data_de_lancamento")),
        "description": metadados.get("sinopse") or None,
    }
