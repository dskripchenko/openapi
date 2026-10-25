// Browser check of the Vue components: renders the fixture specs in both
// themes, drives search, samples and try-it (against a mocked API), and saves
// screenshots to tests/browser/output. Run after `pnpm install`; CI runs it.
import { mkdirSync } from 'node:fs'
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
  const sendFrom = async (summary) => {
    const o = op2.locator('.oa-op').filter({ hasText: summary }).first()
    const n = idp.api.length
    await o.locator('.oa-tryit button', { hasText: 'Send' }).click()
    for (let i = 0; i < 50 && idp.api.length === n; i++) await op2.waitForTimeout(100)
    return idp.api.length > n ? idp.api[idp.api.length - 1].authorization : undefined
  }
  const waitToken = async (scheme) => {
    const status = op2.locator(`.oa-auth__scheme[data-scheme="${scheme}"] .oa-auth__status`)
    await status.waitFor({ timeout: 10000 }).catch(() => {})
    return status.innerText().catch(() => '')
  }
  await op2.goto(`${base}?spec=oauth`)
  await op2.waitForSelector('.oa-op')
  await op2.locator('.oa-auth .oa-panel__head').click()
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
    await pp.locator('.oa-auth .oa-panel__head').click()
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
