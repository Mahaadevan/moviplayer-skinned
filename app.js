import { probe, engines } from './convert.js';

const $ = id => document.getElementById(id);
const V = $('video');
const IMG = $('image');
const VIZ = $('viz');

const AUDIO = new Set('aac ac3 adt adts aif aifc aiff amr aob ape au caf cda dts flac m4a m4p mid mka mlp mp1 mp2 mp3 mpa mpc oga ogg oma opus qcp ra rmi snd spx tta voc vqf w64 wav weba wma wv xa'.split(' '));
const IMAGE = new Set('jpg jpeg png gif webp avif bmp svg ico'.split(' '));
const LISTS = new Set('m3u m3u8 pls xspf wpl zpl asx b4s ram wvx'.split(' '));
const UNSUPPORTED = {
  iso: 'Disc images (.iso/.ifo/.vob menus) cannot be mounted in a browser.',
  ifo: 'DVD menu files cannot be mounted in a browser.',
  vob: 'DVD/VOB navigation is not supported; use a standalone media file.',
  rar: 'RAR archives are not supported; use .zip.',
  mid: 'MIDI needs a synthesizer, which is not bundled yet.',
  rmi: 'MIDI needs a synthesizer, which is not bundled yet.',
  669: 'Tracker modules are not bundled yet.',
  it: 'Tracker modules are not bundled yet.',
  mod: 'Tracker modules are not bundled yet.',
  s3m: 'Tracker modules are not bundled yet.',
  xm: 'Tracker modules are not bundled yet.',
};

const ext = name => {
  const m = String(name).toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : '';
};

const fmt = seconds => {
  const s = Number(seconds);
  if (!Number.isFinite(s) || s < 0) return '0:00';
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const secs = Math.floor(s % 60);
  return hours
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
    : `${minutes}:${String(secs).padStart(2, '0')}`;
};

let queue = [];
let idx = -1;
let url = null;
let A = null;
let B = null;
let kind = '';
let actx = null;
let an = null;
let mediaSource = null;
let raf = 0;
let playToken = 0;
let controller = null;

// Converted files are cached by File object. Cache size is intentionally small
// because each entry can hold a complete MP4 in memory.
const conv = new Map();

function toast(message) {
  const t = Object.assign(document.createElement('div'), {
    className: 'toast',
    textContent: message,
  });
  $('toasts').append(t);
  setTimeout(() => {
    t.classList.add('out');
    setTimeout(() => t.remove(), 300);
  }, 4500);
}

function closeModal() {
  $('modal').hidden = true;
  $('prog').hidden = true;
  $('yes').hidden = false;
  $('yes').textContent = 'Yes, convert';
  $('no').textContent = 'No';
}

function askConversion(title, body, signal) {
  return new Promise(resolve => {
    let done = false;

    const finish = answer => {
      if (done) return;
      done = true;
      signal?.removeEventListener('abort', onAbort);
      closeModal();
      resolve(answer);
    };

    const onAbort = () => finish(false);

    $('mt').textContent = title;
    $('mb').textContent = body;
    $('prog').hidden = true;
    $('yes').hidden = false;
    $('yes').textContent = 'Yes, convert';
    $('no').textContent = 'No';
    $('modal').hidden = false;

    $('yes').onclick = () => finish(true);
    $('no').onclick = () => finish(false);
    signal?.addEventListener('abort', onAbort, { once: true });

    if (signal?.aborted) finish(false);
  });
}

function showConversionModal(title, body, signal) {
  $('mt').textContent = title;
  $('mb').textContent = body;
  $('prog').hidden = false;
  $('yes').hidden = true;
  $('no').textContent = 'Cancel';
  $('modal').hidden = false;

  const cancel = () => controller?.abort();
  $('no').onclick = cancel;

  if (signal?.aborted) cancel();
}

// ---------- intake / playlists ----------

