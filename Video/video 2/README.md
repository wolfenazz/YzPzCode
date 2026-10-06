# YzPzCode Motion Reel (45s, 1080p60)

- `out/YzPzCode_Showreel_45s.mp4`: the final video
- `reel.html`: the whole animation. Every frame is a pure function of time (`seek(t)`), so renders are frame-exact
- `render.js`: renders with real motion blur (4 subframes per frame, 180° shutter), in parallel browsers
- `work/music45.wav`: the soundtrack extended to 45s by looping its 8-kick phrase on the beat, with the app's own "done" sounds on the task-complete and style-applied moments

## Preview live
Open `reel.html` in Chrome and click once to start it with music. To freeze on a moment, add `?t=21.5` to the URL.

## Re-render
```bash
npm install            # playwright
node render.js reel.html out/YzPzCode_Showreel_45s.mp4 60 7 work/music45.wav
node stills.js reel.html work/sheet.png 3.2 10.1 16.9   # contact sheet of stills
```

## Beat map
| Time | Section | Music |
|---|---|---|
| 0–3.2 | Shape: dot → loader → orange burst → MOTION/DESIGN → pill | intro + impact at 1.2 |
| 3.2–10.1 | System: window, 4 → 6 agent panes, working rings, done toast | phrase 1 |
| 10.1–16.9 | Orbit → dock with magnification, click Claude | phrase 2 |
| 16.9–23.8 | Terminal → Browser (inspect, pick style, drag, apply) | phrase 3 |
| 23.8–30.6 | Editor → Themes (accent + mode switching) | phrase 4 |
| 30.6–37.5 | Mosaic: slam, wave, shuffle, 3D flip | phrase 5 |
| 37.5–40.9 | Kinetic type: DESIGNED. ANIMATED. SHIPPED. | fill + 3 kicks |
| 40.9–45 | Mark: plate, ring, wordmark on the final hit (43.66) | finale |

Terminal output, code, file names and UI in the mock screens are illustrative. The "9 AI agents · 10 tool CLIs · 10 IDEs" caption comes from the app's own supported lists.
