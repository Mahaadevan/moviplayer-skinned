// Local-browser media conversion engines.
// 1) Mediabunny/WebCodecs when the browser can decode/encode the required codecs.
// 2) ffmpeg.wasm as a slower compatibility fallback.
//
// No media is uploaded by this module. Third-party libraries are loaded from jsDelivr.

const CDN = 'https://cdn.jsdelivr.net/npm/';
const loaded = new Map();

export function lib(src) {
  if (!loaded.has(src)) {
    loaded.set(src, new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => {
        loaded.delete(src);
        reject(new Error(`Could not load ${src.split('/').pop()}`));
      };
      document.head.append(s);
    }));
  }
  return loaded.get(src);
}

let MBPromise;
function mb() {
  if (!MBPromise) {
    MBPromise = import(`${CDN}mediabunny@1/+esm`).catch(err => {
      MBPromise = null;
      throw new Error(`Could not load Mediabunny: ${err.message || err}`);
    });
  }
  return MBPromise;
}

const cancelled = signal => signal?.aborted;
function throwIfCancelled(signal) {
  if (cancelled(signal)) throw new Error('Cancelled');
}

async function safeCanDecode(track) {
  if (!track) return false;
  try {
    return await track.canDecode();
  } catch {
    return false;
  }
}

/**
 * Returns null when the container cannot be inspected by Mediabunny.
 * `videoOk`/`audioOk` are actual codec-decodability checks, not merely
 * extension guesses.
 */
export async function probe(file, signal) {
  try {
    throwIfCancelled(signal);
    const M = await mb();
    throwIfCancelled(signal);

    const input = new M.Input({
      source: new M.BlobSource(file),
      formats: M.ALL_FORMATS,
    });

    const [video, audio] = await Promise.all([
      input.getPrimaryVideoTrack(),
      input.getPrimaryAudioTrack(),
    ]);
    throwIfCancelled(signal);

    if (!video && !audio) return null;

    return {
      hasVideo: !!video,
      hasAudio: !!audio,
      videoOk: video ? await safeCanDecode(video) : true,
      audioOk: audio ? await safeCanDecode(audio) : true,
    };
  } catch (err) {
    if (cancelled(signal)) throw new Error('Cancelled');
    return null;
  }
}

// plan = { audioOnly, v: re-encode video, a: re-encode audio }

const GPU_STALL_MS = 45000;

