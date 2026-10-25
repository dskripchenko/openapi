// Browser check of the Vue components: renders the fixture specs in both
// themes, drives search, samples and try-it (against a mocked API), and saves
// screenshots to tests/browser/output. Run after `pnpm install`; CI runs it.
import { Buffer } from 'node:buffer'
import { mkdirSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createServer } from 'vite'
import { chromium } from 'playwright'

const root = resolve(import.meta.dirname, '..')
const out = resolve(root, 'tests/browser/output')
mkdirSync(out, { recursive: true })

// OA_CHECK_PORT lets several checks run side by side.
const port = Number(process.env.OA_CHECK_PORT ?? 5311)
const server = await createServer({ configFile: resolve(root, 'playground/vite.config.ts'), server: { port, strictPort: true }, logLevel: 'warn' })
await server.listen()
const base = `http://localhost:${port}/`
const browser = await chromium.launch()
const failures = []
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures.push(name)
}

try {
  for (const spec of ['petstore', 'kitchen', 'swagger']) {
    for (const theme of ['light', 'dark']) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1600 } })
      const errors = []
      page.on('pageerror', (e) => errors.push(String(e)))
      page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
      await page.goto(`${base}?spec=${spec}&theme=${theme}`)
      await page.waitForSelector('.oa-op')
      await page.waitForTimeout(300)
      check(`${spec}/${theme}: renders without errors`, errors.length === 0, errors.join('; '))
      await page.screenshot({ path: `${out}/${spec}-${theme}.png` })
      await page.close()
    }
  }

  const page = await browser.newPage({ viewport: { width: 1440, height: 1600 } })
  await page.goto(`${base}?spec=kitchen`)
  await page.waitForSelector('.oa-op')

  // Search narrows the navigation.
  const before = await page.locator('.oa-nav__op').count()
  await page.fill('.oa-nav__search input', 'payment')
  const after = await page.locator('.oa-nav__op').count()
  check('search filters the navigation', after > 0 && after < before, `${before} → ${after}`)
  await page.fill('.oa-nav__search input', '')

  // Samples follow the chosen language on every operation.
  const op = page.locator('.oa-op').filter({ hasText: 'Create an order' }).first()
  await op.locator('.oa-samples .uid-select').first().click()
  await page.locator('[role="option"]', { hasText: 'Python' }).first().click()
  const python = await op.locator('.oa-samples').innerText()
  check('samples switch to Python', python.includes('import requests') && python.includes('requests.post('))

  // Try it against a mocked API: the request carries the body and the header.
  let seen = null
  await page.route('**/v2/orders**', async (route) => {
    const r = route.request()
    seen = { method: r.method(), url: r.url(), headers: r.headers(), body: r.postData() }
    await route.fulfill({ status: 201, contentType: 'application/json', headers: { 'x-request-id': 'abc' }, body: JSON.stringify({ id: 'o-1', status: 'new' }) })
  })
  await op.locator('.oa-tryit button', { hasText: 'Send' }).click()
  await op.locator('.oa-tryit__response .oa-status').waitFor()
  check('try-it sends the request', seen?.method === 'POST' && /\/v2\/orders$/.test(seen.url), seen?.url)
  check('try-it sends the JSON body', !!seen && JSON.parse(seen.body ?? '{}').status !== undefined)
  check('try-it sends the header parameter', !!seen?.headers['idempotency-key'])
  const status = await op.locator('.oa-tryit__response .oa-status').innerText()
  check('try-it shows the response', status.startsWith('201'), status)
  await op.screenshot({ path: `${out}/tryit.png` })

  // Deep link opens the schema.
  await page.goto(`${base}?spec=kitchen#schema/Order`)
  await page.waitForTimeout(800)
  const visible = await page.locator('[id="schema/Order"]').isVisible()
  check('deep link to a schema', visible)
  await page.close()

  // Several specs: a switcher, a lazy loader, prefixed deep links, credentials per spec.
  const mp = await browser.newPage({ viewport: { width: 1440, height: 1200 } })
  const mErrors = []
  mp.on('pageerror', (e) => mErrors.push(String(e)))
  await mp.goto(`${base}?multi=1`)
  await mp.waitForSelector('.oa-nav__specs')
  await mp.waitForSelector('.oa-op')
  check('several specs: the first opens', (await mp.locator('.oa-intro h1').innerText()).includes('Petstore'))
  await mp.locator('.oa-auth .oa-panel__head').click()
  await mp.locator('.oa-auth input').first().fill('pets-token')
  await mp.locator('.oa-nav__specs').click()
  await mp.locator('[role="option"]', { hasText: 'Swagger 2.0' }).click()
  await mp.waitForSelector('.oa-op')
  check('several specs: a loader spec opens on demand', (await mp.locator('.oa-intro__spec').innerText()).includes('2.0'))
  check('several specs: deep links carry the spec id', (await mp.locator('.oa-op').first().getAttribute('id'))?.startsWith('legacy/operation/') === true)
  await mp.locator('.oa-nav__specs').click()
  await mp.locator('[role="option"]').first().click()
  await mp.waitForSelector('.oa-op')
  await mp.locator('.oa-auth .oa-panel__head').click()
  check('several specs: credentials are kept per spec', (await mp.locator('.oa-auth input').first().inputValue()) === 'pets-token')
  await mp.goto(`${base}?multi=1#shop/schema/Order`)
  await mp.waitForTimeout(1200)
  check('several specs: a prefixed deep link opens its spec and section', await mp.locator('[id="shop/schema/Order"]').isVisible())
  await mp.screenshot({ path: `${out}/multi.png` })
  check('several specs: no page errors', mErrors.length === 0, mErrors.join('; '))
  await mp.close()

  // Files in try-it, cancel, the response viewer, the spec download and operation links.
  const fp = await browser.newPage({ viewport: { width: 1440, height: 1600 }, permissions: ['clipboard-read', 'clipboard-write'], acceptDownloads: true })
  const fErrors = []
  fp.on('pageerror', (e) => fErrors.push(String(e)))
  await fp.goto(`${base}?spec=kitchen`)
  await fp.waitForSelector('.oa-op')
  const up = fp.locator('.oa-op').filter({ hasText: 'Upload a product image' }).first()
  await up.scrollIntoViewIfNeeded()
  await up.locator('.oa-tryit').waitFor()
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  )
  const fileBytes = Buffer.concat([Buffer.from('\x89PNG-FILE-BYTES-'), Buffer.from([0, 1, 2, 255])])
  await up.locator('.oa-tryit__file[data-field="file"] input[type="file"]').setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: fileBytes })
  await up.locator('input[data-field="alt"], [data-field="alt"] input').first().fill('A red mug')
  check('files: the sample names the chosen file', (await up.locator('.oa-samples').innerText()).includes('photo.png'))
  let upload = null
  await fp.route('**/catalog/images**', async (route) => {
    const r = route.request()
    upload = { type: r.headers()['content-type'] ?? '', body: r.postDataBuffer() ?? Buffer.alloc(0) }
    await route.fulfill({ status: 201, contentType: 'application/json', body: '{"ok":true}' })
  })
  await up.locator('.oa-tryit button', { hasText: 'Send' }).click()
  await up.locator('.oa-tryit__response .oa-status').waitFor()
  check('files: multipart upload is multipart/form-data', /^multipart\/form-data; boundary=/.test(upload?.type ?? ''), upload?.type)
  check('files: the part carries the file name and its bytes', !!upload && upload.body.includes('filename="photo.png"') && upload.body.includes(fileBytes))
  check('files: text fields go along', !!upload && upload.body.includes('A red mug'))
  check('response: size is shown', /\d+ B/.test(await up.locator('.oa-tryit__size').innerText()))
  await up.screenshot({ path: `${out}/tryit-multipart.png` })
  await fp.unrouteAll({ behavior: 'ignoreErrors' })

  // A binary body: the file is the whole request body.
  await up.locator('.oa-tryit__media').click()
  await fp.locator('[role="option"]', { hasText: 'application/octet-stream' }).click()
  await up.locator('.oa-tryit__file input[type="file"]').setInputFiles({ name: 'blob.bin', mimeType: 'application/octet-stream', buffer: fileBytes })
  let raw = null
  await fp.route('**/catalog/images**', async (route) => {
    const r = route.request()
    raw = { type: r.headers()['content-type'] ?? '', body: r.postDataBuffer() ?? Buffer.alloc(0) }
    await route.fulfill({ status: 200, contentType: 'image/png', body: png })
  })
  await up.locator('.oa-tryit button', { hasText: 'Send' }).click()
  await up.locator('.oa-tryit__response .oa-status').waitFor()
  check('files: a binary body is sent as the file', raw?.type === 'application/octet-stream' && !!raw && raw.body.equals(fileBytes), raw?.type)
  check('files: curl prints --data-binary', await (async () => {
    await up.locator('.oa-samples .uid-select').first().click()
    await fp.locator('[role="option"]', { hasText: 'cURL' }).first().click()
    return (await up.locator('.oa-samples').innerText()).includes("--data-binary '@blob.bin'")
  })())
  // An image response is previewed.
  await up.locator('.oa-tryit__image').waitFor()
  check('response: an image is previewed', await up.locator('.oa-tryit__image').evaluate((img) => img.complete && img.naturalWidth === 1))
  check('response: a binary response can be downloaded', (await up.locator('.oa-tryit__download').getAttribute('href'))?.startsWith('blob:') === true)
  await fp.unrouteAll({ behavior: 'ignoreErrors' })

  // Cancel: the request never answers.
  await fp.route('**/catalog/images**', () => {})
  await up.locator('.oa-tryit button', { hasText: 'Send' }).click()
  await up.locator('.oa-tryit__cancel').click()
  const cancelledText = await up.locator('.oa-tryit__cancelled').innerText()
  check('cancel: a cancelled request shows Cancelled', cancelledText.includes('Cancelled') && !(await up.locator('.oa-tryit').innerText()).includes('did not reach'), cancelledText)
  await fp.unrouteAll({ behavior: 'ignoreErrors' })
  await up.screenshot({ path: `${out}/tryit-files.png` })

  // JSON responses: pretty by default, raw on demand.
  const order = fp.locator('.oa-op').filter({ hasText: 'Create an order' }).first()
  await order.scrollIntoViewIfNeeded()
  await fp.route('**/v2/orders**', (route) => route.fulfill({ status: 201, contentType: 'application/json', body: '{"id":"o-1"}' }))
  await order.locator('.oa-tryit button', { hasText: 'Send' }).click()
  await order.locator('.oa-tryit__response .oa-status').waitFor()
  const prettyText = await order.locator('.oa-tryit__response .uid-code').innerText()
  await order.locator('.oa-tryit__view .oa-chip', { hasText: 'Raw' }).click()
  const rawText = await order.locator('.oa-tryit__response .uid-code').innerText()
  check('response: JSON pretty and raw', prettyText.includes('"id": "o-1"') && rawText.includes('{"id":"o-1"}'))
  await fp.unrouteAll({ behavior: 'ignoreErrors' })

  // The spec downloads as the source document.
  await fp.evaluate(() => window.scrollTo(0, 0))
  const [yamlDl] = await Promise.all([fp.waitForEvent('download'), fp.locator('.oa-intro__download [data-format="yaml"]').click()])
  const yamlText = await readFile(await yamlDl.path(), 'utf8')
  check('download spec: YAML', yamlDl.suggestedFilename() === 'kitchen-sink-api-2.3.0.yaml' && yamlText.startsWith('openapi'), yamlDl.suggestedFilename())
  const [jsonDl] = await Promise.all([fp.waitForEvent('download'), fp.locator('.oa-intro__download [data-format="json"]').click()])
  const jsonText = await readFile(await jsonDl.path(), 'utf8')
  check('download spec: JSON', jsonDl.suggestedFilename().endsWith('.json') && JSON.parse(jsonText).openapi === '3.1.0')

  // Copy the operation's link.
  await up.scrollIntoViewIfNeeded()
  await up.locator('.oa-op__head').hover()
  await up.locator('.oa-op__copy').click()
  await up.locator('.oa-op__copied').waitFor()
  const copied = await fp.evaluate(() => window.navigator.clipboard.readText())
  const expected = `${base}?spec=kitchen#${await up.getAttribute('id')}`
  check('copy link: the operation URL', copied === expected, copied)
  check('files: no page errors', fErrors.length === 0, fErrors.join('; '))
  await fp.close()

  // The editor: visual edits land in the text, the source view reports problems.
  const ed = await browser.newPage({ viewport: { width: 1440, height: 1200 } })
  const edErrors = []
  ed.on('pageerror', (e) => edErrors.push(String(e)))
  const text = () => ed.evaluate(() => window.__text())
  const settle = () => ed.waitForTimeout(450)
  await ed.goto(`${base}?mode=editor&spec=petstore`)
  await ed.waitForSelector('.oa-editor__tree')
  await ed.locator('.oa-editor__form .uid-input-field input').first().fill('Pet Store Edited')
  await settle()
  check('editor: info edit lands in the YAML', (await text()).includes('title: Pet Store Edited'))
  await ed.locator('.oa-tree__section', { hasText: 'Paths' }).locator('.oa-tree__add').click()
  await settle()
  await ed.locator('.oa-editor__form .uid-input-field input').first().fill('List resources')
  await ed.locator('.oa-editor__form button', { hasText: 'Add parameter' }).click()
  await settle()
  const withOp = await text()
  check('editor: a new path, operation and parameter', withOp.includes('/resource:') && withOp.includes('summary: List resources') && /name: param1\s+in: query/.test(withOp))
  await ed.locator('.oa-tree__section', { hasText: 'Schemas' }).locator('.oa-tree__add').click()
  await settle()
  await ed.locator('.oa-editor__form button', { hasText: 'Add property' }).click()
  await settle()
  await ed.locator('.oa-editor__form .oa-es__prop .uid-checkbox__label').first().click()
  await settle()
  check('editor: a schema with a required property', /Model:[\s\S]*required:\s+- field1/.test(await text()))
  await ed.screenshot({ path: `${out}/editor-schema.png` })
  await ed.locator('.oa-segmented__item', { hasText: 'JSON' }).click()
  await settle()
  check('editor: switches the file to JSON', (await text()).trimStart().startsWith('{'))
  await ed.locator('.oa-segmented__item', { hasText: 'YAML' }).click()
  await settle()
  await ed.locator('.oa-segmented__item', { hasText: 'Source' }).click()
  const ta = ed.locator('.oa-source__textarea')
  const good = await ta.inputValue()
  await ta.fill(good.replace('openapi: 3.0.3', 'openapi: 3.0.3\n  bad: [unclosed'))
  await settle()
  check('editor: the source view shows a parse error with its line', /\d+:\d+/.test(await ed.locator('.oa-source__issues').innerText()))
  await ed.screenshot({ path: `${out}/editor-source.png` })
  await ta.fill(good)
  await settle()
  await ed.locator('.oa-segmented__item', { hasText: 'Preview' }).click()
  await ed.waitForSelector('.oa-editor__preview .oa-op')
  check('editor: preview shows the edited document', (await ed.locator('.oa-editor__preview').innerText()).includes('List resources'))
  await ed.goto(`${base}?mode=editor&spec=swagger`)
  await ed.locator('button', { hasText: 'Convert to OpenAPI 3.1' }).click()
  await settle()
  check('editor: converts Swagger 2.0 to 3.1', (await text()).includes('3.1.0'))
  await ed.goto(`${base}?mode=editor&spec=kitchen&theme=dark`)
  await ed.waitForSelector('.oa-editor__tree')
  await ed.locator('.oa-tree__item', { hasText: 'Create an order' }).click()
  await ed.waitForTimeout(300)
  await ed.screenshot({ path: `${out}/editor-dark.png` })
  check('editor: no page errors', edErrors.length === 0, edErrors.join('; '))
  await ed.close()
} finally {
  await browser.close()
  await server.close()
}

if (failures.length) {
  console.error(`${failures.length} check(s) failed`)
  process.exit(1)
}
