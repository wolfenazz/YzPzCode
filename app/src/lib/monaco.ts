// Monaco Editor setup for Vite + Tauri
// Uses Vite's ?worker imports so Monaco's web workers are bundled offline
// (no CDN required — critical for the Tauri desktop webview).
//
// NOTE: monaco-editor@0.56 exports map ("./*": "./esm/vs/*.js") auto-prepends
// "esm/vs/", so deep imports MUST omit the "esm/vs/" prefix (e.g.
// "monaco-editor/editor/editor.worker" resolves to "esm/vs/editor/editor.worker.js").
import * as monaco from 'monaco-editor';
import { loader } from '@monaco-editor/react';
import EditorWorker from 'monaco-editor/editor/editor.worker?worker';
import JsonWorker from 'monaco-editor/language/json/json.worker?worker';
import CssWorker from 'monaco-editor/language/css/css.worker?worker';
import HtmlWorker from 'monaco-editor/language/html/html.worker?worker';
import TsWorker from 'monaco-editor/language/typescript/ts.worker?worker';

self.MonacoEnvironment = {
  getWorker(_workerId: string, label: string) {
    switch (label) {
      case 'json':
        return new JsonWorker();
      case 'css':
      case 'scss':
      case 'less':
        return new CssWorker();
      case 'html':
      case 'handlebars':
      case 'razor':
        return new HtmlWorker();
      case 'typescript':
      case 'javascript':
        return new TsWorker();
      default:
        return new EditorWorker();
    }
  },
};

// Configure @monaco-editor/react to use the locally bundled monaco instance
// instead of fetching from a CDN.
loader.config({ monaco });

export default monaco;