function decodeText(value) {
  return String(value)
    .replace(/^\uFEFF/, '')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function cleanPlaylistEntry(value) {
  let s = decodeText(value).trim();
  if (!s || s.startsWith('#')) return null;

  // Strip common URI/query fragments and surrounding quotes.
  s = s.replace(/^["']|["']$/g, '').trim();
  try {
    s = decodeURIComponent(s);
  } catch {
    // Keep the original when it contains malformed percent escapes.
  }

  // Playlists normally reference a path/URL. For local dropped files we only
  // need the final filename. Query/hash fragments are not part of the name.
  s = s.split(/[?#]/, 1)[0];
  s = s.replace(/\\/g, '/');
  const name = s.split('/').pop()?.trim();
  return name ? name.toLowerCase() : null;
}

function parsePlaylist(text, extension) {
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
  const names = [];

  if (extension === 'pls') {
    for (const line of lines) {
      const m = line.match(/^\s*File\d+\s*=\s*(.+?)\s*$/i);
      if (m) {
        const n = cleanPlaylistEntry(m[1]);
        if (n) names.push(n);
      }
    }
    return names;
  }

  if (extension === 'xspf') {
    try {
      const xml = new DOMParser().parseFromString(text, 'application/xml');
      if (!xml.querySelector('parsererror')) {
        for (const node of xml.querySelectorAll('track location')) {
          const n = cleanPlaylistEntry(node.textContent);
          if (n) names.push(n);
        }
        return names;
      }
    } catch {
      // Fall through to the generic parser.
    }
  }

  // M3U, WPL, ASX, ZPL, B4S, RAM, WVX and malformed XML playlists.
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const attrs = trimmed.match(
      /(?:location|src|href)\s*=\s*["']([^"']+)["']/i
    );
    const angle = trimmed.match(
      /(?:location|src|href)\s*>\s*([^<]+)\s*</i
    );

    const candidate = attrs?.[1] || angle?.[1] || (
      !/[<>]/.test(trimmed) && !/^\w+\s*=/.test(trimmed) ? trimmed : null
    );

    const n = candidate && cleanPlaylistEntry(candidate);
    if (n) names.push(n);
  }

  return names;
}

async function expandZip(file) {
  const out = [];
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const z = window.fflate?.unzipSync(bytes);
    if (!z) throw new Error('ZIP library is unavailable');

    for (const [path, data] of Object.entries(z)) {
      if (!data?.length || /\/$/.test(path)) continue;
      const name = path.split('/').pop();
      if (!name) continue;
      out.push(new File([data], name, { type: '' }));
    }
  } catch (err) {
    toast(`Could not open ${file.name}: ${err.message || 'invalid ZIP'}`);
  }
  return out;
}

async function addFiles(files) {
  const media = [];
  for (const file of files) {
    if (!(file instanceof File)) continue;
    if (ext(file.name) === 'zip') media.push(...await expandZip(file));
    else media.push(file);
  }

  if (!media.length) return;

  // Case-insensitive basename index. Preserve the first file when two dropped
  // paths have the same basename rather than silently duplicating entries.
  const byName = new Map();
  for (const file of media) {
    const key = file.name.toLowerCase();
    if (!byName.has(key)) byName.set(key, file);
  }

  const out = [];
  for (const file of media) {
    const e = ext(file.name);
    if (!LISTS.has(e)) {
      out.push(file);
      continue;
    }

    try {
      const names = parsePlaylist(await file.text(), e);
      const matches = [];
      const seen = new Set();

      for (const name of names) {
        const match = byName.get(name);
        if (match && !seen.has(match)) {
          seen.add(match);
          matches.push(match);
        }
      }

      if (matches.length) {
        out.push(...matches);
      } else {
        toast(`${file.name}: drop its media files together with the playlist.`);
      }
    } catch (err) {
      toast(`${file.name}: ${err.message || 'could not read playlist'}`);
    }
  }

  // Preserve order while removing duplicate File objects.
  const unique = [...new Set(out)].filter(file => !LISTS.has(ext(file.name)));
  if (!unique.length) return;

  const wasEmpty = queue.length === 0;
  queue.push(...unique);
  render();

  if (idx < 0 || wasEmpty) {
    await play(wasEmpty ? 0 : queue.length - unique.length);
  }
}

function render() {
  $('items').replaceChildren();
  queue.forEach((file, i) => {
    const li = document.createElement('li');
    li.textContent = file.name;
    li.className = i === idx ? 'cur' : '';
    li.title = file.name;
    li.onclick = () => play(i);
    $('items').append(li);
  });
}

// ---------- playback ----------

function cacheSet(file, value) {
  conv.delete(file);
  conv.set(file, value);

  while (conv.size > 3) {
    const first = conv.entries().next().value;
    if (!first) break;
    const [key, item] = first;
    URL.revokeObjectURL(item.url);
    conv.delete(key);
  }
}

function cacheDelete(file) {
  const item = conv.get(file);
  if (!item) return;
  conv.delete(file);
  URL.revokeObjectURL(item.url);
}

function clearCurrentSource() {
  V.pause();
  V.removeAttribute('src');
  V.load();
  if (url) {
    URL.revokeObjectURL(url);
    url = null;
  }
}

function resetMediaUI() {
  live = false;
  kind = '';
  cancelAnimationFrame(raf);
  A = B = null;
  drawLoop();
  $('fill').style.width = '0%';
  $('buf').style.width = '0%';
  $('time').textContent = '0:00 / 0:00';
  V.style.display = 'none';
  IMG.style.display = 'none';
  VIZ.style.display = 'none';
  IMG.removeAttribute('src');
}

let live = false;

V.onerror = () => {
  if (live) toast(`Playback error: ${V.error?.message || 'decode failure'}`);
};

function tryNative(source, audioOnly, myToken, signal) {
  return new Promise(resolve => {
    let settled = false;
    const finish = ok => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      V.removeEventListener('loadedmetadata', onMetadata);
      V.removeEventListener('error', onError);
      signal?.removeEventListener('abort', onAbort);
      resolve(ok && myToken === playToken && !signal?.aborted);
    };

    const onMetadata = () => finish(audioOnly || V.videoWidth > 0);
    const onError = () => finish(false);
    const onAbort = () => finish(false);
    const timer = setTimeout(() => finish(false), 12000);

    if (myToken !== playToken || signal?.aborted) {
      finish(false);
      return;
    }

    V.addEventListener('loadedmetadata', onMetadata);
    V.addEventListener('error', onError);
    signal?.addEventListener('abort', onAbort, { once: true });
    V.src = source;
    V.load();
  });
}

function ready(audioOnly, myToken, signal) {
  if (myToken !== playToken || signal?.aborted) return false;

  closeModal();
  kind = audioOnly ? 'audio' : 'video';
  live = true;
  V.style.display = audioOnly ? 'none' : 'block';
  VIZ.style.display = audioOnly ? 'block' : 'none';

  if (audioOnly) startViz();

  V.play().catch(err => {
    if (err.name === 'NotAllowedError') toast('Press play to start');
  });
  return true;
}

async function play(i) {
  if (i < 0 || i >= queue.length) return;

  controller?.abort();
  controller = new AbortController();
  const signal = controller.signal;
  const myToken = ++playToken;

  idx = i;
  render();
  closeModal();
  clearLoop();
  resetMediaUI();

  const file = queue[i];
  const extension = ext(file.name);

  if (UNSUPPORTED[extension]) {
    document.body.classList.add('has');
    $('title').textContent = file.name;
    toast(`${file.name}: ${UNSUPPORTED[extension]}`);
    return;
  }

  document.body.classList.add('has');
  $('title').textContent = file.name;
  clearCurrentSource();

  if (IMAGE.has(extension)) {
    kind = 'image';
    url = URL.createObjectURL(file);
    IMG.src = url;
    IMG.style.display = 'block';
    return;
  }

  try {
    const converted = await load(file, extension, myToken, signal);
    if (converted === false) return; // user explicitly declined conversion
  } catch (err) {
    if (myToken !== playToken || signal.aborted) return;
    closeModal();
    toast(err.message === 'Cancelled'
      ? 'Conversion cancelled'
      : `${file.name}: ${err.message || 'Playback failed'}`);
  }
}

async function load(file, extension, myToken, signal) {
  const stale = () => {
    if (myToken !== playToken || signal.aborted) throw new Error('Cancelled');
  };

  const cached = conv.get(file);
  if (cached) {
    const ok = await tryNative(cached.url, cached.audioOnly, myToken, signal);
    stale();
    if (ok) return ready(cached.audioOnly, myToken, signal);

    cacheDelete(file);
  }

  // Give the probe a bounded amount of time. It is deliberately best-effort;
  // unknown containers are handed to ffmpeg instead of blocking playback.
  let probeResult = null;
  try {
    probeResult = await Promise.race([
      probe(file, signal),
      new Promise(resolve => setTimeout(() => resolve(null), 5000)),
    ]);
  } catch (err) {
    if (signal.aborted) throw new Error('Cancelled');
  }
  stale();

  // Prefer the actual probe result over the extension. For a known audio-only
  // file, the extension is still useful if probing times out.
  const audioOnly = probeResult
    ? !probeResult.hasVideo
    : AUDIO.has(extension);

  url = URL.createObjectURL(file);
  const nativeOK = await tryNative(url, audioOnly, myToken, signal);
  stale();

  if (nativeOK && (!probeResult || probeResult.audioOk !== false) &&
      (!probeResult?.hasVideo || probeResult.videoOk !== false)) {
    return ready(audioOnly, myToken, signal);
  }

  const wantsConversion = await askConversion(
    'This file needs conversion',
    `${file.name} cannot be played directly by this browser. Convert it locally to ${audioOnly ? 'M4A (AAC)' : 'MP4 (H.264/AAC)'}?`,
    signal
  );
  stale();
  if (!wantsConversion) return false;

  // Cheapest route first. A native failure means we already know the browser
  // cannot use the source directly, but probe results let us avoid needless
  // re-encoding of tracks that are already decodable.
  const basePlan = {
    audioOnly,
    v: audioOnly ? false : (probeResult ? !probeResult.videoOk : true),
    a: probeResult ? !probeResult.audioOk : true,
  };

  const plans = [];
  const addPlan = (engine, plan) => {
    const key = `${engine}:${plan.audioOnly}:${plan.v}:${plan.a}`;
    if (!plans.some(x => x.key === key)) plans.push({ key, engine, plan });
  };

  if (probeResult) addPlan('gpu', basePlan);
  addPlan('wasm', basePlan);

  // If remux/copy failed, force both tracks through known browser-friendly
  // codecs. This is the most compatible final attempt.
  if (!basePlan.audioOnly && (!basePlan.v || !basePlan.a)) {
    addPlan('wasm', { ...basePlan, v: true, a: true });
  }

  let lastError = null;
  $('log').textContent = '';

  const onLog = message => {
    const log = $('log');
    log.textContent += `${message}\n`;
    log.scrollTop = log.scrollHeight;
  };

  for (const { engine, plan } of plans) {
    stale();

    try {
      showConversionModal(
        'Converting…',
        `${file.name} → ${audioOnly ? 'M4A (AAC)' : 'MP4 (H.264/AAC)'} · ${
          engine === 'gpu' ? 'hardware' : 'CPU (slower)'
        }${plan.v ? ' · video re-encode' : ''}${plan.a ? ' · audio re-encode' : ''}`,
        signal
      );

      $('pfill').style.width = '0%';
      $('ppct').textContent = engine === 'wasm' ? 'Loading converter…' : '0%';

      const blob = await engines[engine](file, plan, {
        signal,
        onLog,
        onProgress: percent => {
          const p = Math.min(100, Math.max(0, Number(percent) || 0));
          $('pfill').style.width = `${p}%`;
          $('ppct').textContent = `${p.toFixed(1)}%`;
        },
      });

      stale();
      $('ppct').textContent = 'Verifying…';

      const convertedURL = URL.createObjectURL(blob);
      const plays = await tryNative(convertedURL, audioOnly, myToken, signal);

      if (plays) {
        cacheSet(file, { url: convertedURL, audioOnly });
        url = null; // Converted URL is now owned by the cache.
        return ready(audioOnly, myToken, signal);
      }

      URL.revokeObjectURL(convertedURL);
      lastError = new Error('Converted file still did not play');
      onLog(`✗ ${lastError.message}`);
    } catch (err) {
      if (signal.aborted || myToken !== playToken) throw new Error('Cancelled');
      lastError = err;
      onLog(`✗ ${engine}: ${err.message || err}`);
    }
  }

  throw lastError || new Error('Conversion failed');
}

// ---------- spectrum visualizer ----------

function startViz() {
  if (!window.AudioContext && !window.webkitAudioContext) return;

  try {
    if (!actx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      actx = new AudioCtx();
      an = actx.createAnalyser();
      an.fftSize = 512;
      an.smoothingTimeConstant = 0.82;

      // createMediaElementSource may only be called once for a given media
      // element. Keep the node for the lifetime of the page.
      mediaSource = actx.createMediaElementSource(V);
      mediaSource.connect(an);
      an.connect(actx.destination);
    }

    actx.resume().catch(() => {});
    cancelAnimationFrame(raf);

    const canvas = VIZ;
    const g = canvas.getContext('2d');
    if (!g) return;

    const data = new Uint8Array(an.frequencyBinCount);

    const draw = () => {
      raf = requestAnimationFrame(draw);
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (!width || !height) return;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const pixelWidth = Math.round(width * dpr);
      const pixelHeight = Math.round(height * dpr);
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }

      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, width, height);
      an.getByteFrequencyData(data);

      const bars = 64;
      const barWidth = width / bars;
      const gradient = g.createLinearGradient(0, height, 0, 0);
      gradient.addColorStop(0, '#ff8a00');
      gradient.addColorStop(1, '#5ee7ff');

      g.fillStyle = gradient;
      g.shadowColor = '#ff8a00';
      g.shadowBlur = 14;

      for (let i = 0; i < bars; i++) {
        const value = data[Math.floor(i * data.length * 0.7 / bars)] / 255;
        const barHeight = Math.max(3, value * height * 0.6);
        const x = i * barWidth + 2;
        g.fillRect(x, (height - barHeight) * 0.55, barWidth - 4, barHeight);
      }
      g.shadowBlur = 0;
    };

    draw();
  } catch {
    // Audio playback must continue even if the optional visualizer is
    // unavailable (Safari restrictions, disabled audio context, etc.).
    VIZ.style.display = 'none';
  }
}

