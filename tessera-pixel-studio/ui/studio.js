// =============================================================================================
// Tessera Pixel Studio: front-end. Runs as the `js_on_load` of a gr.HTML component, so
// `element`, `props` and `trigger` are provided by Gradio.
// =============================================================================================
const root = element.querySelector('#ts-app');
if (!root || root.dataset.ready) return;
root.dataset.ready = '1';

const $ = (s) => root.querySelector(s);
const $$ = (s) => Array.from(root.querySelectorAll(s));

// ---------------------------------------------------------------- constants & data
const G = 16, N = 256, MASK = 512;
const PAL = props.palette || [];
const K = PAL.length;
const RGB = new Uint8Array(K * 3);
PAL.forEach((c, i) => { RGB[i * 3] = c[0]; RGB[i * 3 + 1] = c[1]; RGB[i * 3 + 2] = c[2]; });
const GALLERY = (props.gallery && props.gallery.items) || [];
const METRICS = props.metrics || null;
const INFO = props.info || {};
const LIMITS = INFO.limits || { gpu: { max_images: 16, max_steps: 32 }, cpu: { max_images: 4, max_steps: 24 }, has_gpu: true };
let runDevice = LIMITS.has_gpu === false ? 'cpu' : 'gpu';
const curLimits = () => LIMITS[runDevice] || LIMITS.gpu || { max_images: 16, max_steps: 32 };
const ALL_MASK = new Uint16Array(N).fill(MASK);
const STORE_KEY = 'tessera.studio.v1';

const EXAMPLES = [
  'red health potion', 'golden crown', 'green slime monster', 'orange fox head',
  'treasure chest', 'frog with a crown', 'magic spellbook',
];
const SURPRISE = [
  'a tiny red dragon', 'haunted lantern with a green flame', 'cute pink axolotl', 'ice sword with blue glow',
  'mushroom house with a door', 'golden trophy cup', 'treasure chest full of gold coins', 'purple potion with bubbles',
  'snowy pine tree', 'robot with a heart', 'cat wearing a wizard hat', 'magic crystal ball', 'bowl of ramen',
  'sushi roll', 'fire elemental', 'cactus with a pink flower', 'knight helmet with a red plume', 'blue whale',
  'strawberry cake slice', 'old wooden barrel', 'glowing yellow star', 'green apple with a leaf', 'pirate ship',
  'black bat with red eyes', 'rainbow ice cream', 'crystal heart', 'skeleton warrior', 'leather backpack',
  'hot air balloon', 'blue butterfly', 'carrot', 'spell scroll with a red seal', 'golden shield with a lion',
  'baby penguin', 'lava golem', 'bunny holding a carrot', 'christmas present box', 'potted sunflower',
];

// ---------------------------------------------------------------- small utils
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function b64ToBytes(s) { const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
function b64ToU16(s) { const b = b64ToBytes(s); return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1); }
function bytesToB64(u8) { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); }
function u16ToB64(a) { return bytesToB64(new Uint8Array(a.buffer, a.byteOffset, a.byteLength)); }
const hex2 = (v) => v.toString(16).padStart(2, '0');
const tokHex = (t) => t <= 0 || t >= K ? 'transparent' : '#' + hex2(RGB[t * 3]) + hex2(RGB[t * 3 + 1]) + hex2(RGB[t * 3 + 2]);
const tokCss = (t) => t <= 0 || t >= K ? 'transparent' : 'rgb(' + RGB[t * 3] + ',' + RGB[t * 3 + 1] + ',' + RGB[t * 3 + 2] + ')';
const slug = (s) => (s || 'sprite').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'sprite';
const fmtMs = (ms) => ms < 1000 ? Math.round(ms) + ' ms' : (ms / 1000).toFixed(2) + ' s';
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// ---------------------------------------------------------------- visible slice
// On huggingface.co the app lives in an iframe that is resized to its full content height, so
// `position: fixed; inset: 0` would cover (and center in) the whole tall page. The part the user
// can actually see is measured with an IntersectionObserver (which reports visibility relative to
// the top-level viewport, even across origins) and overlays are placed inside it.
const EMBEDDED = (() => { try { return window.self !== window.top; } catch (e) { return true; } })();
if (EMBEDDED) root.classList.add('ts-embedded');
let vis = { top: 0, height: window.innerHeight };
function applyVis() {
  root.style.setProperty('--vis-top', Math.round(vis.top) + 'px');
  root.style.setProperty('--vis-h', Math.round(vis.height) + 'px');
}
function refreshVis() {
  return new Promise((resolve) => {
    const fallback = () => { vis = { top: 0, height: window.innerHeight }; applyVis(); resolve(vis); };
    if (!EMBEDDED || !('IntersectionObserver' in window)) return fallback();
    let done = false;
    const io = new IntersectionObserver((entries) => {
      if (done) return;
      done = true; io.disconnect();
      const r = entries[0].intersectionRect;
      if (entries[0].isIntersecting && r.height > 40) { vis = { top: Math.max(0, r.top), height: r.height }; applyVis(); resolve(vis); }
      else fallback();
    });
    io.observe(root);
    setTimeout(() => { if (!done) { done = true; io.disconnect(); fallback(); } }, 250);
  });
}
applyVis();
// keep overlays glued to the screen while the host page scrolls
setInterval(() => {
  if (EMBEDDED && (root.querySelector('.ts-modal.on') || root.querySelector('.ts-sheet.on') || root.querySelector('.ts-toast'))) refreshVis();
}, 200);
window.addEventListener('resize', () => refreshVis());

