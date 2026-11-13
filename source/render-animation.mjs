import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
function option(name) {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}
const packagedAsset = path.resolve(ROOT, '../assets/characters.png');
const ASSET = path.resolve(option('--atlas') ?? process.env.FISH_ATLAS ??
  (existsSync(packagedAsset) ? packagedAsset : '/workspace/sites/fish-rice-run/dist/assets/characters.png'));
const OUT = path.resolve(option('--frames') ?? option('--out') ?? process.env.FISH_FRAMES ?? path.join(ROOT, 'frames'));
const WIDTH = 960;
const HEIGHT = 420;
const FPS = 20;
const DURATION = 12;
const FLOOR = 345;
const HERO_X = 213;
const FONT = 'NotoCJK, sans-serif';
const C = {
  paper: '#FCFAF2', ink: '#253A4C', muted: '#80918E', mint: '#B5DCCB',
  purple: '#D9D7ED', orange: '#DC9839', line: '#D9E4D8', white: '#FFFFFF',
};

const fontPath = option('--font') ?? process.env.FISH_FONT ?? '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc';
if (existsSync(fontPath)) GlobalFonts.registerFromPath(fontPath, 'NotoCJK');
else console.warn('Chinese font not found; set FISH_FONT or --font to a CJK font file if glyphs are missing.');
const bold = '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc';
if (existsSync(bold)) GlobalFonts.registerFromPath(bold, 'NotoCJK');

const atlas = await loadImage(ASSET);
const analysisCanvas = createCanvas(atlas.width, atlas.height);
const analysis = analysisCanvas.getContext('2d');
analysis.drawImage(atlas, 0, 0);
const pixels = analysis.getImageData(0, 0, atlas.width, atlas.height).data;

// Read alpha bounds for each source sprite, allowing the dragon's left wing to
// cross the atlas midpoint. The source image is never modified or re-saved.
function alphaBounds(region) {
  let [x0, y0, x1, y1] = region;
  x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0));
  x1 = Math.min(atlas.width, Math.ceil(x1)); y1 = Math.min(atlas.height, Math.ceil(y1));
  let left = x1, right = x0, top = y1, bottom = y0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      if (pixels[(y * atlas.width + x) * 4 + 3] > 16) {
        left = Math.min(left, x); right = Math.max(right, x);
        top = Math.min(top, y); bottom = Math.max(bottom, y);
      }
    }
  }
  if (left > right) throw new Error('Empty sprite source region');
  return { x: left, y: top, w: right - left + 1, h: bottom - top + 1 };
}

const sx = atlas.width / 1254;
const sy = atlas.height / 1254;
const region = (r) => r.map((v, i) => v * (i % 2 === 0 ? sx : sy));
const sprites = {
  fish: alphaBounds(region([0, 0, 610, 630])),
  dragon: alphaBounds(region([610, 0, 1254, 630])),
  cat: alphaBounds(region([0, 630, 630, 1254])),
  rice: alphaBounds(region([630, 630, 1254, 1254])),
};

const canvas = createCanvas(WIDTH, HEIGHT);
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = true;
ctx.imageSmoothingQuality = 'high';

const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const smooth = (x) => { const q = clamp(x); return q * q * (3 - 2 * q); };
const lerp = (a, b, u) => a + (b - a) * u;
const sine = (t, hz, phase = 0) => Math.sin(t * Math.PI * 2 * hz + phase);

function rounded(x, y, w, h, r, fill, stroke = null) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
}

function label(text, x, y, size = 16, color = C.ink, weight = 400, align = 'left') {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

function ellipse(x, y, rx, ry, fill) {
  ctx.fillStyle = fill;
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
}

function star(x, y, radius, fill, rotation = 0) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rotation);
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const angle = i * Math.PI / 4 - Math.PI / 2;
    const r = i % 2 === 0 ? radius : radius * 0.32;
    const px = Math.cos(angle) * r, py = Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); ctx.restore();
}

function cloud(x, y, scale = 1, alpha = 1) {
  ctx.save(); ctx.globalAlpha = alpha; ctx.translate(x, y); ctx.scale(scale, scale);
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(-24, 0, 15, Math.PI, 0); ctx.arc(-4, -9, 21, Math.PI, 0);
  ctx.arc(23, 1, 16, Math.PI, 0); ctx.lineTo(39, 12); ctx.lineTo(-39, 12);
  ctx.closePath(); ctx.fill(); ctx.restore();
}

function sprite(kind, x, foot, height, opts = {}) {
  const src = sprites[kind];
  const aspect = src.w / src.h;
  const width = height * aspect * (opts.widen ?? 1);
  ctx.save();
  ctx.translate(x, foot - height * 0.5);
  ctx.rotate(opts.angle ?? 0);
  ctx.globalAlpha = opts.alpha ?? 1;
  ctx.drawImage(atlas, src.x, src.y, src.w, src.h, -width / 2, -height / 2, width, height);
  ctx.restore();
}

