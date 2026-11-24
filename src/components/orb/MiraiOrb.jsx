// PROCEDÊNCIA (Mirai, 23/11/2026): arquivo recebido do dono dentro de
// `mirai-orb.zip` como "versão melhorada do orb" — aplicado VERBATIM, só
// acrescentei este cabeçalho. Motor: canvas 2D puro, ~9.000 partículas,
// sem nenhuma dependência (o orb anterior era WebGL + react-three-fiber).

// MiraiOrb.jsx — orb audio-reativo laranja da Mirai (React, sem dependências)
//
// Uso:
//   <MiraiOrb analyser={analyserNode} state="listening" onClick={toggleMic} size={480} />
//
// Props:
//   analyser  AnalyserNode (microfone ou a voz da Mirai). Opcional.
//   level     número 0..1 se você já calcula o volume por conta própria. Opcional.
//   state     'idle' | 'listening' | 'thinking' | 'speaking'
//   mode      'normal' | 'dark'  (Protocolo Dark Matter, com transição animada)
//   theme     'dark' (universo preto) | 'light' (universo branco: Mirai laranja, Dark Matter invertido)
//   size      tamanho em px (ou use className/style)
//
// Comando de voz (no seu reconhecimento de fala):
//   if (isNormalModeCommand(texto)) setMode('normal');      // verifique este primeiro
//   else if (isDarkMatterCommand(texto)) setMode('dark');
//   onClick   ao clicar no orb
import { useEffect, useRef } from 'react';