function toast(msg, err) {
  refreshVis();
  const t = document.createElement('div');
  t.className = 'ts-toast' + (err ? ' err' : '');
  t.textContent = msg;
  $('#ts-toasts').appendChild(t);
  setTimeout(() => { t.style.transition = 'opacity .3s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 320); }, err ? 6000 : 2600);
}

// ---------------------------------------------------------------- color helpers
const HEAT = [[0, 13, 8, 135], [0.25, 126, 3, 168], [0.5, 204, 71, 120], [0.75, 248, 149, 64], [1, 240, 249, 33]];
function heat(v) {
  v = clamp(v, 0, 1);
  for (let i = 1; i < HEAT.length; i++) {
    if (v <= HEAT[i][0]) {
      const a = HEAT[i - 1], b = HEAT[i], f = (v - a[0]) / (b[0] - a[0]);
      return [a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f, a[3] + (b[3] - a[3]) * f];
    }
  }
  return [240, 249, 33];
}
function tintOf(tok) {
  let r = 0, g = 0, b = 0, n = 0;
  for (let p = 0; p < N; p++) { const t = tok[p]; if (t > 0 && t < K) { r += RGB[t * 3]; g += RGB[t * 3 + 1]; b += RGB[t * 3 + 2]; n++; } }
  if (!n) return '#f4f4f6';
  r /= n; g /= n; b /= n;
  const m = 0.86; // mix with white
  return 'rgb(' + Math.round(r + (255 - r) * m) + ',' + Math.round(g + (255 - g) * m) + ',' + Math.round(b + (255 - b) * m) + ')';
}
function noiseVal(p, seed) {
  let h = (p * 374761393 + seed * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) % 26;
}

// ---------------------------------------------------------------- renderer
function paint(ctx, tok, o) {
  o = o || {};
  const img = ctx.__img || (ctx.__img = ctx.createImageData(G, G));
  const d = img.data;
  const mode = o.mode || 'pixels';
  const dark = root.dataset.bg === 'dark';
  const seed = o.noise || 0;
  for (let p = 0; p < N; p++) {
    const t = tok[p], q = p * 4;
    let r = 0, g = 0, b = 0, a = 0;
    if (t >= K) {               // still masked
      if (mode === 'ghost' && o.pre) {
        const c = o.pre[p];
        if (c > 0 && c < K) { r = RGB[c * 3]; g = RGB[c * 3 + 1]; b = RGB[c * 3 + 2]; a = 100; }
      } else if (mode === 'conf' && o.conf) {
        [r, g, b] = heat(o.conf[p] / 255); a = 150;
      } else {
        const v = (dark ? 46 : 206) + noiseVal(p, seed);
        r = v; g = v; b = v + 5; a = dark ? 255 : 235;
      }
    } else if (mode === 'conf' && o.conf) {
      [r, g, b] = heat(o.conf[p] / 255); a = 255;
    } else if (t > 0) {
      r = RGB[t * 3]; g = RGB[t * 3 + 1]; b = RGB[t * 3 + 2]; a = 255;
    }
    if (o.flash) {
      const f = o.flash[p];
      if (f > 0.02) { const w = f * 0.8; r += (255 - r) * w; g += (255 - g) * w; b += (255 - b) * w; a = Math.max(a, 255 * f); }
    }
    d[q] = r; d[q + 1] = g; d[q + 2] = b; d[q + 3] = a;
  }
  ctx.putImageData(img, 0, 0);
}

// ---------------------------------------------------------------- items
// item = { id, prompt, seed, cfg, steps, tok (final), order (commit step per pixel, 255 = kept),
//          frames [{tok, pre, conf, phase}] | null, init, done, source, ms, device, batch }
function makeItem(o) {
  return Object.assign({ id: uid(), prompt: '', seed: null, cfg: 3, steps: 16, tok: null, order: null,
    frames: null, init: null, done: true, source: 'studio', ms: null, device: null, created: Date.now() }, o);
}
function totalFrames(it) { return it.frames ? Math.max(it.frames.length, it.done ? 0 : (it.total || 0)) : (it.steps || 16); }
function availFrames(it) { return it.frames ? it.frames.length : totalFrames(it); }
function frameAt(it, k) {
  if (it.frames) {
    if (k <= 0 || !it.frames.length) return { tok: it.init || ALL_MASK };
    return it.frames[Math.min(k, it.frames.length) - 1];
  }
  if (it.order && it.tok) {
    if (k >= totalFrames(it)) return { tok: it.tok };
    const out = new Uint16Array(N);
    for (let p = 0; p < N; p++) out[p] = (it.order[p] === 255 || it.order[p] < k) ? it.tok[p] : MASK;
    return { tok: out };
  }
  return { tok: it.tok || ALL_MASK };
}
function computeOrder(it) {
  const o = new Uint8Array(N).fill(255);
  if (!it.frames) return o;
  const init = it.init || ALL_MASK;
  for (let p = 0; p < N; p++) {
    if (init[p] < K) continue;
    for (let k = 0; k < it.frames.length; k++) if (it.frames[k].tok[p] < K) { o[p] = k; break; }
  }
  return o;
}
function colorsOf(tok) {
  const seen = new Map();
  for (let p = 0; p < N; p++) { const t = tok[p]; if (t > 0 && t < K) seen.set(t, (seen.get(t) || 0) + 1); }
  return Array.from(seen.entries()).sort((a, b) => b[1] - a[1]).map((e) => e[0]);
}

// ---------------------------------------------------------------- animation loop & players
const active = new Set();
let rafOn = false;
function ensureLoop() { if (!rafOn) { rafOn = true; requestAnimationFrame(loop); } }
function loop(now) {
  for (const pl of active) if (!pl.tick(now)) active.delete(pl);
  if (active.size) requestAnimationFrame(loop); else rafOn = false;
}
const PLAYERS = new Set();
let speedMs = 80;

class Player {
  constructor(canvas, item, opts) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d');
    this.opts = opts || {};
    this.flash = new Float32Array(N);
    this.k = 0; this.last = 0; this.lastNoise = 0; this.cur = null; this.prevTok = null; this.interval = null;
    PLAYERS.add(this);
    if (item) this.set(item, this.opts.startAt == null ? 'end' : this.opts.startAt);
  }
  set(item, k) {
    this.item = item; this.flash.fill(0); this.prevTok = null;
    this.show(k === 'end' ? totalFrames(item) : k, false);
  }
  show(k, flash) {
    const it = this.item;
    this.k = clamp(k, 0, Math.max(availFrames(it), 0));
    const f = frameAt(it, this.k);
    if (flash && this.prevTok) {
      for (let p = 0; p < N; p++) if (f.tok[p] !== this.prevTok[p] && f.tok[p] < K) this.flash[p] = 1;
    }
    this.prevTok = f.tok; this.cur = f;
    this.hasMask = false;
    for (let p = 0; p < N; p++) if (f.tok[p] >= K) { this.hasMask = true; break; }
    this.render();
    if (this.opts.onStep) this.opts.onStep(this.k, totalFrames(it));
  }
  mode() {
    const m = root.dataset.view;
    return (this.cur && this.cur.pre) || (m === 'pixels') ? m : 'pixels';
  }
  render(now) {
    paint(this.ctx, this.cur ? this.cur.tok : ALL_MASK, {
      mode: this.mode(), pre: this.cur && this.cur.pre, conf: this.cur && this.cur.conf,
      flash: this.flash, noise: Math.floor((now || performance.now()) / 95),
    });
  }
  play(from, interval) {           // replay from a frame, or follow a live item
    this.interval = interval;
    if (from != null) this.show(from, false);
    this.last = 0;
    active.add(this); ensureLoop();
  }
  stop() { active.delete(this); }
  tick(now) {
    const it = this.item;
    const avail = availFrames(it);
    const iv = this.interval == null ? speedMs : this.interval;
    if (this.k < avail && now - this.last >= iv) {
      this.show(iv === 0 ? avail : this.k + 1, true);
      this.last = now;
    }
    let fl = false;
    for (let p = 0; p < N; p++) { if (this.flash[p] > 0.02) { this.flash[p] *= 0.84; fl = true; } else this.flash[p] = 0; }
    if (fl || (this.hasMask && now - this.lastNoise > 95)) { this.render(now); this.lastNoise = now; }
    const finished = it.done && this.k >= totalFrames(it);
    if (finished && !fl) { this.render(now); if (this.opts.onDone) this.opts.onDone(); return false; }
    return true;
  }
}
function rerenderAll() { for (const pl of PLAYERS) if (pl.canvas.isConnected) pl.render(); else PLAYERS.delete(pl); }

// ---------------------------------------------------------------- PNG export
function exportPng(tok, scale, name) {
  const c = document.createElement('canvas');
  c.width = G * scale; c.height = G * scale;
  const x = c.getContext('2d');
  for (let p = 0; p < N; p++) {
    const t = tok[p];
    if (t <= 0 || t >= K) continue;
    x.fillStyle = tokCss(t);
    x.fillRect((p % G) * scale, Math.floor(p / G) * scale, scale, scale);
  }
  c.toBlob((blob) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'tessera-' + slug(name) + (scale > 1 ? '-' + G * scale + 'px' : '-16px') + '.png';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }, 'image/png');
}

// ---------------------------------------------------------------- tiles
const ICON_DL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/></svg>';
const ICON_EDIT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';

function createTile(item, listFn, opts) {
  opts = opts || {};
  const el = document.createElement('div');
  el.className = 'ts-tile' + (item.done ? ' done' : ' live');
  el.tabIndex = 0;
  el.innerHTML = '<canvas class="px" width="16" height="16"></canvas>' +
    (opts.compact ? '' : '<div class="ts-tile-actions"><button data-a="edit" title="Open in Pixel Editor">' + ICON_EDIT + '</button><button data-a="dl" title="Download PNG">' + ICON_DL + '</button></div>') +
    (item.done ? '' : '<div class="ts-tile-step">0/' + (item.total || item.steps) + '</div>') +
    (opts.compact ? '' : '<div class="ts-cap"><span></span><small></small></div>');
  if (!opts.compact) {
    el.querySelector('.ts-cap span').textContent = item.prompt;
    el.querySelector('.ts-cap small').textContent = item.clip != null ? 'CLIP ' + item.clip.toFixed(1) : (item.seed != null ? 'seed ' + item.seed : '');
  }
  if (item.tok) el.style.setProperty('--tile-bg', tintOf(item.tok));
  const stepEl = el.querySelector('.ts-tile-step');
  const player = new Player(el.querySelector('canvas'), item, {
    startAt: item.done ? 'end' : 0,
    onStep: (k, T) => { if (stepEl) stepEl.textContent = k + '/' + T; },
  });
  const tile = { el, item, player };
  el.__tile = tile;
  el.addEventListener('click', (e) => {
    const a = e.target.closest('[data-a]');
    if (a) {
      e.stopPropagation();
      if (!item.tok) return;
      if (a.dataset.a === 'dl') exportPng(item.tok, 32, item.prompt);
      if (a.dataset.a === 'edit') openEditor(item);
      return;
    }
    if (opts.onClick) return opts.onClick(tile);
    if (!item.tok) return;
    openDetail(item, listFn ? listFn() : [item]);
  });
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter') el.click(); });
  if (opts.hoverReplay) {
    el.addEventListener('mouseenter', () => { if (item.done) player.play(0, 42); });
  }
  return tile;
}
function finishTile(tile) {
  const it = tile.item;
  tile.el.classList.remove('live'); tile.el.classList.add('done');
  if (it.tok) tile.el.style.setProperty('--tile-bg', tintOf(it.tok));
  const cap = tile.el.querySelector('.ts-cap small');
  if (cap && it.seed != null) cap.textContent = 'seed ' + it.seed;
}