function characterTag(text, x, y, fill, color) {
  const width = text === 'ChatGPT' ? 76 : 66;
  rounded(x - width / 2, y, width, 20, 7, fill);
  label(text, x, y + 14, 11, color, 500, 'center');
}

function travel(t) {
  const q = Math.min(t, 9.95);
  return 320 * (Math.min(q, 5.5) + Math.max(0, q - 5.5) * 1.05);
}

function world(t) {
  const moved = travel(t);
  ctx.fillStyle = C.paper; ctx.fillRect(0, 0, WIDTH, HEIGHT);
  const sky = ctx.createLinearGradient(0, 95, 0, FLOOR);
  sky.addColorStop(0, '#F6FAF5'); sky.addColorStop(1, '#EEF7F0');
  ctx.fillStyle = sky; ctx.fillRect(0, 96, WIDTH, 286);
  ellipse(821, 142, 26, 26, '#FAEBCB');
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4;
    ctx.strokeStyle = '#EFE0BA'; ctx.lineWidth = 2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(821 + Math.cos(a) * 35, 142 + Math.sin(a) * 35);
    ctx.lineTo(821 + Math.cos(a) * 41, 142 + Math.sin(a) * 41); ctx.stroke();
  }
  cloud(((164 - moved * 0.045) % 1140 + 1140) % 1140 - 90, 153, 0.9, 0.85);
  cloud(((605 - moved * 0.025) % 1140 + 1140) % 1140 - 90, 126, 0.65, 0.8);
  cloud(((995 - moved * 0.045) % 1140 + 1140) % 1140 - 90, 198, 0.9, 0.8);
  const farOffset = -(moved * 0.075 % 480);
  for (let i = -1; i < 4; i++) {
    const x = farOffset + i * 480;
    ctx.beginPath(); ctx.moveTo(x, FLOOR + 10);
    ctx.bezierCurveTo(x + 80, 297, x + 155, 222, x + 225, 257);
    ctx.bezierCurveTo(x + 312, 298, x + 345, 245, x + 480, FLOOR + 10);
    ctx.lineTo(x + 480, FLOOR + 24); ctx.lineTo(x, FLOOR + 24);
    ctx.closePath(); ctx.fillStyle = '#E4E1EF'; ctx.fill();
  }
  const nearOffset = -(moved * 0.14 % 580);
  for (let i = -1; i < 4; i++) {
    const x = nearOffset + i * 580;
    ctx.beginPath(); ctx.moveTo(x, FLOOR + 8);
    ctx.bezierCurveTo(x + 100, 304, x + 165, 283, x + 278, 308);
    ctx.bezierCurveTo(x + 420, 270, x + 467, 321, x + 580, FLOOR + 8);
    ctx.lineTo(x + 580, FLOOR + 24); ctx.lineTo(x, FLOOR + 24);
    ctx.closePath(); ctx.fillStyle = '#D1E7D9'; ctx.fill();
  }
  ctx.fillStyle = '#E9EEDC'; ctx.fillRect(0, FLOOR + 2, WIDTH, 35);
  ctx.strokeStyle = '#B9C9B7'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, FLOOR + 2); ctx.lineTo(WIDTH, FLOOR + 2); ctx.stroke();
  for (let i = -1; i < 32; i++) {
    const x = i * 39 - moved % 39;
    rounded(x, FLOOR + 15 + (i % 3) * 3, 11 + (i % 2) * 8, 2, 1, '#C4D4BC');
  }
}

function header(t) {
  const buff = t >= 5.5;
  const scoreTime = Math.min(t, 9.95);
  const score = Math.floor(28 * (Math.min(scoreTime, 5.5) + Math.max(0, scoreTime - 5.5) * 1.05));
  label('大肥鱼 · 开饭冲刺', 30, 42, 26, C.ink, 700);
  label('今天也要认真干饭。', 32, 67, 12, C.muted);
  rounded(378, 23, 128, 46, 12, '#F2F1E8', '#E2E7DB');
  label('SCORE', 392, 40, 10, C.muted, 700);
  label(String(score).padStart(5, '0'), 491, 59, 20, C.ink, 700, 'right');
  rounded(533, 17, 397, 61, 15, '#FFFFFF', C.line);
  const headers = ['大白饭', '移动速度', '加分倍率'];
  const values = [buff ? '1 碗' : '0 碗', buff ? '× 1.05' : '× 1.00', buff ? '× 1.05' : '× 1.00'];
  for (let i = 0; i < 3; i++) {
    const x = 598 + i * 133;
    label(headers[i], x, 38, 11, C.muted, 400, 'center');
    label(values[i], x, 64, 21, buff ? C.orange : C.ink, 700, 'center');
    if (i < 2) {
      ctx.strokeStyle = '#E7ECE5'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x + 66, 30); ctx.lineTo(x + 66, 65); ctx.stroke();
    }
  }
  if (buff && t < 6.45) {
    const p = (t - 5.5) / 0.95;
    ctx.save(); ctx.globalAlpha = (1 - p) * 0.8;
    ctx.lineWidth = 2; ctx.strokeStyle = '#EDB556';
    ctx.beginPath(); ctx.roundRect(531 - p * 5, 15 - p * 5, 401 + p * 10, 65 + p * 10, 16); ctx.stroke();
    ctx.restore();
  }
}

