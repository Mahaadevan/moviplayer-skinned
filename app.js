// Cone — custom GUI skin over movi-player (https://github.com/MrUjjwalG/movi-player), loaded from CDN.
const MOVI = 'https://cdn.jsdelivr.net/npm/movi-player@0.4.1/dist/element.js';
const $ = id => document.getElementById(id);
const V = $('video'), VIZ = $('viz');
const MEDIA = 'mp4 m4v mov webm ogv mkv avi ts m2ts mts mpg mpeg flv wmv 3gp mp3 m4a aac flac opus ogg oga wav weba wma ac3'.split(' ');
const ext = n => n.split('.').pop().toLowerCase();
let queue = [], idx = -1, A = null, B = null, an = null, raf = 0, aspIdx = 0, rotIdx = 0;

// ---------- spectrum tap: route every AudioContext destination connection through an analyser ----------
const rawConnect = AudioNode.prototype.connect;
AudioNode.prototype.connect = function (t, ...r) {
  if (typeof AudioDestinationNode !== 'undefined' && t instanceof AudioDestinationNode && this !== t.context.__an) {
    const c = t.context;
    if (!c.__an) { an = c.__an = c.createAnalyser(); an.fftSize = 512; an.smoothingTimeConstant = .82; rawConnect.call(an, c.destination); }
    return rawConnect.call(this, c.__an, ...r);
  }
  return rawConnect.call(this, t, ...r);
};
await import(MOVI);

function toast(msg) {
  const t = Object.assign(document.createElement('div'), {className: 'toast', textContent: msg});
  $('toasts').append(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, 4500);
}
const fmt = s => isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '0:00';
const dur = () => V.duration || 0;
const pct = t => (dur() ? t / dur() * 100 : 0) + '%';

// bar height -> layout (bar wraps on narrow screens)
new ResizeObserver(() => document.documentElement.style.setProperty('--bar', $('bar').offsetHeight + 'px')).observe($('bar'));

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
  queue.forEach((f, i) => { const li = Object.assign(document.createElement('li'), {textContent: f.name || f, className: i === idx ? 'cur' : ''}); li.onclick = () => { play(i); $('list').classList.remove('open'); $('pl').classList.remove('on'); }; $('items').append(li); });
}
document.querySelectorAll('.openurl').forEach(b => b.onclick = () => {
  const u = prompt('Video / audio / HLS (.m3u8) / DASH (.mpd) URL'); if (!u) return;
  closeTray(); queue.push(u.trim()); play(queue.length - 1);
});

// ---------- playback ----------
function play(i) {
  if (i < 0 || i >= queue.length) return;
  idx = i; render(); clearLoop(); stopViz();
  const s = queue[i];
  document.body.classList.add('has'); $('title').textContent = s.name || s;
  VIZ.style.display = 'none'; V.style.display = 'block';
  V.src = s;
  V.play?.().catch?.(err => { if (err?.name === 'NotAllowedError') toast('Press play to start'); });
}
V.addEventListener('error', e => toast('Playback error: ' + (e.detail?.message || e.detail || 'unsupported or corrupt file')));
V.addEventListener('loadeddata', () => { const audioOnly = !V.videoWidth; V.style.display = audioOnly ? 'none' : 'block'; if (audioOnly) startViz(); else stopViz(); refreshBtns(); });
V.addEventListener('trackschange', refreshBtns);
V.addEventListener('ended', () => idx + 1 < queue.length && play(idx + 1));
const setPlaying = on => document.body.classList.toggle('playing-now', on);
V.addEventListener('play', () => setPlaying(true));
V.addEventListener('pause', () => setPlaying(false));
V.addEventListener('statechange', e => { if (e.detail === 'playing') setPlaying(true); else if (e.detail === 'paused' || e.detail === 'ended') setPlaying(false); });
V.addEventListener('volumechange', () => document.body.classList.toggle('is-muted', V.muted));
V.addEventListener('pipchange', e => $('pip').classList.toggle('on', !!e.detail?.pip));

