import importlib
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def load_config_module(tmp_path, monkeypatch):
    monkeypatch.setenv("GRAPHITI_CONFIG_PATH", str(tmp_path / "graphiti_config.json"))
    import config

    return importlib.reload(config)


def test_persist_roundtrip_and_merge(tmp_path, monkeypatch):
    config = load_config_module(tmp_path, monkeypatch)

    assert config.load_persisted_config() is None

    config.save_persisted_config(config.LlmConfig(llm_model="qwen3", llm_api_key="k1"))
    config.save_persisted_config(config.LlmConfig(embedding_model="bge-m3"))

    merged = config.load_persisted_config()
    assert merged.llm_model == "qwen3"
    assert merged.llm_api_key == "k1"
    assert merged.embedding_model == "bge-m3"


def test_corrupt_config_file_is_ignored(tmp_path, monkeypatch):
    config = load_config_module(tmp_path, monkeypatch)
    Path(os.environ["GRAPHITI_CONFIG_PATH"]).write_text("{not json")
    assert config.load_persisted_config() is None


def test_apply_llm_config_sets_only_non_null_env(tmp_path, monkeypatch):
    config = load_config_module(tmp_path, monkeypatch)
    for var in ("OPENAI_API_KEY", "OPENAI_BASE_URL", "LLM_MODEL"):
        monkeypatch.delenv(var, raising=False)

    config.apply_llm_config(config.LlmConfig(llm_api_key="secret", llm_model="m1"))
    assert os.environ["OPENAI_API_KEY"] == "secret"
    assert os.environ["LLM_MODEL"] == "m1"
    assert "OPENAI_BASE_URL" not in os.environ


def test_bootstrap_env_applies_defaults_aliases_and_persisted(tmp_path, monkeypatch):
    config = load_config_module(tmp_path, monkeypatch)
    for var in ("LLM_MODEL", "EMBEDDING_MODEL", "OPENAI_API_KEY", "OPENAI_BASE_URL"):
        monkeypatch.delenv(var, raising=False)
    monkeypatch.setenv("LLM_API_KEY", "legacy-key")

    Path(os.environ["GRAPHITI_CONFIG_PATH"]).write_text(json.dumps({"llm_base_url": "http://llama:8000/v1"}))

    config.bootstrap_env()
    assert os.environ["LLM_MODEL"] == "gpt-4o-mini"
    assert os.environ["OPENAI_API_KEY"] == "legacy-key"
    assert os.environ["OPENAI_BASE_URL"] == "http://llama:8000/v1"
