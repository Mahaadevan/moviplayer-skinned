# Cone — movi-player skin

Custom drag-and-drop GUI ("Cone") over [movi-player](https://github.com/MrUjjwalG/movi-player) (Apache-2.0), loaded from jsDelivr (`movi-player@0.4.1`) — not forked or bundled. Playback uses movi's FFmpeg-WASM demuxer + WebCodecs (hardware first, software fallback) entirely in the browser; files never leave your device.

**Features:** MKV/MP4/WebM/MOV/TS/AVI, HEVC/AV1/HDR, HLS/DASH via *open URL*, audio-only mode with spectrum analyser, A-B loop (touch-friendly), speed, volume, playlist, multi-audio and subtitle track cycling, aspect modes, rotate, HDR toggle, snapshot, Picture-in-Picture, fullscreen.

**Keys:** space, ←/→, f, m, a, b, p, s, h, r (aspect), t (rotate), v (subtitles), n (audio track).

**Deploy:** push, then Settings → Pages → deploy from `main`. No special headers needed.

Notes: spectrum taps the page's Web Audio output; the unpinned-API surface of movi is used defensively, so bump the version in `app.js` deliberately.
