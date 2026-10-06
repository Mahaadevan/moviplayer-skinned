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
  queue.forEach((f, i) => { const li = Object.assign(document.createElement('li'), {textContent: f.name || f, className: i === idx ? 'cur' : ''}); li.onclick = () => play(i); $('items').append(li); });
}
$('url').onclick = e => {
  e.preventDefault();
  const u = prompt('Video / audio / HLS (.m3u8) / DASH (.mpd) URL'); if (!u) return;
  queue.push(u.trim()); const i = queue.length - 1; idx < 0 ? play(i) : (render(), play(i));
};

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
V.addEventListener('play', () => { $('play').textContent = '⏸'; document.body.classList.add('playing'); });
V.addEventListener('pause', () => $('play').textContent = '▶');
V.addEventListener('statechange', e => { if (e.detail === 'playing') $('play').textContent = '⏸'; else if (e.detail === 'paused') $('play').textContent = '▶'; });
V.addEventListener('volumechange', () => $('mute').textContent = V.muted ? '🔇' : '🔊');
V.addEventListener('pipchange', e => $('pip').classList.toggle('on', !!e.detail?.pip));

// ---------- spectrum ----------
function startViz() {
  VIZ.style.display = 'block'; cancelAnimationFrame(raf);
  const g = VIZ.getContext('2d');
  (function draw() {
    raf = requestAnimationFrame(draw);
    const w = VIZ.width = VIZ.clientWidth, h = VIZ.height = VIZ.clientHeight;
    if (!an) return;
    const d = new Uint8Array(an.frequencyBinCount); an.getByteFrequencyData(d);
    const n = 64, bw = w / n, gr = g.createLinearGradient(0, h, 0, 0); gr.addColorStop(0, '#ff8a00'); gr.addColorStop(1, '#5ee7ff');
    g.fillStyle = gr; g.shadowColor = '#ff8a00'; g.shadowBlur = 14;
    for (let i = 0; i < n; i++) { const v = d[Math.floor(i * d.length * .7 / n)] / 255, bh = Math.max(3, v * h * .6); g.fillRect(i * bw + 2, (h - bh) * .55, bw - 4, bh); g.globalAlpha = .18; g.fillRect(i * bw + 2, (h + bh) * .55, bw - 4, bh * .5); g.globalAlpha = 1; }
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
const toggle = () => V.paused ? V.play() : V.pause();
$('play').onclick = toggle; $('stage').onclick = e => { if (e.target.closest('#drop')) return; toggle(); };
$('prev').onclick = () => play(idx - 1); $('next').onclick = () => play(idx + 1);
$('rate').onchange = e => V.playbackRate = +e.target.value;
$('vol').oninput = e => V.volume = +e.target.value;
$('mute').onclick = () => V.muted = !V.muted;
$('pl').onclick = () => $('list').classList.toggle('open');
$('fs').onclick = () => document.fullscreenElement ? document.exitFullscreen() : $('stage').requestFullscreen();

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
let dc = 0;
const hasFiles = e => e.dataTransfer?.types?.includes('Files');
const endDrag = () => { dc = 0; document.body.classList.remove('drag'); };
addEventListener('dragenter', e => { if (!hasFiles(e)) return; e.preventDefault(); dc++; document.body.classList.add('drag'); });
addEventListener('dragover', e => { if (!hasFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
addEventListener('dragleave', e => { if (hasFiles(e) && --dc <= 0) endDrag(); });
addEventListener('drop', e => { if (!hasFiles(e)) return; e.preventDefault(); const fs = [...e.dataTransfer.files]; endDrag(); addFiles(fs); });
$('file').onchange = e => { addFiles([...e.target.files]); e.target.value = ''; };
refreshBtns();
