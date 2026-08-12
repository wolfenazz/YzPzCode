# Features | Vite

> Source: https://vite.dev/guide/features.html#web-workers
> Cached: 2026-08-12T19:04:00.089Z

---

Are you an LLM? You can read better optimized documentation at /guide/features.md for this page in Markdown format# Features [​](#features)

At the very basic level, developing using Vite is not that different from using a static file server. However, Vite provides many enhancements over native ESM imports to support various features that are typically seen in bundler-based setups.

## npm Dependency Resolving and Pre-Bundling [​](#npm-dependency-resolving-and-pre-bundling)

Native ES imports do not support bare module imports like the following:

js`import { someMethod } from 'my-dep'`The above import will throw an error in the browser. Vite will detect such bare module imports in all served source files and perform the following:

[Pre-bundle](./dep-pre-bundling) them to improve page loading speed and convert CommonJS / UMD modules to ESM. The pre-bundling step is performed with [Rolldown](https://rolldown.rs/) and makes Vite's cold start time significantly faster than any JavaScript-based bundler.

Rewrite the imports to valid URLs like `/node_modules/.vite/deps/my-dep.js?v=f3sf2ebd` so that the browser can import them properly.

**Dependencies are Strongly Cached**

Vite caches dependency requests via HTTP headers, so if you wish to locally edit/debug a dependency, follow the steps [here](./dep-pre-bundling#browser-cache).

## Hot Module Replacement [​](#hot-module-replacement)

Vite provides an [HMR API](./api-hmr) over native ESM. Frameworks with HMR capabilities can leverage the API to provide instant, precise updates without reloading the page or blowing away application state. Vite provides first-party HMR integrations for [Vue Single File Components](https://github.com/vitejs/vite-plugin-vue/tree/main/packages/plugin-vue) and [React Fast Refresh](https://github.com/vitejs/vite-plugin-react/tree/main/packages/plugin-react). There are also official integrations for Preact via [@prefresh/vite](https://github.com/JoviDeCroock/prefresh/tree/main/packages/vite).

Note you don't need to manually set these up - when you [create an app via `create-vite`](./), the selected templates would have these pre-configured for you already.

## TypeScript [​](#typescript)

Vite supports importing `.ts` files out of the box.

### Transpile Only [​](#transpile-only)

Note that Vite only performs transpilation on `.ts` files and does **NOT** perform type checking. It assumes type checking is taken care of by your IDE and build process.

The reason Vite does not perform type checking as part of the transform process is because the two jobs work fundamentally differently. Transpilation can work on a per-file basis and aligns perfectly with Vite's on-demand compile model. In comparison, type checking requires knowledge of the entire module graph. Shoe-horning type checking into Vite's transform pipeline will inevitably compromise Vite's speed benefits.

Vite's job is to get your source modules into a form that can run in the browser as fast as possible. To that end, we recommend separating static analysis checks from Vite's transform pipeline. This principle applies to other static analysis checks such as ESLint.

For production builds, you can run `tsc --noEmit` in addition to Vite's build command.

During development, if you need more than IDE hints, we recommend running `tsc --noEmit --watch` in a separate process, or use [vite-plugin-checker](https://github.com/fi3ework/vite-plugin-checker) if you prefer having type errors directly reported in the browser.

Vite uses [Oxc Transformer](https://oxc.rs/docs/guide/usage/transformer.html) to transpile TypeScript into JavaScript which is faster than vanilla `tsc`, and HMR updates can reflect in the browser in under 50ms.

Use the [Type-Only Imports and Export](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-8.html#type-only-imports-and-export) syntax to avoid potential problems like type-only imports being incorrectly bundled, for example:

ts```
import type { T } from 'only/types'
export type { T }
```

### TypeScript Compiler Options [​](#typescript-compiler-options)

Vite respects some of the options in `tsconfig.json` and sets the corresponding Oxc Transformer options. For each file, Vite uses the closest parent `tsconfig.json` that matches the file, or a config referenced by its [`references`](https://www.typescriptlang.org/tsconfig/#references) field that matches the file. Vite treats a config as matching the file when the file satisfies the config's [`files`](https://www.typescriptlang.org/tsconfig/#files), [`include`](https://www.typescriptlang.org/tsconfig/#include), and [`exclude`](https://www.typescriptlang.org/tsconfig/#exclude) fields.

When the options are set in both the Vite config and the `tsconfig.json`, the value in the Vite config takes precedence.

Some configuration fields under `compilerOptions` in `tsconfig.json` require special attention.

#### `isolatedModules` [​](#isolatedmodules)

- [TypeScript documentation](https://www.typescriptlang.org/tsconfig#isolatedModules)

Should be set to `true`.

It is because Oxc transformer only performs transpilation without type information, it doesn't support certain features like const enum and implicit type-only imports.

You must set `"isolatedModules": true` in your `tsconfig.json` under `compilerOptions`, so that TS will warn you against the features that do not work with isolated transpilation.

If a dependency doesn't work well with `"isolatedModules": true`, you can use `"skipLibCheck": true` to temporarily suppress the errors until it is fixed upstream.

#### `useDefineForClassFields` [​](#usedefineforclassfields)

- [TypeScript documentation](https://www.typescriptlang.org/tsconfig#useDefineForClassFields)

The default value will be `true` if the TypeScript target is `ES2022` or newer including `ESNext`. It is consistent with the [behavior of TypeScript 4.3.2+](https://github.com/microsoft/TypeScript/pull/42663). Other TypeScript targets will default to `false`.

`true` is the standard ECMAScript runtime behavior.

If you are using a library that heavily relies on class fields, please be careful about the library's intended usage of it. While most libraries expect `"useDefineForClassFields": true`, you can explicitly set `useDefineForClassFields` to `false` if your library doesn't support it.

#### `target` [​](#target)

- [TypeScript documentation](https://www.typescriptlang.org/tsconfig#target)

Vite ignores the `target` value in the `tsconfig.json`, following the same behavior as [esbuild](https://esbuild.github.io/).

To specify the target in dev, the `oxc.target` option can be used, which defaults to `esnext` for minimal transpilation. In builds, the `build.target` option takes higher priority over `oxc.target` and can also be set if needed.

#### `emitDecoratorMetadata` [​](#emitdecoratormetadata)

- [TypeScript documentation](https://www.typescriptlang.org/tsconfig#emitDecoratorMetadata)

This option is only partially supported. Full support requires type inference by the TypeScript compiler, which is not supported. See [Oxc Transformer's documentation](https://oxc.rs/docs/guide/usage/transformer/typescript.html#decorators) for details.

#### `paths` [​](#paths)

- [TypeScript documentation](https://www.typescriptlang.org/tsconfig/#paths)

[`resolve.tsconfigPaths: true`](/config/shared-options#resolve-tsconfigpaths) can be specified to tell Vite to use the `paths` option in `tsconfig.json` to resolve imports.

Note that this feature has a performance cost and is [discouraged by the TypeScript team to use this option to change the behavior of the external tools](https://www.typescriptlang.org/tsconfig/#paths:~:text=Note%20that%20this%20feature%20does%20not%20change%20how%20import%20paths%20are%20emitted%20by%20tsc%2C%20so%20paths%20should%20only%20be%20used%20to%20inform%20TypeScript%20that%20another%20tool%20has%20this%20mapping%20and%20will%20use%20it%20at%20runtime%20or%20when%20bundling.).

#### Other Compiler Options Affecting the Build Result [​](#other-compiler-options-affecting-the-build-result)

- [`extends`](https://www.typescriptlang.org/tsconfig#extends)
- [`importsNotUsedAsValues`](https://www.typescriptlang.org/tsconfig#importsNotUsedAsValues)
- [`preserveValueImports`](https://www.typescriptlang.org/tsconfig#preserveValueImports)
- [`verbatimModuleSyntax`](https://www.typescriptlang.org/tsconfig#verbatimModuleSyntax)
- [`jsx`](https://www.typescriptlang.org/tsconfig#jsx)
- [`jsxFactory`](https://www.typescriptlang.org/tsconfig#jsxFactory)
- [`jsxFragmentFactory`](https://www.typescriptlang.org/tsconfig#jsxFragmentFactory)
- [`jsxImportSource`](https://www.typescriptlang.org/tsconfig#jsxImportSource)
- [`experimentalDecorators`](https://www.typescriptlang.org/tsconfig#experimentalDecorators)

`skipLibCheck`

Vite starter templates have `"skipLibCheck": true` by default to avoid typechecking dependencies, as they may choose to only support specific versions and configurations of TypeScript. You can learn more at [vuejs/vue-cli#5688](https://github.com/vuejs/vue-cli/pull/5688).

### Client Types [​](#client-types)

Vite's default types are for its Node.js API. To shim the environment of client-side code in a Vite application, you can add `vite/client` to `compilerOptions.types` inside `tsconfig.json`:

tsconfig.jsonjson```
{
  "compilerOptions": {
    "types": ["vite/client", "some-other-global-lib"]
  }
}
```

Note that if [`compilerOptions.types`](https://www.typescriptlang.org/tsconfig#types) is specified, only these packages will be included in the global scope (instead of all visible ”@types” packages). This is recommended since TS 5.9.

Using triple-slash directiveAlternatively, you can add a `d.ts` declaration file:

vite-env.d.tstypescript`/// <reference types="vite/client" />``vite/client` provides the following type shims:

- Asset imports (e.g. importing an `.svg` file)
- Types for the Vite-injected [constants](./env-and-mode#env-variables) on `import.meta.env`
- Types for the [HMR API](./api-hmr) on `import.meta.hot`

TIP

To override the default typing, add a type definition file that contains your typings. Then, add the type reference before `vite/client`.

For example, to make the default import of `*.svg` a React component:

`vite-env-override.d.ts` (the file that contains your typings):ts```
declare module '*.svg' {
  const content: React.FC<React.SVGProps<SVGElement>>
  export default content
}
```

If you are using `compilerOptions.types`, ensure the file is included in `tsconfig.json`:tsconfig.jsonjson```
{
  "include": ["src", "./vite-env-override.d.ts"]
}
```

If you are using triple-slash directives, update the file containing the reference to `vite/client` (normally `vite-env.d.ts`):ts```
/// <reference types="./vite-env-override.d.ts" />
/// <reference types="vite/client" />
```

## HTML [​](#html)

HTML files stand [front-and-center](/guide/#index-html-and-project-root) of a Vite project, serving as the entry points for your application, making it simple to build single-page and multi-page applications.

Any HTML files in your project root can be directly accessed by its respective directory path:

- `<root>/index.html` -> `http://localhost:5173/`
- `<root>/about.html` -> `http://localhost:5173/about.html`
- `<root>/blog/index.html` -> `http://localhost:5173/blog/index.html`

Assets referenced by HTML elements such as `<script type="module" src>` and `<link href>` are processed and bundled as part of the app. The full list of supported elements is as below:

- `<audio src>`
- `<embed src>`
- `<img src>` and `<img srcset>`
- `<image href>` and `<image xlink:href>`
- `<input src>`
- `<link href>` and `<link imagesrcset>`
- `<object data>`
- `<script type="module" src>`
- `<source src>` and `<source srcset>`
- `<track src>`
- `<use href>` and `<use xlink:href>`
- `<video src>` and `<video poster>`
- `<meta content>`
Only if `name` attribute matches `msapplication-tileimage`, `msapplication-square70x70logo`, `msapplication-square150x150logo`, `msapplication-wide310x150logo`, `msapplication-square310x310logo`, `msapplication-config`, or `twitter:image`
- Or only if `property` attribute matches `og:image`, `og:image:url`, `og:image:secure_url`, `og:audio`, `og:audio:secure_url`, `og:video`, or `og:video:secure_url`

html```
<!doctype html>
<html>
  <head>
    <link rel="icon" href="/favicon.ico" />
    <link rel="stylesheet" href="/src/styles.css" />
  </head>
  <body>
    <img src="/src/images/logo.svg" alt="logo" />
    <script type="module" src="/src/main.js"></script>
  </body>
</html>
```

To opt-out of HTML processing on certain elements, you can add the `vite-ignore` attribute on the element, which can be useful when referencing external assets or CDN.

## Frameworks [​](#frameworks)

All modern frameworks maintain integrations with Vite. Most framework plugins are maintained by each framework team, with the exception of the official Vue and React Vite plugins that are maintained in the vite org:

- Vue support via [@vitejs/plugin-vue](https://github.com/vitejs/vite-plugin-vue/tree/main/packages/plugin-vue)
- Vue JSX support via [@vitejs/plugin-vue-jsx](https://github.com/vitejs/vite-plugin-vue/tree/main/packages/plugin-vue-jsx)
- React support via [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/tree/main/packages/plugin-react)
- React using SWC support via [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/tree/main/packages/plugin-react-swc)
- [React Server Components (RSC)](https://react.dev/reference/rsc/server-components) support via [@vitejs/plugin-rsc](https://github.com/vitejs/vite-plugin-react/tree/main/packages/plugin-rsc)

Check out the [Plugins Guide](/plugins/) for more information.

## JSX [​](#jsx)

`.jsx` and `.tsx` files are also supported out of the box. JSX transpilation is also handled via [Oxc Transformer](https://oxc.rs/docs/guide/usage/transformer.html).

Your framework of choice will already configure JSX out of the box (for example, Vue users should use the official [@vitejs/plugin-vue-jsx](https://github.com/vitejs/vite-plugin-vue/tree/main/packages/plugin-vue-jsx) plugin, which provides Vue 3 specific features including HMR, global component resolving, directives and slots).

If using JSX with your own framework, custom `jsxFactory` and `jsxFragment` can be configured using the [`oxc` option](/config/shared-options#oxc). For example, the Preact plugin would use:

vite.config.jsjs```
import { defineConfig } from 'vite'

export default defineConfig({
  oxc: {
    jsx: {
      importSource: 'preact',
    },
  },
})
```

More details in [Oxc Transformer docs](https://oxc.rs/docs/guide/usage/transformer/jsx.html).

You can inject the JSX helpers using `jsxInject` (which is a Vite-only option) to avoid manual imports:

vite.config.jsjs```
import { defineConfig } from 'vite'

export default defineConfig({
  oxc: {
    jsxInject: `import React from 'react'`,
  },
})
```

## CSS [​](

... [Content truncated]