// ---------------------------------------------------------------- tabs, view, bg, speed
function setTab(name) {
  $$('#ts-tabs .ts-tab').forEach((b) => b.classList.toggle('on', b.dataset.tab === name));
  $$('.ts-panel').forEach((p) => p.classList.toggle('on', p.dataset.panel === name));
  if (name === 'palette') drawPaletteTab();
}
$('#ts-tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) setTab(b.dataset.tab); });
function segInit(sel, fn) {
  const seg = $(sel);
  seg.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    seg.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    fn(b);
  });
}
segInit('#ts-view', (b) => { root.dataset.view = b.dataset.view; rerenderAll(); });
segInit('#ts-bg', (b) => { root.dataset.bg = b.dataset.bg; rerenderAll(); savePrefs(); });
segInit('#ts-speed', (b) => { speedMs = +b.dataset.speed; savePrefs(); });
segInit('#ts-count', () => savePrefs());

// ---------------------------------------------------------------- settings
const ranges = {};
$$('[data-param]').forEach((inp) => {
  ranges[inp.dataset.param] = inp;
  const out = root.querySelector('[data-out="' + inp.dataset.param + '"]');
  const upd = () => {
    if (inp.type === 'range') {
      const v = +inp.value;
      if (out) out.textContent = (inp.step && +inp.step < 1) ? (inp.dataset.param === 'temperature' ? v.toFixed(2) : v.toFixed(inp.step === '0.25' ? 2 : 1)) : String(v);
      inp.style.setProperty('--fill', ((v - +inp.min) / (+inp.max - +inp.min) * 100) + '%');
    }
  };
  inp.addEventListener('input', () => { upd(); savePrefs(); });
  inp.addEventListener('change', savePrefs);
  inp.__upd = upd; upd();
});
function applyLimits() {
  const lim = curLimits();
  ranges.steps.max = String(lim.max_steps || 32);
  if (+ranges.steps.value > +ranges.steps.max) ranges.steps.value = ranges.steps.max;
  ranges.steps.__upd();
  $$('#ts-count button').forEach((b) => {
    const off = +b.dataset.n > (lim.max_images || 16);
    b.disabled = off;
    b.title = off ? 'Up to ' + lim.max_images + ' images on ' + runDevice.toUpperCase() : '';
  });
  const on = root.querySelector('#ts-count button.on');
  if (!on || on.disabled) {
    const ok = $$('#ts-count button').filter((b) => !b.disabled);
    $$('#ts-count button').forEach((b) => b.classList.remove('on'));
    (ok.find((b) => b.dataset.n === '4') || ok[ok.length - 1]).classList.add('on');
  }
  $$('#ts-device button').forEach((b) => b.classList.toggle('on', b.dataset.device === runDevice));
}
function setDevice(d) {
  if (d === 'gpu' && LIMITS.has_gpu === false) d = 'cpu';
  runDevice = d;
  applyLimits();
}
if (LIMITS.has_gpu === false) { const g = root.querySelector('#ts-device button[data-device="gpu"]'); g.disabled = true; g.title = 'No GPU available on this server'; }
$('#ts-device').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b || b.disabled) return;
  setDevice(b.dataset.device);
  savePrefs();
  if (b.dataset.device === 'cpu') toast('CPU mode: no GPU quota needed, slower (up to 4 images).');
});
applyLimits();

const seedInput = $('#ts-seed');
const seedLock = $('#ts-seed-lock');
let lastSeed = null;
seedLock.addEventListener('click', () => {
  const on = !seedLock.classList.contains('on');
  seedLock.classList.toggle('on', on);
  if (on && lastSeed != null && seedInput.value === '') seedInput.value = lastSeed;
  if (!on) seedInput.value = '';
});

function readSettings() {
  const nb = root.querySelector('#ts-count button.on');
  const seedVal = seedInput.value.trim();
  return {
    device: runDevice,
    n: nb ? +nb.dataset.n : 4,
    steps: +ranges.steps.value,
    cfg: +ranges.cfg.value,
    temperature: +ranges.temperature.value,
    choice_temperature: +ranges.choice_temperature.value,
    polish: +ranges.polish.value,
    cfg_schedule: ranges.cfg_schedule.value,
    nms: ranges.nms.checked,
    seed: seedVal === '' ? null : Math.max(0, parseInt(seedVal, 10) || 0),
  };
}

function savePrefs() {
  try {
    const s = readSettings();
    localStorage.setItem(STORE_KEY + '.prefs', JSON.stringify({ s, bg: root.dataset.bg, speed: speedMs }));
  } catch (e) { /* storage unavailable */ }
}
function loadPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem(STORE_KEY + '.prefs') || 'null');
    if (!p) return;
    const s = p.s || {};
    ['steps', 'cfg', 'temperature', 'choice_temperature', 'polish'].forEach((k) => { if (s[k] != null && ranges[k]) { ranges[k].value = s[k]; ranges[k].__upd(); } });
    if (s.cfg_schedule) ranges.cfg_schedule.value = s.cfg_schedule;
    if (s.nms != null) ranges.nms.checked = !!s.nms;
    if (s.device) setDevice(s.device === 'cpu' ? 'cpu' : 'gpu');
    if (s.n) $$('#ts-count button').forEach((b) => b.classList.toggle('on', +b.dataset.n === s.n && !b.disabled));
    if (!root.querySelector('#ts-count button.on')) root.querySelector('#ts-count button[data-n="4"]').classList.add('on');
    if (p.bg) { root.dataset.bg = p.bg; $$('#ts-bg button').forEach((b) => b.classList.toggle('on', b.dataset.bg === p.bg)); }
    if (p.speed != null) { speedMs = p.speed; $$('#ts-speed button').forEach((b) => b.classList.toggle('on', +b.dataset.speed === p.speed)); }
  } catch (e) { /* ignore */ }
}

// ---------------------------------------------------------------- prompt box & chips
const promptEl = $('#ts-prompt');
const chips = $('#ts-chips');
EXAMPLES.forEach((t) => {
  const b = document.createElement('button');
  b.className = 'ts-chip'; b.textContent = t;
  b.addEventListener('click', () => { promptEl.value = t; promptEl.focus(); });
  chips.appendChild(b);
});
promptEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); createFromSidebar(); }
});

// ---------------------------------------------------------------- jobs (bridge to Python)
const JOBS = {};
let busy = false;
let busyTimer = null;
const createBtn = $('#ts-create');
const createFill = $('#ts-create-fill');
const createLabel = $('#ts-create-label');
const CREATE_HTML = createLabel.innerHTML;
const edGenBtn = $('#ts-ed-generate');

function setBusy(on, label) {
  busy = on;
  createBtn.disabled = on; edGenBtn.disabled = on;
  createBtn.classList.toggle('busy', on);
  if (on) { createLabel.textContent = label || 'Queued...'; }
  else { createLabel.innerHTML = CREATE_HTML; createFill.style.width = '0%'; }
}
function progress(frac, label) {
  createFill.style.width = (clamp(frac, 0, 1) * 100).toFixed(1) + '%';
  if (label) createLabel.textContent = label;
}

function startJob(params, h) {
  if (busy) { toast('Still painting the previous request, one moment...'); return null; }
  const job = 'j' + uid();
  params.job = job;
  JOBS[job] = h;
  setBusy(true, params.device === 'cpu' ? 'Starting on CPU...' : 'Waiting for GPU...');
  clearTimeout(busyTimer);
  busyTimer = setTimeout(() => {
    if (JOBS[job]) { h.error({ msg: 'The request timed out. The queue may be busy, please try again.' }); endJob(job); }
  }, 150000);
  try {
    trigger('submit', { payload: JSON.stringify(params) });
  } catch (e) {
    h.error({ msg: 'Could not reach the server: ' + e }); endJob(job);
  }
  return job;
}
function endJob(job) {
  delete JOBS[job];
  clearTimeout(busyTimer);
  setBusy(false);
}
window.__tesseraBus = (raw) => {
  let m;
  try { m = JSON.parse(raw); } catch (e) { return; }
  const h = JOBS[m.job];
  if (!h) return;
  if (m.t === 'start') {
    clearTimeout(busyTimer);
    busyTimer = setTimeout(() => { if (JOBS[m.job]) { h.error({ msg: 'Generation stalled, please try again.' }); endJob(m.job); } }, 120000);
    h.start(m);
  } else if (m.t === 'frame') h.frame(m);
  else if (m.t === 'done') { h.done(m); endJob(m.job); }
  else if (m.t === 'error') { h.error(m); endJob(m.job); }
};

