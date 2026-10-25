// Browser check of the Vue components: renders the fixture specs in both
// themes, drives search, samples and try-it (against a mocked API), and saves
// screenshots to tests/browser/output. Run after `pnpm install`; CI runs it.
// It builds dist/standalone.js first (a few seconds) so the standalone page
// is checked against the current sources; OA_CHECK_SKIP_BUILD=1 reuses the
// existing bundle.
import { Buffer } from 'node:buffer'
import { existsSync, mkdirSync } from 'node:fs'
import { deflateRawSync } from 'node:zlib'
import { resolve } from 'node:path'
import { build, createServer } from 'vite'
import { chromium } from 'playwright'

const root = resolve(import.meta.dirname, '..')
const out = resolve(root, 'tests/browser/output')
mkdirSync(out, { recursive: true })

if (!process.env.OA_CHECK_SKIP_BUILD || !existsSync(resolve(root, 'dist/standalone.js'))) {
  await build({ configFile: resolve(root, 'vite.standalone.config.ts'), root, logLevel: 'warn' })
}

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

  // Deep links: Scalar's anchors land on our sections.
  const inView = (pg, id) =>
    pg.evaluate((id) => {
      const el = document.getElementById(id)
      if (!el) return false
      const r = el.getBoundingClientRect()
      return r.top > -20 && r.top < window.innerHeight
    }, id)
  const lp = await browser.newPage({ viewport: { width: 1440, height: 1200 } })
  const lErrors = []
  lp.on('pageerror', (e) => lErrors.push(String(e)))
  await lp.goto(`${base}?spec=kitchen#v2/tag/orders/POST/v2/orders`)
  await lp.waitForSelector('.oa-op')
  await lp.waitForTimeout(800)
  check('scalar link: an operation (document segment, base path) in a single spec', await inView(lp, 'operation/createOrder'))
  check('scalar link: the address becomes canonical', (await lp.evaluate(() => window.location.hash)) === '#operation/createOrder')
  await lp.goto(`${base}?spec=kitchen#tag/orders/GET/orders/{orderId}`)
  await lp.waitForTimeout(800)
  check('scalar link: an operation without a document segment', await inView(lp, 'operation/getOrder'))
  await lp.goto(`${base}?spec=kitchen#model/order`)
  await lp.waitForTimeout(800)
  check('scalar link: a model opens the schema', await inView(lp, 'schema/Order'))
  await lp.goto(`${base}?multi=1#shop/tag/orders/POST/orders`)
  await lp.waitForSelector('[id="shop/operation/createOrder"]')
  await lp.waitForTimeout(800)
  check('scalar link: several specs, the document picks the spec', await inView(lp, 'shop/operation/createOrder'))
  await lp.goto(`${base}?multi=1#kitchen-sink/model/Order`)
  await lp.waitForSelector('[id="shop/schema/Order"]')
  await lp.waitForTimeout(800)
  check('scalar link: a document named by the slug of the spec name', await inView(lp, 'shop/schema/Order'))

  // Prefilled links fill the form and send nothing. The payload is made as PHP's gzdeflate would.
  const payload = (data) => 'z' + deflateRawSync(Buffer.from(JSON.stringify(data), 'utf8')).toString('base64url')
  let sent = 0
  await lp.route(/api\.example\.com|localhost:8080/, (route) => {
    sent++
    return route.fulfill({ status: 200, body: '{}' })
  })
  const order = { v: 1, vars: { region: 'us' }, header: { 'Idempotency-Key': 'from-link' }, body: '{\n  "note": "Привет"\n}' }
  await lp.goto(`${base}?spec=kitchen#operation/createOrder?f=${payload(order)}`)
  const created = lp.locator('[id="operation/createOrder"]')
  await created.locator('.oa-tryit__prefilled').waitFor()
  await lp.waitForTimeout(800)
  check('prefilled link: the header value is filled', (await created.locator('.oa-tryit__group input').first().inputValue()) === 'from-link')
  check('prefilled link: the body is filled', (await created.locator('.oa-tryit__textarea').inputValue()) === order.body)
  check('prefilled link: the server variable is applied', (await created.locator('.oa-samples').innerText()).includes('us.api.example.com'))
  check('prefilled link: the try-it panel is in view', await created.locator('.oa-tryit').evaluate((el) => {
    const r = el.getBoundingClientRect()
    return r.top > -20 && r.top < window.innerHeight
  }))
  check('prefilled link: the payload leaves the address', (await lp.evaluate(() => window.location.hash)) === '#operation/createOrder')
  check('prefilled link: nothing is sent', sent === 0, `${sent} request(s)`)
  await lp.screenshot({ path: `${out}/prefilled.png` })
  await created.locator('.oa-tryit__prefilled button').first().click()
  check('prefilled link: the notice can be dismissed', (await created.locator('.oa-tryit__prefilled').count()) === 0)
  // The last operation of the spec, far below, through the query parameter.
  await lp.goto(`${base}?spec=kitchen&oa-f=${payload({ v: 1, query: { form: 'a,b' }, header: { 'x-trace': 't-9' } })}#operation/paramStyles`)
  const styles = lp.locator('[id="operation/paramStyles"]')
  await styles.locator('.oa-tryit__prefilled').waitFor()
  await lp.waitForTimeout(500)
  const styleValues = await styles.locator('.oa-tryit__group input').evaluateAll((els) => els.map((el) => el.value))
  check('prefilled link: an operation far down, payload as ?oa-f=', styleValues.includes('t-9') && styleValues.includes('a,b'), styleValues.join(' | '))
  check('prefilled link: the query parameter leaves the address', !(await lp.evaluate(() => window.location.search)).includes('oa-f'))
  check('prefilled link: still nothing is sent', sent === 0, `${sent} request(s)`)
  check('links: no page errors', lErrors.length === 0, lErrors.join('; '))
  await lp.close()

  // "Copy link" round trip: the copied link fills the same form elsewhere; credentials stay out by default.
  const cc = await browser.newContext({ viewport: { width: 1440, height: 1200 }, permissions: ['clipboard-read', 'clipboard-write'] })
  const cp = await cc.newPage()
  await cp.goto(`${base}?multi=1#shop/operation/createOrder`)
  const source = cp.locator('[id="shop/operation/createOrder"]')
  await source.locator('.oa-tryit').waitFor()
  await cp.locator('.oa-auth .oa-panel__head').click()
  await cp.locator('.oa-auth input').first().fill('secret-token')
  await source.locator('.oa-tryit__group input').first().fill('copied-key')
  await source.locator('.oa-tryit__textarea').fill('{"copied": true}')
  await source.locator('.oa-share__copy').click()
  await source.locator('.oa-share__done').waitFor()
  const link = await cp.evaluate(() => window.navigator.clipboard.readText())
  check('copy link: the link names the operation', link.includes('#shop/operation/createOrder?f=z'), link.slice(0, 120))
  const cp2 = await cc.newPage()
  await cp2.goto(link)
  const target = cp2.locator('[id="shop/operation/createOrder"]')
  await target.locator('.oa-tryit__prefilled').waitFor()
  check('copy link: the header comes back', (await target.locator('.oa-tryit__group input').first().inputValue()) === 'copied-key')
  check('copy link: the body comes back', (await target.locator('.oa-tryit__textarea').inputValue()) === '{"copied": true}')
  await cp2.locator('.oa-auth .oa-panel__head').click()
  check('copy link: credentials are left out by default', (await cp2.locator('.oa-auth input').first().inputValue()) === '')
  await source.locator('.oa-share__creds').click()
  check('copy link: a warning goes with credentials', (await source.locator('.oa-share .oa-tryit__warn').count()) === 1)
  await source.locator('.oa-share__copy').click()
  await cp.waitForTimeout(200)
  const withCreds = await cp.evaluate(() => window.navigator.clipboard.readText())
  await cp2.goto('about:blank')
  await cp2.goto(withCreds)
  await cp2.locator('[id="shop/operation/createOrder"] .oa-tryit__prefilled').waitFor()
  await cp2.locator('.oa-auth .oa-panel__head').click()
  check('copy link: credentials travel when ticked', (await cp2.locator('.oa-auth input').first().inputValue()) === 'secret-token')
  await cc.close()
  // The standalone bundle (built above) in a plain page: one script, two specs by URL.
  const sa = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  const saErrors = []
  sa.on('pageerror', (e) => saErrors.push(String(e)))
  sa.on('console', (m) => m.type() === 'error' && saErrors.push(m.text()))
  const html = (name) => sa.evaluate((n) => document.documentElement.getAttribute(n), name)
  const pageBg = () => sa.evaluate(() => window.getComputedStyle(document.querySelector('.oa-page')).backgroundColor)
  await sa.goto(`${base}standalone.html`)
  await sa.waitForSelector('.oa-op')
  check('standalone: renders from one script', (await sa.locator('.oa-intro h1').innerText()).includes('Petstore'))
  check('standalone: the title goes to the bar and the document', (await sa.locator('.oa-page__title').innerText()) === 'Example APIs' && (await sa.title()) === 'Example APIs')
  check('standalone: the styles are injected', (await sa.locator('style[data-dsk-openapi]').count()) === 1)
  const barHeight = await sa.locator('.oa-page__bar').evaluate((el) => el.offsetHeight)
  const stickyTop = await sa.locator('.oa-nav').evaluate((el) => window.getComputedStyle(el).top)
  check('standalone: the navigation sticks below the bar', barHeight > 0 && stickyTop === `${barHeight}px`, `${stickyTop} vs ${barHeight}px`)
  await sa.mouse.wheel(0, 1500)
  await sa.waitForTimeout(200)
  const navTop = await sa.locator('.oa-nav').evaluate((el) => el.getBoundingClientRect().top)
  check('standalone: the bar stays on top while scrolling', Math.round(navTop) === barHeight && (await sa.locator('.oa-page__bar').evaluate((el) => el.getBoundingClientRect().top)) === 0, `nav at ${navTop}`)
  await sa.screenshot({ path: `${out}/standalone-light.png` })

  const lightBg = await pageBg()
  await sa.locator('[data-theme-option="dark"]').click()
  const darkBg = await pageBg()
  check('standalone: the dark theme sets data-theme and the colors', (await html('data-theme')) === 'dark' && darkBg !== lightBg, `${lightBg} → ${darkBg}`)
  check('standalone: the theme switch reports its state', (await sa.locator('[data-theme-option="dark"]').getAttribute('aria-checked')) === 'true')
  await sa.screenshot({ path: `${out}/standalone-dark.png` })
  await sa.emulateMedia({ colorScheme: 'light' })
  await sa.locator('[data-theme-option="system"]').click()
  const sysLight = await html('data-theme')
  await sa.emulateMedia({ colorScheme: 'dark' })
  await sa.waitForTimeout(100)
  check('standalone: system follows prefers-color-scheme live', sysLight === 'light' && (await html('data-theme')) === 'dark')
  await sa.locator('[data-theme-option="system"]').press('ArrowLeft')
  check('standalone: arrow keys move the theme choice', (await html('data-theme')) === 'dark' && (await sa.locator('[data-theme-option="dark"]').evaluate((el) => el === document.activeElement)))
  await sa.evaluate(() => window.__reference.setTheme('light'))
  await sa.waitForTimeout(50)
  check('standalone: setTheme() from the API', (await html('data-theme')) === 'light')

  await sa.locator('[data-locale-option="ru"]').click()
  check('standalone: the language switch changes the labels', (await sa.locator('.oa-nav__search input').getAttribute('placeholder')) === 'Поиск' && (await html('lang')) === 'ru')
  check('standalone: the bar follows the language', (await sa.locator('.oa-page__theme').getAttribute('aria-label')) === 'Тема')
  await sa.evaluate(() => window.__reference.setLocale('en'))
  await sa.waitForTimeout(50)
  check('standalone: setLocale() from the API', (await sa.locator('.oa-nav__search input').getAttribute('placeholder')) === 'Search')

  await sa.locator('.oa-nav__specs').click()
  await sa.locator('[role="option"]', { hasText: 'Kitchen Sink' }).click()
  await sa.waitForFunction(() => document.querySelector('.oa-intro h1')?.textContent?.includes('Kitchen'))
  check('standalone: the second source opens', (await sa.locator('.oa-op').first().getAttribute('id'))?.startsWith('kitchen/operation/') === true)
  check('standalone: no page errors', saErrors.length === 0, saErrors.join('; '))
  await sa.close()

  // Try-it through the proxy: the request goes there as JSON, the answer is shown.
  const px = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  let proxied = null
  // By path: a glob would also catch the page itself, whose query ends in /api-proxy.
  await px.route((u) => u.pathname === '/api-proxy', async (route) => {
    proxied = JSON.parse(route.request().postData() ?? 'null')
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ status: 202, statusText: 'Accepted', headers: [['content-type', 'application/json']], body: '{"via":"proxy"}', duration: 5 }) })
  })
  await px.goto(`${base}standalone.html?proxy=/api-proxy`)
  await px.waitForSelector('.oa-op')
  const pop = px.locator('.oa-op').first()
  await pop.locator('.oa-tryit button', { hasText: 'Send' }).click()
  await pop.locator('.oa-tryit__response .oa-status').waitFor()
  check('standalone: try-it posts the HttpRequest to the proxy', !!proxied && typeof proxied.method === 'string' && /^https?:\/\//.test(proxied.url) && Array.isArray(proxied.headers), proxied?.url)
  check('standalone: try-it shows the proxied response', (await pop.locator('.oa-tryit__response .oa-status').innerText()).startsWith('202'))
  await px.close()

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
