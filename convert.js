// Conversion engines: mediabunny (WebCodecs, fast) and ffmpeg.wasm (universal, slow).
const CDN = 'https://cdn.jsdelivr.net/npm/';
const loaded = new Map();
export function lib(src) {
  if (!loaded.has(src)) loaded.set(src, new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.onload = res;
    s.onerror = () => { loaded.delete(src); rej(new Error('Could not load ' + src.split('/').pop())); };
    document.head.append(s);
  }));
  return loaded.get(src);
}

let MB;
const mb = () => MB || (MB = import(CDN + 'mediabunny@1/+esm').catch(e => { MB = null; throw e; }));
const yes = p => Promise.resolve(p).then(Boolean, () => false);

/** Inspect container/codecs. Returns null if the container is unreadable. */
export async function probe(file) {
  try {
    const M = await mb();
    const input = new M.Input({ source: new M.BlobSource(file), formats: M.ALL_FORMATS });
    const [v, a] = await Promise.all([input.getPrimaryVideoTrack(), input.getPrimaryAudioTrack()]);
    if (!v && !a) return null;
    return { hasVideo: !!v, hasAudio: !!a,
      videoOk: v ? await yes(v.canDecode()) : true,
      audioOk: a ? await yes(a.canDecode()) : true };
  } catch { return null; }
}

// plan = { audioOnly, v: re-encode video, a: re-encode audio }
async function gpu(file, plan, o) {
  const M = await mb();
  const input = new M.Input({ source: new M.BlobSource(file), formats: M.ALL_FORMATS });
  const output = new M.Output({ format: new M.Mp4OutputFormat({ fastStart: 'in-memory' }), target: new M.BufferTarget() });
  const conv = await M.Conversion.init({ input, output,
    video: plan.audioOnly ? { discard: true } : plan.v ? { codec: 'avc', forceTranscode: true } : {},
    audio: plan.a ? { codec: 'aac', forceTranscode: true } : {} });
  if (!conv.isValid) throw new Error('Not convertible with WebCodecs');
  if (conv.discardedTracks.some(d => d.reason !== 'discarded_by_user' && (d.track.type === 'video' || d.track.type === 'audio')))
    throw new Error('A track cannot be encoded by this browser');
  o.signal?.addEventListener('abort', () => conv.cancel(), { once: true });
  conv.onProgress = p => o.onProgress(p * 100);
  await conv.execute();
  return new Blob([output.target.buffer], { type: plan.audioOnly ? 'audio/mp4' : 'video/mp4' });
}

let FF;
async function loadFF() {
  if (FF) return FF;
  await Promise.all([lib(CDN + '@ffmpeg/ffmpeg@0.12.10/dist/umd/ffmpeg.js'), lib(CDN + '@ffmpeg/util@0.12.1/dist/umd/index.js')]);
  const { toBlobURL } = FFmpegUtil, f = new FFmpegWASM.FFmpeg();
  await f.load({
    classWorkerURL: await toBlobURL(CDN + '@ffmpeg/ffmpeg@0.12.10/dist/umd/814.ffmpeg.js', 'text/javascript'),
    coreURL: await toBlobURL(CDN + '@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.js', 'text/javascript'),
    wasmURL: await toBlobURL(CDN + '@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.wasm', 'application/wasm') });
  return FF = f;
}
const X264 = ['-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '25', '-pix_fmt', 'yuv420p', '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2'];
const AAC = ['-c:a', 'aac', '-b:a', '192k', '-ac', '2'];

async function wasm(file, plan, o) {
  const f = await loadFF();
  const name = 'input.' + ((file.name.split('.').pop() || 'bin').replace(/\W/g, '') || 'bin');
  const out = plan.audioOnly ? 'out.m4a' : 'out.mp4', src = '/in/' + name;
  const args = plan.audioOnly
    ? ['-i', src, '-vn', '-map', '0:a:0', ...AAC, '-movflags', '+faststart', '-y', out]
    : ['-fflags', '+genpts', '-i', src, '-map', '0:v:0?', '-map', '0:a:0?', '-sn', '-dn',
       ...(plan.v ? X264 : ['-c:v', 'copy']), ...(plan.a ? AAC : ['-c:a', 'copy']), '-movflags', '+faststart', '-y', out];
  const onP = ({ progress }) => o.onProgress(Math.min(99, Math.max(0, progress * 100)));
  const abort = () => { FF?.terminate(); FF = null; };
  o.signal?.addEventListener('abort', abort, { once: true });
  f.on('progress', onP);
  try {
    await f.createDir('/in').catch(() => {});
    await f.mount('WORKERFS', { files: [new File([file], name)] }, '/in'); // no full-file copy into memory
    if (await f.exec(args) !== 0) throw new Error('ffmpeg could not decode this file');
    const data = await f.readFile(out);
    if (data.length < 1024) throw new Error('ffmpeg produced an empty file');
    f.deleteFile(out).catch(() => {});
    return new Blob([data], { type: plan.audioOnly ? 'audio/mp4' : 'video/mp4' });
  } finally {
    f.off?.('progress', onP);
    if (FF) await f.unmount('/in').catch(() => {});
  }
}
export const engines = { gpu, wasm };