// ---------- controls + A-B loop ----------

const duration = () => Number.isFinite(V.duration) ? V.duration : 0;
const percent = seconds => {
  const d = duration();
  if (!d) return '0%';
  return `${Math.min(100, Math.max(0, (seconds / d) * 100))}%`;
};

function clearLoop() {
  A = B = null;
  drawLoop();
}

function drawLoop() {
  const hasA = Number.isFinite(A);
  const hasB = Number.isFinite(B) && Number.isFinite(A) && B > A;

  $('mA').style.display = hasA ? 'block' : 'none';
  $('mB').style.display = hasB ? 'block' : 'none';

  if (hasA) $('mA').style.left = percent(A);
  if (hasB) $('mB').style.left = percent(B);

  $('loop').style.display = hasB ? 'block' : 'none';
  if (hasB) {
    $('loop').style.left = percent(A);
    $('loop').style.width = `${Math.max(0, (B - A) / duration() * 100)}%`;
  }

  $('setA').classList.toggle('on', hasA);
  $('setB').classList.toggle('on', hasB);
}

$('setA').onclick = () => {
  if (!Number.isFinite(V.currentTime)) return;
  A = V.currentTime;
  if (B != null && B <= A) B = null;
  drawLoop();
};

$('setB').onclick = () => {
  if (!Number.isFinite(V.currentTime)) return;
  if (A == null) A = 0;
  if (V.currentTime > A) {
    B = V.currentTime;
    drawLoop();
  } else {
    toast('Loop end must come after the start.');
  }
};