// ---------- spectrum (cheap: canvas sized on resize only, no per-frame allocation or shadows) ----------
const FRAME = 1000 / 120; let vw = 0, vh = 0, g, bins, last = 0, acc = 0; const lv = new Float32Array(48);
function sizeViz() {
  const r = Math.min(devicePixelRatio || 1, 1.5);
  vw = VIZ.width = Math.round(VIZ.clientWidth * r); vh = VIZ.height = Math.round(VIZ.clientHeight * r);
  g = VIZ.getContext('2d'); g.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#f0883e';
}
new ResizeObserver(() => VIZ.style.display === 'block' && sizeViz()).observe($('stage'));
function startViz() {
  VIZ.style.display = 'block'; sizeViz(); cancelAnimationFrame(raf); last = performance.now(); acc = 0;
  (function draw(t) {
    raf = requestAnimationFrame(draw);
    const dt = t - last; last = t; acc += dt;
    if (acc < FRAME || !an || document.hidden) return; acc %= FRAME;   // cap at 120 fps (or the display's max if lower)
    const k = Math.pow(.88, dt / 33);
    bins ||= new Uint8Array(an.frequencyBinCount); an.getByteFrequencyData(bins);
    g.clearRect(0, 0, vw, vh);
    const n = 48, bw = vw / n, max = vh * .55, base = vh * .62;
    g.beginPath();
    for (let j = 0; j < n; j++) {
      const v = bins[(j * bins.length * .75 / n) | 0] / 255;
      lv[j] = v > lv[j] ? v : lv[j] * k + v * (1 - k);
      const h = Math.max(2, lv[j] * max);
      g.rect(j * bw + bw * .18, base - h, bw * .64, h);
    }
    g.fill();
  })();
}
function stopViz() { cancelAnimationFrame(raf); VIZ.style.display = 'none'; }