// Runs a batch and streams it into a set of fresh items. `ui` receives the items and callbacks.
function runBatch(spec, ui) {
  const s = Object.assign(readSettings(), spec.settings || {});
  const n = spec.n || s.n;
  const params = {
    device: s.device, mode: spec.mode || 'generate', prompt: spec.prompt, n: Math.min(n, curLimits().max_images || n), steps: s.steps, cfg: s.cfg,
    temperature: s.temperature, choice_temperature: s.choice_temperature, polish: s.polish,
    cfg_schedule: s.cfg_schedule, nms: s.nms, seed: s.seed,
  };
  let init = null;
  if (spec.mode === 'inpaint') {
    params.init = u16ToB64(spec.init);
    params.keep = bytesToB64(spec.keep);
    init = new Uint16Array(N);
    for (let p = 0; p < N; p++) init[p] = spec.keep[p] ? spec.init[p] : MASK;
  }
  const batchId = uid();
  const items = [];
  for (let i = 0; i < params.n; i++) {
    items.push(makeItem({ prompt: spec.prompt, cfg: s.cfg, steps: s.steps + s.polish, total: s.steps + s.polish,
      frames: [], init, done: false, source: spec.source || 'studio', batch: batchId, label: spec.label }));
  }
  const t0 = performance.now();
  if (ui.begin) ui.begin(items, params);
  return startJob(params, {
    start(m) {
      lastSeed = m.seed;
      if (seedLock.classList.contains('on')) seedInput.value = m.seed;
      items.forEach((it) => { it.seed = m.seed; it.total = m.total; it.device = m.device; });
      progress(0.02, 'Painting...');
      if (ui.start) ui.start(m, items);
    },
    frame(m) {
      const tok = b64ToU16(m.tok), pre = b64ToU16(m.pre), conf = b64ToBytes(m.conf);
      for (let i = 0; i < items.length; i++) {
        items[i].frames.push({ tok: tok.subarray(i * N, (i + 1) * N), pre: pre.subarray(i * N, (i + 1) * N),
          conf: conf.subarray(i * N, (i + 1) * N), phase: m.phase });
      }
      const T = items[0].total || 16;
      progress((m.k + 1) / T, 'Step ' + (m.k + 1) + ' / ' + T);
      if (ui.frame) ui.frame(m, items);
    },
    done(m) {
      const tok = b64ToU16(m.tok);
      items.forEach((it, i) => {
        it.tok = tok.slice(i * N, (i + 1) * N);
        it.order = computeOrder(it);
        it.ms = m.ms; it.device = m.device; it.done = true;
      });
      if (ui.done) ui.done(m, items, performance.now() - t0);
    },
    error(m) {
      // ZeroGPU quota exhausted (or GPU unavailable): fall back to the CPU copy and run again
      const gpuIssue = params.device === 'gpu' && LIMITS.has_gpu !== false &&
        /zerogpu|quota|runs limit|gpu task|no gpu|cuda/i.test(m.msg || '');
      if (ui.error) ui.error(m, items);
      if (gpuIssue && spec.retry) {
        setDevice('cpu'); savePrefs();
        toast('GPU quota reached for now, so this runs on CPU instead (switch back any time).');
        setTimeout(() => spec.retry(), 80);
        return;
      }
      toast(m.msg || 'Something went wrong.', true);
    },
  });
}

// ---------------------------------------------------------------- studio (session creations)
const studioGrid = $('#ts-studio-grid');
const BATCHES = [];      // newest first: { id, prompt, items, head, tiles, ms, device, label }
const live = { el: $('#ts-live'), prompt: $('#ts-live-prompt'), meta: $('#ts-live-meta'), bar: $('#ts-live-bar'), step: $('#ts-live-step') };

function studioItems() { const out = []; BATCHES.forEach((b) => b.items.forEach((it) => { if (it.tok) out.push(it); })); return out; }
function updateStudioCount() {
  const n = studioItems().length;
  const badge = $('#ts-studio-count');
  badge.textContent = n; badge.classList.toggle('zero', n === 0);
  $('#ts-empty').hidden = BATCHES.length > 0;
}
function batchHead(b) {
  const h = document.createElement('div');
  h.className = 'ts-batch-head';
  h.innerHTML = '<b></b><span></span><button title="Remove from studio">Remove</button>';
  h.querySelector('b').textContent = (b.label ? b.label + ': ' : '') + b.prompt;
  h.querySelector('button').addEventListener('click', () => removeBatch(b));
  b.head = h;
  updateBatchHead(b);
  return h;
}
function updateBatchHead(b) {
  const parts = [b.items.length + (b.items.length === 1 ? ' image' : ' images')];
  if (b.items[0] && b.items[0].seed != null) parts.push('seed ' + b.items[0].seed);
  if (b.ms != null) parts.push(fmtMs(b.ms));
  if (b.device) parts.push(b.device);
  b.head.querySelector('span').textContent = parts.join(' / ');
}
function addBatch(b, atTop) {
  b.tiles = b.items.map((it) => createTile(it, studioItems));
  const frag = document.createDocumentFragment();
  frag.appendChild(batchHead(b));
  b.tiles.forEach((t) => frag.appendChild(t.el));
  if (atTop) { studioGrid.prepend(frag); BATCHES.unshift(b); } else { studioGrid.appendChild(frag); BATCHES.push(b); }
  updateStudioCount();
}
function removeBatch(b) {
  const i = BATCHES.indexOf(b);
  if (i < 0) return;
  BATCHES.splice(i, 1);
  b.head.remove(); b.tiles.forEach((t) => { t.player.stop(); PLAYERS.delete(t.player); t.el.remove(); });
  saveHistory(); updateStudioCount();
}

function generateInStudio(spec) {
  const prompt = (spec.prompt || '').trim();
  if (!prompt) { toast('Type a prompt first (or press the dice for a surprise).'); promptEl.focus(); return; }
  if (busy) { toast('Still painting the previous request, one moment...'); return; }
  let batch = null;
  runBatch(Object.assign({}, spec, { prompt, retry: () => generateInStudio(spec) }), {
    begin(items, params) {
      batch = { id: items[0].batch, prompt, items, label: spec.label, ms: null, device: null };
      addBatch(batch, true);
      setTab('studio');
      // scroll only this document (scrollIntoView would also scroll the Hugging Face page around the iframe)
      const mr = root.querySelector('.ts-main').getBoundingClientRect();
      if (mr.top < -4 || mr.top > window.innerHeight * 0.5) window.scrollTo({ top: window.scrollY + mr.top - 8, behavior: 'smooth' });
      live.el.hidden = false; live.el.classList.remove('done', 'error');
      live.prompt.textContent = (spec.label ? spec.label + ': ' : '') + prompt;
      live.meta.textContent = params.device === 'cpu' ? 'Starting on CPU (slower, no GPU quota needed)...' : 'Waiting for a GPU slot...';
      live.bar.style.width = '0%';
      live.step.textContent = '0/' + (params.steps + params.polish);
      batch.tiles.forEach((t) => t.player.play(0));
    },
    start(m) {
      live.meta.textContent = m.n + ' image' + (m.n > 1 ? 's' : '') + ' / seed ' + m.seed + ' / ' + m.device;
      updateBatchHead(batch);
      batch.tiles.forEach((t) => t.player.play());
    },
    frame(m, items) {
      const T = items[0].total;
      live.bar.style.width = ((m.k + 1) / T * 100).toFixed(1) + '%';
      live.step.textContent = (m.k + 1) + '/' + T;
      live.meta.textContent = items.length + ' image' + (items.length > 1 ? 's' : '') + ' / seed ' + items[0].seed + ' / ' + items[0].device + ' / ' + fmtMs(m.ms);
    },
    done(m, items) {
      batch.ms = m.ms; batch.device = m.device;
      updateBatchHead(batch);
      batch.tiles.forEach((t) => { t.player.opts.onDone = () => finishTile(t); t.player.play(); });
      live.el.classList.add('done');
      live.bar.style.width = '100%';
      live.meta.textContent = 'Done in ' + fmtMs(m.ms) + ' on ' + m.device + ' / ' + items.length + ' image' + (items.length > 1 ? 's' : '') + ' / seed ' + items[0].seed;
      saveHistory(); updateStudioCount();
    },
    error() {
      live.el.classList.add('error');
      live.meta.textContent = 'Failed. See the message below and try again.';
      if (batch) removeBatch(batch);
    },
  });
}
function createFromSidebar() { generateInStudio({ prompt: promptEl.value }); }
createBtn.addEventListener('click', createFromSidebar);