$('clr').onclick = clearLoop;

function updateProgressUI() {
  const current = Number.isFinite(V.currentTime) ? V.currentTime : 0;
  const d = duration();

  $('fill').style.width = percent(current);
  $('time').textContent = `${fmt(current)} / ${fmt(d)}`;

  if (V.buffered.length) {
    try {
      $('buf').style.width = percent(V.buffered.end(V.buffered.length - 1));
    } catch {
      $('buf').style.width = '0%';
    }
  }
  drawLoop();
}

V.ontimeupdate = updateProgressUI;
V.onloadedmetadata = updateProgressUI;

setInterval(() => {
  if (A != null && B != null && !V.paused && V.currentTime >= B) {
    V.currentTime = A;
  }
}, 40);

const seekTo = event => {
  const rect = $('seek').getBoundingClientRect();
  if (!rect.width || !duration()) return;
  const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
  V.currentTime = ratio * duration();
};

$('seek').onpointerdown = event => {
  const marker = event.target.closest('.mk');
  if (marker) {
    const which = marker === $('mA') ? 'A' : 'B';
    const move = ev => {
      const rect = $('seek').getBoundingClientRect();
      if (!rect.width || !duration()) return;
      const time = Math.min(1, Math.max(0, (ev.clientX - rect.left) / rect.width)) * duration();
      if (which === 'A') {
        A = time;
        if (B != null && B <= A) B = null;
      } else {
        if (A == null || time <= A) return;
        B = time;
      }
      drawLoop();
    };
    const stop = () => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', stop);
      removeEventListener('pointercancel', stop);
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', stop, { once: true });
    addEventListener('pointercancel', stop, { once: true });
    return;
  }

  seekTo(event);
  const move = ev => seekTo(ev);
  const stop = () => {
    removeEventListener('pointermove', move);
    removeEventListener('pointerup', stop);
    removeEventListener('pointercancel', stop);
  };
  addEventListener('pointermove', move);
  addEventListener('pointerup', stop, { once: true });
  addEventListener('pointercancel', stop, { once: true });
};

