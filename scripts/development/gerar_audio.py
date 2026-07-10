from gtts import gTTS
import subprocess
import os

def gerar_audio(texto, arquivo_saida):
    # Gera MP3
    mp3 = arquivo_saida.replace(".ogg", ".mp3")
    tts = gTTS(text=texto, lang="pt", slow=False)
    tts.save(mp3)

    # Converte MP3 → OGG (formato do WhatsApp)
    subprocess.run([
        "ffmpeg", "-y",
        "-i", mp3,
        "-c:a", "libopus",
        "-b:a", "24k",
        arquivo_saida
    ], check=True)

    # Remove o MP3 temporário
    os.remove(mp3)
    print(f"✅ Gerado: {arquivo_saida}")

# Gera a saudação da Helena
gerar_audio(
    "Olá, sou a Helena. Seja bem-vindo ao Oraculum Advocacia.",
    "audios/atendentes/helena_boas_vindas.ogg"
)
