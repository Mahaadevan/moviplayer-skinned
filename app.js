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

// ---------- spectrum tap: route every AudioContext destination connection through an analyser ----------
const rawConnect = AudioNode.prototype.connect;
AudioNode.prototype.connect = function (t, ...r) {
  if (typeof AudioDestinationNode !== 'undefined' && t instanceof AudioDestinationNode && this !== t.context.__an) {
    const c = t.context;
    if (!c.__an) { an = c.__an = c.createAnalyser(); an.fftSize = 1024; an.smoothingTimeConstant = 0; rawConnect.call(an, c.destination); }
    return rawConnect.call(this, c.__an, ...r);
  }
  return rawConnect.call(this, t, ...r);
};
const [, M] = await Promise.all([import(MOVI), import(MOTION).catch(() => null)]);
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
function show(el, from) { if (!el.hidden) return; el.hidden = false; anim(el, {opacity: [0, 1], transform: [from, 'none']}); }
function hide(el, to) { if (el.hidden) return; const a = anim(el, {opacity: 0, transform: to}, {type: 'spring', stiffness: 520, damping: 38}); a ? a.finished.then(() => { el.hidden = true; el.style.opacity = el.style.transform = ''; }) : (el.hidden = true); }
const fmt = s => isFinite(s) ? (s >= 3600 ? Math.floor(s / 3600) + ':' + String(Math.floor(s % 3600 / 60)).padStart(2, '0') : Math.floor(s / 60)) + ':' + String(Math.floor(s % 60)).padStart(2, '0') : '0:00';
const dur = () => V.duration || 0;
const pct = t => (dur() ? t / dur() * 100 : 0) + '%';
new ResizeObserver(() => document.documentElement.style.setProperty('--barh', $('bar').offsetHeight + 'px')).observe($('bar'));

// motion: entrance + hover / press springs
if (M) {
  M.animate('#drop > *', {opacity: [0, 1], transform: ['translateY(14px)', 'none']}, {delay: M.stagger(.07), type: 'spring', stiffness: 260, damping: 24});
  M.hover('.ib, .chip', el => { M.animate(el, {scale: 1.1}, spring); return () => M.animate(el, {scale: 1}, spring); });
  M.hover('#play', el => { M.animate(el, {scale: 1.08}, spring); return () => M.animate(el, {scale: 1}, spring); });
  M.press('button', el => { M.animate(el, {scale: .9}, {type: 'spring', stiffness: 600, damping: 28}); return () => M.animate(el, {scale: 1}, spring); });
}

// ---------- idle auto-hide ----------
let idleT;
const busy = () => !$('more').hidden || !$('list').hidden;
const wake = () => { document.body.classList.remove('idle'); clearTimeout(idleT); if (!V.paused && !busy() && idx >= 0) idleT = setTimeout(() => document.body.classList.add('idle'), 2800); };
['pointermove', 'pointerdown', 'keydown', 'touchstart'].forEach(t => addEventListener(t, wake, {passive: true}));

// ---------- intake ----------
function addFiles(files) {
  const ok = [];
  for (const f of files) MEDIA.includes(ext(f.name)) ? ok.push(f) : toast(`${f.name}: unsupported format`);
  if (!ok.length) return;
  const start = queue.length; queue.push(...ok);
  idx < 0 ? play(start) : render();
}
function render() {
  $('items').innerHTML = '';
  queue.forEach((f, i) => { const li = document.createElement('li'); li.className = i === idx ? 'cur' : ''; li.innerHTML = '<span></span>'; li.firstChild.textContent = f.name || f; li.onclick = () => play(i); $('items').append(li); });
}
const openUrl = e => { e?.preventDefault(); const u = prompt('Video / audio / HLS (.m3u8) / DASH (.mpd) URL'); if (!u) return; queue.push(u.trim()); play(queue.length - 1); };
$('url').onclick = openUrl; $('url2').onclick = openUrl;

