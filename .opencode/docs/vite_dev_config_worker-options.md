# Worker Options | Vite

> Source: https://vite.dev/config/worker-options
> Cached: 2026-08-12T19:08:36.057Z

---

Are you an LLM? You can read better optimized documentation at /config/worker-options.md for this page in Markdown format# Worker Options [​](#worker-options)

Unless noted, the options in this section are applied to all dev, build, and preview.

## worker.format [​](#worker-format)

- **Type:** `'es' | 'iife'`
- **Default:** `'iife'`

Output format for worker bundle.

## worker.plugins [​](#worker-plugins)

- **Type:** [`() => (Plugin | Plugin[])[]`](./shared-options#plugins)

Vite plugins that apply to the worker bundles. Note that [config.plugins](./shared-options#plugins) only applies to workers in dev, it should be configured here instead for build. The function should return new plugin instances as they are used in parallel rolldown worker builds. As such, modifying `config.worker` options in the `config` hook will be ignored.

## worker.rolldownOptions [​](#worker-rolldownoptions)

- **Type:** [`RolldownOptions`](https://rolldown.rs/reference/)

Rolldown options to build worker bundle.

## worker.rollupOptions [​](#worker-rollupoptions)

- **Type:** `RolldownOptions`
- **Deprecated**

This option is an alias of `worker.rolldownOptions` option. Use `worker.rolldownOptions` option instead.