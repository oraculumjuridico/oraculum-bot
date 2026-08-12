from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
from starlette.background import BackgroundTask
from supertonic import TTS

import json
import os
import re
import threading
import time
import unicodedata
import uuid

import numpy as np


app = FastAPI()

DEFAULT_VOICE = "F4"
AVAILABLE_VOICES = ("F1", "F2", "F3", "F4", "F5")
SAMPLE_RATE = 44100
SENTENCE_PAUSE_SECONDS = 0.4

print("Carregando Supertonic e vozes femininas...", flush=True)
tts = TTS(auto_download=True)
voice_styles = {
    voice: tts.get_voice_style(voice_name=voice)
    for voice in AVAILABLE_VOICES
}
print("Supertonic F1-F5 prontas; F4 permanece como padrão.", flush=True)

active_requests = 0
active_lock = threading.Lock()


def log_tts(event, **dados):
    print(
        "[oraculum-tts] " + json.dumps(
            {
                "event": event,
                **dados,
            },
            ensure_ascii=False,
        ),
        flush=True,
    )


def normalizar_texto_supertonic(texto: str) -> str:
    texto = unicodedata.normalize("NFKC", texto)
    texto = "".join(
        caractere
        for caractere in texto
        if unicodedata.category(caractere) != "Cf"
    )
    texto = texto.replace("\ufe0f", "")
    texto = texto.replace("_", " ")
    return texto


def separar_frases(texto: str) -> list[str]:
    frases = [
        match.group(0).strip()
        for match in re.finditer(r"[^.?!]+(?:[.?!]+|$)", texto)
        if match.group(0).strip()
    ]
    return frases or [texto]


def silencio_compativel(wav: np.ndarray) -> np.ndarray:
    formato = list(wav.shape)
    formato[-1] = round(SAMPLE_RATE * SENTENCE_PAUSE_SECONDS)
    return np.zeros(tuple(formato), dtype=wav.dtype)


def unir_segmentos(segmentos: list[np.ndarray]) -> np.ndarray:
    if len(segmentos) == 1:
        return segmentos[0]

    silencio = silencio_compativel(segmentos[0])
    partes = []
    for indice, segmento in enumerate(segmentos):
        if indice:
            partes.append(silencio)
        partes.append(segmento)
    return np.concatenate(partes, axis=-1)


class TTSRequest(BaseModel):
    text: str


@app.get("/health")
def health():
    return {
        "ok": True,
        "service": "oraculum-tts",
        "voice": DEFAULT_VOICE,
        "availableVoices": list(AVAILABLE_VOICES),
    }


@app.post("/tts")
def gerar_audio(
    req: TTSRequest,
    voice_header: str | None = Header(
        default=None,
        alias="X-Oraculum-Voice",
    ),
):
    global active_requests

    request_id = uuid.uuid4().hex[:12]
    inicio_total = time.monotonic()
    texto_original = req.text.strip()

    if not texto_original:
        raise HTTPException(status_code=400, detail="Texto vazio")

    if len(texto_original) > 1500:
        raise HTTPException(status_code=400, detail="Texto muito longo")

    texto = normalizar_texto_supertonic(texto_original)

    if not texto.strip():
        raise HTTPException(
            status_code=400,
            detail="Texto vazio após normalização",
        )

    voice = (voice_header or DEFAULT_VOICE).strip().upper()
    if voice not in voice_styles:
        raise HTTPException(status_code=400, detail="Voz inválida")

    frases = separar_frases(texto)
    sentence_count = len(frases)

    with active_lock:
        active_requests += 1
        ativos_agora = active_requests

    log_tts(
        "request_received",
        requestId=request_id,
        textLength=len(texto_original),
        normalizedLength=len(texto),
        activeRequests=ativos_agora,
        sentenceCount=sentence_count,
        voice=voice,
    )

    arquivo = f"/tmp/oraculum-{uuid.uuid4().hex}.wav"

    try:
        is_valid, unsupported = (
            tts.model.text_processor.validate_text(texto)
        )

        if not is_valid:
            log_tts(
                "unsupported_characters",
                requestId=request_id,
                count=len(unsupported),
                codePoints=[
                    f"U+{ord(char):04X}"
                    for char in unsupported
                ],
                voice=voice,
            )

        log_tts(
            "synthesis_start",
            requestId=request_id,
            activeRequests=ativos_agora,
            speed=0.90,
            sentenceCount=sentence_count,
            voice=voice,
        )

        inicio_sintese = time.monotonic()

        if sentence_count == 1:
            inicio_segmento = time.monotonic()
            wav_final, _ = tts.synthesize(
                text=texto,
                lang="pt",
                voice_style=voice_styles[voice],
                total_steps=8,
                speed=0.90,
            )
            log_tts(
                "segment_end",
                requestId=request_id,
                sentenceCount=1,
                segmentIndex=1,
                segmentDurationMs=round(
                    (time.monotonic() - inicio_segmento) * 1000
                ),
                voice=voice,
            )
        else:
            segmentos = []
            for indice, frase in enumerate(frases, start=1):
                inicio_segmento = time.monotonic()
                wav_segmento, _ = tts.synthesize(
                    text=frase,
                    lang="pt",
                    voice_style=voice_styles[voice],
                    total_steps=8,
                    speed=0.90,
                )
                segmentos.append(wav_segmento)
                log_tts(
                    "segment_end",
                    requestId=request_id,
                    sentenceCount=sentence_count,
                    segmentIndex=indice,
                    segmentDurationMs=round(
                        (time.monotonic() - inicio_segmento) * 1000
                    ),
                    voice=voice,
                )
            wav_final = unir_segmentos(segmentos)

        duracao_sintese = round(
            (time.monotonic() - inicio_sintese) * 1000
        )

        log_tts(
            "synthesis_end",
            requestId=request_id,
            durationMs=duracao_sintese,
            sentenceCount=sentence_count,
            totalSynthesisDurationMs=duracao_sintese,
            voice=voice,
        )

        tts.save_audio(wav_final, arquivo)

        duracao_total = round(
            (time.monotonic() - inicio_total) * 1000
        )

        log_tts(
            "response_ready",
            requestId=request_id,
            durationMs=duracao_total,
            fileSize=os.path.getsize(arquivo),
            sentenceCount=sentence_count,
            totalSynthesisDurationMs=duracao_sintese,
            voice=voice,
        )

        return FileResponse(
            arquivo,
            media_type="audio/wav",
            filename="oraculum-tts.wav",
            background=BackgroundTask(os.remove, arquivo),
        )

    except Exception as erro:
        log_tts(
            "error",
            requestId=request_id,
            errorType=type(erro).__name__,
            voice=voice,
        )
        raise

    finally:
        with active_lock:
            active_requests -= 1
            ativos_restantes = active_requests

        log_tts(
            "request_finished",
            requestId=request_id,
            activeRequests=ativos_restantes,
            voice=voice,
        )