const toggle = () => {
  if (V.paused) {
    V.play().catch(err => {
      if (err.name !== 'AbortError') toast('Playback could not start');
    });
  } else {
    V.pause();
  }
};

$('play').onclick = toggle;
V.onclick = toggle;
V.onplay = () => {
  $('play').textContent = '⏸';
  document.body.classList.add('playing');
};
V.onpause = () => {
  $('play').textContent = '▶';
  document.body.classList.remove('playing');
};
V.onended = () => {
  if (idx + 1 < queue.length) play(idx + 1);
};

$('prev').onclick = () => {
  if (idx > 0) play(idx - 1);
};

$('next').onclick = () => {
  if (idx + 1 < queue.length) play(idx + 1);
};

$('rate').onchange = event => {
  V.playbackRate = Number(event.target.value) || 1;
};

$('vol').oninput = event => {
  V.volume = Math.min(1, Math.max(0, Number(event.target.value) || 0));
};

$('mute').onclick = () => {
  V.muted = !V.muted;
  $('mute').textContent = V.muted ? '🔇' : '🔊';
};

$('pl').onclick = () => $('list').classList.toggle('open');

$('fs').onclick = async () => {
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await $('stage').requestFullscreen();
    }
  } catch {
    toast('Fullscreen is not available in this browser.');
  }
};

