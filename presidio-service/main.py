import logging

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from presidio_analyzer import AnalyzerEngine, PatternRecognizer
from presidio_analyzer.nlp_engine import NlpEngineProvider

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(levelname)s %(message)s")
logger = logging.getLogger("presidio")

SUPPORTED_LANGUAGES = ["en", "fr"]

_nlp_configuration = {
    "nlp_engine_name": "spacy",
    "models": [
        {"lang_code": "en", "model_name": "en_core_web_lg"},
        {"lang_code": "fr", "model_name": "fr_core_news_lg"},
    ],
}

analyzer: AnalyzerEngine | None = None


def build_analyzer() -> AnalyzerEngine:
    provider = NlpEngineProvider(nlp_configuration=_nlp_configuration)
    nlp_engine = provider.create_engine()
    return AnalyzerEngine(nlp_engine=nlp_engine, supported_languages=SUPPORTED_LANGUAGES)


app = FastAPI(title="Zetora Anonymizer Service")


@app.on_event("startup")
async def startup() -> None:
    global analyzer
    analyzer = build_analyzer()
    logger.info("Presidio analyzer initialized (languages: %s)", SUPPORTED_LANGUAGES)


@app.get("/health")
async def health():
    return {"status": "ok", "initialized": analyzer is not None}


class DetectInput(BaseModel):
    text: str
    language: str | None = None
    deny_terms: list[str] | None = None
    enable_ner: bool = True


class Entity(BaseModel):
    start: int
    end: int
    type: str
    score: float
    text: str


@app.post("/detect")
async def detect(input: DetectInput):
    if analyzer is None:
        raise HTTPException(503, "Analyzer not initialized")

    language = input.language if input.language in SUPPORTED_LANGUAGES else "en"

    ad_hoc_recognizers = []
    if input.deny_terms:
        # Forces detection of client/project names the NER model may miss —
        # each request's deny list is scoped to that request only.
        ad_hoc_recognizers.append(
            PatternRecognizer(supported_entity="CUSTOM_DENYLIST", deny_list=input.deny_terms, supported_language=language)
        )

    try:
        results = analyzer.analyze(text=input.text, language=language, ad_hoc_recognizers=ad_hoc_recognizers)
    except Exception as e:
        logger.error("analyze failed", exc_info=True)
        raise HTTPException(500, str(e))

    if not input.enable_ner:
        # NER off means "only mask what the user explicitly listed" — drop
        # both the statistical spaCy NER results AND the built-in pattern
        # recognizers (EMAIL, PHONE, IBAN, IP, URL), keeping only the ad-hoc
        # CUSTOM_DENYLIST recognizer built from deny_terms above.
        results = [r for r in results if r.entity_type == "CUSTOM_DENYLIST"]

    entities = [
        Entity(start=r.start, end=r.end, type=r.entity_type, score=r.score, text=input.text[r.start : r.end])
        for r in results
    ]
    return {"entities": [e.model_dump() for e in entities]}
