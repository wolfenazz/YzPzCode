import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";

const host = process.env.TAURI_DEV_HOST;

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
        manualChunks: {
          tauri: ['@tauri-apps/api/core', '@tauri-apps/api/window', '@tauri-apps/api/event'],
          zustand: ['zustand'],
          codemirror: [
            '@codemirror/view', '@codemirror/state', '@codemirror/language',
            '@codemirror/theme-one-dark', '@codemirror/autocomplete', '@codemirror/commands',
            '@codemirror/search', '@codemirror/lang-javascript', '@codemirror/lang-rust',
            '@codemirror/lang-python', '@codemirror/lang-html', '@codemirror/lang-css',
            '@codemirror/lang-json', '@codemirror/lang-markdown', '@codemirror/lang-java',
            '@codemirror/lang-cpp', '@replit/codemirror-minimap'
          ],
          monaco: ['monaco-editor', '@monaco-editor/react'],
          pdfjs: ['pdfjs-dist'],
          xlsx: ['xlsx'],
          docx: ['docx-preview'],
          pptx: ['pptx-viewer'],
          glide: ['@glideapps/glide-data-grid'],
          highlightjs: ['highlight.js'],
          'framer-motion': ['framer-motion'],
          iconify: ['@iconify/react', '@iconify-json/simple-icons'],
          'dnd-kit': ['@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities'],
          'react-grid-layout': ['react-grid-layout'],
          'react-arborist': ['react-arborist'],
          marked: ['marked', 'marked-highlight'],
        },
      },
    },
  },
}));
