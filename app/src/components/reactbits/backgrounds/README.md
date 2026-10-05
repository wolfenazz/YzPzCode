# Setup backgrounds

Adapted from the TypeScript + Tailwind backgrounds in [React Bits](https://github.com/DavidHDev/react-bits/tree/main/src/ts-tailwind/Backgrounds), fetched through the GitHub MCP connector on October 5, 2026.

Components: Aurora, Threads, Iridescence, Waves, Particles, DarkVeil, GradientBlinds, LiquidChrome, Plasma, and ShapeGrid.

The original sources are at `src/ts-tailwind/Backgrounds/<Component>/<Component>.tsx` in that repository. See [the bundled license](../LICENSE.md).

Local adaptations add container resize observers and GPU context cleanup, remove Next.js directives, Waves' cursor dot, and ShapeGrid's dark vignette, and initialize Plasma's shader accumulators. DarkVeil uses GLSL ES 3.00 with high precision. The shared render guard checks shader linking and requests a still fallback on GPU errors. Presets, lazy loading, motion preferences, and still fallbacks are managed by `setup/SetupBackground.tsx` and `setup/setupBackground.css`.
