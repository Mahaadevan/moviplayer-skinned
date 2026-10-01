# Cone

A VLC-style media player that runs entirely in your browser. Drag, drop, play. Files are never uploaded.

**Live demo:** `https://<your-username>.github.io/<repo>/`

## Features
- Native, hardware-accelerated playback first (video, audio, images)
- Files the browser can't play: a yes/no prompt, then local conversion with progress and a live log
  1. GPU: WebCodecs through [Mediabunny](https://mediabunny.dev)
  2. CPU fallback: [ffmpeg.wasm](https://github.com/ffmpegwasm/ffmpeg.wasm) (single-thread core)
- Detects black video and silent audio (for example MKV with AC3/DTS) a couple of seconds into playback and offers conversion
- Audio spectrum visualiser, A-B loop with draggable markers, playlist with remove/clear
- Playlists (m3u, m3u8, pls, xspf, wpl, asx…) resolve against media dropped with them; `.zip` is unpacked locally ([fflate](https://github.com/101arrowz/fflate))
- Keys: `Space` play/pause, `←` `→` seek 5 s, `F` fullscreen, `M` mute, `A`/`B` loop points

## Run locally
No build step. Serve the folder over HTTP (ES modules don't work from `file://`):

```bash
python3 -m http.server 8000   # then open http://localhost:8000
```

## Deploy to GitHub Pages
1. Push to a repo's `main` branch.
2. Settings → Pages → Source: **GitHub Actions**. The included workflow syntax-checks and deploys on every push.

## Project layout
```
index.html          page shell
css/style.css       styles and animations
js/app.js           playback, playlist, UI, loop, visualiser
js/convert.js       Mediabunny (GPU) and ffmpeg.wasm (CPU) conversion
.github/workflows/  Pages deployment
```

## Limitations
- `.iso`/`.ifo`/`.vob` disc menus, `.rar`, MIDI and tracker modules (`.mid`, `.mod`, `.xm`…) show an error popup
- The ffmpeg.wasm path is CPU-only and slow on large files; converted output is held in memory
- Codec support depends on the browser

## Third-party
Loaded from jsDelivr at runtime (not bundled):
- [Mediabunny](https://github.com/Vanilagy/mediabunny): MPL-2.0
- [ffmpeg.wasm](https://github.com/ffmpegwasm/ffmpeg.wasm): the wrapper is MIT; the core contains FFmpeg and codecs under their own licenses (check the core's license before bundling it)
- [fflate](https://github.com/101arrowz/fflate): MIT

"VLC" and the traffic-cone icon are trademarks of VideoLAN. This project is independent and not affiliated with VideoLAN.

## License
MIT. See [LICENSE](LICENSE).
