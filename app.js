// Cone — custom GUI skin over movi-player (https://github.com/MrUjjwalG/movi-player), loaded from CDN.
const CDN = 'https://cdn.jsdelivr.net/npm/';
const MOVI = CDN + 'movi-player@0.4.1/dist/element.js';
const MOTION = CDN + 'motion@14.0.0/+esm';
const $ = id => document.getElementById(id);
const V = $('video'), VIZ = $('viz');
const MEDIA = 'mp4 m4v mov webm ogv mkv avi ts m2ts mts mpg mpeg flv wmv 3gp mp3 m4a aac flac opus ogg oga wav weba wma ac3'.split(' ');
const ext = n => n.split('.').pop().toLowerCase();
const RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];
let queue = [], idx = -1, A = null, B = null, an = null, raf = 0, aspIdx = 0, rotIdx = 0, rateIdx = 2;

// ---------- drag & drop (registered synchronously, before any library loads) ----------
let dc = 0;
const hasFiles = e => Array.from(e.dataTransfer?.types || []).includes('Files');
const endDrag = () => { dc = 0; document.body.classList.remove('drag'); };
addEventListener('dragenter', e => { if (!hasFiles(e)) return; e.preventDefault(); dc++; document.body.classList.add('drag'); });
addEventListener('dragover', e => { if (!hasFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
addEventListener('dragleave', e => { if (hasFiles(e) && --dc <= 0) endDrag(); });
addEventListener('drop', e => { if (!hasFiles(e)) return; e.preventDefault(); const fs = [...e.dataTransfer.files]; endDrag(); addFiles(fs, {dropped: true}); });

// ---------- spectrum tap: route every AudioContext destination connection through an analyser ----------
const rawConnect = AudioNode.prototype.connect;
AudioNode.prototype.connect = function (t, ...r) {
  if (typeof AudioDestinationNode !== 'undefined' && t instanceof AudioDestinationNode && this !== t.context.__an) {
    const c = t.context;
    if (!c.__an) { an = c.__an = c.createAnalyser(); an.fftSize = 2048; an.smoothingTimeConstant = .35; an.minDecibels = -85; an.maxDecibels = -20; rawConnect.call(an, c.destination); }
    return rawConnect.call(this, c.__an, ...r);
  }
  return rawConnect.call(this, t, ...r);
};
let M = null;
const lib = Promise.all([import(MOVI), customElements.whenDefined('movi-player'), import(MOTION).catch(() => null)]).then(([, , m]) => { M = m; initMotion(); });
lib.catch(() => toast('Could not load the player library — check your connection'));
const spring = {type: 'spring', stiffness: 420, damping: 30};
const anim = (el, kf, o = spring) => M ? M.animate(el, kf, o) : null;

// ---------- icons ----------
const P = {
  cone: '<path d="M12 3 5 20h14z"/><path d="M8 15h8"/>', play: '<path class="f" d="M7 4.5v15l13-7.5z"/>', pause: '<rect class="f" x="6" y="4" width="4.5" height="16" rx="1"/><rect class="f" x="13.5" y="4" width="4.5" height="16" rx="1"/>',
  prev: '<path class="f" d="M19 5v14L8.5 12z"/><path d="M5 5v14"/>', next: '<path class="f" d="M5 5v14l10.5-7z"/><path d="M19 5v14"/>',
  vol: '<path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>', mute: '<path d="M11 5 6 9H3v6h3l5 4z"/><path d="m22 9-6 6m0-6 6 6"/>',
  more: '<circle class="f" cx="5" cy="12" r="1.6"/><circle class="f" cx="12" cy="12" r="1.6"/><circle class="f" cx="19" cy="12" r="1.6"/>', list: '<path d="M9 6h12M9 12h12M9 18h12"/><circle class="f" cx="4.5" cy="6" r="1"/><circle class="f" cx="4.5" cy="12" r="1"/><circle class="f" cx="4.5" cy="18" r="1"/>',
  full: '<path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/>', x: '<path d="M18 6 6 18M6 6l12 12"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  audio: '<path d="M3 14v-2a9 9 0 0 1 18 0v2"/><path d="M21 15a2 2 0 0 1-2 2h-1v-5h1a2 2 0 0 1 2 2zM3 15a2 2 0 0 0 2 2h1v-5H5a2 2 0 0 0-2 2z"/>',
  subs: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M7 14h4M15 14h2M7 10h2M13 10h4"/>', aspect: '<rect x="3" y="6" width="18" height="12" rx="2.5"/>', rotate: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', minus: '<path d="M5 12h14"/>', grip: '<circle class="f" cx="9" cy="6" r="1.4"/><circle class="f" cx="15" cy="6" r="1.4"/><circle class="f" cx="9" cy="12" r="1.4"/><circle class="f" cx="15" cy="12" r="1.4"/><circle class="f" cx="9" cy="18" r="1.4"/><circle class="f" cx="15" cy="18" r="1.4"/>', quality: '<rect x="2.75" y="4.25" width="18.5" height="13.5" rx="2.75"/><path d="M8.25 21h7.5M12 17.75V21"/>',
  stable: '<rect x="2.75" y="4.75" width="18.5" height="14.5" rx="3"/><path d="M6.25 13.5v-3m3 5v-7m3 5.5v-4m3 6v-8m3 5.5v-3"/>', crop: '<path d="M6.25 3.25v13a1.5 1.5 0 0 0 1.5 1.5h13M17.75 20.75v-13a1.5 1.5 0 0 0-1.5-1.5h-13"/>',
  ambient: '<circle cx="12" cy="12" r="4.25"/><path d="M12 2.5v2M12 19.5v2M5.3 5.3l1.4 1.4m10.6 10.6 1.4 1.4M2.5 12h2m15 0h2M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
  hdr: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  cam: '<path d="M21 19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h2.5l1.5-2.5h6L17.5 7H19a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="3.5"/>', pip: '<rect x="2.5" y="4.5" width="19" height="14" rx="2.5"/><rect class="f" x="12" y="11" width="7" height="5" rx="1.2"/>'
};
const ico = (el, name) => { const s = el.tagName === 'svg' ? el : el.querySelector('svg') || el.appendChild(document.createElementNS('http://www.w3.org/2000/svg', 'svg')); s.setAttribute('viewBox', '0 0 24 24'); s.innerHTML = P[name]; };
document.querySelectorAll('[data-i]').forEach(el => ico(el, el.dataset.i));

// ---------- helpers ----------
function toast(msg) {
  const t = Object.assign(document.createElement('div'), {className: 'toast', textContent: msg});
  $('toasts').append(t); anim(t, {opacity: [0, 1], transform: ['translateY(-14px) scale(.96)', 'none']});
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, 3800);
}
const open = el => !!el._open;
function setOpen(el, on, off) {
  if (open(el) === on && (on || el.hidden)) return;
  el._open = on; el._a?.stop?.();
  if (on) { el.hidden = false; el.style.opacity = el.style.transform = ''; el._a = anim(el, {opacity: [0, 1], ...Object.fromEntries(Object.entries(off).map(([k, v]) => [k, [v, k === 'scale' ? 1 : 0]]))}); }
  else { const a = el._a = anim(el, {opacity: 0, ...off}, {type: 'spring', stiffness: 520, damping: 38}); const done = () => { if (!el._open) { el.hidden = true; el.style.opacity = el.style.transform = ''; } }; a ? a.finished.then(done, done) : done(); }
}
const MORE_OFF = {y: 10, scale: .94}, LIST_OFF = {x: 32};
const fmt = s => isFinite(s) ? (s >= 3600 ? Math.floor(s / 3600) + ':' + String(Math.floor(s % 3600 / 60)).padStart(2, '0') : Math.floor(s / 60)) + ':' + String(Math.floor(s % 60)).padStart(2, '0') : '0:00';
const dur = () => V.duration || 0;
const pct = t => (dur() ? t / dur() * 100 : 0) + '%';
new ResizeObserver(() => document.documentElement.style.setProperty('--barh', $('bar').offsetHeight + 'px')).observe($('bar'));

function initMotion() {
  if (!M) return;
  M.animate('#drop > :not(.cone)', {opacity: [0, 1], y: [14, 0]}, {delay: M.stagger(.07), type: 'spring', stiffness: 260, damping: 24});
  M.hover('.ib, .chip, #play', el => { M.animate(el, {scale: 1.1}, spring); return () => M.animate(el, {scale: 1}, spring); });
  M.press('button', el => { M.animate(el, {scale: .9}, {type: 'spring', stiffness: 600, damping: 28}); return () => M.animate(el, {scale: 1}, spring); });
}

// ---------- idle auto-hide ----------
let idleT;
const busy = () => open($('more')) || open($('list')) || open($('qmenu'));
const wake = () => { document.body.classList.remove('idle'); clearTimeout(idleT); if (!V.paused && !busy() && !document.body.classList.contains('dev-mode') && idx >= 0) idleT = setTimeout(() => document.body.classList.add('idle'), 2800); };
['pointermove', 'pointerdown', 'keydown', 'touchstart'].forEach(t => addEventListener(t, wake, {passive: true}));

// ---------- intake ----------
const SUBS = ['srt', 'ass', 'ssa', 'vtt'];
let fresh = new Set(), freshT = 0, autoOpened = false;
function addFiles(files, {dropped = false} = {}) {
  const ok = [];
  for (const f of files) {
    if (SUBS.includes(ext(f.name))) { addSub(f); continue; }
    MEDIA.includes(ext(f.name)) ? ok.push(f) : toast(`${f.name}: unsupported format`);
  }
  if (!ok.length) return;
  const start = queue.length, first = idx < 0; queue.push(...ok);
  fresh = new Set(ok.map((_, i) => start + i));
  clearTimeout(freshT); freshT = setTimeout(() => { fresh.clear(); document.querySelectorAll('#items li.new').forEach(l => l.classList.remove('new')); }, 2600);
  first ? play(start) : render();
  // dropped (or "add more") media: pop the queue open so the newcomers are visible, then tuck it away again
  if (dropped || !first) showFresh(first && ok.length === 1);
}
function showFresh(skip) {
  if (skip) return;
  const was = open($('list'));
  setOpen($('more'), false, MORE_OFF); closeQ(); render(); setOpen($('list'), true, LIST_OFF); pause();
  $('items').querySelector('li.new')?.scrollIntoView({block: 'nearest', behavior: 'smooth'});
  if (was) return;
  autoOpened = true; clearTimeout(showFresh.t);
  showFresh.t = setTimeout(() => { if (autoOpened && open($('list'))) closeMenus(); autoOpened = false; }, 3600);
}
$('list').addEventListener('pointerdown', () => { autoOpened = false; });
async function addSub(f) {
  if (idx < 0) return toast('Load a video first, then add subtitles');
  try { await lib; const ok = await V.addSubtitleFile(f, f.name.replace(/\.[^.]+$/, '')); toast(ok ? `Subtitles loaded: ${f.name}` : 'Could not read subtitle file'); refreshBtns(); } catch { toast('Could not read subtitle file'); }
}
let askT = 0;
function cancelAsk() { clearTimeout(askT); document.querySelectorAll('#items li.ask').forEach(l => l.classList.remove('ask')); }
function removeAt(r) {
  if (r < 0 || r >= queue.length) return;
  const wasCur = r === idx;
  queue.splice(r, 1); fresh.clear();
  if (r < idx) idx--;
  if (wasCur) {
    if (queue.length) { idx = -1; play(Math.min(r, queue.length - 1)); return; }
    idx = -1; clearLoop(); stopViz(); try { V.pause(); } catch {}
    V.style.display = 'none'; document.body.classList.remove('has', 'idle'); $('title').textContent = ''; setPlay(false);
  }
  render();
}
function render() {
  clearTimeout(askT);
  const ol = $('items'); ol.innerHTML = '';
  queue.forEach((f, i) => {
    const li = document.createElement('li'); li.className = (i === idx ? 'cur ' : '') + (fresh.has(i) ? 'new' : ''); li.dataset.i = i;
    const gr = document.createElement('span'); gr.className = 'grip'; gr.title = 'Drag to reorder'; ico(gr, 'grip');
    const lab = document.createElement('span'); lab.className = 'lab'; lab.textContent = f.name || f;
    const rm = document.createElement('button'); rm.type = 'button'; rm.className = 'rm'; rm.title = 'Remove from queue'; rm.setAttribute('aria-label', 'Remove from queue'); ico(rm, 'minus');
    const cf = document.createElement('div'); cf.className = 'cf';
    const yes = Object.assign(document.createElement('button'), {type: 'button', className: 'yes', textContent: 'Remove'});
    const no = Object.assign(document.createElement('button'), {type: 'button', className: 'no', textContent: 'Cancel'});
    cf.append(yes, no); li.append(gr, lab, rm, cf);
    li.onclick = () => play(+li.dataset.i);
    rm.onclick = e => { e.stopPropagation(); cancelAsk(); li.classList.add('ask'); askT = setTimeout(cancelAsk, 4000); };
    yes.onclick = e => { e.stopPropagation(); removeAt(+li.dataset.i); };
    no.onclick = e => { e.stopPropagation(); cancelAsk(); };
    initDrag(li, gr);
    ol.append(li);
  });
}
// drag to reorder (pointer events: mouse, touch and pen). Siblings move, the dragged row only follows the pointer.
function initDrag(li, grip) {
  grip.addEventListener('click', e => e.stopPropagation());
  grip.addEventListener('pointerdown', e => {
    if (e.button) return;
    e.preventDefault(); e.stopPropagation(); cancelAsk(); autoOpened = false;
    const ol = $('items'), id = e.pointerId; let y = e.clientY, cy = e.clientY, sy = ol.scrollTop, r = 0;
    li.classList.add('dragging'); document.body.classList.add('reordering');
    const step = () => {
      li.style.transform = `translateY(${cy - y + ol.scrollTop - sy}px)`;
      const b = li.getBoundingClientRect(), c = b.top + b.height / 2, p = li.previousElementSibling, n = li.nextElementSibling;
      if (p) { const pr = p.getBoundingClientRect(); if (c < pr.top + pr.height / 2) { ol.insertBefore(p, li.nextSibling); y -= pr.height; return step(); } }
      if (n) { const nr = n.getBoundingClientRect(); if (c > nr.top + nr.height / 2) { ol.insertBefore(n, li); y += nr.height; return step(); } }
    };
    const loop = () => {
      const b = ol.getBoundingClientRect();
      if (cy < b.top + 40) ol.scrollTop -= 10; else if (cy > b.bottom - 40) ol.scrollTop += 10;
      step(); r = requestAnimationFrame(loop);
    };
    const mv = ev => { if (ev.pointerId === id) cy = ev.clientY; };
    const end = ev => {
      if (ev.pointerId !== id) return;
      cancelAnimationFrame(r); removeEventListener('pointermove', mv); removeEventListener('pointerup', end); removeEventListener('pointercancel', end);
      li.style.transform = ''; li.classList.remove('dragging'); document.body.classList.remove('reordering');
      const order = [...ol.children].map(l => +l.dataset.i);
      if (order.some((v, i) => v !== i)) { queue = order.map(i => queue[i]); if (idx >= 0) idx = order.indexOf(idx); fresh.clear(); }
      render();
    };
    addEventListener('pointermove', mv); addEventListener('pointerup', end); addEventListener('pointercancel', end);
    r = requestAnimationFrame(loop);
  });
}
const openUrl = e => { e?.preventDefault(); const u = prompt('Video / audio / HLS (.m3u8) / DASH (.mpd) URL'); if (!u) return; queue.push(u.trim()); play(queue.length - 1); };
$('url').onclick = openUrl;

// ---------- playback ----------
async function play(i) {
  if (i < 0 || i >= queue.length) return;
  idx = i; render(); clearLoop(); stopViz(); wake();
  const s = queue[i];
  document.body.classList.add('has'); document.body.classList.remove('idle'); $('title').textContent = s.name || s;
  try { await lib; } catch { return; }
  if (idx !== i) return;
  V.style.display = 'block'; V.sw = 'auto'; V.src = s;
  try { await V.play(); } catch (err) { if (err?.name === 'NotAllowedError') toast('Press play to start'); }
}
const setPlay = p => { const b = $('play'); if (b.dataset.i === (p ? 'pause' : 'play')) return; b.dataset.i = p ? 'pause' : 'play'; ico(b, b.dataset.i); anim(b.firstChild, {scale: [.6, 1], rotate: [-30, 0]}); wake(); };
V.addEventListener('error', e => toast('Playback error: ' + (e.detail?.message || e.detail || 'unsupported or corrupt file')));
V.addEventListener('loadeddata', () => { const ao = !V.videoWidth; V.style.display = ao ? 'none' : 'block'; ao ? startViz() : stopViz(); refreshBtns(); });
V.addEventListener('trackschange', refreshBtns);
V.addEventListener('ended', () => idx + 1 < queue.length && play(idx + 1));
V.addEventListener('play', () => setPlay(true));
V.addEventListener('pause', () => setPlay(false));
V.addEventListener('statechange', e => { if (e.detail === 'playing') setPlay(true); else if (e.detail === 'paused') setPlay(false); });
V.addEventListener('volumechange', () => { const b = $('mute'); b.dataset.i = V.muted || !V.volume ? 'mute' : 'vol'; ico(b, b.dataset.i); });

// ---------- spectrum: NCS-style mirrored bars, rAF at the display's refresh rate, time-based smoothing ----------
// Resizing never restarts it: the loop keeps running, bar state survives (it is resampled if the bar count changes),
// and the canvas is only re-sized inside the frame that draws it, so there is no blank or stuttering frame.
const g = VIZ.getContext('2d', {desynchronized: true});
let W = 0, H = 0, DPR = 1, dirty = true, grad, glow, bars = null, peaks = null, vel = null, fft = null, lo = null, hi = null, tilt = null, N = 0, last = 0, binKey = '', bass = 0;
const resample = (a, n) => { const o = new Float32Array(n); if (a) for (let i = 0; i < n; i++) o[i] = a[Math.min(a.length - 1, Math.floor(i * a.length / n))]; return o; };
new ResizeObserver(() => { dirty = true; }).observe(VIZ);
addEventListener('resize', () => { dirty = true; });
function fit() {
  if (!dirty && W) return true;
  const dpr = Math.min(devicePixelRatio || 1, 2), w = VIZ.clientWidth, h = VIZ.clientHeight;
  if (!w || !h) return false;
  dirty = false;
  if (w === W && h === H && dpr === DPR) return true;
  W = w; H = h; DPR = dpr;
  VIZ.width = Math.round(w * dpr); VIZ.height = Math.round(h * dpr); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  grad = g.createLinearGradient(0, H * .2, 0, H * .62); grad.addColorStop(0, '#ffffff'); grad.addColorStop(1, '#ff7a1a');
  glow = g.createRadialGradient(W / 2, H * .62, 0, W / 2, H * .62, Math.max(W, H) * .45); glow.addColorStop(0, 'rgba(255,122,26,.5)'); glow.addColorStop(1, 'rgba(255,122,26,0)');
  const n = w < 600 ? 28 : 56;
  if (n !== N) { N = n; bars = resample(bars, n); peaks = resample(peaks, n); vel = resample(vel, n); binKey = ''; }
  return true;
}
// map each bar (per side, 0 = lowest = centre) to a log-spaced FFT bin range
function prep() {
  const nb = an.frequencyBinCount, sr = an.context.sampleRate, key = N + ':' + nb + ':' + sr;
  if (key !== binKey) {
    binKey = key; fft = new Uint8Array(nb); lo = new Uint16Array(N); hi = new Uint16Array(N); tilt = new Float32Array(N);
    const nyq = sr / 2, f0 = 35, f1 = Math.min(16000, nyq * .95), at = i => Math.min(nb, f0 * Math.pow(f1 / f0, i / N) / nyq * nb);
    for (let i = 0; i < N; i++) { lo[i] = Math.min(nb - 1, Math.floor(at(i))); hi[i] = Math.max(lo[i] + 1, Math.floor(at(i + 1))); tilt[i] = .9 + .9 * (i / N); }
  }
  an.getByteFrequencyData(fft);
}
function frame(t) {
  raf = requestAnimationFrame(frame);
  const dt = Math.min(.05, (t - last) / 1000 || .016); last = t;
  if (!fit()) return;
  const have = !!an; if (have) prep();
  const up = 1 - Math.exp(-dt * 42), down = 1 - Math.exp(-dt * 8);
  g.clearRect(0, 0, W, H);
  const uw = Math.min(W * .92, 1200), step = uw / (2 * N), bw = Math.max(2, step * .66), cx = W / 2, base = H * .62, maxH = H * .5;
  let bs = 0;
  for (let i = 0; i < N; i++) {
    let m = 0; if (have) for (let k = lo[i]; k < hi[i]; k++) if (fft[k] > m) m = fft[k];
    const tg = Math.min(1, Math.pow(m / 255 * tilt[i], 1.6));
    bars[i] += (tg - bars[i]) * (tg > bars[i] ? up : down);
    if (bars[i] >= peaks[i]) { peaks[i] = bars[i]; vel[i] = 0; } else { vel[i] += dt * 1.8; peaks[i] = Math.max(0, peaks[i] - vel[i] * dt); }
    if (i < 5) bs += bars[i];
  }
  bass += (bs / 5 - bass) * (bs / 5 > bass ? up : 1 - Math.exp(-dt * 5));
  g.globalAlpha = Math.min(1, bass * 1.1); g.fillStyle = glow; g.fillRect(0, 0, W, H);
  g.globalAlpha = 1; g.fillStyle = grad; g.beginPath();
  const xs = (i, s) => s ? cx + i * step + (step - bw) / 2 : cx - (i + 1) * step + (step - bw) / 2;
  for (let s = 0; s < 2; s++) for (let i = 0; i < N; i++) {
    const h = Math.max(3, bars[i] * maxH), x = xs(i, s);
    g.roundRect ? g.roundRect(x, base - h, bw, h, Math.min(bw / 2, 4)) : g.rect(x, base - h, bw, h);
  }
  g.fill();
  g.globalAlpha = .12; g.beginPath();
  for (let s = 0; s < 2; s++) for (let i = 0; i < N; i++) g.rect(xs(i, s), base + 6, bw, Math.max(3, bars[i] * maxH) * .45);
  g.fill(); g.globalAlpha = .9; g.fillStyle = '#fff'; g.beginPath();
  for (let s = 0; s < 2; s++) for (let i = 0; i < N; i++) g.rect(xs(i, s), base - Math.max(3, peaks[i] * maxH) - 5, bw, 2);
  g.fill(); g.globalAlpha = 1;
}
function startViz() { VIZ.style.display = 'block'; cancelAnimationFrame(raf); dirty = true; last = performance.now(); raf = requestAnimationFrame(frame); }
function stopViz() { cancelAnimationFrame(raf); VIZ.style.display = 'none'; }
document.addEventListener('visibilitychange', () => { if (document.hidden) cancelAnimationFrame(raf); else if (VIZ.style.display === 'block') { cancelAnimationFrame(raf); dirty = true; last = performance.now(); raf = requestAnimationFrame(frame); } });

// ---------- seek + A-B loop ----------
function clearLoop() { A = B = null; drawLoop(); }
function drawLoop() {
  $('mA').style.display = A != null ? 'flex' : 'none'; $('mB').style.display = B != null ? 'flex' : 'none';
  if (A != null) $('mA').style.left = pct(A);
  if (B != null) $('mB').style.left = pct(B);
  const on = A != null && B != null; $('loop').style.display = on ? 'block' : 'none';
  if (on) { $('loop').style.left = pct(A); $('loop').style.width = pct(B - A); }
  $('setA').classList.toggle('on', A != null); $('setB').classList.toggle('on', B != null); $('clr').hidden = A == null && B == null;
}
$('setA').onclick = () => { A = V.currentTime; if (B != null && B <= A) B = null; drawLoop(); };
$('setB').onclick = () => { if (A == null) A = 0; if (V.currentTime > A) { B = V.currentTime; drawLoop(); } else toast('Loop end must come after the start'); };
$('clr').onclick = clearLoop;
V.addEventListener('timeupdate', () => {
  $('fill').style.width = pct(V.currentTime); $('time').textContent = `${fmt(V.currentTime)} / ${fmt(dur())}`;
  try { const b = V.buffered; if (b?.length) $('buf').style.width = pct(b.end(b.length - 1)); } catch {}
  drawLoop();
});
(function loopWatch() { if (A != null && B != null && !V.paused && V.currentTime >= B) V.currentTime = A; requestAnimationFrame(loopWatch); })();
const seekAt = x => { const r = $('seek').getBoundingClientRect(); return Math.min(1, Math.max(0, (x - r.left) / r.width)) * dur(); };
$('seek').addEventListener('pointerdown', e => {
  e.preventDefault();
  const mk = e.target.closest?.('.mk'), el = $('seek');
  el.setPointerCapture(e.pointerId);
  const set = x => { const t = seekAt(x); if (mk) { mk === $('mA') ? A = t : B = t; if (A != null && B != null && B < A) [A, B] = [B, A]; drawLoop(); } else V.currentTime = t; };
  if (!mk) set(e.clientX);
  const mv = ev => set(ev.clientX), up = () => { el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); };
  el.addEventListener('pointermove', mv); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
});

// ---------- controls ----------
const toggle = () => { if (idx < 0) return $('file').click(); V.paused ? V.play() : V.pause(); };
$('play').onclick = toggle;
$('stage').onclick = e => {
  if (e.target.closest('#drop')) return;
  if (busy()) { closeMenus(); return; }
  if (document.body.classList.contains('idle')) return wake();
  toggle();
};
$('prev').onclick = () => play(idx - 1); $('next').onclick = () => play(idx + 1);
$('rate').onclick = () => { rateIdx = (rateIdx + 1) % RATES.length; V.playbackRate = RATES[rateIdx]; $('rate').textContent = RATES[rateIdx] + '×'; };
$('vol').oninput = e => { V.volume = +e.target.value; V.muted = false; };
$('mute').onclick = () => V.muted = !V.muted;
$('fs').onclick = () => document.fullscreenElement ? document.exitFullscreen() : (document.documentElement.requestFullscreen?.() || toast('Fullscreen unavailable'));
function closeQ() { setOpen($('qmenu'), false, MORE_OFF); }
function closeMenus() { setOpen($('more'), false, MORE_OFF); setOpen($('list'), false, LIST_OFF); closeQ(); wake(); }
const pause = () => { document.body.classList.remove('idle'); clearTimeout(idleT); };
$('mo').onclick = () => { if (open($('more'))) return closeMenus(); closeQ(); setOpen($('list'), false, LIST_OFF); setOpen($('more'), true, MORE_OFF); pause(); };
$('pl').onclick = () => { if (open($('list'))) return closeMenus(); autoOpened = false; closeQ(); setOpen($('more'), false, MORE_OFF); render(); setOpen($('list'), true, LIST_OFF); pause(); };
$('plx').onclick = closeMenus;

// movi features: audio/subtitle tracks, aspect, rotate, HDR, snapshot, PiP
const MP = () => V.player;
const nm = t => t.label || t.language || t.lang || t.codec || ('#' + t.id);
const act = (kind) => { try { return MP()?.trackManager?.['getActive' + kind + 'Track']?.() || null; } catch { return null; } };
function refreshBtns() {
  try { const a = MP()?.getAudioTracks?.() || [], s = MP()?.getSubtitleTracks?.() || [];
    $('aud').style.display = a.length > 1 ? '' : 'none';
    const ca = act('Audio'); $('audv').textContent = ca ? nm(ca) : '';
    const cs = act('Subtitle'); $('subv').textContent = cs ? nm(cs) : 'Off'; $('sub').classList.toggle('on', !!cs);
    $('subadd').style.display = '';
    $('qualv').textContent = curQuality();
  } catch {}
  syncToggles();
}
async function cycleTrack(get, sel, label, valEl) {
  try {
    const tr = MP()[get](); if (!tr.length) return toast('No ' + label + ' tracks');
    const c = act(label === 'subtitle' ? 'Subtitle' : 'Audio'), cur = c ? tr.findIndex(t => t.id === c.id) : -1;
    const nxt = label === 'subtitle' ? (cur + 1 >= tr.length ? null : tr[cur + 1]) : tr[(cur + 1) % tr.length];
    await MP()[sel](nxt ? nxt.id : null); const v = nxt ? nm(nxt) : 'Off'; $(valEl).textContent = v; $(valEl).parentElement.classList.toggle('on', !!nxt && label === 'subtitle'); toast(`${label[0].toUpperCase() + label.slice(1)}: ${v}`);
  } catch { toast('Track switch failed'); }
}
$('aud').onclick = () => cycleTrack('getAudioTracks', 'selectAudioTrack', 'audio', 'audv');
$('sub').onclick = () => (MP()?.getSubtitleTracks?.().length ? cycleTrack('getSubtitleTracks', 'selectSubtitleTrack', 'subtitle', 'subv') : toast('No embedded subtitles — add a .srt / .ass / .vtt file'));
$('subadd').onclick = e => { if (e.target.id !== 'subfile') $('subfile').click(); };
$('subfile').onchange = e => { [...e.target.files].forEach(addSub); e.target.value = ''; };

// quality: adaptive (HLS/DASH) rungs when the source has them, otherwise show what is playing
const curQuality = () => { const h = V.videoHeight; const t = act('Video'); if (t && t.id === -1) return h ? `Auto · ${h}p` : 'Auto'; return h ? h + 'p' : '—'; };
function qualityList() {
  const tr = (MP()?.getVideoTracks?.() || []).filter(t => t.id === -1 || t.height > 0);
  const seen = new Set(), out = [];
  tr.sort((a, b) => a.id === -1 ? -1 : b.id === -1 ? 1 : (b.height - a.height) || ((b.bitRate || 0) - (a.bitRate || 0)));
  for (const t of tr) { const l = t.id === -1 ? 'Auto' : t.label || t.height + 'p'; if (!seen.has(l)) { seen.add(l); out.push({t, l}); } }
  return out;
}
const badge = h => h >= 4320 ? '8K' : h >= 2160 ? '4K' : h >= 720 ? 'HD' : '';
$('qual').onclick = () => {
  const list = qualityList();
  if (list.length < 2) return toast(`Quality: ${curQuality()} — this source has a single quality`);
  const a = act('Video'), q = $('qmenu'); q.innerHTML = '';
  list.forEach(({t, l}) => {
    const b = document.createElement('button'); b.className = 'item' + (a && a.id === t.id ? ' cur' : '');
    const sp = document.createElement('span'); sp.textContent = l === 'Auto' && a?.id === -1 && V.videoHeight ? `Auto (${V.videoHeight}p)` : l; b.append(sp);
    const bd = badge(t.height || 0); if (bd) b.insertAdjacentHTML('beforeend', `<em class="tag">${bd}</em>`);
    b.onclick = e => { e.stopPropagation(); try { MP().trackManager.selectVideoTrack(t.id); } catch { toast('Quality switch failed'); } closeQ(); setOpen($('more'), false, MORE_OFF); $('qualv').textContent = l; toast('Quality: ' + l); wake(); };
    q.append(b);
  });
  setOpen($('more'), false, MORE_OFF); setOpen($('qmenu'), true, MORE_OFF);
};
V.addEventListener('qualitychange', () => { $('qualv').textContent = curQuality(); });

// stable volume / crop black bars / ambient — thin wrappers over movi's own switches
// Ambient box must match the picture's own aspect ratio, otherwise the box (fixed 16:9) leaves black bars
// above/below (or left/right) of the video whenever the window or the video isn't 16:9.
function setAR() {
  let w = V.videoWidth, h = V.videoHeight;
  if (!(w > 0 && h > 0)) { const t = (MP()?.getVideoTracks?.() || []).find(t => t.width > 0 && t.height > 0); if (t) { w = t.width; h = t.height; } }
  let r = w > 0 && h > 0 ? w / h : 16 / 9;
  if (rotIdx % 180 && 'rotate' in (customElements.get('movi-player')?.prototype || {})) r = 1 / r; // 90°/270° swaps the shape
  document.body.style.setProperty('--arn', Math.min(Math.max(r, 0.4), 4).toFixed(4));
}
function syncToggles() {
  setAR();
  const set = (id, vid, on) => { $(vid).textContent = on ? 'On' : 'Off'; $(id).classList.toggle('on', on); };
  set('stab', 'stabv', !!V.stableVolume); set('crop', 'cropv', !!V.cropbars);
  const vid = !!V.videoWidth; set('amb', 'ambv', !!V.ambientMode);
  document.body.classList.toggle('amb-on', !!V.ambientMode && vid);
  
}
$('stab').onclick = () => { V.stableVolume = !V.stableVolume; syncToggles(); toast('Stable volume ' + (V.stableVolume ? 'on' : 'off')); };
$('crop').onclick = () => { if (!V.videoWidth) return toast('Crop applies to video only'); V.cropbars = !V.cropbars; syncToggles(); toast(V.cropbars ? 'Black bars cropped' : 'Black bars kept'); };
$('amb').onclick = () => { if (!V.videoWidth) return toast('Ambient mode applies to video only'); V.ambientMode = !V.ambientMode; syncToggles(); toast('Ambient mode ' + (V.ambientMode ? 'on' : 'off')); };
V.addEventListener('volumechange', syncToggles);

$('asp').onclick = () => { const m = ['contain', 'cover', 'fill', 'zoom']; V.objectFit = m[aspIdx = (aspIdx + 1) % m.length]; $('aspv').textContent = V.objectFit; };
$('rot').onclick = () => { V.rotate = (rotIdx = (rotIdx + 90) % 360); $('rotv').textContent = rotIdx + '°'; setAR(); };
$('snap').onclick = async () => {
  // Lossless: grab the decoded frame at its native resolution (no scaling, no overlay) and encode as PNG.
  // Falls back to the rendered canvas if the raw frame is unavailable.
  if (!V.videoWidth) return toast('Snapshot applies to video only');
  const toPng = c => new Promise(r => c.toBlob(r, 'image/png'));
  let blob = null;
  try {
    const f = MP()?.getCurrentVideoFrame?.();
    if (f) {
      const el = f instanceof HTMLVideoElement, w = el ? f.videoWidth : f.displayWidth, h = el ? f.videoHeight : f.displayHeight;
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const x = c.getContext('2d', {colorSpace: 'srgb', alpha: false}); x.imageSmoothingEnabled = false; x.drawImage(f, 0, 0, w, h);
      // reject an all-black readback (some GPUs return one) and fall through to the canvas path
      const d = x.getImageData(0, 0, Math.min(w, 64), Math.min(h, 36)).data; let lit = false;
      for (let i = 0; i < d.length; i += 4) if (d[i] > 8 || d[i + 1] > 8 || d[i + 2] > 8) { lit = true; break; }
      if (lit) blob = await toPng(c);
    }
  } catch {}
  if (!blob) { try { blob = await toPng(V.getCanvas()); } catch {} }
  if (!blob) return toast('Snapshot failed');
  const t = V.currentTime, p = n => String(Math.floor(n)).padStart(2, '0');
  const name = `${(queue[idx]?.name || 'snapshot').replace(/\.[^.]+$/, '')}-${p(t / 3600)}-${p(t % 3600 / 60)}-${p(t % 60)}.png`;
  const a = Object.assign(document.createElement('a'), {href: URL.createObjectURL(blob), download: name});
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  toast(`Snapshot saved (${V.videoWidth}×${V.videoHeight} PNG)`);
};

document.addEventListener('fullscreenchange', syncToggles);
addEventListener('keydown', e => {
  const tg = e.target.tagName, k = e.key.toLowerCase();
  if (tg === 'INPUT' && e.target.type !== 'range') return;
  if (e.ctrlKey || e.metaKey || e.altKey || (tg === 'BUTTON' && (k === ' ' || k === 'enter')) || (tg === 'INPUT' && e.target.type === 'range' && k.startsWith('arrow'))) return;
  const map = {f: 'fs', m: 'mute', a: 'setA', b: 'setB', s: 'snap', r: 'asp', t: 'rot', v: 'sub', n: 'aud', l: 'clr', u: 'stab', c: 'crop', g: 'amb', q: 'qual', d: 'dev-mode-switch'};
  if (k === ' ') { e.preventDefault(); toggle(); }
  else if (k === 'escape') closeMenus();
  else if (k === 'arrowright') V.currentTime += 5; else if (k === 'arrowleft') V.currentTime -= 5;
  else if (map[k]) $(map[k]).click();
});

$('file').onchange = e => { addFiles([...e.target.files]); e.target.value = ''; };
$('file2').onchange = e => { addFiles([...e.target.files]); e.target.value = ''; };
refreshBtns(); drawLoop();

// ---------- developer mode + console (ported from moviplayer.com — movi-player by Ujjwal Gupta, Apache-2.0) ----------
const devSw = $('dev-mode-switch'), dBody = $('dev-log-body'), dEmpty = $('dev-log-empty'), dCount = $('dev-log-count'), dSearch = $('dev-log-search');
const dLevelsBtn = $('dev-log-levels-btn'), dLevelsLabel = $('dev-log-levels-label'), dLevelsMenu = $('dev-log-levels-menu'), dLevelsAll = $('dev-log-levels-all');
const LEVELS = ['log', 'info', 'warn', 'error', 'debug'], levelsOn = new Set(LEVELS), MAXROWS = 5000;
let dAuto = true, dHydrated = false, dQuery = '', dShown = 0;
const filtered = () => dQuery !== '' || levelsOn.size !== LEVELS.length;
const matches = e => !!e && levelsOn.has(e.level) && (dQuery === '' || e.text.toLowerCase().includes(dQuery));
const ts = t => { const d = new Date(t), p = (n, w = 2) => String(n).padStart(w, '0'); return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`; };
const dTotal = () => window.__moviDevLog?.buffer?.length ?? 0;
const dUpdate = () => { dCount.textContent = filtered() ? `${dShown} / ${dTotal()}` : String(dTotal()); };
function dRow(e) {
  const r = document.createElement('div'); r.className = 'dev-log-row ' + e.level;
  for (const [c, t] of [['ts', ts(e.t)], ['lvl', e.level], ['msg', e.text]]) { const s = document.createElement('span'); s.className = c; s.textContent = t; r.append(s); }
  return r;
}
function dAppend(e) {
  if (!e) return;
  if (matches(e)) {
    dShown++; if (dEmpty.parentNode === dBody) dEmpty.remove();
    dBody.append(dRow(e));
    while (dBody.childElementCount > MAXROWS) dBody.firstElementChild.remove();
    if (dAuto) dBody.scrollTop = dBody.scrollHeight;
  }
  dUpdate();
}
function dClearDom() { dBody.innerHTML = ''; dShown = 0; dEmpty.textContent = 'No logs yet.'; dBody.append(dEmpty); dUpdate(); }
function dRender() {
  if (!dHydrated) return;
  const m = (window.__moviDevLog?.buffer || []).filter(matches); dShown = m.length; dBody.innerHTML = '';
  if (!m.length) { dEmpty.textContent = filtered() ? 'No logs match the filter.' : 'No logs yet.'; dBody.append(dEmpty); dUpdate(); return; }
  const f = document.createDocumentFragment(); for (const e of m.slice(-MAXROWS)) f.append(dRow(e));
  dBody.append(f); dUpdate(); if (dAuto) dBody.scrollTop = dBody.scrollHeight;
}
function dHydrate() { if (dHydrated || !window.__moviDevLog) return; dHydrated = true; dRender(); window.__moviDevLog.subscribe(e => e === null ? dClearDom() : dAppend(e)); }
let st; dSearch.addEventListener('input', () => { clearTimeout(st); st = setTimeout(() => { dQuery = dSearch.value.trim().toLowerCase(); dRender(); }, 120); });
const boxes = [...dLevelsMenu.querySelectorAll('input[data-level]')];
function syncLevels() {
  const n = levelsOn.size;
  dLevelsLabel.textContent = n === LEVELS.length ? 'All levels' : n === 0 ? 'No levels' : n === 1 ? boxes.find(b => levelsOn.has(b.dataset.level)).nextElementSibling.textContent : `${n} levels`;
  dLevelsAll.checked = n === LEVELS.length; dLevelsAll.indeterminate = n > 0 && n < LEVELS.length;
}
const openLevels = o => { dLevelsMenu.hidden = !o; dLevelsBtn.setAttribute('aria-expanded', String(o)); };
dLevelsBtn.addEventListener('click', e => { e.stopPropagation(); openLevels(dLevelsMenu.hidden); });
dLevelsMenu.addEventListener('click', e => e.stopPropagation());
document.addEventListener('click', () => openLevels(false));
addEventListener('keydown', e => { if (e.key === 'Escape' && !dLevelsMenu.hidden) openLevels(false); });
dLevelsMenu.addEventListener('change', e => {
  const b = e.target;
  if (b === dLevelsAll) { levelsOn.clear(); if (b.checked) LEVELS.forEach(l => levelsOn.add(l)); boxes.forEach(x => x.checked = b.checked); }
  else if (b.dataset.level) { b.checked ? levelsOn.add(b.dataset.level) : levelsOn.delete(b.dataset.level); } else return;
  syncLevels(); dRender();
});
syncLevels();
const dText = () => (window.__moviDevLog?.buffer || []).filter(matches).map(e => `[${ts(e.t)}] ${e.level.toUpperCase()} ${e.text}`).join('\n');
const dFile = () => { const s = queue[idx]; let n = s?.name || (typeof s === 'string' ? s.split(/[?#]/)[0].split('/').pop() : ''); n = (n || '').replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]+/g, '_').trim(); return (n || 'cone') + '.log'; };
$('dev-log-clear').onclick = () => window.__moviDevLog?.clear();
$('dev-log-download').onclick = () => {
  const a = Object.assign(document.createElement('a'), {href: URL.createObjectURL(new Blob([dText() + '\n'], {type: 'text/plain;charset=utf-8'})), download: dFile()});
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  const b = $('dev-log-download'), o = b.textContent; b.textContent = 'Saved!'; setTimeout(() => b.textContent = o, 1200);
};
$('dev-log-copy').onclick = async () => {
  const b = $('dev-log-copy'), o = b.textContent, t = dText();
  try { await navigator.clipboard.writeText(t); b.textContent = 'Copied!'; }
  catch { try { const ta = Object.assign(document.createElement('textarea'), {value: t}); ta.style.cssText = 'position:fixed;opacity:0'; document.body.append(ta); ta.select(); document.execCommand('copy'); ta.remove(); b.textContent = 'Copied!'; } catch { b.textContent = 'Copy failed'; } }
  setTimeout(() => b.textContent = o, 1200);
};
$('dev-log-autoscroll').onclick = e => { dAuto = !dAuto; e.currentTarget.setAttribute('aria-pressed', String(dAuto)); e.currentTarget.textContent = 'Autoscroll: ' + (dAuto ? 'on' : 'off'); if (dAuto) dBody.scrollTop = dBody.scrollHeight; };
function applyDev(on) {
  document.body.classList.toggle('dev-mode', on); devSw.setAttribute('aria-checked', String(on));
  if (on) { dHydrate(); document.body.classList.remove('idle'); clearTimeout(idleT); } else wake();
}
let devOn = false; try { devOn = localStorage.getItem('cone-dev') === '1'; } catch {}
applyDev(devOn);
devSw.onclick = e => { e.stopPropagation(); devOn = !devOn; applyDev(devOn); try { localStorage.setItem('cone-dev', devOn ? '1' : '0'); } catch {} if (devOn) console.info('Cone dev console on — skin over movi-player by Ujjwal Gupta (moviplayer.com)'); };
