# local web media player (Alpha, comical amount of bugs)

Drag-and-drop VLC-style player that runs entirely in the browser. Files never leave your device.

- Native playback first (hardware-accelerated `<video>`/`<audio>`) (.mkv works)
- Spectrum visualiser for audio
- A-B loop (buttons `A`/`B` keys, draggable markers on the bar)
- Some formats may require conversions to play (local conversion with progress and verbose)
  1. GPU: WebCodecs through [Mediabunny](https://github.com/Vanilagy/mediabunny)
  2. CPU fallback: [ffmpeg.wasm](https://github.com/ffmpegwasm/ffmpeg.wasm) (single-thread core, so no special headers are needed on GitHub Pages)
- Playlists (m3u, pls, xspf, wpl, asx…) resolve against media files dropped with them; .zip is unpacked locally ([fflate](https://github.com/101arrowz/fflate))

Keys: space, ←/→, f, m, a, b.
Not supported (for now ig): .iso/.ifo DVD menus, .rar, MIDI and tracker modules (.mid, .mod, .xm, .it…). These show an error popup.

Not for me: to deploy, push this folder to a repo, then Settings → Pages → deploy from branch. Libraries load from jsDelivr.
