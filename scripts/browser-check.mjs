// Browser check of the Vue components: renders the fixture specs in both
// themes, drives search, samples and try-it (against a mocked API), and saves
// screenshots to tests/browser/output. Run after `pnpm install`; CI runs it.
// It builds dist/standalone.js first (a few seconds) so the standalone page
// is checked against the current sources; OA_CHECK_SKIP_BUILD=1 reuses the
// existing bundle.
import { Buffer } from 'node:buffer'
import { existsSync, mkdirSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
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
// Server and credentials live in the header's settings drawer.
const openSettings = async (pg) => {
  await pg.locator('.oa-header__settings').click()
  await pg.locator('.oa-settings').waitFor()
}
const closeSettings = async (pg) => {
  await pg.keyboard.press('Escape')
  await pg.locator('.oa-settings').waitFor({ state: 'detached' }).catch(() => {})
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
  await op.locator('.oa-side-tabs__tab[data-tab="code"]').click()
  await op.locator('.oa-samples .uid-select').first().click()
  await page.locator('[role="option"]', { hasText: 'Python' }).first().click()
  const python = await op.locator('.oa-samples').innerText()
  await op.locator('.oa-side-tabs__tab[data-tab="try"]').click()
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
  await openSettings(mp)
  await mp.locator('.oa-auth input').first().fill('pets-token')
  await closeSettings(mp)
  await mp.locator('.oa-nav__specs').click()
  await mp.locator('[role="option"]', { hasText: 'Swagger 2.0' }).click()
  await mp.waitForSelector('.oa-op')
  check('several specs: a loader spec opens on demand', (await mp.locator('.oa-intro .oa-chip-static--muted').innerText()).includes('2.0'))
  check('several specs: deep links carry the spec id', (await mp.locator('.oa-op').first().getAttribute('id'))?.startsWith('legacy/operation/') === true)
  await mp.locator('.oa-nav__specs').click()
  await mp.locator('[role="option"]').first().click()
  await mp.waitForSelector('.oa-op')
  await openSettings(mp)
  check('several specs: credentials are kept per spec', (await mp.locator('.oa-auth input').first().inputValue()) === 'pets-token')
  await closeSettings(mp)
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
  check('prefilled link: the body shows in the form', (await created.locator('.oa-tryit__form .oa-field[data-field="note"] input').inputValue()) === 'Привет')
  await created.locator('.oa-tryit [data-view="json"]').click()
  check('prefilled link: the body is filled', (await created.locator('.oa-tryit__textarea').inputValue()) === order.body)
  await created.locator('.oa-side-tabs__tab[data-tab="code"]').click()
  check('prefilled link: the server variable is applied', (await created.locator('.oa-samples').innerText()).includes('us.api.example.com'))
  await created.locator('.oa-side-tabs__tab[data-tab="try"]').click()
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
  const formTags = await styles.locator('.oa-field[data-field="form"] .uid-tags-input__chip > span').allInnerTexts()
  check('prefilled link: an operation far down, payload as ?oa-f=', styleValues.includes('t-9') && formTags.join(',') === 'a,b', `${styleValues.join(' | ')} / ${formTags.join(',')}`)
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
  await openSettings(cp)
  await cp.locator('.oa-auth input').first().fill('secret-token')
  await closeSettings(cp)
  await source.locator('.oa-tryit__group input').first().fill('copied-key')
  await source.locator('.oa-tryit [data-view="json"]').click()
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
  await target.locator('.oa-tryit [data-view="json"]').click()
  check('copy link: the body comes back', (await target.locator('.oa-tryit__textarea').inputValue()) === '{"copied": true}')
  await openSettings(cp2)
  check('copy link: credentials are left out by default', (await cp2.locator('.oa-auth input').first().inputValue()) === '')
  await closeSettings(cp2)
  await source.locator('.oa-share__creds').click()
  check('copy link: a warning goes with credentials', (await source.locator('.oa-share .oa-tryit__warn').count()) === 1)
  await source.locator('.oa-share__copy').click()
  await cp.waitForTimeout(200)
  const withCreds = await cp.evaluate(() => window.navigator.clipboard.readText())
  await cp2.goto('about:blank')
  await cp2.goto(withCreds)
  await cp2.locator('[id="shop/operation/createOrder"] .oa-tryit__prefilled').waitFor()
  await openSettings(cp2)
  check('copy link: credentials travel when ticked', (await cp2.locator('.oa-auth input').first().inputValue()) === 'secret-token')
  await closeSettings(cp2)
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
  check('standalone: the title goes to the bar and the document', (await sa.locator('.oa-header__name').innerText()) === 'Example APIs' && (await sa.title()) === 'Example APIs')
  check('standalone: the styles are injected', (await sa.locator('style[data-dsk-openapi]').count()) === 1)
  const barHeight = await sa.locator('.oa-header').evaluate((el) => el.offsetHeight)
  const stickyTop = await sa.locator('.oa-nav').evaluate((el) => window.getComputedStyle(el).top)
  check('standalone: the navigation sticks below the bar', barHeight > 0 && stickyTop === `${barHeight}px`, `${stickyTop} vs ${barHeight}px`)
  await sa.mouse.wheel(0, 1500)
  await sa.waitForTimeout(200)
  const navTop = await sa.locator('.oa-nav').evaluate((el) => el.getBoundingClientRect().top)
  check('standalone: the bar stays on top while scrolling', Math.round(navTop) === barHeight && (await sa.locator('.oa-header').evaluate((el) => el.getBoundingClientRect().top)) === 0, `nav at ${navTop}`)
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
  check('standalone: the language switch changes the labels', (await sa.locator('.oa-nav__search input').getAttribute('placeholder'))?.startsWith('Поиск') && (await html('lang')) === 'ru')
  check('standalone: the bar follows the language', (await sa.locator('.oa-page__theme').getAttribute('aria-label')) === 'Тема')
  await sa.evaluate(() => window.__reference.setLocale('en'))
  await sa.waitForTimeout(50)
  check('standalone: setLocale() from the API', (await sa.locator('.oa-nav__search input').getAttribute('placeholder'))?.startsWith('Search'))

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
  // Search and named examples.
  const sp = await browser.newPage({ viewport: { width: 1440, height: 1200 } })
  const spErrors = []
  sp.on('pageerror', (e) => spErrors.push(String(e)))
  await sp.goto(`${base}?spec=kitchen`)
  await sp.waitForSelector('.oa-op')
  await sp.locator('.oa-intro h1').click()
  await sp.keyboard.press('Control+k')
  const focused = await sp.evaluate(() => document.activeElement?.closest('.oa-nav__search') !== null && document.activeElement?.tagName === 'INPUT')
  check('search: Ctrl+K focuses the search', focused)
  await sp.locator('.oa-intro h1').click()
  await sp.keyboard.press('/')
  check('search: / focuses the search', await sp.evaluate(() => !!document.activeElement?.closest('.oa-nav__search')))
  // "tokenized" is only in the description of "Pay for an order".
  await sp.keyboard.type('tokenized')
  await sp.waitForSelector('.oa-search__hit')
  const firstHit = await sp.locator('.oa-search__hit').first().innerText()
  check('search: a word of a description finds its operation', firstHit.includes('Pay for an order') && (await sp.locator('.oa-search__hit mark').first().innerText()) === 'tokenized', firstHit)
  check('search: the navigation keeps the operation', (await sp.locator('.oa-nav__op').allInnerTexts()).some((t) => t.includes('Pay for an order')))
  await sp.screenshot({ path: `${out}/search.png` })
  await sp.keyboard.press('Enter')
  await sp.waitForTimeout(600)
  const payTarget = sp.locator('[id="operation/createPayment"]')
  const box = await payTarget.boundingBox()
  check('search: Enter opens the operation', !!box && box.y >= -2 && box.y < 200 && (await sp.locator('.oa-search__results').count()) === 0, JSON.stringify(box))

  // A response with nothing but a description is a plain row.
  const hooks = sp.locator('.oa-op').filter({ hasText: 'An order was paid' }).first()
  await hooks.scrollIntoViewIfNeeded()
  await hooks.locator('.oa-response__head').first().waitFor()
  check('responses: an empty one has nothing to open', (await hooks.locator('.oa-response__head--plain').count()) > 0 && (await hooks.locator('.oa-response__head--plain .oa-schema__chevron').count()) === 0)
  // An XML body is written as XML, not as "[object Object]".
  const xmlOp = sp.locator('[id="operation/createOrder"]')
  await xmlOp.scrollIntoViewIfNeeded()
  await xmlOp.locator('.oa-tryit .oa-tryit__media').first().click()
  await sp.locator('[role="option"]', { hasText: 'application/xml' }).first().click()
  const xmlText = await xmlOp.locator('.oa-tryit__textarea').inputValue()
  check('try-it: an XML body is XML', xmlText.trimStart().startsWith('<') && !xmlText.includes('[object Object]'), xmlText.slice(0, 60))

  // A response with named examples: the chips switch the code.
  const list = sp.locator('[id="operation/listOrders"]')
  await list.scrollIntoViewIfNeeded()
  check('responses: folded by default', (await list.locator('.oa-response__body').count()) === 0)
  await list.locator('button.oa-response__head').first().click()
  await list.locator('.oa-response__example').first().waitFor()
  // The code block fills in after it mounts: wait for its text.
  const exampleCode = async () => {
    const code = list.locator('.oa-response .oa-response__example').first()
    for (let i = 0; i < 20; i++) {
      const t = await code.innerText()
      if (t.includes('{')) return t
      await sp.waitForTimeout(100)
    }
    return code.innerText()
  }
  const firstExample = await exampleCode()
  await list.locator('.oa-response .oa-examples__names .oa-chip', { hasText: 'No orders yet' }).click()
  const emptyExample = await exampleCode()
  check('examples: a named response example can be chosen', firstExample.includes('6f1c1b7e') && !emptyExample.includes('6f1c1b7e') && emptyExample.includes('"data"'), JSON.stringify([firstExample.slice(0, 80), emptyExample.slice(0, 80)]))
  check('examples: the example description is shown', (await list.locator('.oa-response .oa-examples').first().innerText()).includes('cursor'))
  await list.locator('.oa-response .oa-examples__names .oa-chip', { hasText: 'Archived orders' }).click()
  check('examples: an external example is a link', (await list.locator('.oa-examples__external a').getAttribute('href')) === 'https://example.com/examples/orders-archive.json')

  // Try it: the example select replaces the body.
  const pay = sp.locator('[id="operation/createPayment"]')
  await pay.scrollIntoViewIfNeeded()
  const textarea = pay.locator('.oa-tryit__textarea')
  check('examples: the form starts with the first example', (await pay.locator('.oa-tryit__form .oa-field[data-field="number"] input').inputValue()) === '4242424242424242')
  await pay.locator('.oa-tryit [data-view="json"]').click()
  check('examples: try-it starts with the first example', (await textarea.inputValue()).includes('4242424242424242'))
  await pay.locator('.oa-tryit__example .uid-select').click()
  await sp.locator('[role="option"]', { hasText: 'Bank transfer' }).click()
  check('examples: try-it example select replaces the body', (await textarea.inputValue()).includes('DE89370400440532013000'))
  await pay.locator('.oa-tryit [data-view="form"]').click()
  const bankValues = await pay.locator('.oa-tryit__form input').evaluateAll((els) => els.map((el) => el.value))
  check('examples: the form follows the chosen example', bankValues.includes('DE89370400440532013000'), bankValues.join(' | '))
  await pay.locator('.oa-tryit [data-view="json"]').click()
  await pay.locator('.oa-tryit__example .uid-select').click()
  await sp.locator('[role="option"]', { hasText: 'Generated sample' }).click()
  check('examples: try-it offers the generated sample', !(await textarea.inputValue()).includes('DE89370400440532013000'))

  // A parameter's examples fill its try-it field.
  const styleOp = sp.locator('[id="operation/paramStyles"]')
  await styleOp.scrollIntoViewIfNeeded()
  await styleOp.locator('.oa-param__examples .oa-chip', { hasText: 'long' }).click()
  const traceValue = await styleOp.locator('.oa-tryit .oa-field[data-field="X-Trace"] input').inputValue()
  check('examples: a parameter example fills try-it', traceValue === 'abcdef0123456789', traceValue)
  await sp.screenshot({ path: `${out}/examples.png` })
  check('search and examples: no page errors', spErrors.length === 0, spErrors.join('; '))
  await sp.close()
  // OAuth in the browser: a mock identity provider on the playground's origin.
  const oc = await browser.newContext({ viewport: { width: 1440, height: 1400 } })
  const op2 = await oc.newPage()
  const oErrors = []
  op2.on('pageerror', (e) => oErrors.push(String(e)))
  const idp = { authorize: [], token: [], api: [] }
  await oc.route('**/mock-idp/authorize**', async (route) => {
    const q = Object.fromEntries(new URL(route.request().url()).searchParams)
    idp.authorize.push(q)
    const back =
      q.client_id === 'deny'
        ? `${q.redirect_uri}?error=access_denied&error_description=${encodeURIComponent('The user said no')}&state=${q.state}`
        : q.response_type === 'token'
          ? `${q.redirect_uri}#access_token=implicit-token&token_type=Bearer&expires_in=1800&state=${q.state}`
          : `${q.redirect_uri}?code=code-${idp.authorize.length}&state=${q.state}`
    await route.fulfill({ status: 302, headers: { location: back } })
  })
  await oc.route('**/mock-idp/token', async (route) => {
    const form = Object.fromEntries(new URL(`http://form/?${route.request().postData() ?? ''}`).searchParams)
    idp.token.push(form)
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ access_token: `token-for-${form.code}`, token_type: 'Bearer', expires_in: 3600 }),
    })
  })
  await oc.route('**/mock-idp/.well-known/openid-configuration', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        authorization_endpoint: `${base}mock-idp/authorize`,
        token_endpoint: `${base}mock-idp/token`,
        scopes_supported: ['openid', 'email'],
        response_types_supported: ['code'],
      }),
    }),
  )
  await oc.route('**/mock-api/**', async (route) => {
    idp.api.push(route.request().headers())
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' })
  })
  // Sends from the page with the settings drawer closed, then opens it again.
  const sendFrom = async (summary) => {
    await closeSettings(op2)
    const o = op2.locator('.oa-op').filter({ hasText: summary }).first()
    const n = idp.api.length
    await o.locator('.oa-tryit button', { hasText: 'Send' }).click()
    for (let i = 0; i < 50 && idp.api.length === n; i++) await op2.waitForTimeout(100)
    await openSettings(op2)
    return idp.api.length > n ? idp.api[idp.api.length - 1].authorization : undefined
  }
  const waitToken = async (scheme) => {
    const status = op2.locator(`.oa-auth__scheme[data-scheme="${scheme}"] .oa-auth__status`)
    await status.waitFor({ timeout: 10000 }).catch(() => {})
    return status.innerText().catch(() => '')
  }
  await op2.goto(`${base}?spec=oauth`)
  await op2.waitForSelector('.oa-op')
  await openSettings(op2)
  const oauthBox = op2.locator('.oa-auth__scheme[data-scheme="oauth"]')
  await oauthBox.locator('.oa-auth__oauth input').first().fill('docs-app')
  await oauthBox.locator('.uid-checkbox', { hasText: 'orders' }).locator('.uid-checkbox__label').click()
  await oauthBox.locator('.oa-auth__authorize').click()
  const codeStatus = await waitToken('oauth')
  const auth = idp.authorize[0] ?? {}
  const tok = idp.token[0] ?? {}
  const { createHash } = await import('node:crypto')
  const s256 = (v) => createHash('sha256').update(v).digest('base64url')
  check(
    'oauth code: the authorize request carries PKCE, state and the checked scopes',
    auth.response_type === 'code' && auth.code_challenge_method === 'S256' && !!auth.state && auth.client_id === 'docs-app' && auth.scope === 'profile' && auth.redirect_uri === base,
    JSON.stringify(auth),
  )
  check(
    'oauth code: the token request sends the code and the verifier',
    tok.grant_type === 'authorization_code' && tok.code === 'code-1' && !!tok.code_verifier && s256(tok.code_verifier) === auth.code_challenge && tok.redirect_uri === base && !tok.client_secret,
    JSON.stringify(tok),
  )
  check('oauth code: the token shows its expiry', /expires in 60 min/.test(codeStatus), codeStatus)
  check('oauth code: try-it sends the bearer token', (await sendFrom('Who am I (OAuth2)')) === 'Bearer token-for-code-1')

  await oauthBox.locator('[data-flow="implicit"]').click()
  await oauthBox.locator('.oa-auth__authorize').click()
  await op2
    .waitForFunction(() => document.querySelector('.oa-auth__scheme[data-scheme="oauth"] .oa-auth__expiry')?.textContent?.includes('30 min'), null, { timeout: 10000 })
    .catch(() => {})
  check('oauth implicit: response_type=token without a challenge', idp.authorize[1]?.response_type === 'token' && !idp.authorize[1]?.code_challenge)
  check('oauth implicit: try-it sends the token from the fragment', (await sendFrom('Who am I (OAuth2)')) === 'Bearer implicit-token')

  await oauthBox.locator('.oa-auth__logout').click()
  check('oauth: log out clears the token', (await oauthBox.locator('.oa-auth__token input').inputValue()) === '')

  await oauthBox.locator('[data-flow="authorizationCode"]').click()
  await oauthBox.locator('.oa-auth__oauth input').first().fill('deny')
  await oauthBox.locator('.oa-auth__authorize').click()
  await oauthBox.locator('.oa-auth__error').waitFor({ timeout: 10000 }).catch(() => {})
  const denied = await oauthBox.locator('.oa-auth__error').innerText().catch(() => '')
  check('oauth: the provider error is shown', denied.includes('access_denied') && denied.includes('The user said no'), denied)

  const oidcBox = op2.locator('.oa-auth__scheme[data-scheme="openId"]')
  await oidcBox.locator('.uid-checkbox', { hasText: 'email' }).waitFor({ timeout: 5000 }).catch(() => {})
  check('openIdConnect: discovery offers its scopes', (await oidcBox.locator('.uid-checkbox').count()) === 2)
  await oidcBox.locator('.oa-auth__oauth input').first().fill('oidc-app')
  const tokensBefore = idp.token.length
  await oidcBox.locator('.oa-auth__authorize').click()
  await waitToken('openId')
  check(
    'openIdConnect: code flow against the discovered endpoints',
    idp.token[tokensBefore]?.client_id === 'oidc-app' && idp.authorize.at(-1)?.scope === 'openid email',
  )
  check('openIdConnect: try-it sends the token', ((await sendFrom('Who am I (OpenID Connect)')) ?? '').startsWith('Bearer token-for-code-'))
  await op2.locator('.oa-auth').screenshot({ path: `${out}/auth-oauth.png` })

  // The relay: a page opened as a popup with an OAuth response posts it to its opener.
  const relayed = await op2.evaluate(
    () =>
      new Promise((resolve) => {
        window.addEventListener('message', (e) => {
          if (e.data?.type === 'dsk-openapi-oauth') resolve({ origin: e.origin, ...e.data })
        })
        window.open(`${window.location.origin}/?spec=petstore&code=relayed&state=st-1`, 'relay-test')
        window.setTimeout(() => resolve(null), 8000)
      }),
  )
  check(
    'oauth: a redirected popup relays the response to its opener',
    relayed?.code === 'relayed' && relayed?.state === 'st-1' && relayed?.origin === base.slice(0, -1),
    JSON.stringify(relayed),
  )
  check('oauth: no page errors', oErrors.length === 0, oErrors.join('; '))
  await op2.close()

  // Persisted credentials: kept across a reload, gone after Forget.
  const pp = await oc.newPage()
  const keyInput = () => pp.locator('.oa-auth__scheme[data-scheme="apiKey"] .oa-auth__token input')
  const openAuth = async () => {
    await pp.waitForSelector('.oa-op')
    await openSettings(pp)
  }
  await pp.goto(`${base}?spec=oauth&persist=local`)
  await openAuth()
  check('persist: the panel says where credentials are kept', await pp.locator('.oa-auth__persist', { hasText: 'Saved in this browser' }).isVisible())
  await keyInput().fill('kept-key')
  await pp.waitForTimeout(200)
  await pp.reload()
  await openAuth()
  check('persist: an API key survives a reload', (await keyInput().inputValue()) === 'kept-key')
  const stored = await pp.evaluate(() => Object.keys(window.localStorage).filter((k) => k.startsWith('dsk-openapi:credentials:')))
  check('persist: stored under the spec id and title', stored.includes('dsk-openapi:credentials:spec:OAuth Playground'), stored.join(', '))
  await pp.locator('.oa-auth__forget').click()
  check('persist: Forget clears the field', (await keyInput().inputValue()) === '')
  await pp.reload()
  await openAuth()
  check('persist: Forget clears the storage', (await keyInput().inputValue()) === '' && (await pp.evaluate(() => window.localStorage.length)) === 0)
  await pp.close()
  await oc.close()
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
  await up.locator('.oa-side-tabs__tab[data-tab="code"]').click()
  check('files: the sample names the chosen file', (await up.locator('.oa-samples').innerText()).includes('photo.png'))
  await up.locator('.oa-side-tabs__tab[data-tab="try"]').click()
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
    await up.locator('.oa-side-tabs__tab[data-tab="code"]').click()
    await up.locator('.oa-samples .uid-select').first().click()
    await fp.locator('[role="option"]', { hasText: 'cURL' }).first().click()
    const text = await up.locator('.oa-samples').innerText()
    await up.locator('.oa-side-tabs__tab[data-tab="try"]').click()
    return text.includes("--data-binary '@blob.bin'")
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
  const orderOp = fp.locator('.oa-op').filter({ hasText: 'Create an order' }).first()
  await orderOp.scrollIntoViewIfNeeded()
  await fp.route('**/v2/orders**', (route) => route.fulfill({ status: 201, contentType: 'application/json', body: '{"id":"o-1"}' }))
  await orderOp.locator('.oa-tryit button', { hasText: 'Send' }).click()
  await orderOp.locator('.oa-tryit__response .oa-status').waitFor()
  const prettyText = await orderOp.locator('.oa-tryit__response .uid-code').innerText()
  await orderOp.locator('.oa-tryit__view .oa-chip', { hasText: 'Raw' }).click()
  const rawText = await orderOp.locator('.oa-tryit__response .uid-code').innerText()
  check('response: JSON pretty and raw', prettyText.includes('"id": "o-1"') && rawText.includes('{"id":"o-1"}'))
  await fp.unrouteAll({ behavior: 'ignoreErrors' })

  // The spec downloads as the source document.
  await fp.evaluate(() => window.scrollTo(0, 0))
  const [yamlDl] = await Promise.all([fp.waitForEvent('download'), fp.locator('.oa-header__download[data-format="yaml"]').click()])
  const yamlText = await readFile(await yamlDl.path(), 'utf8')
  check('download spec: YAML', yamlDl.suggestedFilename() === 'kitchen-sink-api-2.3.0.yaml' && yamlText.startsWith('openapi'), yamlDl.suggestedFilename())
  const [jsonDl] = await Promise.all([fp.waitForEvent('download'), fp.locator('.oa-header__download[data-format="json"]').click()])
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

  // Try-it forms: a JSON body as a form, typed parameter inputs, custom headers, the request preview, narrow panels.
  const tf = await browser.newPage({ viewport: { width: 1440, height: 1600 } })
  const tfErrors = []
  tf.on('pageerror', (e) => tfErrors.push(String(e)))
  await tf.goto(`${base}?spec=kitchen#operation/createOrder`)
  const co = tf.locator('[id="operation/createOrder"]')
  await co.locator('.oa-tryit__form').waitFor()
  check('try-it form: a JSON body opens as a form', (await co.locator('.oa-tryit__textarea').count()) === 0)
  await co.locator('.oa-sf[data-path="total"] .oa-field[data-field="amount"] input').fill('42.50')
  await co.locator('.oa-sf[data-path="status"] .uid-select').click()
  await tf.locator('[role="option"]', { hasText: 'paid' }).click()
  const itemsGroup = co.locator('.oa-sf[data-path="items"]')
  await itemsGroup.locator('> .oa-sf__body > .oa-sf__more').click()
  const secondItem = itemsGroup.locator('> .oa-sf__body > .oa-sf--group').nth(1)
  await secondItem.locator('.oa-field[data-field="sku"] input').fill('SKU-2')
  await secondItem.locator('.oa-field[data-field="quantity"] input').fill('3')
  await co.locator('.oa-tryit [data-view="json"]').click()
  const typed = JSON.parse(await co.locator('.oa-tryit__textarea').inputValue())
  check(
    'try-it form: nested fields, an enum and an added array item land in the JSON',
    typed.total?.amount === '42.50' && typed.status === 'paid' && typed.items?.length === 2 && typed.items[1].sku === 'SKU-2' && typed.items[1].quantity === 3,
    JSON.stringify(typed).slice(0, 200),
  )
  check('try-it form: read-only properties are left out', typed.id === undefined && typed.createdAt === undefined)
  await co.locator('.oa-tryit__textarea').fill('{"status": ')
  await co.locator('.oa-tryit [data-view="form"]').click({ force: true })
  check(
    'try-it form: invalid JSON stays in the JSON view',
    (await co.locator('.oa-tryit__textarea').count()) === 1 && (await co.locator('.oa-tryit__warn').count()) === 1 && (await co.locator('.oa-tryit [data-view="form"]').isDisabled()),
  )
  await co.locator('.oa-tryit__textarea').fill(JSON.stringify(typed, null, 2))
  await co.locator('.oa-tryit [data-view="form"]').click()
  check('try-it form: back to the form, the values stay', (await co.locator('.oa-sf[data-path="total"] .oa-field[data-field="amount"] input').inputValue()) === '42.50')
  // A custom header goes along.
  await co.locator('.oa-tryit__group[data-loc="header"] .oa-tryit__add').click()
  await co.locator('.oa-kv__key input').fill('X-Debug')
  await co.locator('.oa-kv__value input').fill('on')
  // The preview offers the same: a second own header that replaces the generated Content-Type.
  await co.locator('.oa-preview__summary').click()
  await co.locator('.oa-preview__add').click()
  await co.locator('.oa-kv__key input').nth(1).fill('Content-Type')
  await co.locator('.oa-kv__value input').nth(1).fill('application/vnd.shop+json')
  await co.locator('.oa-preview__summary').click()
  let formSent = null
  await tf.route('**/v2/orders**', async (route) => {
    const r = route.request()
    formSent = { headers: r.headers(), body: JSON.parse(r.postData() ?? 'null') }
    await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: 'o-2', note: 'x'.repeat(400), url: `https://example.com/${'segment/'.repeat(40)}` }) })
  })
  await co.locator('.oa-tryit button', { hasText: 'Send' }).click()
  await co.locator('.oa-tryit__response .oa-status').waitFor()
  check('try-it form: the request carries the form body', formSent?.body?.items?.[1]?.sku === 'SKU-2' && formSent?.body?.total?.amount === '42.50')
  check('try-it form: a custom header is sent', formSent?.headers['x-debug'] === 'on', JSON.stringify(formSent?.headers ?? {}))
  check('try-it form: an own Content-Type replaces the generated one', formSent?.headers['content-type'] === 'application/vnd.shop+json', formSent?.headers['content-type'])
  check('try-it form: the response body is a wrapped code block', (await co.locator('.oa-tryit__response .oa-code').count()) === 1)
  // The preview: closed to one line, open to the URL and headers.
  const preview = co.locator('.oa-preview')
  const summary = await preview.locator('.oa-preview__summary').innerText()
  check('preview: one line with the method, URL and header count', /POST/.test(summary) && /orders/.test(summary) && /headers: \d/.test(summary), summary)
  await preview.locator('.oa-preview__summary').click()
  const previewText = await preview.locator('.oa-preview__headers').innerText()
  check('preview: lists the custom header', previewText.includes('X-Debug') && previewText.includes('on'))

  // Narrow panels: nothing overflows sideways at 340px, response shown and preview open.
  const overflow = (loc) =>
    loc.evaluate((el) => {
      const right = el.getBoundingClientRect().right
      const out = [...el.querySelectorAll('*')].filter((n) => n.getClientRects().length && n.getBoundingClientRect().right > right + 1 && !n.closest('.oa-preview__line')).map((n) => n.className)
      return { scroll: el.scrollWidth - el.clientWidth, out: out.slice(0, 5) }
    })
  for (const width of [340, 480]) {
    await co.locator('.oa-tryit').evaluate((el, w) => (el.style.width = `${w}px`), width)
    await tf.waitForTimeout(150)
    const o = await overflow(co.locator('.oa-tryit'))
    check(`try-it at ${width}px: no horizontal overflow`, o.scroll <= 0 && o.out.length === 0, JSON.stringify(o))
  }
  await co.locator('.oa-tryit').screenshot({ path: `${out}/tryit-form-narrow.png` })
  await co.locator('.oa-tryit').evaluate((el) => (el.style.width = ''))

  // Typed parameters: an array of an enum as a multi-select, a boolean with "not set", tags.
  await tf.goto(`${base}?spec=kitchen#operation/listOrders`)
  const lo = tf.locator('[id="operation/listOrders"]')
  await lo.locator('.oa-tryit').waitFor()
  await lo.locator('.oa-field[data-field="status"] .uid-select').click()
  await tf.locator('[role="option"]', { hasText: 'shipped' }).click()
  await tf.keyboard.press('Escape')
  await lo.locator('.oa-field[data-field="limit"] input').fill('7')
  await lo.locator('.oa-preview__summary').click()
  const listUrl = await lo.locator('.oa-preview__url').innerText()
  check('typed params: an enum via select and a number input', /status=shipped/.test(listUrl) && /limit=7/.test(listUrl), listUrl)
  await tf.goto(`${base}?spec=kitchen#operation/paramStyles`)
  const ps = tf.locator('[id="operation/paramStyles"]')
  await ps.locator('.oa-tryit').waitFor()
  await ps.locator('.oa-field[data-field="empty"] [data-value="true"]').click()
  await ps.locator('.oa-field[data-field="form"] input').fill('x')
  await ps.locator('.oa-field[data-field="form"] input').press('Enter')
  await ps.locator('.oa-field[data-field="form"] input').fill('y')
  await ps.locator('.oa-field[data-field="form"] input').press('Enter')
  await ps.locator('.oa-preview__summary').click()
  const psUrl = await ps.locator('.oa-preview__url').innerText()
  check('typed params: a boolean switch and array tags', /empty=true/.test(psUrl) && /form=x,y/.test(psUrl), psUrl)
  await ps.locator('.oa-field[data-field="empty"] [data-value="unset"]').click()
  check('typed params: an optional boolean can be unset', !/empty=/.test(await ps.locator('.oa-preview__url').innerText()))

  // Credentials from a prefilled link: the preview masks them.
  const linkPayload = 'j' + Buffer.from(JSON.stringify({ v: 1, auth: { bearer: 'tok-1234567890-abcd' } })).toString('base64url')
  await tf.goto(`${base}?spec=kitchen#operation/getOrder?f=${linkPayload}`)
  const go = tf.locator('[id="operation/getOrder"]')
  await go.locator('.oa-tryit__prefilled').waitFor()
  await go.locator('.oa-preview__summary').click()
  const masked = await go.locator('.oa-preview__headers').innerText()
  check('preview: Authorization is masked', masked.includes('Bearer ••••abcd') && !masked.includes('tok-1234'), masked)
  check('try-it forms: no page errors', tfErrors.length === 0, tfErrors.join('; '))
  await tf.close()

  // TypeScript types: a lazy side tab with name chips, and the whole document as a .d.ts download.
  const ty = await browser.newPage({ viewport: { width: 1440, height: 1600 }, permissions: ['clipboard-read', 'clipboard-write'], acceptDownloads: true })
  const tyErrors = []
  ty.on('pageerror', (e) => tyErrors.push(String(e)))
  await ty.goto(`${base}?spec=kitchen#operation/createOrder`)
  const tco = ty.locator('[id="operation/createOrder"]')
  await tco.locator('.oa-side-tabs').waitFor()
  check('types: generated only when the tab opens', (await ty.locator('.oa-types').count()) === 0)
  await tco.locator('.oa-side-tabs__tab[data-tab="types"]').click()
  await tco.locator('.oa-types .oa-code').waitFor()
  const tsCode = await tco.locator('.oa-types__code').evaluate((el) => el.textContent ?? '')
  check(
    'types: the operation code names its body and reaches the components',
    tsCode.includes('export type CreateOrderRequestBody = Order') && tsCode.includes('export interface Order {') && tsCode.includes('export interface CreateOrderHeaders'),
    tsCode.slice(0, 120),
  )
  check('types: only the opened operation generated its types', (await ty.locator('.oa-types').count()) === 1)
  await tco.locator('.oa-types__name[data-name="CreateOrderCreated"]').click()
  await tco.locator('.oa-types__copied').waitFor()
  check('types: a chip copies its name', (await ty.evaluate(() => window.navigator.clipboard.readText())) === 'CreateOrderCreated')
  await tco.locator('.oa-op__side').screenshot({ path: `${out}/types.png` })
  await tco.locator('.oa-side-tabs__tab[data-tab="try"]').click()
  check('types: the other tabs still switch', await tco.locator('.oa-tryit').isVisible() && !(await tco.locator('.oa-types').isVisible()))
  await ty.goto(`${base}?spec=kitchen#operation/orderPaidWebhook`)
  const hook = ty.locator('[id="operation/orderPaidWebhook"]')
  await hook.locator('.oa-side-tabs').waitFor()
  const hookTabs = await hook.locator('.oa-side-tabs__tab').evaluateAll((els) => els.map((el) => el.getAttribute('data-tab')).join(','))
  check('types: a webhook has the code and types tabs', hookTabs === 'code,types', hookTabs)
  await hook.locator('.oa-side-tabs__tab[data-tab="types"]').click()
  check('types: a webhook names its payload', (await hook.locator('.oa-types__code').evaluate((el) => el.textContent ?? '')).includes('OrderPaidWebhookRequestBody = OrderEvent'))
  await ty.evaluate(() => window.scrollTo(0, 0))
  const [tsDl] = await Promise.all([ty.waitForEvent('download'), ty.locator('.oa-header__download[data-format="ts"]').click()])
  const tsText = await readFile(await tsDl.path(), 'utf8')
  check(
    'download types: a .d.ts of the document',
    tsDl.suggestedFilename() === 'kitchen-sink-api-2.3.0.d.ts' && tsText.includes('export interface Order {') && tsText.includes('export type CreateOrderRequestBody'),
    tsDl.suggestedFilename(),
  )
  await openSettings(ty)
  const [tsDl2] = await Promise.all([ty.waitForEvent('download'), ty.locator('.oa-settings__downloads [data-format="ts"]').click()])
  check('download types: from the settings drawer too', tsDl2.suggestedFilename().endsWith('.d.ts') && (await readFile(await tsDl2.path(), 'utf8')).includes('export interface'))
  await closeSettings(ty)
  check('types: no page errors', tyErrors.length === 0, tyErrors.join('; '))
  await ty.close()
  // Embedded operations and printing. window.print of the print frame is replaced, so no dialog opens:
  // the call is recorded with the frame's title instead.
  const stubPrint = () => {
    const get = Object.getOwnPropertyDescriptor(window.HTMLIFrameElement.prototype, 'contentWindow').get
    Object.defineProperty(window.HTMLIFrameElement.prototype, 'contentWindow', {
      configurable: true,
      get() {
        const win = get.call(this)
        if (win && this.hasAttribute('data-oa-print')) win.print = () => (window.__printed = (window.__printed ?? 0) + 1)
        return win
      },
    })
  }
  const printFrame = async (pg) => {
    await pg.waitForFunction(() => window.__printed > 0)
    return pg.evaluate(() => {
      const doc = document.querySelector('iframe[data-oa-print]').contentDocument
      return { title: doc.title, text: doc.body.innerText, html: doc.documentElement.outerHTML, ops: doc.querySelectorAll('.oap-op').length, tryIt: doc.querySelectorAll('.oa-tryit, button, input').length }
    })
  }

  const em = await browser.newPage({ viewport: { width: 1280, height: 1200 } })
  await em.addInitScript(stubPrint)
  const emErrors = []
  em.on('pageerror', (e) => emErrors.push(String(e)))
  em.on('console', (m) => m.type() === 'error' && emErrors.push(m.text()))
  // The kitchen spec's OpenID Connect scheme reads its discovery document when the drawer opens.
  await em.route('https://auth.example.com/**', (route) => route.fulfill({ contentType: 'application/json', body: '{"authorization_endpoint":"https://auth.example.com/authorize","token_endpoint":"https://auth.example.com/token"}' }))
  let specFetches = 0
  em.on('request', (r) => r.url().includes('/fixtures/kitchen-sink-31.json') && specFetches++)
  await em.goto(`${base}embed.html`)
  await em.waitForFunction(() => document.querySelectorAll('.oa-embed__card').length === 3)
  check('embed: three operations mount (two by attributes, one by mountOperation)', (await em.locator('.oa-embed__card').count()) === 3)
  check('embed: no header, navigation or footer', (await em.locator('.oa-header, .oa-nav, .oa-footer, .oa-intro').count()) === 0)
  check('embed: embeds of one URL fetch it once', specFetches === 1, `${specFetches} requests`)
  const hostLook = await em.evaluate(() => ({
    theme: document.documentElement.getAttribute('data-theme'),
    p: window.getComputedStyle(document.querySelector('.article p')).marginBottom,
    h2: window.getComputedStyle(document.querySelector('.article h2')).marginTop,
    font: window.getComputedStyle(document.querySelector('.article p')).fontFamily,
  }))
  check('embed: the host page keeps its theme and typography', hostLook.theme === null && hostLook.p === '14px' && hostLook.h2 === '40px' && /Georgia/.test(hostLook.font), JSON.stringify(hostLook))
  const create = em.locator('#create')
  check('embed: names an operation by METHOD /path', (await em.locator('#get .oa-embed__title').innerText()) === 'Get an order')
  check('embed: "Open in reference" links the canonical anchor', (await create.locator('.oa-embed__ref').getAttribute('href')) === '/standalone.html#kitchen/operation/createOrder')
  check('embed: try-it can be turned off', (await em.locator('#get .oa-tryit').count()) === 0 && (await em.locator('#get .oa-samples').count()) === 1)
  let embedSent = null
  await em.route('**/v2/orders**', async (route) => {
    embedSent = { method: route.request().method(), url: route.request().url() }
    await route.fulfill({ status: 201, contentType: 'application/json', body: '{"id":"o-9"}' })
  })
  await create.locator('.oa-tryit button', { hasText: 'Send' }).click()
  await create.locator('.oa-tryit__response .oa-status').waitFor()
  check('embed: try-it sends', embedSent?.method === 'POST' && /\/v2\/orders$/.test(embedSent.url), embedSent?.url)
  await create.locator('.oa-embed__settings').click()
  await em.locator('.oa-settings .oa-servers').waitFor()
  check('embed: the settings drawer has the servers and credentials', (await em.locator('.oa-settings .oa-auth').count()) === 1)
  await em.keyboard.press('Escape')
  await em.locator('.oa-settings').waitFor({ state: 'detached' }).catch(() => {})
  await create.screenshot({ path: `${out}/embed.png` })

  // A narrow container: one column, nothing sideways.
  await em.locator('.aside').evaluate((el) => (el.style.width = '380px'))
  await em.waitForTimeout(150)
  const narrow = await em.locator('#list .oa-embed').evaluate((el) => {
    const right = el.getBoundingClientRect().right
    const outside = [...el.querySelectorAll('*')].filter((n) => n.getClientRects().length && n.getBoundingClientRect().right > right + 1 && !n.closest('.oa-preview__line')).map((n) => n.className)
    const grid = el.querySelector('.oa-op__grid')
    return { scroll: el.scrollWidth - el.clientWidth, outside: outside.slice(0, 5), columns: window.getComputedStyle(grid).gridTemplateColumns.split(' ').length }
  })
  check('embed at 380px: one column, no horizontal overflow', narrow.scroll <= 0 && narrow.outside.length === 0 && narrow.columns === 1, JSON.stringify(narrow))
  await em.locator('#list').screenshot({ path: `${out}/embed-narrow.png` })

  // PDF from the embed: the print frame holds the operation, expanded, without try-it.
  await create.locator('.oa-embed__pdf').click()
  const printed = await printFrame(em)
  check('print: the document title names the API and the operation', printed.title === 'Kitchen Sink API — Create an order', printed.title)
  check('print: the request schema is expanded (a nested property)', /amount/.test(printed.text) && /currency/.test(printed.text), printed.text.slice(0, 200))
  check('print: cycles point up', printed.text.includes('→ Order'))
  check('print: no try-it, no controls', printed.tryIt === 0)
  check('print: a sample and the operation URL', printed.text.includes('curl') && printed.text.includes('/standalone.html#kitchen/operation/createOrder'))
  check('print: the host page is untouched', (await em.locator('.oa-embed__card').first().isVisible()) && (await em.evaluate(() => document.querySelectorAll('iframe[data-oa-print]').length)) === 1)
  const pdfPage = await browser.newPage()
  await pdfPage.setContent(printed.html)
  await pdfPage.emulateMedia({ media: 'print' })
  const pdf = await pdfPage.pdf({ path: `${out}/operation.pdf`, format: 'A4', preferCSSPageSize: true })
  check('print: a PDF comes out', pdf.length > 1000, `${pdf.length} bytes`)
  await pdfPage.close()
  check('embed: no page errors', emErrors.length === 0, emErrors.join('; '))
  await em.close()

  // The Vue component on its own; an unknown operation is reported in place.
  const ev = await browser.newPage({ viewport: { width: 1280, height: 1200 } })
  await ev.addInitScript(stubPrint)
  const evErrors = []
  ev.on('pageerror', (e) => evErrors.push(String(e)))
  await ev.goto(`${base}?mode=embed&op=createOrder`)
  await ev.locator('.oa-embed__card').waitFor()
  check('embed (Vue): renders the operation side by side when wide', (await ev.locator('.oa-op__grid').evaluate((g) => window.getComputedStyle(g).gridTemplateColumns.split(' ').length)) === 2)
  await ev.goto(`${base}?mode=embed&op=nope`)
  await ev.locator('.oa-embed .uid-alert').waitFor()
  check('embed (Vue): an unknown operation shows an alert', (await ev.locator('.oa-embed .uid-alert').innerText()).includes('nope'))
  // The reference: PDF next to "Copy link", and the whole spec from the settings drawer.
  await ev.goto(`${base}?spec=kitchen#operation/getOrder`)
  const go2 = ev.locator('[id="operation/getOrder"]')
  await go2.locator('.oa-tryit').waitFor()
  await go2.locator('.oa-op__head').hover()
  await go2.locator('.oa-op__pdf').click()
  const one = await printFrame(ev)
  check('print (reference): one operation', one.ops === 1 && one.title === 'Kitchen Sink API — Get an order', one.title)
  await ev.evaluate(() => (window.__printed = 0))
  await openSettings(ev)
  await ev.locator('.oa-settings__print button').click()
  const all = await printFrame(ev)
  check('print (reference): the whole spec, every operation and the schemas', all.ops >= 9 && all.text.includes('Order') && all.title.startsWith('Kitchen Sink API'), `${all.ops} operations`)
  check('print (reference): one frame at a time', (await ev.evaluate(() => document.querySelectorAll('iframe[data-oa-print]').length)) === 1)
  check('embed (Vue) and print: no page errors', evErrors.length === 0, evErrors.join('; '))
  await ev.close()

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

  // API blocks: the Vue widget — preview, source with the format switch, the constructor.
  const bk = await browser.newPage({ viewport: { width: 1100, height: 1400 } })
  const bkErrors = []
  bk.on('pageerror', (e) => bkErrors.push(String(e)))
  const blockText = () => bk.evaluate(() => window.__text())
  await bk.goto(`${base}?mode=block`)
  await bk.locator('.oa-bk .oa-embed__card').waitFor()
  check('block: renders an operation card', (await bk.locator('.oa-bk .oa-embed__title').innerText()) === 'Update a user')
  let blockSent = null
  await bk.route('**/v1/users/**', async (route) => {
    blockSent = { method: route.request().method(), url: route.request().url(), auth: route.request().headers().authorization }
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"id":7}' })
  })
  await bk.locator('.oa-bk .oa-tryit button', { hasText: 'Send' }).click()
  await bk.locator('.oa-bk .oa-tryit__response .oa-status').waitFor()
  check('block: try-it really sends', blockSent?.method === 'POST' && /\/v1\/users\/0(\?|$)/.test(blockSent.url), blockSent?.url)
  await bk.locator('.oa-bk .uid-tab', { hasText: 'Source' }).click()
  const bkSource = bk.locator('.oa-bk .oa-source__textarea')
  check('block: the source tab shows the YAML', (await bkSource.inputValue()).startsWith('method: POST'))
  await bk.locator('.oa-bk__format--bar .oa-segmented__item', { hasText: 'JSON' }).click()
  const asJson = await bkSource.inputValue()
  check('block: YAML → JSON converts the text', asJson.trimStart().startsWith('{') && JSON.parse(asJson).method === 'POST' && (await blockText()) === asJson)
  await bk.locator('.oa-bk__format--bar .oa-segmented__item', { hasText: 'YAML' }).click()
  check('block: and back to YAML', (await bkSource.inputValue()).startsWith('method: POST'))
  await bk.locator('.oa-bk .uid-tab', { hasText: 'Constructor' }).click()
  const form = bk.locator('.oa-bk__form')
  await form.locator('.uid-input-field', { hasText: 'Summary' }).locator('input').fill('Rename a user')
  await bk.waitForTimeout(400)
  check('block: a constructor edit lands in the source', (await blockText()).includes('summary: Rename a user') && (await blockText()).includes('notify:'))
  await form.locator('.oa-bk__url input').fill('https://api.example.com/v1/users/{id}/posts/{postId}')
  await bk.waitForTimeout(100)
  check('block: path parameters follow the URL', (await form.locator('.oa-bk__param-name input').evaluateAll((els) => els.map((e) => e.value))).join() === 'id,postId,notify')
  await form.locator('button', { hasText: 'Add parameter' }).click()
  await bk.waitForTimeout(400)
  const withParam = await blockText()
  check('block: an added parameter is written as shorthand', /\n\s+param: string\n/.test(withParam))
  await bk.screenshot({ path: `${out}/block-constructor.png`, fullPage: true })
  await bk.locator('.oa-bk .uid-tab', { hasText: 'Source' }).click()
  check('block: the source tab shows the constructor’s text', (await bkSource.inputValue()) === withParam)
  await bkSource.fill('method: FETCH\nurl: /a\n')
  await bk.waitForTimeout(100)
  check('block: a broken block names its line', /1:1/.test(await bk.locator('.oa-bk .oa-source__issues').innerText()) && (await bk.locator('.oa-bk .oa-bk__dot').count()) === 1)
  await bk.locator('.oa-bk .uid-tab', { hasText: 'Preview' }).click()
  check('block: the preview shows the error', (await bk.locator('.oa-bk .uid-alert').innerText()).includes('FETCH'))
  // Phone width, dark theme: legible, nothing sideways.
  await bk.setViewportSize({ width: 390, height: 1400 })
  await bk.goto(`${base}?mode=block&theme=dark&tab=constructor`)
  await bk.locator('.oa-bk__form').waitFor()
  const bkLook = await bk.evaluate(() => {
    const lum = (c) => {
      const [r, g, b] = c.match(/[\d.]+/g).slice(0, 3).map((v) => {
        const s = Number(v) / 255
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
      })
      return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }
    const block = document.querySelector('.oa-bk')
    const input = block.querySelector('.oa-bk__url input')
    const fg = lum(window.getComputedStyle(input).color)
    const bg = lum(window.getComputedStyle(block).backgroundColor)
    const right = block.getBoundingClientRect().right
    const outside = [...block.querySelectorAll('*')].filter((n) => n.getClientRects().length && n.getBoundingClientRect().right > right + 1).map((n) => n.className)
    return { contrast: (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05), page: document.documentElement.scrollWidth, outside: outside.slice(0, 5) }
  })
  check('block (dark, phone): text is legible', bkLook.contrast >= 7, bkLook.contrast.toFixed(1))
  check('block (phone): nothing overflows sideways', bkLook.page <= 390 && bkLook.outside.length === 0, JSON.stringify(bkLook))
  await bk.screenshot({ path: `${out}/block-phone-dark.png`, fullPage: true })
  check('block: no page errors', bkErrors.length === 0, bkErrors.join('; '))
  await bk.close()

  // API blocks in a rendered article, from the standalone bundle (read-only).
  const sb = await browser.newPage({ viewport: { width: 1000, height: 1400 } })
  const sbErrors = []
  sb.on('pageerror', (e) => sbErrors.push(String(e)))
  await sb.goto(`${base}blocks.html`)
  await sb.locator('.oa-bk .oa-embed__card').first().waitFor()
  const rendered = await sb.evaluate(() => ({
    blocks: document.querySelectorAll('[data-openapi-block] .oa-bk').length,
    cards: document.querySelectorAll('.oa-bk .oa-embed__card').length,
    left: document.querySelectorAll('pre > code.language-openapi, pre > code.language-openapi-json').length,
    plain: document.querySelectorAll('pre > code.language-yaml').length,
    tabs: document.querySelectorAll('.oa-bk .uid-tabs').length,
    again: window.DskOpenApi.renderBlocks().length,
  }))
  check('renderBlocks: every openapi block becomes a widget, other code stays', rendered.blocks === 3 && rendered.left === 0 && rendered.plain === 1, JSON.stringify(rendered))
  check('renderBlocks: read-only cards, several requests per block', rendered.cards === 3 && rendered.tabs === 0, JSON.stringify(rendered))
  check('renderBlocks: idempotent', rendered.again === 0)
  check('renderBlocks: a broken block shows its error', (await sb.locator('.oa-bk .uid-alert').innerText()).includes('FETCH'))
  await sb.screenshot({ path: `${out}/blocks-standalone.png`, fullPage: true })
  check('renderBlocks: no page errors', sbErrors.length === 0, sbErrors.join('; '))
  await sb.close()
} finally {
  await browser.close()
  await server.close()
}

if (failures.length) {
  console.error(`${failures.length} check(s) failed`)
  process.exit(1)
}
