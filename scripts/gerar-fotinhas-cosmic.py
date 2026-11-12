#!/usr/bin/env python3
"""
gerar-fotinhas-cosmic.py — as fotinhas dos agentes do Cosmic Agent.

PEDIDO DO DONO (11/11/2026): "coloca a fotinha no lugar da marca. uma fotinha
full screen estilo metal slug." → o card do painel já tem a área da marca; aqui
nascem as imagens que entram nela.

POR QUE ESTE SCRIPT E NÃO UM CONJUNTO DE CHAMADAS À MÃO: a lista de agentes é
fixa (a governança do ecossistema) e as imagens precisam ser REPRODUTÍVEIS — se
um card ficar feio, dá para gerar de novo aquele só (`--so kael`).

O QUE SAI: `public/cosmic/<slug>.png`, PNG com FUNDO TRANSPARENTE (a cor do
agente aparece por trás, igual o painel faz com a cor da marca), corpo inteiro,
contorno grosso, paleta curta — pixel art de fliperama, não render 3D.

API: `gemini-2.5-flash-image` via `generateContent` (a que funciona neste
ecossistema — ver skill `google-image-gemini-flash`). Chave: canal otomic-news,
com fallback no `.env` raiz; valores em `.env` às vezes têm aspas literais.
"""
from __future__ import annotations

import argparse
import base64
import json
import os
import sys
import urllib.request
from pathlib import Path

APP = Path("/opt/data/mirai-app")
SAIDA = APP / "public" / "cosmic"
MODELO = "gemini-2.5-flash-image"
ENDPOINT = f"https://generativelanguage.googleapis.com/v1beta/models/{MODELO}:generateContent"

FONTES_CHAVE = [
    Path("/opt/data/mirai/profissional/rocky/canais/otomic-news/.env"),
    Path("/opt/data/.env"),
]

# O estilo vem PRIMEIRO e é o mesmo para todos: é o que faz os oito parecerem do
# mesmo jogo. "Metal Slug" = pixel art de neo-geo: contorno preto grosso, poucas
# cores, pose de fliperama, corpo inteiro.
ESTILO = (
    "16-bit pixel art arcade sprite in the style of Metal Slug (Neo Geo), "
    "full body from head to feet, standing pose ready for action, thick black outline, "
    "short bold color palette, sharp pixels no anti-aliasing, "
    "isolated on a fully TRANSPARENT background (no scene, no floor, no shadow), "
    "the character fills the frame vertically, centered"
)

AGENTES: list[tuple[str, str]] = [
    ("mirai", "a female AI orchestrator with short silver hair and an orange glowing visor, "
              "dark tactical suit with orange circuit lines, calm and commanding presence"),
    ("kael", "a male software builder with short dark hair, welding goggles pushed up on the forehead, "
             "blue work jacket with tool pouches, holding a glowing wrench like a weapon"),
    ("brynn", "a female researcher with round glasses and a long violet coat, "
              "carrying a huge magnifying glass and a stack of files, curious expression"),
    ("zara", "a female designer with magenta hair in a bun, holding a glowing stylus pen, "
             "design tablet under the arm, sharp confident look"),
    ("jax", "a male business agent in a green suit with rolled-up sleeves, "
            "holding a briefcase in one hand and a coin in the other, sly smile"),
    ("fen", "a male infrastructure engineer with a cyan hard hat, "
            "thick cables coiled over the shoulder, plugging a connector into a power box"),
    ("fenix", "a phoenix-themed firefighter of data, orange and flame-colored armor, "
              "wings of small flames, holding a hard drive like a shield"),
    ("rocky", "a male content host and rockstar with a yellow leather jacket and headphones, "
              "holding a microphone, one hand raised like a showman"),
]


def achar_chave() -> str:
    for fonte in FONTES_CHAVE:
        try:
            texto = fonte.read_text(encoding="utf-8")
        except OSError:
            continue
        for linha in texto.splitlines():
            if linha.strip().startswith("GOOGLE_API_KEY"):
                valor = linha.split("=", 1)[-1].strip().strip('"').strip("'")
                if valor:
                    return valor
    return os.environ.get("GOOGLE_API_KEY", "").strip()


def gerar(slug: str, personagem: str, chave: str) -> tuple[bool, str]:
    prompt = f"{ESTILO}. Character: {personagem}."
    corpo = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"responseModalities": ["IMAGE"]},
    }
    req = urllib.request.Request(
        f"{ENDPOINT}?key={chave}",
        method="POST",
        data=json.dumps(corpo).encode(),
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=180) as r:
            dados = json.loads(r.read().decode())
    except Exception as exc:  # noqa: BLE001
        extra = ""
        if hasattr(exc, "read"):
            try:
                extra = exc.read().decode()[:220]  # type: ignore[attr-defined]
            except Exception:
                extra = ""
        return False, f"{exc} {extra}".strip()[:240]

    try:
        partes = dados["candidates"][0]["content"]["parts"]
    except (KeyError, IndexError):
        return False, f"resposta sem partes: {json.dumps(dados)[:200]}"

    for p in partes:
        inline = p.get("inlineData") or p.get("inline_data")
        if inline and inline.get("data"):
            SAIDA.mkdir(parents=True, exist_ok=True)
            destino = SAIDA / f"{slug}.png"
            destino.write_bytes(base64.b64decode(inline["data"]))
            return True, f"{destino.name} ({destino.stat().st_size // 1024} KB)"
    return False, "nenhum inlineData de imagem na resposta"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--so", default="", help="gera só este slug (ex.: kael)")
    args = ap.parse_args()

    chave = achar_chave()
    if not chave:
        print("  ✗ sem GOOGLE_API_KEY (canal otomic-news nem .env raiz)")
        return 1
    print(f"  chave carregada (len {len(chave)})")

    alvos = [a for a in AGENTES if not args.so or a[0] == args.so]
    if not alvos:
        print(f"  ✗ slug desconhecido: {args.so}")
        return 1

    ok = 0
    for slug, personagem in alvos:
        print(f"  → {slug}…", end=" ", flush=True)
        sucesso, recado = gerar(slug, personagem, chave)
        print(("✅ " if sucesso else "❌ ") + recado)
        ok += 1 if sucesso else 0

    print(f"\n  {ok}/{len(alvos)} fotinhas em {SAIDA}")
    return 0 if ok == len(alvos) else 1


if __name__ == "__main__":
    raise SystemExit(main())
