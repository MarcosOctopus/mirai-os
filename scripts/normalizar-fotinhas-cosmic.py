#!/usr/bin/env python3
"""
normalizar-fotinhas-cosmic.py — fecha o acabamento das fotinhas do Cosmic Agent.

POR QUE EXISTE: a API de imagem devolve 1024x1024 em RGB, FUNDO BRANCO e ~1,3 MB.
O card desenha a fotinha em 153x98 sobre a cor do agente. Se entrar como veio:
o branco cobre a cor (a troca "cor no lugar da marca" some) e 8 cards puxam
10 MB. Medido em 11/11/2026: 10203 KB → 1299 KB (87% menor) com o recorte certo.

AS TRÊS ETAPAS (nesta ordem, importa):
  1. FUNDO: flood-fill a partir de TODA a borda, com tolerância. Só o branco
     CONECTADO à borda vira transparente — branco dentro do personagem (luva,
     olho, papel) fica intacto. `thresh` alto demais come o personagem; baixo
     demais deixa rebarba.
  2. HALO: erode 1 px do canal alpha (MinFilter 3). O que sobra de branco em
     volta do contorno desaparece. É o passo que conserta o "recorte sujo".
  3. TAMANHO: NEAREST para 384x384 — pixel art tem de continuar com quadrado
     duro; BICUBIC/BILINEAR borra e mata o estilo de fliperama.

COMO USAR:
  ... normalizar-fotinhas-cosmic.py                 # todas
  ... normalizar-fotinhas-cosmic.py --so brynn      # só uma (depois de refazer)

CONFERIR SEMPRE: gere a folha de contato e OLHE (vision), porque número não
mostra halo. Foi assim que o halo do Brynn apareceu, com o alpha já 0-255.
"""
from __future__ import annotations

import argparse
import re
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

D = Path("/opt/data/mirai-app/public/cosmic")
REGISTRO = Path("/opt/data/mirai-app/src/lib/cosmic-agentes.ts")
LADO = 384
TOLERANCIA = 38


def normalizar(p: Path) -> tuple[int, int]:
    kb0 = p.stat().st_size // 1024
    rgba = Image.open(p).convert("RGB").convert("RGBA")
    larg, alt = rgba.size

    # 1) fundo conectado à borda
    for x in range(0, larg, 8):
        for semente in ((x, 0), (x, alt - 1)):
            try:
                ImageDraw.floodfill(rgba, semente, (255, 255, 255, 0), thresh=TOLERANCIA)
            except Exception:
                pass
    for y in range(0, alt, 8):
        for semente in ((0, y), (larg - 1, y)):
            try:
                ImageDraw.floodfill(rgba, semente, (255, 255, 255, 0), thresh=TOLERANCIA)
            except Exception:
                pass

    # 2) halo
    rgba.putalpha(rgba.getchannel("A").filter(ImageFilter.MinFilter(3)))

    # 2b) CAÇA-HALO: o erode acima tira a borda, mas quando a API desenha um
    #     contorno claro em volta do personagem (aconteceu no brynn, 11/11/2026),
    #     sobra um aro branco grudado no recorte. Aqui só o branco ENCOSTADO na
    #     transparência morre — o branco de dentro (camisa, luva, papel) fica.
    #     Não regera a imagem: conserta o que já está em disco.
    px = rgba.load()
    larg, alt = rgba.size
    for _ in range(2):  # duas passadas: o aro costuma ter 2 px
        aro: list[tuple[int, int]] = []
        for y in range(alt):
            for x in range(larg):
                r, g, b, a = px[x, y]
                if a < 40:  # já é fundo
                    continue
                if min(r, g, b) < 205:  # cor de verdade: é o personagem
                    continue
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    viz = (x + dx, y + dy)
                    if 0 <= viz[0] < larg and 0 <= viz[1] < alt and px[viz][3] < 40:
                        aro.append((x, y))
                        break
        if not aro:
            break
        for x, y in aro:
            px[x, y] = (255, 255, 255, 0)

    # 3) tamanho (NEAREST: o pixel continua quadrado)
    rgba.resize((LADO, LADO), Image.NEAREST).save(p, optimize=True)
    return kb0, p.stat().st_size // 1024


def folha_de_contato() -> Path:
    """As 8 sobre as cores dos agentes, do jeito que o card mostra."""
    fonte = REGISTRO.read_text(encoding="utf-8")
    blocos = re.findall(r"\{[^{}]*?nome:\s*\"(\w+)\"[^{}]*?cor:\s*\"(#[0-9a-fA-F]{6})\"[^{}]*?\}", fonte)
    cores = {n.lower(): c for n, c in blocos}
    ordem = [p.stem for p in sorted(D.glob("*.png"))]

    L = A = 240
    linhas = (len(ordem) + 3) // 4
    folha = Image.new("RGB", (L * 4, A * linhas), (18, 18, 22))
    for i, slug in enumerate(ordem):
        cor = cores.get(slug, "#333333")
        fundo = Image.new("RGB", (L, A), tuple(int(cor[j : j + 2], 16) for j in (1, 3, 5)))
        im = Image.open(D / f"{slug}.png").convert("RGBA")
        im.thumbnail((L - 20, A - 20), Image.NEAREST)
        fundo.paste(im, ((L - im.size[0]) // 2, (A - im.size[1]) // 2), im)
        folha.paste(fundo, ((i % 4) * L, (i // 4) * A))
    destino = Path("/opt/data/cache/scratch/folha-cosmic.png")
    folha.save(destino)
    return destino


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--so", default="")
    args = ap.parse_args()

    alvos = sorted(D.glob(f"{args.so}.png")) if args.so else sorted(D.glob("*.png"))
    if not alvos:
        print(f"  ✗ nada para normalizar em {D}")
        return 1

    a = b = 0
    for p in alvos:
        kb0, kb1 = normalizar(p)
        a += kb0
        b += kb1
        print(f"  {p.name:12} {kb0:5}KB → {kb1:4}KB")
        if args.so:
            # a folha continua provando o conjunto, não só o refeito
            pass
    print(f"\n  total: {a}KB → {b}KB" + (f"  ({(1-b/a)*100:.0f}% menor)" if a else ""))
    print(f"  folha de contato: {folha_de_contato()}  → OLHE antes de publicar")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