async function gpu(file, plan, o = {}) {
  const signal = o.signal;
  throwIfCancelled(signal);

  const M = await mb();
  throwIfCancelled(signal);

  const input = new M.Input({
    source: new M.BlobSource(file),
    formats: M.ALL_FORMATS,
  });
  const output = new M.Output({
    format: new M.Mp4OutputFormat({ fastStart: 'in-memory' }),
    target: new M.BufferTarget(),
  });

  const conversion = await M.Conversion.init({
    input,
    output,
    // Conversion has no `tracks` option; keep only the first video/audio track via per-track callbacks.
    video: (_track, n) => plan.audioOnly || n > 1
      ? { discard: true }
      : plan.v ? { codec: 'avc', forceTranscode: true } : {},
    audio: (_track, n) => n > 1
      ? { discard: true }
      : plan.a ? { codec: 'aac', forceTranscode: true } : {},
  });

  throwIfCancelled(signal);

  if (!conversion.isValid) {
    throw new Error('This browser cannot convert the selected media');
  }

  // Only reject real A/V tracks that were unexpectedly discarded.
  const unexpected = conversion.discardedTracks?.find(d =>
    d.reason !== 'discarded_by_user' &&
    (d.track?.type === 'video' || d.track?.type === 'audio')
  );
  if (unexpected) {
    throw new Error('A required audio/video track cannot be handled by this browser');
  }

  let lastProgress = Date.now();
  let lastReported = -1;
  let stalled = false;
  let timer;

  const onProgress = progress => {
    if (progress !== lastReported) {
      lastReported = progress;
      lastProgress = Date.now();
    }
    o.onProgress?.(Math.min(100, Math.max(0, progress * 100)));
  };

  conversion.onProgress = onProgress;

  const cancel = () => {
    // cancel() is async; the conversion itself owns its cancellation state.
    conversion.cancel().catch(() => {});
  };

  const onAbort = () => cancel();
  signal?.addEventListener('abort', onAbort, { once: true });

  timer = setInterval(() => {
    if (Date.now() - lastProgress > GPU_STALL_MS) {
      stalled = true;
      cancel();
    }
  }, 3000);

  try {
    await conversion.execute();
    throwIfCancelled(signal);

    const buffer = output.target.buffer;
    if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 1024) {
      throw new Error('Hardware conversion produced an empty file');
    }

    return new Blob([buffer], {
      type: plan.audioOnly ? 'audio/mp4' : 'video/mp4',
    });
  } catch (err) {
    if (cancelled(signal)) throw new Error('Cancelled');
    if (stalled) throw new Error('Hardware encoder stalled');
    throw err;
  } finally {
    clearInterval(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

// ffmpeg.wasm single-thread core: no pthread/COOP/COEP requirement.
let FF = null;
let FFLoadPromise = null;

async function loadFF(signal) {
  throwIfCancelled(signal);
  if (FF?.loaded) return FF;
  if (FFLoadPromise) {
    const f = await FFLoadPromise;
    throwIfCancelled(signal);
    return f;
  }

  FFLoadPromise = (async () => {
    try {
      if (!window.FFmpegWASM) {
        await lib(`${CDN}@ffmpeg/ffmpeg@0.12.10/dist/umd/ffmpeg.js`);
      }
      if (!window.FFmpegUtil) {
        await lib(`${CDN}@ffmpeg/util@0.12.1/dist/umd/index.js`);
      }

      const { toBlobURL } = window.FFmpegUtil;
      const f = new window.FFmpegWASM.FFmpeg();
      const coreBase = `${CDN}@ffmpeg/core@0.12.6/dist/umd`;
      const mainBase = `${CDN}@ffmpeg/ffmpeg@0.12.10/dist/umd`;

      await f.load({
        classWorkerURL: await toBlobURL(
          `${mainBase}/814.ffmpeg.js`,
          'text/javascript'
        ),
        coreURL: await toBlobURL(
          `${coreBase}/ffmpeg-core.js`,
          'text/javascript'
        ),
        wasmURL: await toBlobURL(
          `${coreBase}/ffmpeg-core.wasm`,
          'application/wasm'
        ),
      });

      FF = f; // `loaded` is a read-only getter on FFmpeg; assigning it threw and broke every conversion
      return f;
    } catch (err) {
      FF = null;
      throw new Error(`Could not load ffmpeg.wasm: ${err.message || err}`);
    } finally {
      FFLoadPromise = null;
    }
  })();

  const f = await FFLoadPromise;
  throwIfCancelled(signal);
  return f;
}

// Keep dimensions even and cap the width at 1920. -2 preserves aspect ratio.
const X264 = [
  '-c:v', 'libx264',
  '-preset', 'ultrafast',
  '-crf', '25',
  '-pix_fmt', 'yuv420p',
  '-vf', 'scale=trunc(min(1920\\,iw)/2)*2:-2',
];
const AAC = ['-c:a', 'aac', '-b:a', '192k', '-ac', '2'];
const PROBE = ['-probesize', '50M', '-analyzeduration', '100M'];
const FF_IDLE_MS = 150000;

async function wasm(file, plan, o = {}) {
  const signal = o.signal;
  const f = await loadFF(signal);
  throwIfCancelled(signal);

  // One stable, filesystem-safe name. WORKERFS preserves the original File
  // without copying the whole input into the WASM heap.
  const ext = (file.name.split('.').pop() || 'bin').replace(/[^a-z0-9]/gi, '') || 'bin';
  const name = `input.${ext}`;
  const out = plan.audioOnly ? 'out.m4a' : 'out.mp4';

  let mounted = false;
  let wrote = false;
  let timer = null;
  let lastActivity = Date.now();

  const bump = () => { lastActivity = Date.now(); };
  const onProgress = ({ progress }) => {
    bump();
    o.onProgress?.(Math.min(99, Math.max(0, Number(progress) * 100)));
  };
  const onLog = ({ message }) => {
    bump();
    o.onLog?.(message);
  };

  // ffmpeg.wasm 0.12.10 supports abort signals on exec, so prefer that over
  // killing the worker. terminate() is reserved for a genuine watchdog hang.
  let watchdogAbort = false;
  let execPromise;

  const abortSignal = signal;
  const onAbort = () => {
    // Rejecting exec() does not stop the worker, which would stay busy and block
    // the next conversion. Kill it; the next run loads a fresh (cached) core.
    watchdogAbort = false;
    FF = null;
    try { f.terminate(); } catch {}
  };
  abortSignal?.addEventListener('abort', onAbort, { once: true });

  f.on('progress', onProgress);
  f.on('log', onLog);

  try {
    await f.createDir('/in').catch(() => {});

    // WORKERFS exposes each File under its own .name, so rename without copying data.
    const mounted_file = new File([file], name, { type: '' });
    let src = `/in/${name}`;
    try {
      await f.mount('WORKERFS', { files: [mounted_file] }, '/in');
      mounted = true;
    } catch {
      // Fallback for browsers/cores where WORKERFS is unavailable.
      // This can be memory-heavy, so fail clearly for very large files.
      const MAX_MEMFS = 512 * 1024 * 1024;
      if (file.size > MAX_MEMFS) {
        throw new Error('This browser cannot process a file this large without WORKERFS');
      }
      await f.writeFile(name, new Uint8Array(await file.arrayBuffer()));
      wrote = true;
      src = name;
    }

    const args = plan.audioOnly
      ? [
          ...PROBE, '-i', src,
          '-vn', '-map', '0:a:0?',
          ...AAC,
          '-movflags', '+faststart',
          '-y', out,
        ]
      : [
          ...PROBE,
          '-fflags', '+genpts',
          '-i', src,
          '-map', '0:v:0?',
          '-map', '0:a:0?',
          '-sn', '-dn',
          ...(plan.v ? X264 : ['-c:v', 'copy']),
          ...(plan.a ? AAC : ['-c:a', 'copy']),
          '-movflags', '+faststart',
          '-y', out,
        ];

    bump();
    timer = setInterval(() => {
      if (Date.now() - lastActivity > FF_IDLE_MS) {
        watchdogAbort = true;
        // A timeout argument makes ffmpeg stop itself; if it still does not
        // respond, the final catch terminates the worker.
        f.terminate();
        FF = null;
      }
    }, 5000);

    execPromise = f.exec(args, -1, { signal: abortSignal });
    const exitCode = await execPromise;

    if (cancelled(signal)) throw new Error('Cancelled');
    if (watchdogAbort) throw new Error('ffmpeg stopped responding');
    if (exitCode !== 0) throw new Error(`ffmpeg could not decode this file (exit ${exitCode})`);

    const data = await f.readFile(out);
    if (!data || data.length < 1024) {
      throw new Error('ffmpeg produced an empty file');
    }

    return new Blob([data], {
      type: plan.audioOnly ? 'audio/mp4' : 'video/mp4',
    });
  } catch (err) {
    if (cancelled(signal)) throw new Error('Cancelled');
    if (watchdogAbort) throw new Error('ffmpeg stopped responding');
    throw err;
  } finally {
    clearInterval(timer);
    abortSignal?.removeEventListener('abort', onAbort);
    f.off?.('progress', onProgress);
    f.off?.('log', onLog);

    // Do not touch a replacement FF instance after a watchdog termination.
    if (FF === f && !watchdogAbort) {
      if (mounted) await f.unmount('/in').catch(() => {});
      if (wrote) await f.deleteFile(name).catch(() => {});
      await f.deleteFile(out).catch(() => {});
    }
  }
}

export const engines = { gpu, wasm };