function subtitle(t) {
  let badge = 'READY', text = '大鱼娘出发！今天的目标：一碗热腾腾的大白饭。';
  if (t >= 1.55 && t < 3.45) { badge = 'JUMP'; text = 'Gemini 猫娘出现！轻轻一跃，成功避开。'; }
  else if (t >= 3.45 && t < 5.5) { badge = 'RICE'; text = '前方发现大白饭。干饭优先，其他稍后！'; }
  else if (t >= 5.5 && t < 7.1) { badge = '+5%'; text = '大白饭已到账：移动速度 +5%，后续加分 +5%。'; }
  else if (t >= 7.1 && t < 9.25) { badge = 'DUCK'; text = 'ChatGPT 龙娘低空经过——收收肚子，蹲下！'; }
  else if (t >= 9.25) { badge = 'NICE!'; text = '成功躲过！干饭计划，循环执行。'; }
  ctx.fillStyle = C.paper; ctx.fillRect(0, 382, WIDTH, 38);
  ctx.strokeStyle = C.line; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(25, 382); ctx.lineTo(935, 382); ctx.stroke();
  rounded(29, 392, 63, 19, 6, t >= 5.5 && t < 7.1 ? '#F7E6BE' : '#E5EDE4');
  label(badge, 60, 406, 10, t >= 5.5 && t < 7.1 ? '#B17926' : '#58796A', 700, 'center');
  label(text, 106, 406, 12, '#60736C');
  label('循环动画', 930, 406, 11, '#9AA89D', 400, 'right');
}

function confetti(t, start, x, y, count, spread = 1) {
  const age = t - start;
  if (age < 0 || age > 1.5) return;
  ctx.save(); ctx.globalAlpha = clamp(1 - age / 1.5);
  for (let i = 0; i < count; i++) {
    const angle = i * 2.39996;
    const vx = Math.cos(angle) * (50 + i % 5 * 14) * spread;
    const vy = -75 - (i % 4) * 20;
    const px = x + vx * age;
    const py = y + vy * age + age * age * 70;
    star(px, py, 3.2 + i % 3, ['#E6AF43', '#8EBEAA', '#B4A2D3'][i % 3], age * 2 + i);
  }
  ctx.restore();
}

