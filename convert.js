// Local conversion: GPU path (WebCodecs via Mediabunny) first, CPU path (ffmpeg.wasm, single-thread) as fallback.
const COPY_OK = ['mkv','ts','m2ts','mts','mov','mp4','m4v','flv','f4v','webm'];
let ff = null;

export async function convert(file, {audioOnly, reencode, onProgress, onLog, signal}) {
  const ext = file.name.split('.').pop().toLowerCase();
  const outExt = audioOnly ? 'm4a' : 'mp4';
  try {
    onLog('Trying GPU path (WebCodecs hardware encode/decode)…');
    return await viaGpu(file, outExt, reencode, onProgress, onLog);
  } catch (e) {
    onLog('GPU path unavailable: ' + e.message + '\nFalling back to CPU (ffmpeg.wasm)…');
  }
  return viaCpu(file, ext, outExt, audioOnly, reencode, onProgress, onLog, signal);
}

async function viaGpu(file, outExt, reencode, onProgress, onLog) {
  if (!('VideoEncoder' in window)) throw new Error('WebCodecs not supported in this browser');
  const M = await import('https://cdn.jsdelivr.net/npm/mediabunny@1/+esm');
  const input = new M.Input({source: new M.BlobSource(file), formats: M.ALL_FORMATS});
  const output = new M.Output({format: outExt === 'm4a' ? new M.Mp4OutputFormat({fastStart: 'in-memory'}) : new M.Mp4OutputFormat({fastStart: 'in-memory'}), target: new M.BufferTarget()});
  const c = await M.Conversion.init({input, output, video: outExt === 'm4a' ? {discard: true} : {codec: 'avc', forceTranscode: !!reencode}, audio: {codec: 'aac'}});
  if (!c.isValid) throw new Error('conversion not valid for this file');
  if (c.discardedTracks.length) throw new Error(c.discardedTracks.map(t => t.track.type + ': ' + t.reason).join(', '));
  c.onProgress = p => onProgress(p);
  await c.execute();
  onLog('GPU conversion finished.');
  return new File([output.target.buffer], file.name.replace(/\.[^.]+$/, '') + '.' + outExt, {type: outExt === 'm4a' ? 'audio/mp4' : 'video/mp4'});
}

async function loadFF(onLog) {
  if (ff) return ff;
  const {FFmpeg} = FFmpegWASM, {toBlobURL} = FFmpegUtil;
  const base = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/umd/';
  ff = new FFmpeg();
  ff.on('log', ({message}) => onLog(message));
  onLog('Downloading ffmpeg core (~30 MB, cached after first run)…');
  await ff.load({
    classWorkerURL: await toBlobURL('https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/dist/umd/814.ffmpeg.js', 'text/javascript'),
    coreURL: await toBlobURL(base + 'ffmpeg-core.js', 'text/javascript'),
    wasmURL: await toBlobURL(base + 'ffmpeg-core.wasm', 'application/wasm'),
  });
  return ff;
}

async function viaCpu(file, ext, outExt, audioOnly, reencode, onProgress, onLog, signal) {
  const f = await loadFF(onLog);
  f.on('progress', ({progress}) => onProgress(Math.min(1, Math.max(0, progress))));
  signal?.addEventListener('abort', () => { f.terminate(); ff = null; });
  const inName = 'in.' + ext, out = 'out.' + outExt;
  await f.writeFile(inName, new Uint8Array(await file.arrayBuffer()));
  const attempts = audioOnly ? [['-vn', '-c:a', 'aac', '-b:a', '192k']]
    : [...(COPY_OK.includes(ext) && !reencode ? [['-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k']] : []),
       ['-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23', '-pix_fmt', 'yuv420p', '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-c:a', 'aac', '-b:a', '192k']];
  for (const a of attempts) {
    onLog('ffmpeg ' + a.join(' '));
    if (await f.exec(['-i', inName, ...a, '-y', out]) === 0) {
      const data = await f.readFile(out);
      f.deleteFile(inName); f.deleteFile(out);
      onLog('CPU conversion finished.');
      return new File([data], file.name.replace(/\.[^.]+$/, '') + '.' + outExt, {type: audioOnly ? 'audio/mp4' : 'video/mp4'});
    }
    onLog('Attempt failed, trying next option…');
  }
  throw new Error('ffmpeg could not convert this file');
}