// ---------- playback ----------
function play(i) {
  if (i < 0 || i >= queue.length) return;
  idx = i; render(); clearLoop(); stopViz(); wake();
  const s = queue[i];
  document.body.classList.add('has'); $('title').textContent = s.name || s;
  V.style.display = 'block'; V.src = s;
  V.play?.().catch?.(err => { if (err?.name === 'NotAllowedError') toast('Press play to start'); });
}
const setPlay = p => { const b = $('play'); if (b.dataset.i === (p ? 'pause' : 'play')) return; b.dataset.i = p ? 'pause' : 'play'; ico(b, b.dataset.i); anim(b.firstChild, {transform: ['scale(.6) rotate(-30deg)', 'none'], opacity: [0, 1]}); wake(); };
V.addEventListener('error', e => toast('Playback error: ' + (e.detail?.message || e.detail || 'unsupported or corrupt file')));
V.addEventListener('loadeddata', () => { const ao = !V.videoWidth; V.style.display = ao ? 'none' : 'block'; ao ? startViz() : stopViz(); refreshBtns(); });
V.addEventListener('trackschange', refreshBtns);
V.addEventListener('ended', () => idx + 1 < queue.length && play(idx + 1));
V.addEventListener('play', () => setPlay(true));
V.addEventListener('pause', () => setPlay(false));
V.addEventListener('statechange', e => { if (e.detail === 'playing') setPlay(true); else if (e.detail === 'paused') setPlay(false); });
V.addEventListener('volumechange', () => { const b = $('mute'); b.dataset.i = V.muted || !V.volume ? 'mute' : 'vol'; ico(b, b.dataset.i); });
V.addEventListener('pipchange', e => $('pip').classList.toggle('on', !!e.detail?.pip));

// ---------- spectrum: rAF at display refresh rate, time-based smoothing, zero per-frame allocation ----------
const g = VIZ.getContext('2d', {desynchronized: true});
let W = 0, H = 0, grad, bins, bars, peaks, vel, fft, N = 0, last = 0;
function layout() {
  const dpr = Math.min(devicePixelRatio || 1, 2); W = VIZ.clientWidth; H = VIZ.clientHeight;
  if (!W) return; VIZ.width = W * dpr; VIZ.height = H * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0);
  N = W < 600 ? 32 : 64;
  bars = new Float32Array(N); peaks = new Float32Array(N); vel = new Float32Array(N);
  grad = g.createLinearGradient(0, H * .2, 0, H * .62); grad.addColorStop(0, '#ffffff'); grad.addColorStop(1, '#ff7a1a');
  const nb = an ? an.frequencyBinCount : 512; bins = new Uint16Array(N);
  for (let i = 0; i < N; i++) bins[i] = Math.min(nb - 1, Math.floor(Math.pow(i / N, 1.7) * nb * .72) + 1); // log-ish spacing
}
new ResizeObserver(layout).observe(VIZ);
function frame(t) {
  raf = requestAnimationFrame(frame);
  const dt = Math.min(.05, (t - last) / 1000 || .016); last = t;
  if (!an || !N) return;
  if (!fft || fft.length !== an.frequencyBinCount) { fft = new Uint8Array(an.frequencyBinCount); layout(); }
  an.getByteFrequencyData(fft);
  const up = 1 - Math.exp(-dt * 38), down = 1 - Math.exp(-dt * 9);
  g.clearRect(0, 0, W, H);
  const gap = Math.max(2, W / N * .28), bw = W / N - gap, base = H * .62, maxH = H * .5;
  g.fillStyle = grad; g.beginPath();
  for (let i = 0; i < N; i++) {
    const tg = Math.pow(fft[bins[i]] / 255, 1.4);
    bars[i] += (tg - bars[i]) * (tg > bars[i] ? up : down);
    if (bars[i] >= peaks[i]) { peaks[i] = bars[i]; vel[i] = 0; } else { vel[i] += dt * 1.6; peaks[i] = Math.max(0, peaks[i] - vel[i] * dt); }
    const h = Math.max(3, bars[i] * maxH), x = i * (bw + gap) + gap / 2;
    g.roundRect ? g.roundRect(x, base - h, bw, h, Math.min(bw / 2, 4)) : g.rect(x, base - h, bw, h);
  }
  g.fill();
  g.globalAlpha = .12; g.beginPath();
  for (let i = 0; i < N; i++) { const h = Math.max(3, bars[i] * maxH) * .45, x = i * (bw + gap) + gap / 2; g.rect(x, base + 6, bw, h); }
  g.fill(); g.globalAlpha = .9; g.fillStyle = '#fff'; g.beginPath();
  for (let i = 0; i < N; i++) g.rect(i * (bw + gap) + gap / 2, base - Math.max(3, peaks[i] * maxH) - 5, bw, 2);
  g.fill(); g.globalAlpha = 1;
}
function startViz() { VIZ.style.display = 'block'; cancelAnimationFrame(raf); last = performance.now(); layout(); raf = requestAnimationFrame(frame); }
function stopViz() { cancelAnimationFrame(raf); VIZ.style.display = 'none'; }
document.addEventListener('visibilitychange', () => { if (document.hidden) cancelAnimationFrame(raf); else if (VIZ.style.display === 'block') { last = performance.now(); raf = requestAnimationFrame(frame); } });

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
const toggle = () => V.paused ? V.play() : V.pause();
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
function closeMenus() { hide($('more'), 'translateY(8px) scale(.96)'); hide($('list'), 'translateX(24px)'); wake(); }
$('mo').onclick = () => { if ($('more').hidden) { hide($('list'), 'translateX(24px)'); show($('more'), 'translateY(10px) scale(.94)'); document.body.classList.remove('idle'); clearTimeout(idleT); } else closeMenus(); };
$('pl').onclick = () => { if ($('list').hidden) { hide($('more'), 'translateY(8px) scale(.96)'); show($('list'), 'translateX(32px)'); render(); document.body.classList.remove('idle'); clearTimeout(idleT); } else closeMenus(); };
$('plx').onclick = closeMenus;