function renderScene(t) {
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  world(t);

  // Encounters deliberately occupy separate windows; their source art remains
  // untouched. All movement/squash is a normal canvas sprite transform.
  const catX = HERO_X + (2.6 - t) * 320;
  if (catX > -100 && catX < WIDTH + 120) {
    ellipse(catX, FLOOR + 3, 31, 5, '#A9BFAF55');
    sprite('cat', catX, FLOOR + sine(t, 3.5) * 2, 104, { angle: sine(t, 3.5) * 0.025 });
    characterTag('Gemini', catX, 216, '#F3F0FB', '#8E7CA5');
  }

  const riceX = HERO_X + (5.5 - t) * 320;
  if (t < 5.5 && riceX > -70 && riceX < WIDTH + 80) {
    ellipse(riceX, FLOOR + 2, 21, 4, '#A9BFAF44');
    const bowlFoot = FLOOR - 15 + sine(t, 1.8) * 4;
    sprite('rice', riceX, bowlFoot, 66);
    star(riceX - 32, bowlFoot - 47, 4 + sine(t, 1.7), '#E9BD60', t * 0.4);
    star(riceX + 28, bowlFoot - 69, 3.7, '#E9BD60', -t * 0.5);
  }

  const dragonX = HERO_X + (8.0 - t) * 336;
  if (dragonX > -140 && dragonX < WIDTH + 140) {
    ellipse(dragonX, FLOOR + 3, 40, 4, '#A9BFAF2A');
    sprite('dragon', dragonX, 261 + sine(t, 1.2) * 3, 132, { angle: sine(t, 1.2) * 0.025 });
    characterTag('ChatGPT', dragonX, 105, '#EAF5EA', '#60846F');
    for (let i = 0; i < 3; i++) {
      rounded(dragonX + 77 + i * 15, 208 + i * 11, 16 + i * 8, 2, 1, '#96BDAB55');
    }
  }

  const jumpU = (t - 2.0) / 1.2;
  const jump = jumpU > 0 && jumpU < 1 ? 4 * jumpU * (1 - jumpU) * 128 : 0;
  const duck = smooth((t - 7.42) / 0.23) * (1 - smooth((t - 8.35) / 0.25));
  const running = t < 9.95;
  const bodyHeight = lerp(124, 74, duck);
  const groundBob = running && jump === 0 ? Math.abs(sine(t, 3.2)) * 3 : 0;
  const happyBob = t >= 9.95 ? Math.abs(sine(t - 9.95, 1.7)) * 7 : 0;
  const foot = FLOOR - jump - groundBob - happyBob;
  ellipse(HERO_X + 3, FLOOR + 3, 43 - jump * 0.1 + duck * 10, 7 - jump * 0.02, '#90AD9D55');

  if (running && jump === 0) {
    for (let i = 0; i < 5; i++) {
      const a = (t * 2.3 + i / 5) % 1;
      ellipse(HERO_X - 43 - a * 58, FLOOR - 5 - a * 12, 1.5 + (1 - a) * 2.3, 1 + (1 - a) * 1.8, `rgba(154, 181, 151, ${(1 - a) * 0.35})`);
    }
  }
  sprite('fish', HERO_X, foot, bodyHeight, {
    widen: lerp(1, 1.95, duck),
    angle: jump > 0 ? -0.09 * sine(jumpU, 0.5) : sine(t, running ? 3.2 : 1.7) * 0.018,
  });
  label('DeepSeek', HERO_X, 375, 11, '#5F82A0', 500, 'center');

  if (t >= 5.5 && t < 6.8) {
    const a = t - 5.5;
    const alpha = Math.min(1, a * 6) * (1 - smooth((a - 0.85) / 0.45));
    ctx.save(); ctx.globalAlpha = alpha;
    rounded(HERO_X - 68, 163 - a * 18, 144, 57, 12, '#FFF5D9', '#E8C578');
    label('速度 +5%', HERO_X + 4, 186 - a * 18, 17, '#BC8125', 700, 'center');
    label('得分 +5%', HERO_X + 4, 209 - a * 18, 17, '#BC8125', 700, 'center');
    ctx.restore();
  }
  confetti(t, 5.5, HERO_X, 275, 18, 1.25);

  const celebrate = smooth((t - 9.6) / 0.4);
  if (celebrate > 0) {
    ctx.save(); ctx.globalAlpha = celebrate;
    label('干饭成功！', 553, 226, 34, C.ink, 700, 'center');
    label('移速 +5%  ·  加分 +5%', 553, 258, 17, '#B78937', 500, 'center');
    rounded(311, 164, 183, 34, 12, '#FFFFFF', '#DFE8DA');
    label('好耶！再来一碗！', 402, 187, 14, '#60796B', 500, 'center');
    ctx.restore();
  }
  confetti(t, 9.65, 553, 202, 26, 2.3);

  header(t);
  subtitle(t);

}

// Cross-fade back into the exact starting scene, keeping the full illustration
// visible instead of flashing to a blank screen between loops.
renderScene(0);
const resetPixels = ctx.getImageData(0, 0, WIDTH, HEIGHT);
const resetFrame = createCanvas(WIDTH, HEIGHT);
resetFrame.getContext('2d').putImageData(resetPixels, 0, 0);
function render(t) {
  if (t === 0 || t >= 11.8) {
    ctx.putImageData(resetPixels, 0, 0);
    return;
  }
  renderScene(t);
  const fade = smooth((t - 11.2) / 0.6);
  if (fade > 0) {
    ctx.save(); ctx.globalAlpha = fade;
    ctx.drawImage(resetFrame, 0, 0); ctx.restore();
  }
}

await mkdir(OUT, { recursive: true });
for (let frame = 0; frame < DURATION * FPS; frame++) {
  render(frame / FPS);
  await writeFile(path.join(OUT, `frame-${String(frame).padStart(4, '0')}.png`), canvas.toBuffer('image/png'));
  if (frame % 60 === 0) console.log(`Rendered ${frame}/${DURATION * FPS}`);
}
const metadata = { width: WIDTH, height: HEIGHT, fps: FPS, duration: DURATION, frames: DURATION * FPS, pattern: path.join(OUT, 'frame-%04d.png'), atlas: ASSET, sprites };
await writeFile(path.join(ROOT, 'render-metadata.json'), JSON.stringify(metadata, null, 2) + '\n');
console.log(JSON.stringify(metadata));
