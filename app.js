import {convert} from './convert.js';
const $ = id => document.getElementById(id);
const V = $('video'), IMG = $('image'), VIZ = $('viz');
const AUDIO = 'aac ac3 adt adts aif aifc aiff amr aob ape au caf cda dts flac m4a m4p mid mka mlp mp1 mp2 mp3 mpa mpc oga ogg oma opus qcp ra rmi snd spx tta voc vqf w64 wav weba wma wv xa 669 it mod s3m xm'.split(' ');
const IMAGE = 'jpg jpeg png gif webp avif bmp svg ico'.split(' ');
const LISTS = 'm3u m3u8 pls xspf wpl zpl asx b4s ram wvx'.split(' ');
const UNSUPPORTED = {iso: 'Disc images (.iso/.ifo/.vob menus) cannot be mounted in a browser.', rar: 'RAR archives are not supported; use .zip.', mid: 'MIDI needs a synthesizer, which is not bundled yet.', rmi: 'MIDI needs a synthesizer, which is not bundled yet.',
  669: 'Tracker modules are not bundled yet.', it: 'Tracker modules are not bundled yet.', mod: 'Tracker modules are not bundled yet.', s3m: 'Tracker modules are not bundled yet.', xm: 'Tracker modules are not bundled yet.'};
const ext = n => n.split('.').pop().toLowerCase();
let queue = [], idx = -1, url = null, A = null, B = null, kind = '', actx, an, src, raf;

// ---------- feedback ----------
function toast(msg) {
  const t = Object.assign(document.createElement('div'), {className: 'toast', textContent: msg});
  $('toasts').append(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, 4500);
}
function ask(title, body) {
  return new Promise(res => {
    $('mt').textContent = title; $('mb').textContent = body; $('prog').hidden = true;
    $('yes').textContent = 'Yes, convert'; $('no').textContent = 'No'; $('modal').hidden = false;
    $('yes').onclick = () => res(true); $('no').onclick = () => { $('modal').hidden = true; res(false); };
  });
}