// history persistence (final tokens + commit order only)
function saveHistory() {
  try {
    const data = BATCHES.slice(0, 40).filter((b) => b.items.every((it) => it.tok)).map((b) => ({
      prompt: b.prompt, label: b.label || null, ms: b.ms, device: b.device,
      items: b.items.map((it) => ({ tok: u16ToB64(it.tok), order: bytesToB64(it.order || new Uint8Array(N)), seed: it.seed,
        steps: it.frames ? it.frames.length : it.steps, cfg: it.cfg, source: it.source, created: it.created })),
    }));
    localStorage.setItem(STORE_KEY + '.history', JSON.stringify(data));
  } catch (e) { /* storage full or unavailable */ }
}
function loadHistory() {
  try {
    const data = JSON.parse(localStorage.getItem(STORE_KEY + '.history') || '[]');
    data.reverse().forEach((b) => {
      const items = b.items.map((x) => makeItem({ prompt: b.prompt, tok: b64ToU16(x.tok).slice(), order: b64ToBytes(x.order),
        seed: x.seed, steps: x.steps || 16, cfg: x.cfg, source: x.source || 'studio', created: x.created, ms: b.ms, device: b.device }));
      addBatch({ id: uid(), prompt: b.prompt, items, label: b.label, ms: b.ms, device: b.device }, true);
      BATCHES[0].tiles.forEach((t) => finishTile(t));
    });
  } catch (e) { /* ignore corrupt history */ }
}

// ---------------------------------------------------------------- explore gallery
const exploreItems = GALLERY.map((g) => makeItem({ prompt: g.prompt, seed: g.seed, steps: g.steps, cfg: g.cfg, clip: g.clip,
  tok: b64ToU16(g.tok).slice(), order: b64ToBytes(g.order), source: 'explore' }));
const exploreGrid = $('#ts-explore-grid');
exploreItems.forEach((it, i) => {
  const t = createTile(it, () => exploreItems, { hoverReplay: true });
  t.el.style.animationDelay = Math.min(i * 18, 600) + 'ms';
  exploreGrid.appendChild(t.el);
});
const findExplore = (q) => exploreItems.find((it) => it.prompt.indexOf(q) >= 0) || exploreItems[0];

// ---------------------------------------------------------------- logo, avatar, empty sprite
function drawStatic(canvasSel, item) { const c = root.querySelector(canvasSel); if (c && item) paint(c.getContext('2d'), item.tok); }
if (exploreItems.length) {
  drawStatic('#ts-logo', findExplore('crystal'));
  drawStatic('#wu-logo', findExplore('crystal'));
  drawStatic('#ts-empty-sprite', findExplore('ghost'));
  const avatarItems = ['fox', 'crown', 'slime', 'potion', 'duck', 'cat', 'frog', 'mushroom', 'rocket', 'dragon'].map(findExplore);
  const avatarIn = $('#ts-avatar-in');
  const avatar = new Player($('#ts-avatar'), avatarItems[0]);
  let ai = 0;
  const cycle = () => {
    const it = avatarItems[ai % avatarItems.length]; ai++;
    avatarIn.style.setProperty('--avatar-bg', tintOf(it.tok));
    avatar.set(it, 0); avatar.play(0, 55);
  };
  cycle();
  setInterval(() => { if (!document.hidden) cycle(); }, 4200);
}

// ---------------------------------------------------------------- detail modal
const detail = {
  el: $('#ts-detail'), stage: $('#ts-d-stage'), scrub: $('#ts-d-scrub'), step: $('#ts-d-step'),
  prompt: $('#ts-d-prompt'), meta: $('#ts-d-meta'), colors: $('#ts-d-colors'), source: $('#ts-d-source'),
  colorsLabel: $('#ts-d-colors-label'), item: null, list: [],
};
detail.player = new Player($('#ts-d-canvas'), null, {
  onStep: (k, T) => { detail.scrub.max = T; detail.scrub.value = k; detail.step.textContent = 'step ' + k + '/' + T;
    detail.scrub.style.setProperty('--fill', (T ? k / T * 100 : 100) + '%'); },
});
function openDetail(item, list) {
  detail.item = item; detail.list = list || [item];
  detail.stage.style.setProperty('--tile-bg', tintOf(item.tok));
  detail.player.stop();
  detail.player.set(item, 'end');
  detail.prompt.textContent = item.prompt;
  detail.source.textContent = item.source === 'explore' ? 'Explore gallery' : (item.source === 'editor' ? 'Pixel Editor' : 'Your studio');
  const meta = [];
  if (item.seed != null) meta.push('seed ' + item.seed);
  meta.push((item.frames ? item.frames.length : item.steps) + ' steps');
  if (item.cfg != null) meta.push('cfg ' + item.cfg);
  if (item.clip != null) meta.push('CLIP ' + item.clip.toFixed(1));
  if (item.ms != null) meta.push(fmtMs(item.ms));
  if (item.device) meta.push(item.device);
  detail.meta.innerHTML = meta.map((m) => '<span>' + escapeHtml(m) + '</span>').join('');
  const cols = colorsOf(item.tok);
  detail.colorsLabel.textContent = cols.length + ' palette colors used';
  detail.colors.innerHTML = cols.slice(0, 48).map((t) => '<i title="token ' + t + ' / ' + tokHex(t) + '" style="background:' + tokCss(t) + '"></i>').join('');
  const multi = detail.list.length > 1;
  root.querySelectorAll('.ts-stage-nav').forEach((b) => { b.hidden = !multi; });
  showModal(detail.el);
  detail.player.play(0, 70);
}
function detailNav(d) {
  const L = detail.list, i = L.indexOf(detail.item);
  if (L.length < 2 || i < 0) return;
  openDetail(L[(i + d + L.length) % L.length], L);
}
detail.scrub.addEventListener('input', () => { detail.player.stop(); detail.player.show(+detail.scrub.value, false); });

// ---------------------------------------------------------------- modals
let openModal = null;
function showModal(el) {
  if (openModal && openModal !== el) openModal.classList.remove('on');
  openModal = el;
  refreshVis().then(() => { if (openModal === el) el.classList.add('on'); });
}
function closeModal() {
  if (!openModal) return;
  openModal.classList.remove('on');
  if (openModal === detail.el) detail.player.stop();
  openModal = null;
}
$$('.ts-modal').forEach((m) => m.addEventListener('mousedown', (e) => { if (e.target === m) closeModal(); }));

// ---------------------------------------------------------------- pixel editor
const ed = {
  el: $('#ts-editor'), canvas: $('#ts-ed-canvas'), overlay: $('#ts-ed-overlay'), stage: $('#ts-ed-stage'),
  hint: $('#ts-ed-hint'), pal: $('#ts-ed-palette'), prompt: $('#ts-ed-prompt'), results: $('#ts-ed-results'),
  tok: new Uint16Array(N), locked: new Uint8Array(N), color: 1, tool: 'pencil', undo: [], down: false, hover: -1, cands: [],
};
ed.ctx = ed.canvas.getContext('2d');
ed.octx = ed.overlay.getContext('2d');

