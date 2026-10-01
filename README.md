# Cone - local web media player (Alpha, comical amount of bugs)

Drag-and-drop VLC-style player that runs entirely in the browser. Files never leave your device.

## Stack
| Role | Library |
|---|---|
| Player UI (controls, speed, PiP, fullscreen, keyboard) | [Plyr](https://plyr.io) |
| HLS (`.m3u8`) | [hls.js](https://github.com/video-dev/hls.js) (lazy-loaded) |
| MPEG-DASH (`.mpd`) | [dash.js](https://github.com/Dash-Industry-Forum/dash.js) (lazy-loaded) |
| Fast conversion (WebCodecs) | [mediabunny](https://mediabunny.dev) |
| Universal conversion fallback | [ffmpeg.wasm](https://github.com/ffmpegwasm/ffmpeg.wasm) |
| `.zip` archives | JSZip (lazy-loaded) |

The other players (Video.js, Shaka, Clappr, MediaElement, xgplayer, RxPlayer, OpenPlayerJS) are alternative UIs/streaming engines on the same `<video>` element, so adding them would duplicate Plyr/hls.js/dash.js without decoding any extra format.

## How playback works
1. Try native `<video>`/`<audio>`.
2. If it fails (or audio can't be decoded), probe the codecs and convert with the cheapest plan: remux → re-encode audio only → re-encode video, trying mediabunny (hardware) first, then ffmpeg.wasm.
3. Each result is verified to actually play before it is used; failures escalate to the next plan. Converted files are cached per session. Conversion can be cancelled.

## Features
Playlist queue, shuffle/repeat, playlist files (`.m3u .m3u8 .pls .xspf .wpl .zpl .asx .wvx .b4s .ram`), URL streams, media-key support. Shortcuts: Space, ←/→, ↑/↓, F, M, N/P.

## Limits
Remote URLs need CORS. `.rar`, DVD `.iso` menus, DRM, MIDI synthesis are not supported. Conversion output is held in memory (~2 GB max).

## Run
`python3 -m http.server 8000` → http://localhost:8000 (or GitHub Pages). MIT licensed.
