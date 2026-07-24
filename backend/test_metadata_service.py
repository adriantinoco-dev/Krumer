import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch, MagicMock

import sys
sys.path.append(str(Path(__file__).parent))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import models
from models import Item
from metadata_service import (
    limpar_nome_arquivo,
    limpar_cache_negativo,
    processar_arquivo_livro,
    processar_lote_com_progresso,
    mapear_metadados_para_item,
    extrair_ano,
    MetadataServiceError,
    CACHE_PATH,
    DAILY_COUNT_PATH,
)
from fastapi.testclient import TestClient
import main


class TestLimparNomeArquivo(unittest.TestCase):
    def test_casos_do_script(self):
        casos = [
            ("castelo_de_areia.epub", "castelo de areia"),
            ("castelo_de_areia_frederik_peeters.epub", "castelo de areia frederik peeters"),
            ("1984_george_orwell_pt-br_scan_v2.pdf", "1984 george orwell"),
            ("O-Senhor-Dos-Aneis.epub", "o senhor dos aneis"),
            ("livro_0042.pdf", "livro 0042"),
        ]
        for entrada, esperado in casos:
            with self.subTest(entrada=entrada):
                self.assertEqual(limpar_nome_arquivo(entrada), esperado)


class TestMapearMetadados(unittest.TestCase):
    def test_mapeamento_completo(self):
        meta = {
            "nome_da_obra": "1984",
            "autor": "George Orwell",
            "data_de_lancamento": "1949-06-08",
            "sinopse": "Distopia clássica.",
        }
        mapped = mapear_metadados_para_item(meta)
        self.assertEqual(mapped["title"], "1984")
        self.assertEqual(mapped["author"], "George Orwell")
        self.assertEqual(mapped["year"], 1949)
        self.assertEqual(mapped["description"], "Distopia clássica.")

    def test_extrair_ano(self):
        self.assertEqual(extrair_ano("1998"), 1998)
        self.assertEqual(extrair_ano("publicado em 2020"), 2020)
        self.assertIsNone(extrair_ano(None))
        self.assertIsNone(extrair_ano("desconhecido"))


class TestProcessarLoteComProgresso(unittest.TestCase):
    @patch("metadata_service.time.sleep")
    @patch("metadata_service.processar_arquivo_livro")
    def test_emite_progresso_por_item(self, mock_processar, mock_sleep):
        resultados_esperados = [
            {"item_id": 1, "arquivo_original": "a.epub", "titulo_limpo": "a", "metadados": {"nome_da_obra": "A"}},
            {"item_id": 2, "arquivo_original": "b.epub", "titulo_limpo": "b", "metadados": None},
        ]
        mock_processar.side_effect = resultados_esperados
        itens = [
            {"item_id": 1, "nome_arquivo": "a.epub"},
            {"item_id": 2, "nome_arquivo": "b.epub"},
        ]
        eventos = list(processar_lote_com_progresso(itens))
        self.assertEqual(len(eventos), 2)
        self.assertEqual(eventos[0], (1, 2, resultados_esperados[0]))
        self.assertEqual(eventos[1], (2, 2, resultados_esperados[1]))
        mock_sleep.assert_called_once()