addEventListener('keydown', event => {
  const tag = event.target?.tagName;
  const key = event.key;

  if (
    tag === 'SELECT' ||
    tag === 'TEXTAREA' ||
    tag === 'INPUT'
  ) return;

  if (key === ' ') {
    event.preventDefault();
    toggle();
  } else if (key === 'ArrowRight') {
    V.currentTime = Math.min(duration(), V.currentTime + 5);
  } else if (key === 'ArrowLeft') {
    V.currentTime = Math.max(0, V.currentTime - 5);
  } else if (key.toLowerCase() === 'f') {
    $('fs').click();
  } else if (key.toLowerCase() === 'm') {
    $('mute').click();
  } else if (key.toLowerCase() === 'a') {
    $('setA').click();
  } else if (key.toLowerCase() === 'b') {
    $('setB').click();
  }
});

// ---------- drag & drop ----------

for (const type of ['dragenter', 'dragover']) {
  addEventListener(type, event => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    document.body.classList.add('drag');
  });
}

for (const type of ['dragleave', 'drop']) {
  addEventListener(type, event => {
    event.preventDefault();
    if (type === 'drop' || !event.relatedTarget) {
      document.body.classList.remove('drag');
    }
  });
}

addEventListener('drop', event => {
  addFiles([...event.dataTransfer.files]).catch(err => {
    toast(err.message || 'Could not add files');
  });
});

$('file').onchange = event => {
  addFiles([...event.target.files]).catch(err => {
    toast(err.message || 'Could not add files');
  });
};