function edRender() {
  paint(ed.ctx, ed.tok);
  const o = ed.octx, S = ed.overlay.width / G;
  o.clearRect(0, 0, ed.overlay.width, ed.overlay.height);
  let marked = 0;
  for (let p = 0; p < N; p++) {
    if (ed.locked[p]) continue;
    marked++;
    const x = (p % G) * S, y = Math.floor(p / G) * S;
    o.fillStyle = 'rgba(108,75,255,0.22)';
    o.fillRect(x, y, S, S);
    o.strokeStyle = 'rgba(108,75,255,0.75)';
    o.lineWidth = 1.5;
    o.beginPath();
    o.moveTo(x, y + S * 0.5); o.lineTo(x + S * 0.5, y);
    o.moveTo(x, y + S); o.lineTo(x + S, y);
    o.moveTo(x + S * 0.5, y + S); o.lineTo(x + S, y + S * 0.5);
    o.stroke();
  }
  if (ed.hover >= 0) {
    o.strokeStyle = 'rgba(13,13,16,.85)'; o.lineWidth = 2;
    o.strokeRect((ed.hover % G) * S + 1, Math.floor(ed.hover / G) * S + 1, S - 2, S - 2);
  }
  ed.marked = marked;
  $('#ts-ed-generate-label').textContent = marked === N ? 'Paint the whole canvas' : (marked ? 'Repaint ' + marked + ' marked pixels' : 'Mark pixels to repaint first');
  edHint();
}
function edHint() {
  const p = ed.hover;
  let s = ed.marked + ' / 256 pixels marked for repaint';
  if (p >= 0) s = 'x ' + (p % G) + ', y ' + Math.floor(p / G) + ' / token ' + ed.tok[p] + ' ' + tokHex(ed.tok[p]) + ' / ' + (ed.locked[p] ? 'locked' : 'marked') + '  -  ' + s;
  ed.hint.textContent = s;
}
function edSetColor(t) {
  ed.color = t;
  $('#ts-ed-color').style.background = t > 0 ? tokCss(t) : 'repeating-conic-gradient(#ddd 0 25%, #fff 0 50%) 50% / 12px 12px';
  $('#ts-ed-color-hex').textContent = t > 0 ? 'token ' + t + ' / ' + tokHex(t) : 'token 0 / transparent';
  edDrawPalette();
}
function edDrawPalette() {
  const x = ed.pal.getContext('2d');
  const img = x.createImageData(32, 16);
  for (let i = 0; i < 512; i++) {
    const q = i * 4;
    if (i === 0 || i >= K) { img.data[q] = 236; img.data[q + 1] = 236; img.data[q + 2] = 240; img.data[q + 3] = 255; }
    else { img.data[q] = RGB[i * 3]; img.data[q + 1] = RGB[i * 3 + 1]; img.data[q + 2] = RGB[i * 3 + 2]; img.data[q + 3] = 255; }
  }
  x.putImageData(img, 0, 0);
}
function edSetTool(t) { ed.tool = t; $$('#ts-ed-tools [data-tool]').forEach((b) => b.classList.toggle('on', b.dataset.tool === t)); }
function edPush() { ed.undo.push([ed.tok.slice(), ed.locked.slice()]); if (ed.undo.length > 60) ed.undo.shift(); }
function edUndo() { const s = ed.undo.pop(); if (!s) return; ed.tok = s[0]; ed.locked = s[1]; edRender(); }
function edCell(e) {
  const r = ed.overlay.getBoundingClientRect();
  const x = Math.floor((e.clientX - r.left) / r.width * G), y = Math.floor((e.clientY - r.top) / r.height * G);
  return (x < 0 || y < 0 || x >= G || y >= G) ? -1 : y * G + x;
}
function edApply(p) {
  if (p < 0) return;
  const t = ed.tool;
  if (t === 'pencil') { ed.tok[p] = ed.color; ed.locked[p] = 1; }
  else if (t === 'eraser') { ed.tok[p] = 0; ed.locked[p] = 1; }
  else if (t === 'magic') ed.locked[p] = 0;
  else if (t === 'unmark') ed.locked[p] = 1;
  else if (t === 'picker') { edSetColor(ed.tok[p] < K ? ed.tok[p] : 0); edSetTool('pencil'); }
  else if (t === 'fill') {
    const target = ed.tok[p], stack = [p], seen = new Uint8Array(N);
    while (stack.length) {
      const c = stack.pop();
      if (seen[c] || ed.tok[c] !== target) continue;
      seen[c] = 1; ed.tok[c] = ed.color; ed.locked[c] = 1;
      const x = c % G, y = (c / G) | 0;
      if (x > 0) stack.push(c - 1); if (x < G - 1) stack.push(c + 1);
      if (y > 0) stack.push(c - G); if (y < G - 1) stack.push(c + G);
    }
  }
}
ed.overlay.addEventListener('pointerdown', (e) => {
  e.preventDefault(); edPush(); ed.down = true; ed.overlay.setPointerCapture(e.pointerId);
  edApply(edCell(e)); edRender();
});
ed.overlay.addEventListener('pointermove', (e) => {
  const p = edCell(e);
  if (ed.down && ed.tool !== 'fill' && ed.tool !== 'picker') edApply(p);
  ed.hover = p; edRender();
});
ed.overlay.addEventListener('pointerup', () => { ed.down = false; });
ed.overlay.addEventListener('pointerleave', () => { ed.hover = -1; if (!ed.down) edRender(); });
ed.pal.addEventListener('click', (e) => {
  const r = ed.pal.getBoundingClientRect();
  const i = Math.floor((e.clientY - r.top) / r.height * 16) * 32 + Math.floor((e.clientX - r.left) / r.width * 32);
  edSetColor(clamp(i, 0, K - 1));
  if (ed.tool !== 'pencil' && ed.tool !== 'fill') edSetTool('pencil');
});
$('#ts-ed-tools').addEventListener('click', (e) => { const b = e.target.closest('[data-tool]'); if (b) edSetTool(b.dataset.tool); });

function openEditor(item, color) {
  ed.undo = [];
  if (item && item.tok) { ed.tok = item.tok.slice(); ed.locked = new Uint8Array(N).fill(1); ed.prompt.value = item.prompt; edSetTool('magic'); }
  else { ed.tok = new Uint16Array(N); ed.locked = new Uint8Array(N); ed.prompt.value = promptEl.value.trim(); edSetTool('pencil'); }
  const cols = item && item.tok ? colorsOf(item.tok) : [];
  edSetColor(color != null ? color : (cols[0] || ed.color || 1));
  ed.results.innerHTML = ''; ed.cands = [];
  edRender();
  showModal(ed.el);
}
function edGenerate() {
  const prompt = ed.prompt.value.trim() || promptEl.value.trim();
  if (!prompt) { toast('Give the editor a prompt describing the sprite.'); ed.prompt.focus(); return; }
  if (!ed.marked) { toast('Use the Magic brush to mark pixels for Tessera to repaint.'); edSetTool('magic'); return; }
  ed.results.innerHTML = '';
  const tiles = [];
  runBatch({ mode: 'inpaint', prompt, n: 4, init: ed.tok.slice(), keep: ed.locked.slice(), source: 'editor', retry: edGenerate }, {
    begin(items) {
      items.forEach((it) => {
        const t = createTile(it, null, { compact: true, onClick: (tile) => {
          if (!tile.item.tok) return;
          edPush(); ed.tok = tile.item.tok.slice(); ed.locked = new Uint8Array(N).fill(1); edRender();
          toast('Applied. Mark more pixels to keep refining.');
        } });
        tiles.push(t); ed.results.appendChild(t.el); t.player.play(0);
      });
    },
    start() { tiles.forEach((t) => t.player.play()); },
    done() { tiles.forEach((t) => { t.player.opts.onDone = () => finishTile(t); t.player.play(); }); },
    error() { ed.results.innerHTML = ''; },
  });
}
edGenBtn.addEventListener('click', edGenerate);

