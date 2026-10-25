// The standalone build: dist/standalone.js, an IIFE with Vue, the kit and all
// styles inside (global `DskOpenApi`). Runs after the library build, so it
// must not empty dist/.
import { resolve } from 'path'
import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'

/** Puts the bundle's CSS into the script, which adds it to <head> on load; standalone.css stays too. */
function injectCss(): Plugin {
  return {
    name: 'oa-inject-css',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const css = Object.values(bundle)
        .filter((f) => f.type === 'asset' && f.fileName.endsWith('.css'))
        .map((f) => (f.type === 'asset' ? String(f.source) : ''))
        .join('\n')
      if (!css) return
      for (const file of Object.values(bundle)) {
        if (file.type !== 'chunk' || !file.isEntry) continue
        // Once per page, even when the script is included twice.
        file.code =
          `!function(){if(typeof document>"u"||document.querySelector("style[data-dsk-openapi]"))return;` +
          `var s=document.createElement("style");s.setAttribute("data-dsk-openapi","");s.textContent=${JSON.stringify(css)};` +
          `document.head.appendChild(s)}();\n` +
          file.code
      }
    },
  }
}

export default defineConfig({
  plugins: [vue(), injectCss()],
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
    __VUE_OPTIONS_API__: 'true',
    __VUE_PROD_DEVTOOLS__: 'false',
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false',
  },
  build: {
    emptyOutDir: false,
    lib: {
      entry: resolve(import.meta.dirname, 'src/standalone/index.ts'),
      formats: ['iife'],
      name: 'DskOpenApi',
      fileName: () => 'standalone.js',
      cssFileName: 'standalone',
    },
    minify: true,
    cssMinify: true,
    sourcemap: false,
  },
})
