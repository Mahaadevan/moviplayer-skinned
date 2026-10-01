import { probe, engines, lib } from './convert.js';
const CDN = 'https://cdn.jsdelivr.net/npm/';
const $ = s => document.querySelector(s), V = $('#v'), IMG = $('#img');
const ext = n => (n.split(/[?#]/)[0].split('.').pop() || '').toLowerCase();
const base = n => n.split(/[?#]/)[0].split(/[\\/]/).pop();
const set = s => new Set(s.split(' '));
const AUDIO = set('3ga aac ac3 adt adts aif aifc aiff amr aob ape au caf cda dts flac it m4a m4p mid mka mlp mod mp1 mp2 mp3 mpa mpc oga ogg oma opus qcp ra rmi s3m snd spx tta voc vqf w64 wav wma wv xa xm 669 a52');
const PIC = set('png jpg jpeg gif webp bmp svg avif ico apng');
const LIST = set('m3u m3u8 pls xspf wpl zpl asx wvx b4s ram');

const P = new Plyr(V, { controls: ['play-large', 'play', 'progress', 'current-time', 'duration', 'mute', 'volume', 'settings', 'pip', 'fullscreen'],
  settings: ['speed'], speed: { selected: 1, options: [.5, .75, 1, 1.25, 1.5, 2] }, keyboard: { focused: true, global: true }, storage: { enabled: false } });
const box = P.elements.container;

let q = [], cur = -1, tok = 0, shuf = false, rep = 0, ac = null, live = false, hls = null, dash = null, srcUrl = null;
const conv = new WeakMap();           // File -> {url, aud} cached conversions
const origUrls = new WeakMap();

// ---------- UI helpers ----------
function show(k) { box.style.display = k === 'video' || k === 'audio' ? '' : 'none'; IMG.hidden = k !== 'img'; $('#art').hidden = k !== 'audio'; $('#drop').hidden = !!k; }
function ov(msg, pct) { $('#ov').hidden = !msg; $('#msg').textContent = msg || ''; $('#bar').hidden = pct == null; if (pct != null) $('#bar i').style.width = pct + '%'; }
let tt; function toast(m) { const t = $('#toast'); t.textContent = m; t.hidden = false; clearTimeout(tt); tt = setTimeout(() => t.hidden = true, 5000); }
function render() { const l = $('#list'); l.textContent = ''; q.forEach((it, i) => { const d = document.createElement('div'); d.className = 'it' + (i === cur ? ' on' : ''); d.textContent = (i + 1) + '. ' + it.name; d.title = it.name; d.onclick = () => play(i); l.append(d); }); }
const blobUrl = f => origUrls.get(f) || (origUrls.set(f, URL.createObjectURL(f)), origUrls.get(f));

// ---------- queue / playlists ----------
async function expand(files) {
  const out = [];
  for (const f of files) {
    if (ext(f.name) !== 'zip') { out.push(f); continue; }
    try { await lib('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
      const z = await JSZip.loadAsync(f);
      for (const en of Object.values(z.files)) if (!en.dir) out.push(new File([await en.async('blob')], base(en.name)));
    } catch (e) { toast('Cannot read zip: ' + e.message); }
  }
  return out;
}
async function parsePl(f) {
  const t = await f.text(), e = ext(f.name);
  if (['m3u', 'm3u8', 'ram'].includes(e)) return t.split(/\r?\n/).map(s => s.trim()).filter(s => s && s[0] !== '#');
  if (e === 'pls') return [...t.matchAll(/^File\d+=(.+)$/gim)].map(m => m[1].trim());
  const r = [], d = new DOMParser().parseFromString(t, 'text/xml');
  d.querySelectorAll('location,media,ref,entry').forEach(n => { const s = n.textContent.trim() || n.getAttribute('src') || n.getAttribute('href') || n.getAttribute('Playstring'); if (s) r.push(s); });
  return r;
}
async function add(list) {
  const files = await expand([...list]), pls = files.filter(f => LIST.has(ext(f.name))), media = files.filter(f => !LIST.has(ext(f.name)));
  let items = [];
  if (pls.length) {
    const map = new Map(media.map(f => [f.name.toLowerCase(), f]));
    for (const p of pls) for (const ref of await parsePl(p)) {
      let b = base(ref.replace(/^file:\/+/, '')); try { b = decodeURIComponent(b); } catch {}
      const f = map.get(b.toLowerCase());
      if (f) { items.push({ name: f.name, file: f }); map.delete(b.toLowerCase()); }
      else if (/^https?:/i.test(ref)) items.push({ name: b || ref, url: ref });
    }
    map.forEach(f => items.push({ name: f.name, file: f }));
  } else items = media.map(f => ({ name: f.name, file: f }));
  if (!items.length) return;
  const first = q.length; q.push(...items);
  if (cur < 0) play(first); else render();
}

// ---------- playback engines ----------
function destroyStream() { hls?.destroy(); hls = null; dash?.reset(); dash = null; }
function tryNative(src, aud) {
  return new Promise(res => {
    const end = ok => { clearTimeout(t); V.removeEventListener('loadedmetadata', m); V.removeEventListener('error', e); res(ok); };
    const m = () => end(aud || V.videoWidth > 0), e = () => end(false), t = setTimeout(() => end(false), 20000);
    V.addEventListener('loadedmetadata', m); V.addEventListener('error', e);
    V.src = src; V.load();
  });
}
const wait = (ms, v) => new Promise(r => setTimeout(() => r(v), ms));
async function stream(url) {
  show('video'); ov('Opening stream…');
  const isHls = /\.m3u8(\?|#|$)/i.test(url), isDash = /\.mpd(\?|#|$)/i.test(url);
  if (isHls && !V.canPlayType('application/vnd.apple.mpegurl')) {
    await lib(CDN + 'hls.js@1.5.17/dist/hls.min.js');
    if (!Hls.isSupported()) throw new Error('HLS is not supported in this browser');
    hls = new Hls(); hls.loadSource(url); hls.attachMedia(V);
    await new Promise((res, rej) => { hls.on(Hls.Events.MANIFEST_PARSED, res); hls.on(Hls.Events.ERROR, (_, d) => d.fatal && rej(new Error('HLS error: ' + d.details))); });
  } else if (isDash) {
    await lib(CDN + 'dashjs@4.7.4/dist/dash.all.min.js');
    dash = dashjs.MediaPlayer().create(); dash.initialize(V, url, false);
    await new Promise((res, rej) => { dash.on('streamInitialized', res); dash.on('error', e => rej(new Error('DASH error: ' + (e.error?.message || e.error)))); });
  } else if (!await tryNative(url, false) && !await tryNative(url, true)) throw new Error('Cannot play this URL (format or CORS)');
}
function ready(aud) {
  ov(); show(aud ? 'audio' : 'video'); live = true;
  P.play().catch(() => {});
  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({ title: q[cur]?.name || '' });
    navigator.mediaSession.setActionHandler('previoustrack', () => play(cur - 1));
    navigator.mediaSession.setActionHandler('nexttrack', () => play(next()));
  }
}

async function load(it, my) {
  const f = it.file, e = ext(it.name);
  if (it.url) { await stream(it.url); return ready(false); }
  if (PIC.has(e)) { show('img'); IMG.src = blobUrl(f); return ov(); }
  const c = conv.get(f);
  if (c) { show(c.aud ? 'audio' : 'video'); if (await tryNative(c.url, c.aud)) return ready(c.aud); conv.delete(f); }
  show('video'); ov('Analysing ' + it.name + '…');
  const pr = await Promise.race([probe(f), wait(5000, null)]);
  const aud = AUDIO.has(e) || (!!pr && !pr.hasVideo);
  const ok = await tryNative(blobUrl(f), aud);
  if (ok && pr?.audioOk !== false) return ready(aud);
  if (my !== tok) return;

  // Needs conversion: pick the cheapest plan, escalate on failure.
  const plan = { audioOnly: aud, v: ok ? false : pr ? !pr.videoOk : true, a: pr ? !pr.audioOk : true };
  const tries = [];
  if (pr) tries.push(['gpu', plan]);
  tries.push(['wasm', plan]);
  if (!plan.v || !plan.a) tries.push(['wasm', { ...plan, v: true, a: true }]);
  ac = new AbortController(); const signal = ac.signal; let last;
  for (const [eng, pl] of tries) {
    if (signal.aborted) break;
    try {
      const label = 'Converting ' + it.name + (eng === 'gpu' ? ' (hardware)' : ' (ffmpeg, slower)') + (pl.v ? '' : ' – no video re-encode');
      ov(eng === 'wasm' ? 'Loading converter…' : label, 0);
      const blob = await engines[eng](f, pl, { signal, onProgress: p => ov(label, p) });
      ov('Verifying…'); const url = URL.createObjectURL(blob);
      if (await tryNative(url, aud)) { conv.set(f, { url, aud }); return ready(aud); }
      URL.revokeObjectURL(url); last = new Error('Converted file still did not play');
    } catch (err) { if (signal.aborted) break; last = err; console.warn(eng, err); }
  }
  throw signal.aborted ? new Error('Cancelled') : last || new Error('Conversion failed');
}

async function play(i) {
  if (i < 0 || i >= q.length) return;
  ac?.abort(); const my = ++tok; cur = i; live = false; render();
  P.pause(); destroyStream(); V.removeAttribute('src'); V.load(); IMG.removeAttribute('src');
  try { await load(q[i], my); }
  catch (err) { if (my !== tok) return; ov(); live = false; toast('⚠ ' + q[i].name + ': ' + err.message); if (err.message !== 'Cancelled' && i < q.length - 1) setTimeout(() => my === tok && play(i + 1), 2500); }
}
const next = () => shuf && q.length > 1 ? (cur + 1 + Math.random() * (q.length - 1) | 0) % q.length : cur + 1;

// ---------- events ----------
P.on('ended', () => { if (rep === 2) { V.currentTime = 0; P.play(); } else { const n = next(); n < q.length ? play(n) : rep === 1 && q.length && play(0); } });
V.addEventListener('error', () => live && toast('Playback error: ' + (V.error?.message || 'decode failure')));
$('#prev').onclick = () => V.currentTime > 3 ? V.currentTime = 0 : play(cur - 1);
$('#next').onclick = () => play(next());
$('#shuf').onclick = e => { shuf = !shuf; e.currentTarget.classList.toggle('a', shuf); };
$('#rep').onclick = e => { rep = (rep + 1) % 3; e.currentTarget.classList.toggle('a', !!rep); e.currentTarget.textContent = rep === 2 ? '🔂' : '🔁'; e.currentTarget.title = 'Repeat: ' + ['off', 'all', 'one'][rep]; };
$('#cancel').onclick = () => ac?.abort();
$('#clr').onclick = () => { ac?.abort(); tok++; q = []; cur = -1; P.pause(); destroyStream(); V.removeAttribute('src'); V.load(); show(null); ov(); render(); };
$('#open').onclick = () => $('#fi').click();
$('#fi').onchange = e => { add(e.target.files); e.target.value = ''; };
$('#urlf').onsubmit = e => { e.preventDefault(); const u = $('#url').value.trim(); if (!u) return; q.push({ name: base(u) || u, url: u }); $('#url').value = ''; play(q.length - 1); };
document.addEventListener('keydown', e => { if (/INPUT|TEXTAREA/.test(e.target.tagName)) return; if (e.key === 'n') play(next()); else if (e.key === 'p') play(cur - 1); });
['dragenter', 'dragover'].forEach(t => document.addEventListener(t, e => { e.preventDefault(); $('#stage').classList.add('over'); }));
['dragleave', 'drop'].forEach(t => document.addEventListener(t, e => { e.preventDefault(); $('#stage').classList.remove('over'); }));
document.addEventListener('drop', e => { if (e.dataTransfer.files.length) add(e.dataTransfer.files); });
show(null);