// ---------------------------------------------------------------- palette tab
let paletteDrawn = false;
function drawPaletteTab() {
  if (paletteDrawn) return;
  paletteDrawn = true;
  const c = $('#ts-palette-canvas');
  const x = c.getContext('2d');
  const img = x.createImageData(32, 16);
  for (let i = 0; i < 512; i++) {
    const q = i * 4;
    if (i === 0 || i >= K) { img.data[q] = 236; img.data[q + 1] = 236; img.data[q + 2] = 240; }
    else { img.data[q] = RGB[i * 3]; img.data[q + 1] = RGB[i * 3 + 1]; img.data[q + 2] = RGB[i * 3 + 2]; }
    img.data[q + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  const pick = (e) => {
    const r = c.getBoundingClientRect();
    return clamp(Math.floor((e.clientY - r.top) / r.height * 16) * 32 + Math.floor((e.clientX - r.left) / r.width * 32), 0, 511);
  };
  const info = (i) => {
    $('#ts-pal-swatch').style.background = i === 0 ? 'repeating-conic-gradient(#e4e4e8 0 25%, #fff 0 50%) 50% / 16px 16px' : tokCss(i);
    $('#ts-pal-idx').textContent = i + (i === 0 ? ' (transparent)' : '');
    $('#ts-pal-hex').textContent = i === 0 ? '-' : tokHex(i);
    $('#ts-pal-rgb').textContent = i === 0 ? 'alpha 0' : RGB[i * 3] + ', ' + RGB[i * 3 + 1] + ', ' + RGB[i * 3 + 2];
  };
  c.addEventListener('mousemove', (e) => info(pick(e)));
  c.addEventListener('click', (e) => openEditor(null, pick(e)));
  info(1);
}

// ---------------------------------------------------------------- write-up
const sheet = $('#ts-writeup');
let chartsDrawn = false;
function openWriteup() {
  refreshVis().then(() => { sheet.classList.add('on'); sheet.scrollTop = 0; });
  if (!EMBEDDED) document.documentElement.style.overflow = 'hidden';
  if (!chartsDrawn) { chartsDrawn = true; try { drawWriteup(); } catch (e) { console.error('[tessera] write-up charts', e); } }
}
function closeWriteup() { sheet.classList.remove('on'); document.documentElement.style.overflow = ''; }
$('#wu-toc').addEventListener('click', (e) => {
  const a = e.target.closest('a');
  if (!a) return;
  e.preventDefault();
  const t = sheet.querySelector(a.getAttribute('href'));
  if (t) sheet.scrollTo({ top: t.offsetTop - 76, behavior: 'smooth' });
});
sheet.addEventListener('scroll', () => {
  const max = sheet.scrollHeight - sheet.clientHeight;
  $('#wu-progress').style.width = (max > 0 ? sheet.scrollTop / max * 100 : 0) + '%';
  let cur = null;
  sheet.querySelectorAll('article section[id]').forEach((s) => { if (s.offsetTop - 120 <= sheet.scrollTop) cur = s.id; });
  sheet.querySelectorAll('.wu-toc a').forEach((a) => a.classList.toggle('on', a.getAttribute('href') === '#' + cur));
}, { passive: true });

// --- tiny SVG chart kit
function niceTicks(min, max, n) {
  const span = max - min, step0 = span / Math.max(1, n), mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0) || step0;
  const out = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-12; v += step) out.push(+v.toPrecision(12));
  return out;
}
function lineChart(host, c) {
  const W = c.width || 720, H = c.height || 280;
  const L = 56, R = c.y2 ? 56 : 18, T = 16, B = 38;
  const xs = (v) => L + (v - c.x.min) / (c.x.max - c.x.min) * (W - L - R);
  const mkY = (ax) => (v) => {
    const a = ax.log ? Math.log(ax.min) : ax.min, b = ax.log ? Math.log(ax.max) : ax.max;
    const vv = ax.log ? Math.log(Math.max(v, 1e-12)) : v;
    return T + (1 - (clamp(vv, a, b) - a) / (b - a)) * (H - T - B);
  };
  const ys = mkY(c.y), ys2 = c.y2 ? mkY(c.y2) : null;
  let s = '<svg viewBox="0 0 ' + W + ' ' + H + '" font-family="Inter, sans-serif" font-size="11">';
  (c.y.ticks || niceTicks(c.y.min, c.y.max, 5)).forEach((v) => {
    const y = ys(v);
    s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y + '" y2="' + y + '" stroke="#eeeef2"/>';
    s += '<text x="' + (L - 8) + '" y="' + (y + 4) + '" text-anchor="end" fill="#8a8a94">' + (c.y.fmt ? c.y.fmt(v) : v) + '</text>';
  });
  if (c.y2) (c.y2.ticks || niceTicks(c.y2.min, c.y2.max, 5)).forEach((v) => {
    s += '<text x="' + (W - R + 8) + '" y="' + (ys2(v) + 4) + '" fill="' + (c.y2.color || '#8a8a94') + '">' + (c.y2.fmt ? c.y2.fmt(v) : v) + '</text>';
  });
  (c.x.ticks || niceTicks(c.x.min, c.x.max, 6)).forEach((v) => {
    const x = xs(v);
    s += '<line x1="' + x + '" x2="' + x + '" y1="' + (H - B) + '" y2="' + (H - B + 4) + '" stroke="#c4c4cc"/>';
    s += '<text x="' + x + '" y="' + (H - B + 18) + '" text-anchor="middle" fill="#8a8a94">' + (c.x.fmt ? c.x.fmt(v) : v) + '</text>';
  });
  s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + (H - B) + '" y2="' + (H - B) + '" stroke="#c4c4cc"/>';
  if (c.x.label) s += '<text x="' + ((L + W - R) / 2) + '" y="' + (H - 4) + '" text-anchor="middle" fill="#6e6e78">' + c.x.label + '</text>';
  if (c.y.label) s += '<text transform="translate(13 ' + ((T + H - B) / 2) + ') rotate(-90)" text-anchor="middle" fill="#6e6e78">' + c.y.label + '</text>';
  if (c.y2 && c.y2.label) s += '<text transform="translate(' + (W - 8) + ' ' + ((T + H - B) / 2) + ') rotate(90)" text-anchor="middle" fill="' + (c.y2.color || '#6e6e78') + '">' + c.y2.label + '</text>';
  (c.bands || []).forEach((bd) => {
    s += '<rect x="' + xs(bd.from) + '" y="' + T + '" width="' + (xs(bd.to) - xs(bd.from)) + '" height="' + (H - T - B) + '" fill="' + bd.color + '"/>';
    if (bd.label) s += '<text x="' + (xs(bd.from) + 6) + '" y="' + (T + 14) + '" fill="#6e6e78" font-size="10.5">' + bd.label + '</text>';
  });
  c.series.forEach((sr) => {
    const yf = sr.axis === 2 ? ys2 : ys;
    const d = sr.pts.map((p, i) => (i ? 'L' : 'M') + xs(p[0]).toFixed(1) + ' ' + yf(p[1]).toFixed(1)).join('');
    s += '<path d="' + d + '" fill="none" stroke="' + sr.color + '" stroke-width="' + (sr.width || 2) + '"' +
      (sr.dash ? ' stroke-dasharray="' + sr.dash + '"' : '') + ' stroke-linejoin="round" stroke-linecap="round" opacity="' + (sr.opacity || 1) + '"/>';
    if (sr.dots) sr.pts.forEach((p) => { s += '<circle cx="' + xs(p[0]) + '" cy="' + yf(p[1]) + '" r="2.6" fill="' + sr.color + '"/>'; });
  });
  s += '</svg>';
  s += '<div class="wu-legend">' + c.series.filter((sr) => sr.name).map((sr) => '<span><i style="background:' + sr.color + '"></i>' + sr.name + '</span>').join('') + '</div>';
  host.innerHTML = s;
}
const kfmt = (v) => v === 0 ? '0' : (v >= 1000 ? (v / 1000) + 'k' : String(v));

