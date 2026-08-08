/* Genera les icones de l'app: un eclipsi total amb corona, un parell
   d'estrelles i un Perseid. Sense dependències — es dibuixa píxel a píxel i
   s'escriu el PNG a mà.   Ús:  node tools/icones.mjs                        */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

/* ---------- escriptura de PNG ---------- */
const crcTaula = (() => {
  const t = new Int32Array(256);
  for(let n = 0; n < 256; n++){
    let c = n;
    for(let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf){
  let c = -1;
  for(const b of buf) c = crcTaula[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(tipus, dades){
  const llarg = Buffer.alloc(4);
  llarg.writeUInt32BE(dades.length);
  const cos = Buffer.concat([Buffer.from(tipus, 'ascii'), dades]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(cos));
  return Buffer.concat([llarg, cos, crc]);
}
function png(w, h, rgba){
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc(h * (w * 4 + 1));
  for(let y = 0; y < h; y++){
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ---------- dibuix ---------- */
const barreja = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
const suau = (b, v, s) => clamp01((v - b) / s);          // 0 sota b, 1 a b+s

const FONS_C  = [22, 30, 52];      // blau nit al centre
const FONS_V  = [8, 10, 18];       // gairebé negre a les vores
const OR      = [242, 193, 78];
const OR_CALT = [255, 232, 176];
const LLUNA   = [4, 6, 11];

// Perseids: origen, direcció i llargada relatius al costat
const METEORS = [
  { x: 0.16, y: 0.14, dx:  0.26, dy: 0.20, gruix: 0.011, força: 1.0 },
  { x: 0.72, y: 0.10, dx:  0.15, dy: 0.12, gruix: 0.008, força: 0.6 },
];
const ESTRELLES = [
  [0.13, 0.42, 0.9], [0.86, 0.33, 0.8], [0.24, 0.83, 0.7],
  [0.79, 0.79, 1.0], [0.50, 0.09, 0.6], [0.09, 0.66, 0.55],
  [0.92, 0.57, 0.65], [0.42, 0.92, 0.5],
];

function pinta(costat, escala){
  const SS = 4;                       // supermostreig per als contorns
  const N = costat * SS;
  const px = Buffer.alloc(costat * costat * 4);
  const c = N / 2;
  const rLluna  = 0.255 * N * escala;
  const rCorona = 0.455 * N * escala;

  for(let y = 0; y < costat; y++){
    for(let x = 0; x < costat; x++){
      let ac = [0, 0, 0];
      for(let sy = 0; sy < SS; sy++){
        for(let sx = 0; sx < SS; sx++){
          const px_ = x * SS + sx + 0.5, py_ = y * SS + sy + 0.5;
          const dx = px_ - c, dy = py_ - c;
          const r = Math.hypot(dx, dy);

          // fons
          let col = barreja(FONS_C, FONS_V, clamp01(r / (N * 0.66)));

          // estrelles
          for(const [ex, ey, eb] of ESTRELLES){
            const d = Math.hypot(px_ - ex * N, py_ - ey * N);
            const i = Math.exp(-Math.pow(d / (N * 0.006), 2)) * eb;
            if(i > 0.004) col = barreja(col, [235, 240, 255], clamp01(i));
          }

          // meteors: traç amb cua que s'apaga
          for(const m of METEORS){
            const ax = m.x * N, ay = m.y * N;
            const bx = (m.x + m.dx) * N, by = (m.y + m.dy) * N;
            const vx = bx - ax, vy = by - ay;
            const t = clamp01(((px_ - ax) * vx + (py_ - ay) * vy) / (vx * vx + vy * vy));
            const d = Math.hypot(px_ - (ax + vx * t), py_ - (ay + vy * t));
            const perfil = Math.exp(-Math.pow(d / (m.gruix * N), 2));
            const cua = Math.pow(t, 1.7);                       // brillant al final
            const i = perfil * cua * m.força * 0.95;
            if(i > 0.004) col = barreja(col, [255, 250, 235], clamp01(i));
          }

          // corona: cau cap enfora, amb una mica de textura radial
          if(r > rLluna * 0.9){
            const u = clamp01((r - rLluna) / (rCorona - rLluna));
            const raigs = 1 + 0.16 * Math.cos(Math.atan2(dy, dx) * 9);
            const i = Math.pow(1 - u, 2.6) * 0.92 * raigs;
            col = barreja(col, OR, clamp01(i));
          }

          // anell cromosfèric just al llavi de la Lluna
          const anell = Math.exp(-Math.pow((r - rLluna * 1.035) / (N * 0.011), 2));
          col = barreja(col, OR_CALT, clamp01(anell * 0.95));

          // disc de la Lluna
          col = barreja(col, LLUNA, 1 - suau(rLluna - N * 0.004, r, N * 0.008));

          ac[0] += col[0]; ac[1] += col[1]; ac[2] += col[2];
        }
      }
      const n = SS * SS, o = (y * costat + x) * 4;
      px[o]     = Math.round(clamp01(ac[0] / n / 255) * 255);
      px[o + 1] = Math.round(clamp01(ac[1] / n / 255) * 255);
      px[o + 2] = Math.round(clamp01(ac[2] / n / 255) * 255);
      px[o + 3] = 255;
    }
  }
  return png(costat, costat, px);
}

mkdirSync('icons', { recursive: true });
// maskable: Android en retalla un cercle, cal deixar aire a les vores
const feina = [
  ['icons/icon-512.png',          512, 1.00],
  ['icons/icon-192.png',          192, 1.00],
  ['icons/apple-touch-icon.png',  180, 1.00],
  ['icons/favicon.png',            64, 1.00],
  ['icons/icon-maskable-512.png', 512, 0.72],
];
for(const [ruta, mida, escala] of feina){
  writeFileSync(ruta, pinta(mida, escala));
  console.log(ruta, mida + 'px');
}
