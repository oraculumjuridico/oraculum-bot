# Lightning TTS

Esta pasta preserva a versão do servidor Supertonic validada para o Oráculum.

## Contrato

- `POST /tts` recebe somente `{ "text": "..." }`.
- `X-Oraculum-Voice` aceita `F1`, `F2`, `F3`, `F4` ou `F5`; sem o cabeçalho, usa `F4`.
- Todas as vozes usam `lang="pt"`, `total_steps=8` e `speed=0.90`.
- O texto é dividido apenas em `.`, `?` e `!`; os WAVs são unidos com 0,4 segundo de silêncio.
- Os logs não incluem o texto nem as frases.

## Instalação no Lightning

Substitua `/teamspace/studios/this_studio/tts_api.py` por `tts_api.py` desta pasta. Em seguida:

```sh
cd /teamspace/studios/this_studio
python -m py_compile tts_api.py
pkill -f "uvicorn tts_api:app" || true
nohup uvicorn tts_api:app --host 0.0.0.0 --port 8000 > /tmp/oraculum-tts.log 2>&1 &
```

O `nohup` mantém o processo após fechar o terminal, mas não garante reinício se o Studio for desligado. O processo deve ser iniciado pelo mecanismo permanente do Lightning quando esse recurso estiver disponível.

## Verificação local

```sh
curl -fsS http://127.0.0.1:8000/health
curl -o /tmp/tts-f4.wav -H "Content-Type: application/json" -d '{"text":"Teste um. Teste dois."}' http://127.0.0.1:8000/tts
curl -o /tmp/tts-f1.wav -H "Content-Type: application/json" -H "X-Oraculum-Voice: F1" -d '{"text":"Teste da voz um."}' http://127.0.0.1:8000/tts
```