function drawWriteup() {
  // palette
  const pc = $('#wu-palette'), px = pc.getContext('2d'), img = px.createImageData(32, 16);
  for (let i = 0; i < 512; i++) {
    const q = i * 4;
    if (i === 0 || i >= K) { img.data[q] = 236; img.data[q + 1] = 236; img.data[q + 2] = 240; }
    else { img.data[q] = RGB[i * 3]; img.data[q + 1] = RGB[i * 3 + 1]; img.data[q + 2] = RGB[i * 3 + 2]; }
    img.data[q + 3] = 255;
  }
  px.putImageData(img, 0, 0);

  // unmasking schedule (matches the sampler: remaining = floor(256 * cos(pi/2 * k/S)))
  const S = 16, commits = [];
  let prev = N;
  for (let k = 1; k <= S; k++) {
    const rem = k === S ? 0 : Math.floor(N * Math.cos(Math.PI / 2 * k / S));
    commits.push(Math.max(1, prev - rem)); prev = Math.min(prev, rem);
  }
  {
    const W = 720, H = 230, L = 40, B = 34, T = 18, bw = (W - L - 10) / S;
    const mx = Math.max.apply(null, commits);
    let s = '<svg viewBox="0 0 ' + W + ' ' + H + '" font-family="Inter, sans-serif" font-size="11">';
    let cum = 0;
    commits.forEach((v, i) => {
      cum += v;
      const h = v / mx * (H - T - B), x = L + i * bw + 4, y = H - B - h;
      s += '<rect x="' + x + '" y="' + y + '" width="' + (bw - 8) + '" height="' + h + '" rx="4" fill="' + (i < 4 ? '#c9bcff' : '#6c4bff') + '"/>';
      s += '<text x="' + (x + (bw - 8) / 2) + '" y="' + (y - 5) + '" text-anchor="middle" fill="#33333d" font-weight="600">' + v + '</text>';
      s += '<text x="' + (x + (bw - 8) / 2) + '" y="' + (H - B + 16) + '" text-anchor="middle" fill="#8a8a94">' + (i + 1) + '</text>';
    });
    s += '<text x="' + (W / 2) + '" y="' + (H - 2) + '" text-anchor="middle" fill="#6e6e78">decoding step (pixels committed per step, 256 in total)</text></svg>';
    $('#wu-chart-sched').innerHTML = s;
  }

  // filmstrip
  const film = findExplore('fox');
  if (film) {
    const host = $('#wu-film');
    for (let k = 0; k <= 16; k += 2) {
      const cell = document.createElement('div');
      const cv = document.createElement('canvas'); cv.width = 16; cv.height = 16; cv.className = 'px';
      cell.appendChild(cv);
      const lab = document.createElement('span'); lab.textContent = 'step ' + k; cell.appendChild(lab);
      host.appendChild(cell);
      paint(cv.getContext('2d'), frameAt(film, k).tok, { noise: k });
    }
    $('#wu-film-cap').textContent = 'A real trajectory from the Explore gallery: "' + film.prompt + '", every second step. Grey cells are still [MASK].';
  }

  if (!METRICS) return;
  const tc = METRICS.train_cols, tr = METRICS.train, va = METRICS.val, vc = METRICS.val_cols;
  const col = (name) => tc.indexOf(name);
  const last = tr[tr.length - 1][0];
  const xax = { min: 0, max: last, ticks: niceTicks(0, last, 8), fmt: kfmt, label: 'training step' };
  const decayStart = Math.round(last * 0.8);

  lineChart($('#wu-chart-loss'), {
    height: 300, x: xax,
    y: { min: 0.8, max: 6.6, log: true, ticks: [1, 1.5, 2, 3, 4, 6], fmt: (v) => v.toFixed(v < 2 ? 1 : 0), label: 'nats / pixel (log)' },
    bands: [{ from: decayStart, to: last, color: 'rgba(108,75,255,0.06)', label: 'LR cooldown' }],
    series: [
      { name: 'train loss (with label smoothing)', color: '#c4c4cc', width: 1.6, pts: tr.map((r) => [r[0], r[col('loss')]]) },
      { name: 'train NLL', color: '#0d0d10', width: 2, pts: tr.map((r) => [r[0], r[col('nll')]]) },
      { name: 'validation NLL (EMA)', color: '#6c4bff', width: 2.4, dots: true, pts: va.map((r) => [r[0], r[1]]) },
    ],
  });
  lineChart($('#wu-chart-lr'), {
    height: 240, x: xax,
    y: { min: 0, max: 6.5e-4, ticks: [0, 2e-4, 4e-4, 6e-4], fmt: (v) => v === 0 ? '0' : (v * 1e4).toFixed(0) + 'e-4', label: 'learning rate' },
    y2: { min: 0.15, max: 12, log: true, ticks: [0.2, 0.5, 1, 2, 5, 10], color: '#e5484d', label: 'grad norm (log)' },
    series: [
      { name: 'learning rate', color: '#0d0d10', width: 2.2, pts: tr.map((r) => [r[0], r[col('lr')]]) },
      { name: 'gradient norm', color: '#e5484d', width: 1.4, opacity: 0.8, axis: 2, pts: tr.map((r) => [r[0], r[col('grad_norm')]]) },
    ],
  });
  const ratioColors = ['#c9bcff', '#a48dff', '#7c5cff', '#5531e6', '#2a1494'];
  lineChart($('#wu-chart-ratio'), {
    height: 280, x: xax,
    y: { min: 0.4, max: 2.0, ticks: [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2], fmt: (v) => v.toFixed(2), label: 'validation NLL' },
    series: [0.15, 0.35, 0.55, 0.75, 0.95].map((q, i) => ({
      name: Math.round(q * 100) + '% masked', color: ratioColors[i], width: 2.2, dots: true,
      pts: va.map((r) => [r[0], r[vc.indexOf('nll@' + q)]]),
    })),
  });

  // results table
  const fv = va[va.length - 1];
  const rows = [
    ['Validation NLL', fv[1].toFixed(3) + ' nats / pixel (perplexity ' + Math.exp(fv[1]).toFixed(2) + ' out of 512 colors)'],
    ['Validation accuracy', (fv[2] * 100).toFixed(1) + '% of masked pixels exactly right (mixed mask ratios)'],
    ['NLL, 15% masked', fv[vc.indexOf('nll@0.15')].toFixed(3) + ' (filling in details)'],
    ['NLL, 95% masked', fv[vc.indexOf('nll@0.95')].toFixed(3) + ' (inventing the layout)'],
    ['Start of training', tr[0][col('nll')].toFixed(2) + ' (ln 512 = 6.24 is a uniform guess)'],
  ];
  if (METRICS.clip && METRICS.clip.length) {
    const cl = METRICS.clip[METRICS.clip.length - 1];
    rows.push(['CLIP score', cl[1].toFixed(2) + ' generated vs ' + cl[2].toFixed(2) + ' for the real sprites']);
  }
  const ips = tr.map((r) => r[col('img_per_s')]).filter((v) => v > 1500);
  if (ips.length) rows.push(['Training throughput', Math.round(ips.reduce((a, b) => a + b, 0) / ips.length).toLocaleString() + ' sprites / s (median step, bf16)']);
  if (METRICS.wall_hours) rows.push(['Wall-clock', METRICS.wall_hours.toFixed(2) + ' h for 30 epochs, evaluation included']);
  $('#wu-results-table').innerHTML = rows.map((r) => '<tr><td>' + r[0] + '</td><td class="num">' + escapeHtml(r[1]) + '</td></tr>').join('');
  if (METRICS.wall_hours) $('#wu-wall').textContent = METRICS.wall_hours.toFixed(2) + ' h, including evaluation and checkpoints';
}

// ---------------------------------------------------------------- global actions & keys
root.addEventListener('click', (e) => {
  const a = e.target.closest('[data-action]');
  if (!a) return;
  const act = a.dataset.action;
  const it = detail.item;
  switch (act) {
    case 'open-writeup': openWriteup(); break;
    case 'close-writeup': closeWriteup(); break;
    case 'tab': setTab(a.dataset.tab); break;
    case 'surprise': promptEl.value = SURPRISE[Math.floor(Math.random() * SURPRISE.length)]; promptEl.focus(); break;
    case 'close-modal': closeModal(); break;
    case 'detail-prev': detailNav(-1); break;
    case 'detail-next': detailNav(1); break;
    case 'detail-play': detail.player.play(0, Math.max(60, speedMs || 80)); break;
    case 'download-png': if (it) exportPng(it.tok, 32, it.prompt); break;
    case 'download-small': if (it) exportPng(it.tok, 1, it.prompt); break;
    case 'use-prompt': if (it) { promptEl.value = it.prompt; closeModal(); promptEl.focus(); } break;
    case 'variations': if (it) { closeModal(); generateInStudio({ prompt: it.prompt, n: 4, settings: { seed: null }, label: 'Variations' }); } break;
    case 'remix': if (it) {
      const keep = new Uint8Array(N);
      for (let p = 0; p < N; p++) keep[p] = Math.random() < 0.65 ? 1 : 0;
      closeModal();
      generateInStudio({ prompt: it.prompt, n: 4, mode: 'inpaint', init: it.tok.slice(), keep, settings: { seed: null }, label: 'Remix' });
    } break;
    case 'edit': if (it) openEditor(it); break;
    case 'open-editor-blank': openEditor(null); break;
    case 'ed-undo': edUndo(); break;
    case 'ed-clear': edPush(); ed.tok = new Uint16Array(N); ed.locked = new Uint8Array(N); edRender(); break;
    case 'ed-save': {
      if (!ed.tok.some((t) => t > 0)) { toast('The canvas is empty.'); break; }
      const item = makeItem({ prompt: ed.prompt.value.trim() || 'pixel editor sprite', tok: ed.tok.slice(), order: new Uint8Array(N), steps: 1, source: 'editor' });
      addBatch({ id: uid(), prompt: item.prompt, items: [item], label: 'Edited' }, true);
      BATCHES[0].tiles.forEach((t) => finishTile(t));
      saveHistory(); toast('Saved to your Studio.');
      break;
    }
    case 'ed-download': exportPng(ed.tok, 32, ed.prompt.value); break;
    default: break;
  }
});

document.addEventListener('keydown', (e) => {
  if (!root.isConnected) return;
  const typing = /INPUT|TEXTAREA|SELECT/.test((e.target && e.target.tagName) || '');
  if (e.key === 'Escape') {
    if (sheet.classList.contains('on')) closeWriteup(); else closeModal();
    return;
  }
  if (openModal === detail.el && !typing) {
    if (e.key === 'ArrowLeft') detailNav(-1);
    if (e.key === 'ArrowRight') detailNav(1);
  }
  if (openModal === ed.el && !typing) {
    const k = e.key.toLowerCase();
    if ((e.metaKey || e.ctrlKey) && k === 'z') { e.preventDefault(); edUndo(); return; }
    const map = { b: 'pencil', p: 'pencil', e: 'eraser', g: 'fill', i: 'picker', m: 'magic', u: 'unmark' };
    if (map[k] && !e.metaKey && !e.ctrlKey) edSetTool(map[k]);
  }
});

// ---------------------------------------------------------------- boot
loadPrefs();
loadHistory();
updateStudioCount();
edSetColor(1);
console.log('[tessera] studio ready:', K, 'colors,', exploreItems.length, 'gallery sprites, device', INFO.device);
