import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";

const host = process.env.TAURI_DEV_HOST;

/**
 * Vendor chunks, by package. A name ending in "/" claims a whole scope or prefix
 * ("@tiptap/"), any other name claims exactly that package.
 *
 * This is a function (not the object form) on purpose: the object form also pulls
 * every dependency of a listed package into its chunk, so a shared helper (Vite's
 * preload helper, react-dom, floating-ui…) landed inside whichever heavy chunk
 * listed it first, and the start page had to download and parse all of Monaco,
 * TipTap and dnd-kit just to get a few lines of helper code. Here a chunk holds
 * only the packages named below; anything shared falls back to Rollup's default.
 */
const VENDOR_CHUNKS: Record<string, string[]> = {
  react: ['react', 'react-dom', 'scheduler'],
  // Used by tooltips and popovers all over the UI. Rollup also pulls a chunk's
  // unassigned dependencies into it, so without its own chunk this ended up inside
  // the TipTap chunk and the start page loaded the editor to position a tooltip.
  'floating-ui': ['@floating-ui/'],
  tauri: ['@tauri-apps/api'],
  zustand: ['zustand'],
  codemirror: ['@codemirror/', '@lezer/', '@replit/codemirror-minimap'],
  monaco: ['monaco-editor', '@monaco-editor/'],
  pdfjs: ['pdfjs-dist'],
  xlsx: ['xlsx'],
  docx: ['docx-preview'],
  pptx: ['pptx-viewer'],
  glide: ['@glideapps/glide-data-grid'],
  highlightjs: ['highlight.js'],
  'framer-motion': ['framer-motion', 'motion', 'motion-dom', 'motion-utils'],
  iconify: ['@iconify/react', '@iconify-json/simple-icons'],
  'dnd-kit': ['@dnd-kit/'],
  'react-grid-layout': ['react-grid-layout'],
  'react-arborist': ['react-arborist'],
  marked: ['marked', 'marked-highlight'],
  // Writing workspace: the rich-text editor and the Word reader/writer.
  tiptap: ['@tiptap/', 'tiptap-pagination-plus', 'prosemirror-', 'orderedmap', 'rope-sequence'],
  'docx-writer': ['docx'],
  mammoth: ['mammoth'],
  // Presentation studio: the PowerPoint writer.
  pptxgenjs: ['pptxgenjs'],
};

function vendorChunk(id: string): string | undefined {
  // Vite's own helpers (the dynamic-import preloader, CommonJS interop) are used by
  // the entry; keep them in a tiny chunk of their own so no vendor chunk is needed
  // at start-up just to get them.
  if (id.includes('vite/preload-helper') || id.includes('vite/modulepreload-polyfill') || id.includes('commonjsHelpers')) {
    return 'vite-helpers';
  }
  const marker = id.lastIndexOf('node_modules/');
  if (marker < 0) return undefined;
  const rest = id.slice(marker + 'node_modules/'.length);
  const parts = rest.split('/');
  const pkg = parts[0].startsWith('@') ? `${parts[0]}/${parts[1]}` : parts[0];
  for (const [chunk, names] of Object.entries(VENDOR_CHUNKS)) {
    for (const name of names) {
      if (name.endsWith('/') ? `${pkg}/`.startsWith(name) : name.endsWith('-') ? pkg.startsWith(name) : pkg === name) return chunk;
    }
  }
  return undefined;
}

export default defineConfig(async () => ({
  clearScreen: false,
  // Use relative paths so Tauri's custom protocol (tauri.localhost) loads assets correctly
  base: './',
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 8745,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 8746,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: vendorChunk,
      },
    },
  },
}));
