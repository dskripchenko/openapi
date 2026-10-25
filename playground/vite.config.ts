import { createReadStream, existsSync } from 'fs'
import { basename, resolve } from 'path'
import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'

const root = resolve(import.meta.dirname, '..')

/**
 * For standalone.html: the built bundle as /standalone/standalone.js (run
 * `pnpm build` first) and the fixture specs as /fixtures/{file}, served as
 * a backend would serve them.
 */
function staticFiles(): Plugin {
  const types: Record<string, string> = { '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.yaml': 'application/yaml' }
  const routes: [string, string][] = [
    ['/standalone/', resolve(root, 'dist')],
    ['/fixtures/', resolve(root, 'tests/fixtures/specs')],
  ]
  return {
    name: 'oa-playground-static',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = (req.url ?? '').split('?')[0]!
        const route = routes.find(([prefix]) => path.startsWith(prefix))
        if (!route) return next()
        const file = resolve(route[1], basename(path))
        if (!existsSync(file)) {
          res.statusCode = 404
          return res.end(`${path} not found${route[0] === '/standalone/' ? ' — run pnpm build' : ''}`)
        }
        res.setHeader('Content-Type', types[file.slice(file.lastIndexOf('.'))] ?? 'application/octet-stream')
        res.setHeader('Cache-Control', 'no-store')
        createReadStream(file).pipe(res)
      })
    },
  }
}

export default defineConfig({
  root: resolve(import.meta.dirname),
  plugins: [vue(), staticFiles()],
  server: { port: 5310, fs: { allow: [root] } },
})