// ---------- intake ----------
const fmt = s => isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '0:00';
async function addFiles(files) {
  const media = [];
  for (const f of files) {
    const e = ext(f.name);
    if (e === 'zip') {
      try {
        const z = fflate.unzipSync(new Uint8Array(await f.arrayBuffer()));
        for (const [n, d] of Object.entries(z)) if (d.length) media.push(new File([d], n.split('/').pop()));
      } catch { toast('Could not open ' + f.name); }
    } else media.push(f);
  }
  const byName = new Map(media.map(f => [f.name.toLowerCase(), f]));
  let out = [];
  for (const f of media) {
    if (LISTS.includes(ext(f.name))) {
      const txt = await f.text();
      const names = [...txt.matchAll(/^(?!#)(?:File\d+=)?(.+\.[a-z0-9]{2,5})\s*$|(?:location|src|href)[>="']+([^<"']+)/gim)].map(m => (m[1] || m[2]).split(/[\\/]/).pop().trim().toLowerCase());
      const hit = names.map(n => byName.get(n)).filter(Boolean);
      hit.length ? out.push(...hit) : toast(`${f.name}: drop its media files together with the playlist.`);
    } else out.push(f);
  }
  out = [...new Set(out)].filter(f => !LISTS.includes(ext(f.name)));
  if (!out.length) return;
  queue.push(...out); render();
  if (idx < 0 || !document.body.classList.contains('has')) play(queue.length - out.length);
}
function render() {
  $('items').innerHTML = '';
  queue.forEach((f, i) => { const li = Object.assign(document.createElement('li'), {textContent: f.name, className: i === idx ? 'cur' : ''}); li.onclick = () => play(i); $('items').append(li); });
}

// ---------- playback ----------
async function play(i, converted) {
  if (i < 0 || i >= queue.length) return;
  idx = i; render(); clearLoop();
  const f = queue[i], e = ext(f.name);
  if (UNSUPPORTED[e] && !converted) { toast(`${f.name}: ${UNSUPPORTED[e]}`); return; }
  V.pause(); if (url) URL.revokeObjectURL(url); url = URL.createObjectURL(f);
  document.body.classList.add('has'); $('title').textContent = f.name;
  IMG.style.display = V.style.display = VIZ.style.display = 'none';
  if (IMAGE.includes(e)) { kind = 'image'; IMG.src = url; IMG.style.display = 'block'; return; }
  kind = AUDIO.includes(e) ? 'audio' : 'video';
  V.src = url; V.style.display = kind === 'video' ? 'block' : 'none';
  if (kind === 'audio') { VIZ.style.display = 'block'; startViz(); }
  V.onerror = () => asked.has(f) && converted ? toast('Converted file still not playable: ' + (V.error?.message || 'decode error')) : needConvert(f, 'This browser cannot decode ' + f.name + '.');
  try { await V.play(); } catch (err) { if (err.name !== 'AbortError' && err.name !== 'NotAllowedError') needConvert(f, 'Playback failed.'); return; }
  // MKV/others: video plays but the audio codec (AC3, DTS…) may be unsupported
  if (kind === 'video') setTimeout(() => {
    const silent = V.webkitAudioDecodedByteCount === 0 || V.mozHasAudio === false || (V.audioTracks && V.audioTracks.length === 0);
    if (queue[i] === f && !V.paused && silent && V.currentTime > .5) needConvert(f, 'The video plays but its audio track is not supported by this browser.');
  }, 1800);
}
const asked = new WeakSet();
async function needConvert(f, why) {
  if ($('modal').hidden === false || asked.has(f)) return;
  asked.add(f);
  V.pause();
  if (!await ask('Convert to a playable format?', `${why} Convert locally to ${kind === 'audio' ? 'M4A (AAC)' : 'MP4 (H.264/AAC)'}? Nothing leaves your device. Your GPU is used when available, otherwise the CPU.`)) return;
  $('yes').hidden = true; $('no').textContent = 'Cancel'; $('prog').hidden = false; $('log').textContent = ''; $('pfill').style.width = '0';
  $('mt').textContent = 'Converting…'; $('mb').textContent = f.name;
  const ac = new AbortController();
  $('no').onclick = () => { ac.abort(); $('modal').hidden = true; $('yes').hidden = false; };
  try {
    const out = await convert(f, {audioOnly: kind === 'audio', reencode: !/audio track/.test(why), signal: ac.signal,
      onProgress: p => { $('pfill').style.width = p * 100 + '%'; $('ppct').textContent = (p * 100).toFixed(1) + '%'; },
      onLog: m => { const l = $('log'); l.textContent += m + '\n'; l.scrollTop = l.scrollHeight; }});
    $('modal').hidden = true; $('yes').hidden = false;
    asked.add(out); queue[idx] = out; play(idx, true);
  } catch (err) {
    if (ac.signal.aborted) return;
    $('modal').hidden = true; $('yes').hidden = false; toast('Conversion failed: ' + err.message);
  }
}

// ---------- spectrum ----------
function startViz() {
  if (!actx) { actx = new AudioContext(); an = actx.createAnalyser(); an.fftSize = 512; an.smoothingTimeConstant = .82; src = actx.createMediaElementSource(V); src.connect(an); an.connect(actx.destination); }
  actx.resume(); cancelAnimationFrame(raf);
  const g = VIZ.getContext('2d'), d = new Uint8Array(an.frequencyBinCount);
  (function draw() {
    raf = requestAnimationFrame(draw);
    const w = VIZ.width = VIZ.clientWidth, h = VIZ.height = VIZ.clientHeight; an.getByteFrequencyData(d);
    const n = 64, bw = w / n, gr = g.createLinearGradient(0, h, 0, 0); gr.addColorStop(0, '#ff8a00'); gr.addColorStop(1, '#5ee7ff');
    g.fillStyle = gr; g.shadowColor = '#ff8a00'; g.shadowBlur = 14;
    for (let i = 0; i < n; i++) { const v = d[Math.floor(i * d.length * .7 / n)] / 255, bh = Math.max(3, v * h * .6); g.fillRect(i * bw + 2, (h - bh) * .55, bw - 4, bh); g.globalAlpha = .18; g.fillRect(i * bw + 2, (h + bh) * .55 - bh + bh, bw - 4, bh * .5); g.globalAlpha = 1; }
  })();
}

// ---------- controls + A-B loop ----------
const dur = () => V.duration || 0;
const pct = t => (t / dur() * 100) + '%';
function clearLoop() { A = B = null; drawLoop(); }
function drawLoop() {
  $('mA').style.display = A != null ? 'block' : 'none'; $('mB').style.display = B != null ? 'block' : 'none';
  if (A != null) $('mA').style.left = pct(A); if (B != null) $('mB').style.left = pct(B);
  const on = A != null && B != null; $('loop').style.display = on ? 'block' : 'none';
  if (on) { $('loop').style.left = pct(A); $('loop').style.width = pct(B - A); }
  $('setA').classList.toggle('on', A != null); $('setB').classList.toggle('on', B != null);
}
$('setA').onclick = () => { A = V.currentTime; if (B != null && B <= A) B = null; drawLoop(); };
$('setB').onclick = () => { if (A == null) A = 0; if (V.currentTime > A) { B = V.currentTime; drawLoop(); } else toast('Loop end must come after the start.'); };
$('clr').onclick = clearLoop;
V.ontimeupdate = V.onloadedmetadata = () => {
  $('fill').style.width = pct(V.currentTime); $('time').textContent = `${fmt(V.currentTime)} / ${fmt(dur())}`;
  if (V.buffered.length) $('buf').style.width = pct(V.buffered.end(V.buffered.length - 1)); drawLoop();
};
setInterval(() => { if (A != null && B != null && !V.paused && V.currentTime >= B) V.currentTime = A; }, 40);
const seekTo = e => { const r = $('seek').getBoundingClientRect(); V.currentTime = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * dur(); };
$('seek').onpointerdown = e => {
  if (e.target.classList.contains('mk')) { const m = e.target === $('mA') ? 'A' : 'B';
    const mv = ev => { const r = $('seek').getBoundingClientRect(), t = Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)) * dur(); m === 'A' ? A = t : B = t; drawLoop(); };
    addEventListener('pointermove', mv); addEventListener('pointerup', () => removeEventListener('pointermove', mv), {once: true}); return; }
  seekTo(e); const mv = ev => seekTo(ev); addEventListener('pointermove', mv); addEventListener('pointerup', () => removeEventListener('pointermove', mv), {once: true});
};
const toggle = () => V.paused ? V.play() : V.pause();
$('play').onclick = toggle; V.onclick = toggle;
V.onplay = () => { $('play').textContent = '⏸'; document.body.classList.add('playing'); };
V.onpause = () => $('play').textContent = '▶';
V.onended = () => play(idx + 1);
$('prev').onclick = () => play(idx - 1); $('next').onclick = () => play(idx + 1);
$('rate').onchange = e => V.playbackRate = +e.target.value;
$('vol').oninput = e => V.volume = +e.target.value;
$('mute').onclick = () => { V.muted = !V.muted; $('mute').textContent = V.muted ? '🔇' : '🔊'; };
$('pl').onclick = () => $('list').classList.toggle('open');
$('fs').onclick = () => document.fullscreenElement ? document.exitFullscreen() : $('stage').requestFullscreen();
addEventListener('keydown', e => {
  if (e.target.tagName === 'SELECT') return;
  const k = e.key; if (k === ' ') { e.preventDefault(); toggle(); } else if (k === 'ArrowRight') V.currentTime += 5; else if (k === 'ArrowLeft') V.currentTime -= 5;
  else if (k === 'f') $('fs').click(); else if (k === 'm') $('mute').click(); else if (k === 'a') $('setA').click(); else if (k === 'b') $('setB').click();
});

// ---------- drag & drop ----------
['dragenter', 'dragover'].forEach(t => addEventListener(t, e => { e.preventDefault(); document.body.classList.add('drag'); }));
['dragleave', 'drop'].forEach(t => addEventListener(t, e => { e.preventDefault(); if (t === 'drop' || !e.relatedTarget) document.body.classList.remove('drag'); }));
addEventListener('drop', e => addFiles([...e.dataTransfer.files]));
$('file').onchange = e => addFiles([...e.target.files]);
