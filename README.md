# Cone — local web media player

A VLC-style local media player that runs in the browser. Media files are processed locally; the app does not upload them to a server.

## Features

- Native browser playback first.
- Local conversion fallback:
  1. Mediabunny/WebCodecs when supported.
  2. ffmpeg.wasm single-thread fallback.
- Audio spectrum visualizer.
- A/B looping with draggable markers.
- Playlist support for common local playlist formats.
- Local ZIP extraction.
- Keyboard controls: Space, ←/→, F, M, A, B.
- Converted-file LRU cache with blob-URL cleanup.

## Reliability fixes in this version

### Playback and race handling
- Every playback request has its own `AbortController` and token.
- Starting another file cancels stale native loads, probes, and conversions.
- Native playback timeouts are bounded and abortable.
- Converted URLs are owned by the conversion cache; source URLs are revoked separately.
- Previous/next controls no longer attempt to play outside the playlist.

### Conversion
- Conversion is now explicitly confirmed by the user before CPU/GPU work begins.
- Mediabunny uses primary A/V tracks and its supported conversion cancellation API.
- Hardware conversion has a watchdog and clean cancellation.
- ffmpeg.wasm uses the documented abortable `exec()` API.
- ffmpeg.wasm and core versions are compatible with WORKERFS support.
- WORKERFS is attempted first; MEMFS fallback is limited to avoid uncontrolled browser memory use.
- Conversion output is verified by trying to play the generated file before it enters the cache.
- Failed conversion attempts do not leave stale cached blob URLs.

### Playlist and ZIP handling
- PLS, XSPF, M3U/M3U8 and common XML-style playlist references are parsed more safely.
- Relative paths, Windows separators, URL encoding, XML/HTML entities, query strings and fragments are handled.
- ZIP directory entries are ignored.
- Duplicate media entries are removed while preserving order.
- Missing playlist files produce a clear message instead of silently doing nothing.

### Audio/UI robustness
- The visualizer is optional; failure to create an `AudioContext` no longer breaks playback.
- `createMediaElementSource()` is created only once per media element.
- Progress and A/B loop calculations are guarded against unknown/zero duration.
- Pointer cancellation is handled when dragging the seek bar.
- Keyboard shortcuts no longer interfere with form controls.
- Mobile controls are less likely to overflow.

## Deployment

Serve the folder from a normal static web server (GitHub Pages, etc.). The app loads its conversion libraries from jsDelivr.

## Known limitations

- DVD menu/navigation formats are not mounted directly.
- RAR archives are not supported.
- MIDI and tracker modules are not synthesized.
- Very large files may still exceed browser memory limits, especially when conversion output must be held in memory.
- Browser codec support varies; the fallback converter cannot guarantee support for every damaged or proprietary media file.