// movi features: audio/subtitle tracks, aspect, rotate, HDR, snapshot, PiP
const MP = () => V.player;
const nm = t => t.label || t.language || t.lang || t.codec || ('#' + t.id);
function refreshBtns() {
  try { const a = MP()?.getAudioTracks?.() || [], s = MP()?.getSubtitleTracks?.() || [];
    $('aud').style.display = a.length > 1 ? '' : 'none'; $('sub').style.display = s.length ? '' : 'none';
    const ca = a.find(t => t.active ?? t.selected ?? t.enabled); $('audv').textContent = ca ? nm(ca) : '';
  } catch {}
}
function cycleTrack(get, set, label, valEl) {
  try {
    const tr = MP()[get](); if (!tr.length) return toast('No ' + label + ' tracks');
    const cur = tr.findIndex(t => t.active ?? t.selected ?? t.enabled);
    const nxt = label === 'subtitle' ? (cur + 1 >= tr.length ? null : tr[cur + 1]) : tr[(cur + 1) % tr.length];
    MP()[set](nxt ? nxt.id : null); const v = nxt ? nm(nxt) : 'Off'; $(valEl).textContent = v; $(valEl).parentElement.classList.toggle('on', !!nxt && label === 'subtitle'); toast(`${label[0].toUpperCase() + label.slice(1)}: ${v}`);
  } catch { toast('Track switch failed'); }
}
$('aud').onclick = () => cycleTrack('getAudioTracks', 'setAudioTrack', 'audio', 'audv');
$('sub').onclick = () => cycleTrack('getSubtitleTracks', 'setSubtitleTrack', 'subtitle', 'subv');
$('asp').onclick = () => { const m = ['contain', 'cover', 'fill', 'zoom']; V.objectFit = m[aspIdx = (aspIdx + 1) % m.length]; $('aspv').textContent = V.objectFit; };
$('rot').onclick = () => { V.rotate = (rotIdx = (rotIdx + 90) % 360); $('rotv').textContent = rotIdx + '°'; };
$('hdr').onclick = () => { V.hdr = !V.hdr; $('hdrv').textContent = V.hdr ? 'On' : 'Off'; $('hdr').classList.toggle('on', V.hdr); };
$('snap').onclick = () => {
  try { V.getCanvas().toBlob(b => { if (!b) return toast('Snapshot failed'); const a = Object.assign(document.createElement('a'), {href: URL.createObjectURL(b), download: `snapshot-${Date.now()}.png`}); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }); } catch { toast('Snapshot unavailable'); }
};
$('pip').onclick = () => V.requestPictureInPicture().catch(() => toast('Picture-in-Picture unavailable'));

addEventListener('keydown', e => {
  const tg = e.target.tagName, k = e.key.toLowerCase();
  if (e.ctrlKey || e.metaKey || e.altKey || (tg === 'BUTTON' && (k === ' ' || k === 'enter')) || (tg === 'INPUT' && e.target.type === 'range' && k.startsWith('arrow'))) return;
  const map = {f: 'fs', m: 'mute', a: 'setA', b: 'setB', p: 'pip', s: 'snap', h: 'hdr', r: 'asp', t: 'rot', v: 'sub', n: 'aud', l: 'clr'};
  if (k === ' ') { e.preventDefault(); toggle(); }
  else if (k === 'escape') closeMenus();
  else if (k === 'arrowright') V.currentTime += 5; else if (k === 'arrowleft') V.currentTime -= 5;
  else if (map[k]) $(map[k]).click();
});

// ---------- drag & drop ----------
let dc = 0;
const hasFiles = e => e.dataTransfer?.types?.includes('Files');
const endDrag = () => { dc = 0; document.body.classList.remove('drag'); };
addEventListener('dragenter', e => { if (!hasFiles(e)) return; e.preventDefault(); dc++; document.body.classList.add('drag'); });
addEventListener('dragover', e => { if (!hasFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
addEventListener('dragleave', e => { if (hasFiles(e) && --dc <= 0) endDrag(); });
addEventListener('drop', e => { if (!hasFiles(e)) return; e.preventDefault(); const fs = [...e.dataTransfer.files]; endDrag(); addFiles(fs); });
$('file').onchange = e => { addFiles([...e.target.files]); e.target.value = ''; };
refreshBtns(); drawLoop();
