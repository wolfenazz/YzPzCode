# GitHub - dream-num/univer: Univer is a full-stack framework for creating and editing spreadsheets / word processor / presentation on both web and server. · GitHub

> Source: https://github.com/dream-num/univer
> Cached: 2026-08-13T01:32:07.279Z

---

**A full-stack, isomorphic office SDK for building spreadsheets, documents, and presentations.**

Build embeddable productivity experiences with a plugin architecture, Canvas-based rendering,
a formula engine, and one Facade API that works in the browser and on Node.js.
English | [简体中文](/dream-num/univer/blob/dev/docs/readme/zh-CN.md) | [繁體中文](/dream-num/univer/blob/dev/docs/readme/zh-TW.md) | [日本語](/dream-num/univer/blob/dev/docs/readme/ja-JP.md) | [한국어](/dream-num/univer/blob/dev/docs/readme/ko-KR.md) | [Español](/dream-num/univer/blob/dev/docs/readme/es-ES.md)

[📖 Documentation](https://docs.univer.ai) | [✨ Showcase](https://docs.univer.ai/showcase) | [📘 API Reference](https://docs.univer.ai/reference/classes/univer) | [📝 Blog](https://docs.univer.ai/blog)

[](https://github.com/dream-num/univer/releases)
[](/dream-num/univer/blob/dev/LICENSE)
[](https://github.com/dream-num/univer/actions/workflows/build-packages.yml)
[](https://www.codefactor.io/repository/github/dream-num/univer/overview/dev)
[](https://codecov.io/gh/dream-num/univer)
[](https://github.com/dream-num/univer/stargazers)
[](https://github.com/dream-num/univer/graphs/contributors)
[](https://github.com/dream-num/univer/issues)
[](https://github.com/dream-num/univer/commits/main/)
[](https://discord.gg/z3NKNT6D2f)
[](https://twitter.com/univerhq)
[](https://opencollective.com/univer)
[](https://trendshift.io/repositories/4376)

## ✨ What is Univer?

[](#-what-is-univer)
Univer is an open-source SDK for creating office applications inside your own product. It gives you the building blocks for spreadsheet, document, and presentation experiences without forcing you into a hosted app or a fixed UI.

Use Univer when you need to:

- Embed spreadsheet or document editing into a SaaS product, internal tool, BI workflow, or AI application.

- Run workbook/document processing on the server with the same architecture used in the browser.

- Compose only the features you need through plugins or start quickly with presets.

- Extend behavior through custom plugins, commands, services, UI components, and Facade APIs.

Univer is not a spreadsheet file viewer only. It is a framework for building your own productivity surface.

## 🌟 Highlights

[](#-highlights)

  
    
      ⚡

      **Built for large surfaces**

      Canvas-based rendering and a dedicated formula engine keep complex workbooks responsive.
    
    
      🧩

      **Plugin-shaped by default**

      Compose, replace, lazy-load, or extend capabilities without taking the whole stack.
    
    
      🤖

      **Headless for AI infrastructure**

      Run workbook and document logic in Node.js to power agents, automation, and server-side workflows.
    
  
  
    
      🛠️

      **Product-ready SDK**

      Framework adapters, Facade APIs, presets, and headless runtime fit real integration paths.
    
    
      🌗

      **Dark-mode ready**

      UI components and the rendering engine both adapt to light and dark themes.
    
    
      🔌

      **Unified Facade API**

      One consistent API surface for workbooks, ranges, formulas, and documents across browser and Node.js.
    
  

## 🚀 Why Univer?

[](#-why-univer)

- **Isomorphic by design**: run UI apps in browsers and headless processing in Node.js.

- **Plugin-first architecture**: every capability is delivered as a composable plugin, so features can be added, removed, replaced, or lazy-loaded.

- **Preset mode for fast integration**: use curated plugin bundles from [`univer-presets`](https://github.com/dream-num/univer-presets) when you want a working app quickly.

- **Plugin mode for full control**: manually compose packages when you need custom loading, smaller bundles, or deep integration.

- **Facade API**: work with workbooks, worksheets, ranges, documents, formulas, commands, and events through a higher-level API.

- **Canvas rendering engine**: support large editable document surfaces with a rendering layer shared across document types.

- **Extensible UI**: integrate with React, Vue, Web Components, and framework-specific application shells.

## ⚡ Quick Start

[](#-quick-start)
For most applications, start with **Preset Mode**. Use **Plugin Mode** when you need to manually compose packages and control plugin registration.

**Preset Mode (recommended)**
Presets are curated collections of Univer plugins that include the required Facade API registrations and styles.

pnpm add @univerjs/presets @univerjs/preset-sheets-core
import { UniverSheetsCorePreset } from '@univerjs/preset-sheets-core'
import UniverPresetSheetsCoreEnUS from '@univerjs/preset-sheets-core/locales/en-US'
import { createUniver, LocaleType, mergeLocales } from '@univerjs/presets'

import '@univerjs/preset-sheets-core/lib/index.css'

const { univerAPI } = createUniver({
  locale: LocaleType.EN_US,
  locales: {
    [LocaleType.EN_US]: mergeLocales(UniverPresetSheetsCoreEnUS),
  },
  presets: [
    UniverSheetsCorePreset({
      container: 'app',
    }),
  ],
})

univerAPI.createWorkbook({})

**Plugin Mode**
Plugin Mode gives you lower-level control over packages, style imports, locale merging, Facade API registration, and plugin order.

pnpm add @univerjs/core @univerjs/design @univerjs/docs @univerjs/docs-ui @univerjs/engine-formula @univerjs/engine-render @univerjs/sheets @univerjs/sheets-formula @univerjs/sheets-formula-ui @univerjs/sheets-numfmt @univerjs/sheets-numfmt-ui @univerjs/sheets-ui @univerjs/ui
import { LocaleType, mergeLocales, Univer } from '@univerjs/core'
import { FUniver } from '@univerjs/core/facade'
import DesignEnUS from '@univerjs/design/locale/en-US'
import { UniverDocsPlugin } from '@univerjs/docs'
import { UniverDocsUIPlugin } from '@univerjs/docs-ui'
import DocsUIEnUS from '@univerjs/docs-ui/locale/en-US'
import { UniverFormulaEnginePlugin } from '@univerjs/engine-formula'
import { UniverRenderEnginePlugin } from '@univerjs/engine-render'
import { UniverSheetsPlugin } from '@univerjs/sheets'
import SheetsEnUS from '@univerjs/sheets/locale/en-US'
import { UniverSheetsFormulaPlugin } from '@univerjs/sheets-formula'
import SheetsFormulaEnUS from '@univerjs/sheets-formula/locale/en-US'
import { UniverSheetsFormulaUIPlugin } from '@univerjs/sheets-formula-ui'
import SheetsFormulaUIEnUS from '@univerjs/sheets-formula-ui/locale/en-US'
import { UniverSheetsNumfmtPlugin } from '@univerjs/sheets-numfmt'
import { UniverSheetsNumfmtUIPlugin } from '@univerjs/sheets-numfmt-ui'
import SheetsNumfmtUIEnUS from '@univerjs/sheets-numfmt-ui/locale/en-US'
import { UniverSheetsUIPlugin } from '@univerjs/sheets-ui'
import SheetsUIEnUS from '@univerjs/sheets-ui/locale/en-US'
import { UniverUIPlugin } from '@univerjs/ui'
import UIEnUS from '@univerjs/ui/locale/en-US'

import '@univerjs/design/lib/index.css'
import '@univerjs/ui/lib/index.css'
import '@univerjs/docs-ui/lib/index.css'
import '@univerjs/sheets-ui/lib/index.css'
import '@univerjs/sheets-formula-ui/lib/index.css'
import '@univerjs/sheets-numfmt-ui/lib/index.css'

import '@univerjs/engine-formula/facade'
import '@univerjs/ui/facade'
import '@univerjs/sheets/facade'
import '@univerjs/sheets-ui/facade'
import '@univerjs/sheets-formula/facade'
import '@univerjs/sheets-numfmt/facade'

const univer = new Univer({
  locale: LocaleType.EN_US,
  locales: {
    [LocaleType.EN_US]: mergeLocales(
      DesignEnUS,
      UIEnUS,
      DocsUIEnUS,
      SheetsEnUS,
      SheetsUIEnUS,
      SheetsFormulaEnUS,
      SheetsFormulaUIEnUS,
      SheetsNumfmtUIEnUS,
    ),
  },
})

univer.registerPlugin(UniverRenderEnginePlugin)
univer.registerPlugin(UniverFormulaEnginePlugin)
univer.registerPlugin(UniverUIPlugin, { container: 'app' })
univer.registerPlugin(UniverDocsPlugin)
univer.registerPlugin(UniverDocsUIPlugin)
univer.registerPlugin(UniverSheetsPlugin)
univer.registerPlugin(UniverSheetsUIPlugin)
univer.registerPlugin(UniverSheetsFormulaPlugin)
univer.registerPlugin(UniverSheetsFormulaUIPlugin)
univer.registerPlugin(UniverSheetsNumfmtPlugin)
univer.registerPlugin(UniverSheetsNumfmtUIPlugin)

const univerAPI = FUniver.newAPI(univer)
univerAPI.createWorkbook({})

Your page needs a container:

<div id="app" style="height: 100vh"></div>
Learn more in the [Installation & Basic Usage guide](https://docs.univer.ai/guides/sheets/getting-started/installation), the [`createUniver` reference](https://docs.univer.ai/reference/methods/create-univer), and the [Facade API reference](https://docs.univer.ai/reference/classes/univer).

## 🧩 Preset Mode vs Plugin Mode

[](#-preset-mode-vs-plugin-mode)

Choose
When to use it
Start here

**Preset Mode**
You want a working Sheets, Docs, or Node setup with minimal configuration.
[`univer-presets`](https://github.com/dream-num/univer-presets) and the [getting started guide](https://docs.univer.ai/guides/sheets/getting-started/installation)

**Plugin Mode**
You need strict control over packages, plugin registration order, lazy loading, or custom runtime composition.
This repository's [`examples/`](/dream-num/univer/blob/dev/examples) and [architecture guide](https://docs.univer.ai/guides/recipes/architecture/univer)

**Headless Mode**
You need server-side workbook/document processing, formula calculation, or automation without UI.
[Headless Univer](https://docs.univer.ai/guides/sheets/getting-started/node)

Keep all `@univerjs/*` packages on the same version. If you use Univer Pro packages, keep `@univerjs-pro/*` versions aligned as well.

For API compatibility expectations, experimental APIs, internal APIs, and deprecation rules, see the [API Stability Policy](/dream-num/univer/blob/dev/docs/API_STABILITY.md).

## 🧭 Compatibility

[](#-compatibility)

- **Browser runtime**: Univer is compiled with a Chrome 88 target and aims to work on Edge `>=88`, Firefox `>=90`, Chrome `>=88`, Safari `>=14.1`, and Electron `>=12`.

- **Polyfills**: Univer relies on `Intl.Segmenter`. Add a polyfill such as `@formatjs/intl-segmenter` if your target browser or runtime does not provide it.

- **Build tools**: We recommend Vite, esbuild, or Webpack 5. If your build tool does not support the `exports` field in `package.json` (common in Webpack 4), you may need extra path mapping.

- **React**: Univer's view layer is built on React 18, supports React 18 and 19, and provides minimal compatibility support for React 16.9+ and 17.

- **Node.js runtime**: Headless Univer supports Node.js `>=18.17.0`. Developing this monorepo requires Node.js `>=22.18`.

## 🛠️ What You Can Build

[](#️-what-you-can-build)

Area
Open-source capabilities
Univer Pro extensions

**Sheets**
Workbooks, worksheets, ranges, selection, formulas, number formatting, filtering, sorting, data validation, conditional formatting, hyperlinks, comments, find and replace, notes, tables, drawing integration, and extensible UI plugins.
Real-time collaboration, edit history, import/export, printing, charts, pivot tables, sparklines, outlines, shapes, in-cell graphics, data connectors, server-side calculation, and performance-enhanced formula features.

**Docs**
Rich document model, editing UI, lists, hyperlinks, drawing integration, comments, quick insert, and shared document architecture.
Collaboration, import/export, printing, enhanced tables and lists, columns, callouts, code blocks, quotes, shapes, and remote comment resources.

**Slides**
Presentation data model and UI packages under active development.
Pro slide model and UI, slide import/export, chart and table model/UI plugins, and shared shape-editing infrastructure.

**Bases**
Build custom structured-data experiences on top of Univer's plugin, command, and model architecture.
Base database model, commands, formula integration, workbench UI, field editors, and render-engine views.

**Runtime**
Browser apps, Node.js headless usage, Web Worker/RPC patterns, multi-instance usage, and server-oriented automation.
Collaboration client/server packages, Node.js collaboration client, Pro server services, SSR, computing delegation, server-side calculation, and changeset replay tooling.

**Integrations**
React, Vue, Web Components, framework templates, theming, localization, and custom plugins.
Pro presets and enterprise deployment packages.

Sheets are the most mature product surface today. Docs and Slides share Univer's architecture and continue to evolve in the same SDK.

## 🔓 Open Source and Pro

[](#-open-source-and-pro)
This repository contains Univer's open-source core and first-party OSS plugins. Univer Pro is developed separately as a commercial extension layer for advanced product surfaces, collaboration, server features, and enterprise integrations.

Category
Open source
Univer Pro / commercial

**Foundation**
Core SDK, plugin system, rendering engine, formula engine, Facade API, themes, i18n, and framework adapters.
Pro presets and enterprise deployment packages.

**Sheets**
Core spreadsheet editing, formulas, number formatting, filter/sort, data validation, conditional formatting, notes, tables, hyperlinks, comments, drawing, find and replace.
Collaboration, edit history, import/export, print, charts, pivot tables, sparklines, outlines, shapes, in-cell graphics, data connectors, range preprocessing, and enhanced formula engine features.

**Docs**
Document model and editor UI, lists, hyperlinks, comments, quick insert, and drawing integration.
Collaboration, import/export, print, enhanced tables/lists, columns, callouts, code blocks, quotes, shapes, and remote thread-comment resources.

**Slides**
OSS presentation model and UI packages.
Pro slide model/UI packages, slide import/export, charts, tables, and reusable shape editor UI.

**Bases**
Extensible plugin architecture for custom data-centric products.
Base database core model, commands, mutations, formula integration, workbench UI, field editors, and render-engine integration.

**Server and runtime**
Node.js headless runtime, RPC/Web Worker patterns, and server-oriented automation primitives.
Collaboration server, Node.js collaboration client, SSR services, computing delegation, server-side calculation, and collaboration changeset replay tooling.

Pro features are documented in the [Univer Pro guide](https://docs.univer.ai/guides/pro). They are intentionally separated here so the OSS package surface is clear.

Boundary principles:

- OSS packages in this repository are intended to be useful on their own under the Apache-2.0 license. Univer Pro is optional and is not required to use the public OSS SDK APIs.

- Bugs, regressions, and security issues in OSS packages should be reported and fixed in the OSS repository, even when a related Pro feature exists.

- OSS documentation should not imply that Pro-only capabilities are available in public `@univerjs/*` packages. Pro-only APIs, packages, and deployment paths should be named explicitly.

- When an OSS feature has a Pro enhancement, the OSS behavior should remain documented independently so users can evaluate the open-source surface without reading commercial docs first.

## 🌐 

... [Content truncated]