class TestMetadataAPI(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        models.Base.metadata.create_all(bind=self.engine)
        self.SessionLocal = sessionmaker(bind=self.engine)

        def override_get_db():
            db = self.SessionLocal()
            try:
                yield db
            finally:
                db.close()

        main.app.dependency_overrides[main.get_db] = override_get_db
        self.client = TestClient(main.app)
        self.db = self.SessionLocal()

        self.book = Item(
            title="Livro Teste",
            type="book",
            path="/tmp/livro_teste.epub",
            filename_title="livro_teste",
        )
        self.db.add(self.book)
        self.db.commit()
        self.db.refresh(self.book)

    def tearDown(self):
        self.db.close()
        main.app.dependency_overrides.clear()

    @patch("main.get_api_key", return_value=None)
    def test_fetch_sem_api_key(self, _mock_key):
        res = self.client.post("/metadata/fetch", json={"item_ids": [self.book.id]})
        self.assertEqual(res.status_code, 400)
        self.assertIn("GEMINI_API_KEY", res.json()["detail"])

    @patch("main.get_api_key", return_value="fake-key")
    def test_fetch_rejeita_mais_de_10(self, _mock_key):
        ids = list(range(1, 12))
        res = self.client.post("/metadata/fetch", json={"item_ids": ids})
        self.assertEqual(res.status_code, 400)

    @patch("main.get_api_key", return_value="fake-key")
    def test_fetch_rejeita_series(self, _mock_key):
        series = Item(title="Serie", type="series", path="/tmp/serie")
        self.db.add(series)
        self.db.commit()
        self.db.refresh(series)

        res = self.client.post("/metadata/fetch", json={"item_ids": [series.id]})
        self.assertEqual(res.status_code, 400)
        self.assertIn("série", res.json()["detail"].lower())

    @patch("main.processar_lote_com_progresso")
    @patch("main.get_api_key", return_value="fake-key")
    def test_fetch_stream_sse(self, _mock_key, mock_lote):
        mock_lote.return_value = iter([
            (1, 1, {
                "item_id": self.book.id,
                "arquivo_original": "livro_teste.epub",
                "titulo_limpo": "livro teste",
                "metadados": {"nome_da_obra": "Livro Teste", "autor": "Autor", "data_de_lancamento": "2020", "sinopse": "Sinopse"},
            }),
        ])
        res = self.client.post("/metadata/fetch", json={"item_ids": [self.book.id]})
        self.assertEqual(res.status_code, 200)
        self.assertIn("text/event-stream", res.headers.get("content-type", ""))
        self.assertIn('"type": "progress"', res.text)
        self.assertIn('"type": "result"', res.text)
        self.assertIn('"type": "done"', res.text)

    def test_apply_metadata(self):
        payload = {
            "results": [{
                "item_id": self.book.id,
                "metadados": {
                    "nome_da_obra": "Novo Título",
                    "autor": "Novo Autor",
                    "data_de_lancamento": "1999",
                    "sinopse": "Nova sinopse",
                },
            }],
        }
        res = self.client.post("/metadata/apply", json=payload)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]["title"], "Novo Título")
        self.assertEqual(data[0]["author"], "Novo Autor")
        self.assertEqual(data[0]["year"], 1999)
        self.assertEqual(data[0]["description"], "Nova sinopse")


class TestCacheMetadados(unittest.TestCase):
    def setUp(self):
        self.tmp_dir = tempfile.TemporaryDirectory()
        self.cache_path = Path(self.tmp_dir.name) / "metadados_cache.json"

    def tearDown(self):
        self.tmp_dir.cleanup()

    @patch("metadata_service.obter_metadados_gemini")
    def test_livro_encontrado_usa_cache(self, mock_obter):
        with patch("metadata_service.CACHE_PATH", self.cache_path):
            mock_obter.return_value = {"nome_da_obra": "Dom Casmurro", "autor": "Machado de Assis"}

            # Primeira chamada: busca via Gemini
            res1 = processar_arquivo_livro("dom_casmurro.epub", use_cache=True)
            self.assertEqual(mock_obter.call_count, 1)
            self.assertEqual(res1["metadados"]["nome_da_obra"], "Dom Casmurro")

            # Segunda chamada: deve utilizar o cache
            res2 = processar_arquivo_livro("dom_casmurro.epub", use_cache=True)
            self.assertEqual(mock_obter.call_count, 1)
            self.assertEqual(res2["metadados"]["nome_da_obra"], "Dom Casmurro")

    @patch("metadata_service.obter_metadados_gemini")
    def test_livro_nao_encontrado_nao_salva_no_cache_permanente(self, mock_obter):
        with patch("metadata_service.CACHE_PATH", self.cache_path):
            mock_obter.return_value = None

            # Primeira chamada: não encontra
            res1 = processar_arquivo_livro("livro_inexistente.epub", use_cache=True)
            self.assertEqual(mock_obter.call_count, 1)
            self.assertIsNone(res1["metadados"])

            # Segunda chamada: deve tentar novamente na API Gemini
            res2 = processar_arquivo_livro("livro_inexistente.epub", use_cache=True)
            self.assertEqual(mock_obter.call_count, 2)
            self.assertIsNone(res2["metadados"])

    def test_limpar_cache_negativo(self):
        content = {
            "valido.epub": {
                "status": "found",
                "titulo_limpo": "valido",
                "metadados": {"nome_da_obra": "Válido"}
            },
            "invalido_none.epub": {
                "titulo_limpo": "invalido",
                "metadados": None
            },
            "invalido_status.epub": {
                "status": "not_found",
                "titulo_limpo": "invalido status",
                "metadados": None
            }
        }
        with open(self.cache_path, "w", encoding="utf-8") as f:
            json.dump(content, f)

        removidos = limpar_cache_negativo(self.cache_path)
        self.assertEqual(removidos, 2)

        with open(self.cache_path, "r", encoding="utf-8") as f:
            novo_cache = json.load(f)

        self.assertIn("valido.epub", novo_cache)
        self.assertNotIn("invalido_none.epub", novo_cache)
        self.assertNotIn("invalido_status.epub", novo_cache)


if __name__ == "__main__":
    unittest.main()