// ---------- controls ----------
function clearLoop() { A = B = null; drawLoop(); }
function drawLoop() {
  $('mA').style.display = A != null ? 'block' : 'none'; $('mB').style.display = B != null ? 'block' : 'none';
  if (A != null) $('mA').style.left = pct(A);
  if (B != null) $('mB').style.left = pct(B);
  const on = A != null && B != null; $('loop').style.display = on ? 'block' : 'none';
  if (on) { $('loop').style.left = pct(A); $('loop').style.width = pct(B - A); }
  $('setA').classList.toggle('on', A != null); $('setB').classList.toggle('on', B != null);
}
$('setA').onclick = () => { A = V.currentTime; if (B != null && B <= A) B = null; drawLoop(); };
$('setB').onclick = () => { if (A == null) A = 0; if (V.currentTime > A) { B = V.currentTime; drawLoop(); } else toast('Loop end must come after the start.'); };
$('clr').onclick = clearLoop;
V.addEventListener('timeupdate', () => {
  $('fill').style.width = pct(V.currentTime); $('tcur').textContent = fmt(V.currentTime); $('tdur').textContent = fmt(dur());
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
const toggle = () => V.paused ? V.play() : V.pause();
$('play').onclick = toggle; $('stage').onclick = e => { if (e.target.closest('#drop')) return; toggle(); };

// tray
const tray = $('tray'), closeTray = () => { tray.hidden = true; $('tools').classList.remove('on'); };
$('tools').onclick = () => { tray.hidden = !tray.hidden; $('tools').classList.toggle('on', !tray.hidden); };
addEventListener('pointerdown', e => { if (!tray.hidden && !e.target.closest('#tray, #tools')) closeTray(); });
addEventListener('keydown', e => { if (e.key === 'Escape') closeTray(); });
$('prev').onclick = () => play(idx - 1); $('next').onclick = () => play(idx + 1);
$('rate').onchange = e => V.playbackRate = +e.target.value;
$('vol').oninput = e => V.volume = +e.target.value;
$('mute').onclick = () => V.muted = !V.muted;
$('pl').onclick = () => { $('list').classList.toggle('open'); $('pl').classList.toggle('on'); closeTray(); };
$('fs').onclick = () => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.().catch(() => toast('Fullscreen unavailable here'));

// movi features: audio/subtitle tracks, aspect, rotate, HDR, snapshot, PiP
const P = () => V.player;
const nm = t => t.label || t.language || t.lang || t.codec || ('#' + t.id);
function refreshBtns() {
  try { $('aud').style.display = (P()?.getAudioTracks?.().length || 0) > 1 ? '' : 'none'; $('sub').style.display = (P()?.getSubtitleTracks?.().length || 0) ? '' : 'none'; } catch {}
}
function cycleTrack(get, set, label) {
  try {
    const tr = P()[get](); if (!tr.length) return toast('No ' + label + ' tracks');
    const cur = tr.findIndex(t => t.active ?? t.selected ?? t.enabled);
    const nxt = label === 'subtitle' ? (cur + 1 >= tr.length ? null : tr[cur + 1]) : tr[(cur + 1) % tr.length];
    P()[set](nxt ? nxt.id : null); toast(`${label}: ${nxt ? nm(nxt) : 'off'}`);
  } catch (e) { toast('Track switch failed'); }
}
$('aud').onclick = () => cycleTrack('getAudioTracks', 'setAudioTrack', 'audio');
$('sub').onclick = () => cycleTrack('getSubtitleTracks', 'setSubtitleTrack', 'subtitle');
$('asp').onclick = () => { const m = ['contain', 'cover', 'fill', 'zoom']; V.objectFit = m[aspIdx = (aspIdx + 1) % m.length]; toast('Aspect: ' + V.objectFit); };
$('rot').onclick = () => { V.rotate = (rotIdx = (rotIdx + 90) % 360); };
$('hdr').onclick = () => { V.hdr = !V.hdr; $('hdr').classList.toggle('on', V.hdr); };
$('snap').onclick = () => {
  try { V.getCanvas().toBlob(b => { if (!b) return toast('Snapshot failed'); const a = Object.assign(document.createElement('a'), {href: URL.createObjectURL(b), download: `snapshot-${Date.now()}.png`}); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }); } catch { toast('Snapshot unavailable'); }
};
$('pip').onclick = () => V.requestPictureInPicture().catch(() => toast('Picture-in-Picture unavailable'));

addEventListener('keydown', e => {
  const tg = e.target.tagName, k = e.key.toLowerCase();
  if (e.ctrlKey || e.metaKey || e.altKey || tg === 'SELECT' || (tg === 'BUTTON' && (k === ' ' || k === 'enter')) || (tg === 'INPUT' && e.target.type === 'range' && k.startsWith('arrow'))) return;
  const map = {f: 'fs', m: 'mute', a: 'setA', b: 'setB', p: 'pip', s: 'snap', h: 'hdr', r: 'asp', t: 'rot', v: 'sub', n: 'aud'};
  if (k === ' ') { e.preventDefault(); toggle(); }
  else if (k === 'arrowright') V.currentTime += 5; else if (k === 'arrowleft') V.currentTime -= 5;
  else if (map[k]) $(map[k]).click();
});

// ---------- drag & drop ----------
// Capture phase on window: movi's own handlers can't swallow the events.
// The overlay clears itself shortly after dragover stops, so there is no enter/leave counter to drift.
const hasFiles = e => e.dataTransfer?.types?.includes('Files');
let dt;
const endDrag = () => { clearTimeout(dt); document.body.classList.remove('drag'); };
const eat = e => { e.preventDefault(); e.stopPropagation(); };
addEventListener('dragenter', e => hasFiles(e) && eat(e), true);
addEventListener('dragover', e => {
  if (!hasFiles(e)) return; eat(e); e.dataTransfer.dropEffect = 'copy';
  document.body.classList.add('drag'); clearTimeout(dt); dt = setTimeout(endDrag, 400);
}, true);
addEventListener('drop', e => { if (!hasFiles(e)) return; eat(e); const fs = [...e.dataTransfer.files]; endDrag(); addFiles(fs); }, true);
addEventListener('dragend', endDrag, true);
document.querySelectorAll('.pick').forEach(p => p.onchange = e => { addFiles([...e.target.files]); e.target.value = ''; closeTray(); });
refreshBtns();