// ============================================================
//  Mirai Orb — esfera de poeira de partículas, audio-reativa
//  Canvas 2D puro, sem dependências.
//  Em repouso: esfera girando. Na fala: as partículas se
//  espalham para fora em ondas suaves e voltam, em harmonia.
// ============================================================
function createMiraiOrb(canvas, options) {
  const opts = Object.assign({
    particles: 9000,   // quantidade de pontos
    scale: 0.27,       // raio relativo ao menor lado do canvas
    spread: 0.9,       // quanto as partículas do meio se espalham na fala (0..1.5)
    spin: 0.35,        // velocidade de rotação em repouso
    glow: 0.35,        // brilho suave atrás da esfera (0 = nenhum)
    bloom: 0.75,       // brilho em volta das partículas (0 = nenhum)
    gap: 0.16,         // abertura no meio da esfera
    // ---- Protocolo Dark Matter ----
    darkStars: 900,      // estrelas distorcidas pela gravidade
    darkDisk: 4200,      // partículas do disco brilhante
    space: [5, 6, 12],   // cor do fundo do seu site no tema escuro (lente "transparente")
    spaceLight: [246, 246, 248], // cor do fundo do seu site no tema claro
    theme: 'dark',       // 'dark' (universo preto) | 'light' (universo branco)
    // no tema claro a Mirai continua laranja (tons mais fortes para aparecer no branco)
    paletteLight: {
      deep:  [255, 140, 50],
      main:  [255, 110, 10],
      light: [226, 84, 0],
      hot:   [190, 60, 0]
    },
    // no tema claro o Dark Matter se inverte: buraco branco, partículas pretas
    darkPaletteLight: {
      white: [12, 12, 16],
      cool:  [34, 40, 62],
      warm:  [22, 18, 14]
    },
    darkPalette: {
      white: [255, 255, 255],
      cool:  [214, 228, 255],  // branco levemente azulado
      warm:  [255, 240, 220]   // branco levemente quente
    },
    palette: {
      deep:  [255, 90, 10],    // laranja profundo
      main:  [255, 140, 40],   // laranja Mirai
      light: [255, 196, 120],  // pêssego
      hot:   [255, 236, 205]   // quase branco
    }
  }, options || {});

  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, dpr = 1;
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = canvas.getBoundingClientRect();
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  const ro = new ResizeObserver(resize); ro.observe(canvas); resize();

  // ---------- Partículas ----------
  const BANDS = 32;
  const N = opts.particles;
  const px = new Float32Array(N), py = new Float32Array(N), pz = new Float32Array(N);
  const pBand = new Uint8Array(N), pSpread = new Float32Array(N);
  const pSize = new Float32Array(N), pTw = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    // casca fina, um pouco mais densa nos polos (como na referência)
    // abertura no meio: rejeita pontos perto do equador
    let y;
    do {
      const u = Math.random() * 2 - 1;
      y = Math.sign(u) * Math.pow(Math.abs(u), 0.55);
    } while (Math.abs(y) < opts.gap && Math.random() > Math.abs(y) / opts.gap * 0.35);
    const th = Math.random() * Math.PI * 2, r = Math.sqrt(1 - y * y);
    const shell = 1 - Math.pow(Math.random(), 2.2) * 0.12;
    px[i] = Math.cos(th) * r * shell; py[i] = y * shell; pz[i] = Math.sin(th) * r * shell;
    pBand[i] = Math.min(BANDS - 1, Math.floor((Math.abs(y) * 0.6 + (th / (Math.PI * 2)) * 0.4) * BANDS));
    // quanto cada partícula viaja ao se espalhar: camadas, nem todas iguais
    pSpread[i] = 0.25 + Math.pow(Math.random(), 1.6) * 0.75;
    pSize[i] = 0.5 + Math.random() * 0.9;
    pTw[i] = Math.random() * Math.PI * 2;
  }

  // ---------- Áudio ----------
  let analyser = null, freq = null, manualLevel = null, state = 'idle';
  const bands = new Float32Array(BANDS);
  let level = 0;

  function readAudio(time) {
    let target = 0;
    if (analyser) {
      if (!freq || freq.length !== analyser.frequencyBinCount) freq = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(freq);
      const n = freq.length, maxBin = Math.floor(n * 0.7);
      let sum = 0;
      for (let b = 0; b < BANDS; b++) {
        const s = Math.floor(Math.pow(b / BANDS, 1.8) * maxBin);
        const e = Math.max(s + 1, Math.floor(Math.pow((b + 1) / BANDS, 1.8) * maxBin));
        let acc = 0; for (let k = s; k < e; k++) acc += freq[k];
        const val = acc / (e - s) / 255;
        bands[b] += (val - bands[b]) * (val > bands[b] ? 0.3 : 0.08);
        sum += val;
      }
      target = Math.min(1, (sum / BANDS) * 2.2);
    } else {
      const base = manualLevel != null ? manualLevel
        : state === 'thinking' ? 0.15 + 0.06 * Math.sin(time * 5)
        : 0.03 + 0.02 * Math.sin(time * 1.2);
      target = base;
      for (let b = 0; b < BANDS; b++) {
        const val = base * (0.6 + 0.4 * Math.sin(time * 2 + b * 0.5));
        bands[b] += (val - bands[b]) * 0.1;
      }
    }
    // sobe rápido o suficiente para acompanhar a voz, desce devagar (harmonia)
    level += (target - level) * (target > level ? 0.18 : 0.05);
  }

  // ---------- Protocolo Dark Matter: dados ----------
  let theme = opts.theme === 'light' ? 'light' : 'dark';
  const TH = () => theme === 'light'
    ? { add: 'multiply', P: opts.paletteLight, DP: opts.darkPaletteLight, space: opts.spaceLight, hole: [255, 255, 255], k: 2.6, kb: 1.6 }
    : { add: 'lighter',  P: opts.palette,      DP: opts.darkPalette,      space: opts.space,      hole: [0, 0, 0], k: 1, kb: 1 };
  let T = TH();
  let mode = 'normal', mix = 0;               // mix: 0 = Mirai normal, 1 = Dark Matter
  const SN = opts.darkStars;
  const sR = new Float32Array(SN), sA = new Float32Array(SN), sS = new Float32Array(SN), sT = new Float32Array(SN);
  for (let i = 0; i < SN; i++) {
    sR[i] = Math.sqrt(Math.random());           // distância (0..1 do campo)
    sA[i] = Math.random() * Math.PI * 2;
    sS[i] = 0.4 + Math.pow(Math.random(), 3) * 1.8;
    sT[i] = Math.random() * Math.PI * 2;
  }
  const DN = opts.darkDisk;
  const dR = new Float32Array(DN), dP = new Float32Array(DN), dH = new Float32Array(DN), dS = new Float32Array(DN), dJ = new Float32Array(DN);
  for (let i = 0; i < DN; i++) {
    const t = Math.pow(Math.random(), 1.7);
    dR[i] = 1.3 + t * 2.4;                     // raio em unidades do horizonte
    dP[i] = Math.random() * Math.PI * 2;
    dH[i] = (Math.random() - 0.5) * 0.05 * (1 + t);  // espessura do disco
    dS[i] = 0.35 + Math.random() * 0.8;
    dJ[i] = Math.random();
  }
  const DB = [new Float32Array(DN * 3 * 4), new Float32Array(DN * 3 * 4)];
  const DBN = [0, 0];
  let diskT = 0, lensT = 0, lastRs = 0;

  function drawDark(cx, cy, m, time, dt) {
    const M = Math.min(W, H);
    const L = M * 0.5;                          // raio do campo distorcido
    const rs = M * opts.scale * 0.5 * (0.25 + 0.75 * m) * (1 + level * 0.04); // horizonte de eventos
    const E = rs * 1.55 * (1 + level * 0.12 + Math.sin(time * 0.8) * 0.02);    // raio de Einstein (força da lente)
    const DP = T.DP;
    lastRs = rs;
    diskT += dt * (0.6 + level * 2.2);
    lensT += dt * (0.025 + level * 0.05);

    // (o "véu" do espaço já foi desenhado antes da esfera, no frame)
    let g;

    ctx.globalCompositeOperation = T.add;
    // 2) estrelas de fundo dobradas pela gravidade (lente gravitacional)
    ctx.lineCap = 'round';
    for (let i = 0; i < SN; i++) {
      const r = sR[i] * L * 1.05 + 1, ang = sA[i] + lensT * (0.4 + 0.6 * (1 - sR[i]));
      const root = Math.sqrt(r * r + 4 * E * E);
      const tw = 0.7 + 0.3 * Math.sin(time * 1.7 + sT[i]);
      const edgeFade = Math.max(0, Math.min(1, (L - r) / (L * 0.25)));
      // imagem principal (empurrada para fora, esticada em arco)
      const r1 = (r + root) / 2;
      const u = r / E, mag = Math.min(6, (u * u + 2) / (u * Math.sqrt(u * u + 4)));
      if (r1 < L) {
        const fade = Math.max(0, Math.min(1, (L - r1) / (L * 0.25)));
        const a = Math.min(1, 0.55 * tw * Math.sqrt(mag) * fade * m);
        const w = sS[i] * (M / 600);
        const half = Math.min(1.0, Math.max(0, mag - 1.08) * w * 2.2 / r1);
        ctx.globalAlpha = a; ctx.strokeStyle = rgba(i % 3 ? DP.white : DP.cool, 1); ctx.lineWidth = w;
        if (half < 0.004) { ctx.fillStyle = ctx.strokeStyle; ctx.fillRect(cx + Math.cos(ang) * r1 - w / 2, cy + Math.sin(ang) * r1 - w / 2, w, w); }
        else { ctx.beginPath(); ctx.arc(cx, cy, r1, ang - half, ang + half); ctx.stroke(); }
      }
      // imagem secundária (do outro lado, bem perto do anel)
      const r2 = (root - r) / 2;
      if (r2 > rs * 1.02 && edgeFade > 0) {
        const a2 = Math.min(1, 0.35 * tw * Math.max(0, mag - 1) * m);
        if (a2 > 0.02) {
          const w = sS[i] * (M / 750), half = Math.min(1.2, Math.max(0, mag - 1) * w * 2.4 / r2);
          ctx.globalAlpha = a2; ctx.strokeStyle = rgba(DP.cool, 1); ctx.lineWidth = w;
          ctx.beginPath(); ctx.arc(cx, cy, r2, ang + Math.PI - half, ang + Math.PI + half); ctx.stroke();
        }
      }
    }

    // 3) disco de partículas brancas (estilo Interstellar)
    const incl = 0.085 + Math.sin(time * 0.15) * 0.015;  // quase de lado (estilo Interstellar)
    const ci = Math.sin(incl);
    DBN[0] = DBN[1] = 0;                         // 0 = atrás do buraco, 1 = na frente
    const pS = M / 520;
    for (let i = 0; i < DN; i++) {
      // velocidade de órbita: mais rápido perto do centro
      const rr = dR[i] * (1 + level * 0.35 * Math.pow(dJ[i], 2) * (0.6 + 0.4 * Math.sin(diskT * 1.3 + dJ[i] * 9)));
      const phi = dP[i] + diskT * 1.6 / Math.pow(dR[i], 1.5);
      const r = rr * rs;
      const x = Math.cos(phi) * r;
      const zf = Math.sin(phi);                  // >0 = na frente
      const y = zf * r * ci + dH[i] * rs;
      // brilho: mais forte perto do centro + lado que vem em nossa direção (Doppler)
      const heat = Math.pow(1.25 / dR[i], 1.3);
      const dop = 1 + 0.55 * Math.cos(phi + 0.3);
      const flick = 0.8 + 0.2 * Math.sin(time * 3 + dJ[i] * 20);
      const a = Math.min(1, (0.25 + heat * 0.9) * dop * flick * m);
      const s = dS[i] * (0.7 + heat * 1.1) * pS;
      const layer = zf > 0 ? 1 : 0;
      let k = DBN[layer]++ * 4, buf = DB[layer];
      buf[k] = cx + x - s / 2; buf[k + 1] = cy + y - s / 2; buf[k + 2] = s; buf[k + 3] = a;
      // a parte de trás do disco aparece dobrada por cima e por baixo do buraco
      if (zf < 0.25) {
        const rl = rs * 1.1 + (r - rs * 1.3) * 0.2;
        const q = x / rl;
        if (Math.abs(q) < 1) {
          const ya = Math.sqrt(1 - q * q) * rl;
          const aa = Math.min(1, a * 1.1 * (1 - Math.max(0, zf) * 4));
          k = DBN[0]++ * 4;
          buf = DB[0];
          buf[k] = cx + x - s / 2; buf[k + 1] = cy - ya - s / 2; buf[k + 2] = s; buf[k + 3] = aa;
          k = DBN[0]++ * 4;
          buf[k] = cx + x * 0.92 - s / 2; buf[k + 1] = cy + ya * 0.92 - s / 2; buf[k + 2] = s * 0.8; buf[k + 3] = aa * 0.35;
        }
      }
    }
    const drawLayer = (L2) => {
      const buf = DB[L2];
      ctx.fillStyle = rgba(DP.warm, 1);
      for (let j = 0, n = DBN[L2] * 4; j < n; j += 4) {
        ctx.globalAlpha = buf[j + 3]; ctx.fillRect(buf[j], buf[j + 1], buf[j + 2], buf[j + 2]);
      }
    };
    drawLayer(0);

    // 4) horizonte de eventos (a sombra)
    ctx.globalCompositeOperation = 'source-over';
    g = ctx.createRadialGradient(cx, cy, rs * 0.85, cx, cy, rs * 1.08);
    g.addColorStop(0, rgba(T.hole, m)); g.addColorStop(1, rgba(T.hole, 0));
    ctx.globalAlpha = 1; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, rs * 1.08, 0, Math.PI * 2); ctx.fill();

    // 5) anel de fótons
    ctx.globalCompositeOperation = T.add;
    ctx.globalAlpha = m;
    ctx.lineWidth = Math.max(1, rs * 0.025) * (1 + level * 1.2);
    ctx.strokeStyle = rgba(DP.white, 0.55 + level * 0.4);
    ctx.shadowColor = rgba(DP.cool, 1); ctx.shadowBlur = rs * (0.15 + level * 0.35) * (T.k > 1 ? 1.5 : 1);
    ctx.beginPath(); ctx.arc(cx, cy, rs * 1.06, 0, Math.PI * 2); ctx.stroke();
    ctx.shadowBlur = 0;
    g = ctx.createRadialGradient(cx, cy, rs * 1.0, cx, cy, rs * 1.6);
    g.addColorStop(0, rgba(DP.cool, Math.min(1, (0.18 + level * 0.25) * m * T.k))); g.addColorStop(1, rgba(DP.cool, 0));
    ctx.globalAlpha = 1; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, rs * 1.6, 0, Math.PI * 2); ctx.fill();

    // 6) parte da frente do disco
    drawLayer(1);
  }

  // ---------- Render ----------
  let rotY = 0, flowT = 0, raf = 0, last = performance.now(), running = true;
  const bucket = [new Float32Array(N * 4), new Float32Array(N * 4), new Float32Array(N * 4)];
  const bucketN = [0, 0, 0];
  const bloomC = document.createElement('canvas'), bctx = bloomC.getContext('2d');
  const hasFilter = typeof bctx.filter === 'string';
  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

  function frame(now) {
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const time = now / 1000;
    readAudio(time);
    T = TH(); const P = T.P;

    const cx = W / 2, cy = H / 2;
    const R0 = Math.min(W, H) * opts.scale;
    const R = R0 * (1 - 0.85 * (mix < 0.5 ? 2 * mix * mix : 1 - Math.pow(-2 * mix + 2, 2) / 2));
    rotY += dt * mix * 6 +  dt * (opts.spin + level * 0.6);         // gira sempre, um pouco mais rápido na fala
    flowT += dt * (0.5 + level * 1.2);
    const rotX = 0.28 + Math.sin(time * 0.25) * 0.08; // leve inclinação, como na referência
    const cY = Math.cos(rotY), sY = Math.sin(rotY), cX = Math.cos(rotX), sX = Math.sin(rotX);
    const FOV = 3.4;

    ctx.clearRect(0, 0, W, H);
    // transição suave entre os modos (~1,6 s)
    const target = mode === 'dark' ? 1 : 0;
    mix += Math.sign(target - mix) * Math.min(Math.abs(target - mix), dt / 1.6);
    const m = mix < 0.5 ? 2 * mix * mix : 1 - Math.pow(-2 * mix + 2, 2) / 2; // easing
    const keep = Math.pow(1 - m, 1.4);          // quanto da Mirai laranja ainda aparece
    if (m > 0.001) {
      // a lente cobre o fundo; a esfera laranja é sugada por cima dela
      ctx.globalCompositeOperation = 'source-over';
      const L = Math.min(W, H) * 0.5;
      const g0 = ctx.createRadialGradient(cx, cy, 0, cx, cy, L);
      g0.addColorStop(0, rgba(T.space, 0.97 * m)); g0.addColorStop(0.7, rgba(T.space, 0.85 * m)); g0.addColorStop(1, rgba(T.space, 0));
      ctx.fillStyle = g0; ctx.fillRect(cx - L, cy - L, L * 2, L * 2);
    }
    ctx.globalCompositeOperation = T.add;
    if (keep > 0.002) {

    // brilho suave atrás da esfera
    if (opts.glow > 0) {
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.min(W, H) * 0.5);
      g.addColorStop(0, rgba(P.deep, Math.min(1, keep * opts.glow * (0.22 + level * 0.3) * T.k)));
      g.addColorStop(0.5, rgba(P.deep, Math.min(1, keep * opts.glow * (0.08 + level * 0.12) * T.k)));
      g.addColorStop(1, rgba(P.deep, 0));
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }

    const sz = R / 135;
    const spread = level * opts.spread;
    bucketN[0] = bucketN[1] = bucketN[2] = 0;

    for (let i = 0; i < N; i++) {
      const bx = px[i], by = py[i], bz = pz[i];
      const bv = bands[pBand[i]];
      // campo suave compartilhado: regiões vizinhas "florescem" juntas
      // só a faixa do meio reage à fala; polos ficam praticamente parados
      // faixa do meio mais larga, com borda suave e irregular
      const ang = Math.atan2(bz, bx);
      const edge = 0.26 + 0.08 * Math.sin(ang * 2 + flowT * 0.4);
      const mid = Math.exp(-(by * by) / edge);
      // "ruído" orgânico: mistura de ritmos que não se repetem
      const n1 = Math.sin(ang * 2.0 + flowT * 0.93 + by * 3.1);
      const n2 = Math.sin(ang * 3.7 - flowT * 1.31 + pSpread[i] * 5.0);
      const n3 = Math.sin(ang * 6.3 + flowT * 0.57 - by * 5.3);
      const wave = 0.5 + 0.5 * (n1 * 0.5 + n2 * 0.3 + n3 * 0.2);
      const breathe = 1 + Math.sin(time * 1.1 + by * 2) * 0.012;
      // cada partícula vai a uma distância diferente (cauda longa = poeira solta)
      const reach = Math.pow(pSpread[i], 2.2) * 1.6 + 0.1;
      const out = level * opts.spread * mid * reach * (0.3 + 0.7 * wave) + bv * 0.08 * mid * pSpread[i];
      const d = breathe + out;
      // as que se afastam deslizam em volta do eixo, as mais longe deslizam mais
      const swirl = out * (0.5 + 0.4 * n2);
      const cs = Math.cos(swirl), sn = Math.sin(swirl);
      let x = (bx * cs - bz * sn) * d, y = by * d, z = (bx * sn + bz * cs) * d;
      // a poeira que escapa sobe ou desce um pouco, como fumaça
      y += out * 0.35 * (n3 * 0.7 + Math.sign(by) * 0.3);

      const x1 = x * cY + z * sY, z1 = -x * sY + z * cY;
      const y1 = y * cX - z1 * sX, z2 = y * sX + z1 * cX;
      const f = FOV / (FOV - z2);
      const depth = Math.max(0, Math.min(1, (z2 / d + 1) * 0.5));
      const tw = 0.85 + 0.15 * Math.sin(time * 2.2 + pTw[i]);
      // quem se afasta mais fica mais sutil, como poeira se dissipando
      const fadeOut = 1 / (1 + out * 1.1);
      const a = Math.min(1, (0.3 + depth * 0.75) * tw * fadeOut) * keep;
      const s = pSize[i] * (0.55 + depth * 0.8) * sz;
      const b = depth > 0.8 && pSize[i] > 1.25 ? 2 : depth > 0.55 ? 1 : 0;
      const k = bucketN[b]++ * 4, buf = bucket[b];
      buf[k] = cx + x1 * R * f - s / 2; buf[k + 1] = cy + y1 * R * f - s / 2; buf[k + 2] = s; buf[k + 3] = a;
    }

    const colors = [P.deep, P.main, P.light];
    for (let b = 0; b < 3; b++) {
      ctx.fillStyle = rgba(colors[b], 1);
      const buf = bucket[b];
      for (let j = 0, n = bucketN[b] * 4; j < n; j += 4) {
        ctx.globalAlpha = buf[j + 3];
        ctx.fillRect(buf[j], buf[j + 1], buf[j + 2], buf[j + 2]);
      }
    }

    // brilho nos polos (as "calotas" que brilham na referência)
    const poleY = Math.cos(rotX) * R;
    for (const sgn of [-1, 1]) {
      const py0 = cy + sgn * poleY * 0.93;
      const rad = R * (0.55 + level * 0.1);
      ctx.globalAlpha = 1;
      ctx.save(); ctx.translate(cx, py0); ctx.scale(1, 0.38);
      const gp = ctx.createRadialGradient(0, 0, 0, 0, 0, rad);
      gp.addColorStop(0, rgba(P.main, Math.min(1, (0.22 + level * 0.18) * keep * T.k)));
      gp.addColorStop(0.4, rgba(P.deep, Math.min(1, (0.08 + level * 0.08) * keep * T.k)));
      gp.addColorStop(1, rgba(P.deep, 0));
      ctx.fillStyle = gp; ctx.beginPath(); ctx.arc(0, 0, rad, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    }
    if (m > 0.001) drawDark(cx, cy, m, time, dt);
    ctx.globalCompositeOperation = T.add;

    // bloom: reduz o desenho e amplia de volta = brilho suave em volta dos pontos
    if (opts.bloom > 0) {
      const bw = Math.max(1, Math.round(canvas.width / 3)), bh = Math.max(1, Math.round(canvas.height / 3));
      if (bloomC.width !== bw || bloomC.height !== bh) { bloomC.width = bw; bloomC.height = bh; }
      bctx.clearRect(0, 0, bw, bh);
      bctx.imageSmoothingEnabled = true;
      if (hasFilter) bctx.filter = `blur(${Math.max(2, bw / 90)}px)`;
      bctx.drawImage(canvas, 0, 0, bw, bh);
      if (hasFilter) bctx.filter = 'none';
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.globalAlpha = Math.min(1, opts.bloom * (0.8 + level * 0.4) * (1 - mix * 0.25) * T.kb);
      ctx.drawImage(bloomC, 0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = Math.min(1, opts.bloom * 0.5 * T.kb);
      const m = canvas.width * 0.04, n2 = canvas.height * 0.04;
      ctx.drawImage(bloomC, -m, -n2, canvas.width + 2 * m, canvas.height + 2 * n2);
      ctx.restore();
    }

    // a sombra precisa continuar preta mesmo depois do brilho
    if (mix > 0.001 && lastRs > 0) {
      ctx.globalCompositeOperation = 'source-over';
      const mm = mix < 0.5 ? 2 * mix * mix : 1 - Math.pow(-2 * mix + 2, 2) / 2;
      const gs = ctx.createRadialGradient(cx, cy, 0, cx, cy, lastRs * 1.0);
      gs.addColorStop(0, rgba(T.hole, mm)); gs.addColorStop(0.82, rgba(T.hole, mm)); gs.addColorStop(1, rgba(T.hole, 0));
      ctx.globalAlpha = 1; ctx.fillStyle = gs; ctx.beginPath(); ctx.arc(cx, cy, lastRs, 0, Math.PI * 2); ctx.fill();
      // redesenha a frente do disco por cima da sombra
      ctx.globalCompositeOperation = T.add;
      const buf = DB[1]; ctx.fillStyle = rgba(T.DP.warm, 1);
      for (let j = 0, n = DBN[1] * 4; j < n; j += 4) {
        const yy = buf[j + 1] - cy, xx = buf[j] - cx;
        if (xx * xx + yy * yy < lastRs * lastRs) { ctx.globalAlpha = buf[j + 3]; ctx.fillRect(buf[j], buf[j + 1], buf[j + 2], buf[j + 2]); }
      }
    }

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  return {
    /** Conecte um AnalyserNode (microfone ou voz da Mirai). null = sem áudio. */
    setAnalyser(a) { analyser = a || null; },
    /** Alternativa: passe um nível 0..1 manualmente (null volta ao automático). */
    setLevel(v) { manualLevel = v == null ? null : Math.max(0, Math.min(1, v)); },
    /** 'idle' | 'listening' | 'thinking' | 'speaking' */
    setState(s) { state = s || 'idle'; },
    /** 'normal' | 'dark' — Protocolo Dark Matter (transição animada) */
    setMode(md) { mode = md === 'dark' || md === 'darkMatter' ? 'dark' : 'normal'; },
    getMode() { return mode; },
    /** 'dark' (universo preto) | 'light' (universo branco) */
    setTheme(t) { theme = t === 'light' ? 'light' : 'dark'; },
    destroy() { running = false; cancelAnimationFrame(raf); ro.disconnect(); }
  };
}

/** Detecta o comando de voz: "vamos rodar o Dark Matter", "Protocolo Dark Matter"... */
function isDarkMatterCommand(text) {
  return /\b(dark\s*matter|darkmatter|mat[ée]ria\s+escura)\b/i.test(text || '');
}
/** Detecta o comando para voltar ao normal: "sair do Dark Matter", "protocolo normal"... */
function isNormalModeCommand(text) {
  return /\b(sair|desativar|encerrar|desligar)\b.*\b(dark\s*matter|protocolo)\b|\bprotocolo\s+normal\b|\bvolta(r)?\s+ao\s+normal\b/i.test(text || '');
}


export default function MiraiOrb({ analyser = null, level = null, state = 'idle', mode = 'normal', theme = 'dark',
  size = 480, onClick, className, style, options }) {
  const canvasRef = useRef(null);
  const orbRef = useRef(null);

  useEffect(() => {
    orbRef.current = createMiraiOrb(canvasRef.current, options);
    return () => orbRef.current && orbRef.current.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { orbRef.current && orbRef.current.setAnalyser(analyser); }, [analyser]);
  useEffect(() => { orbRef.current && orbRef.current.setLevel(level); }, [level]);
  useEffect(() => { orbRef.current && orbRef.current.setState(state); }, [state]);
  useEffect(() => { orbRef.current && orbRef.current.setMode(mode); }, [mode]);
  useEffect(() => { orbRef.current && orbRef.current.setTheme(theme); }, [theme]);

  return (
    <canvas
      ref={canvasRef}
      onClick={onClick}
      role="button"
      aria-label="Falar com a Mirai"
      className={className}
      style={{ width: size, height: size, cursor: onClick ? 'pointer' : 'default', ...style }}
    />
  );
}

export { createMiraiOrb, isDarkMatterCommand, isNormalModeCommand };
