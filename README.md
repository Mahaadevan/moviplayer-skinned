# Cone — moviplayer skinned

Simplified skin over [movi-player](https://github.com/MrUjjwalG/movi-player) (Apache-2.0), loaded from jsDelivr (`movi-player@0.4.1`) — not forked or bundled. Playback uses movi's FFmpeg-WASM demuxer + WebCodecs (hardware first, software fallback) entirely in the browser; files never leave your device.

**Features:** MKV/MP4/WebM/MOV/TS/AVI, HEVC/AV1/HDR, HLS/DASH via *open URL*, audio-only mode with an NCS-style ASCII ring spectrum, A-B loop (touch-friendly), speed, volume, playlist, multi-audio and subtitle track cycling, aspect modes, rotate, HDR toggle, snapshot, Picture-in-Picture, fullscreen.

Built for the sole reason for sharing videos on google meet with audio without sharing the whole screen of my system


**Dev mode / credits:** the `DEV` switch in the header opens a console (log/info/warn/error/debug, filter, copy, download) and a credits strip. The console, ambient glow, stable volume, black-bar crop and subtitle loading are adapted from [moviplayer.com](https://moviplayer.com/) — created by [Ujjwal Gupta](https://github.com/MrUjjwalG) ([movi-player](https://github.com/MrUjjwalG/movi-player), Apache-2.0). Full credit to the original creator.

**ASCII spectrum credits:** the audio-only visualiser is an original implementation (no code copied) of a circular, mirrored ring spectrum drawn in ASCII, inspired by the circular spectrum seen in NCS (NoCopyrightSounds) release videos — not affiliated with NCS. Its signal handling follows ideas from [cava](https://github.com/karlstav/cava) by Karl Stavestrand (MIT): log-spaced frequency bands, auto-gain, neighbour smoothing and gravity-style falloff. The ring layout (bass at one pole, mirrored, peak-hold caps) was informed by [keyur-one/custom-audio-visualizer](https://github.com/keyur-one/custom-audio-visualizer), and the glyph-based look by [omerbb/vis](https://github.com/omerbb/vis) and [jjwhite224/ASCII-Visualizer](https://github.com/jjwhite224/ASCII-Visualizer). Thanks to all of them.

**Spectrum credits:** the audio-only visualiser is an NCS-style ring drawn in ASCII. Its analysis (log-spaced bands, frequency eq, gravity falloff, integral smoothing, monstercat filter and auto-sensitivity) is a from-scratch JavaScript re-implementation of the signal pipeline used by [cava](https://github.com/karlstav/cava) (Console-based Audio Visualizer, MIT) by [karlstav](https://github.com/karlstav). No cava source code is bundled. The ring layout is inspired by the visualisers on [NoCopyrightSounds](https://ncs.io/) releases; NCS is a trademark of its owners and is not affiliated with this project.
