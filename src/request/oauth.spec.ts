import {
  base64Url,
  buildAuthorizeUrl,
  codeChallenge,
  createCodeVerifier,
  exchangeAuthorizationCode,
  fetchOAuthToken,
  fetchOpenIdConfiguration,
  parseCallbackUrl,
  randomToken,
} from './oauth'

type Call = { url: string; init: RequestInit }

function mockFetch(response: () => Response) {
  const calls: Call[] = []
  const fn = (async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    return response()
  }) as unknown as typeof fetch
  return { fn, calls }
}

describe('PKCE and state', () => {
  it('matches the RFC 7636 appendix B vector', async () => {
    expect(await codeChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')
  })

  it('encodes base64url without padding', () => {
    expect(base64Url(new Uint8Array([0xfb, 0xff]))).toBe('-_8')
    expect(base64Url(new Uint8Array([]))).toBe('')
  })

  it('makes random URL-safe verifiers and states', () => {
    const v = createCodeVerifier()
    expect(v).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(createCodeVerifier()).not.toBe(v)
    expect(randomToken(16)).toMatch(/^[A-Za-z0-9_-]{22}$/)
  })
})

describe('buildAuthorizeUrl', () => {
  it('builds a code request with PKCE and keeps the existing query', () => {
    const url = new URL(
      buildAuthorizeUrl({
        authorizationUrl: 'https://idp.test/authorize?tenant=a',
        responseType: 'code',
        clientId: 'app',
        redirectUri: 'https://docs.test/',
        scopes: ['read', 'write'],
        state: 's1',
        codeChallenge: 'ch',
      }),
    )
    const q = Object.fromEntries(url.searchParams)
    expect(q).toEqual({
      tenant: 'a',
      response_type: 'code',
      client_id: 'app',
      redirect_uri: 'https://docs.test/',
      scope: 'read write',
      state: 's1',
      code_challenge: 'ch',
      code_challenge_method: 'S256',
    })
  })

  it('builds an implicit request without scope and challenge', () => {
    const q = new URL(
      buildAuthorizeUrl({ authorizationUrl: 'https://idp.test/a', responseType: 'token', clientId: 'x', redirectUri: 'https://d/', state: 's' }),
    ).searchParams
    expect(q.get('response_type')).toBe('token')
    expect(q.has('scope')).toBe(false)
    expect(q.has('code_challenge')).toBe(false)
  })
})

describe('parseCallbackUrl', () => {
  it('reads a code from the query', () => {
    expect(parseCallbackUrl('https://d.test/?code=abc&state=s1')).toEqual({ code: 'abc', state: 's1' })
  })

  it('reads an implicit token from the fragment', () => {
    expect(parseCallbackUrl('https://d.test/#access_token=t&token_type=Bearer&expires_in=3600&state=s')).toEqual({
      accessToken: 't',
      tokenType: 'Bearer',
      expiresIn: 3600,
      state: 's',
    })
  })

  it('reads an error', () => {
    expect(parseCallbackUrl('https://d.test/?error=access_denied&error_description=No+way&state=s')).toEqual({
      error: 'access_denied',
      errorDescription: 'No way',
      state: 's',
    })
  })

  it('returns null for a plain URL or garbage', () => {
    expect(parseCallbackUrl('https://d.test/?spec=x#operation/a')).toBeNull()
    expect(parseCallbackUrl('not a url')).toBeNull()
  })
})

describe('token requests', () => {
  it('exchanges a code with the verifier and the secret in the form', async () => {
    const { fn, calls } = mockFetch(() => new Response('{"access_token":"tok","token_type":"bearer","expires_in":"60"}'))
    const token = await exchangeAuthorizationCode({
      tokenUrl: 'https://idp.test/token',
      code: 'c',
      redirectUri: 'https://d/',
      clientId: 'app',
      clientSecret: 'sec',
      codeVerifier: 'ver',
      fetch: fn,
    })
    expect(token).toEqual({ accessToken: 'tok', tokenType: 'bearer', expiresIn: 60 })
    const form = Object.fromEntries(new URLSearchParams(String(calls[0]!.init.body)))
    expect(form).toEqual({ grant_type: 'authorization_code', code: 'c', redirect_uri: 'https://d/', client_id: 'app', code_verifier: 'ver', client_secret: 'sec' })
    expect(calls[0]!.init.method).toBe('POST')
  })

  it('reports the server error', async () => {
    const { fn } = mockFetch(() => new Response('{"error":"invalid_grant","error_description":"Code expired"}', { status: 400 }))
    await expect(exchangeAuthorizationCode({ tokenUrl: 'https://t', code: 'c', redirectUri: 'https://d/', clientId: 'a', fetch: fn })).rejects.toThrow(
      'Code expired',
    )
  })

  it('sends the scopes it is given for client credentials', async () => {
    const { fn, calls } = mockFetch(() => new Response('{"access_token":"t"}'))
    await fetchOAuthToken('clientCredentials', { tokenUrl: 'https://t', clientId: 'a', scopes: ['one'], fetch: fn })
    expect(new URLSearchParams(String(calls[0]!.init.body)).get('scope')).toBe('one')
  })
})

describe('fetchOpenIdConfiguration', () => {
  it('reads the endpoints and lists', async () => {
    const { fn, calls } = mockFetch(
      () =>
        new Response(
          JSON.stringify({
            authorization_endpoint: 'https://idp/a',
            token_endpoint: 'https://idp/t',
            scopes_supported: ['openid', 'profile', 7],
            response_types_supported: ['code', 'token'],
          }),
        ),
    )
    expect(await fetchOpenIdConfiguration('https://idp/.well-known/openid-configuration', { fetch: fn })).toEqual({
      authorizationEndpoint: 'https://idp/a',
      tokenEndpoint: 'https://idp/t',
      scopesSupported: ['openid', 'profile'],
      responseTypesSupported: ['code', 'token'],
      grantTypesSupported: [],
    })
    expect(calls[0]!.url).toBe('https://idp/.well-known/openid-configuration')
  })

  it('rejects a failed or non-JSON response', async () => {
    await expect(fetchOpenIdConfiguration('https://x', { fetch: mockFetch(() => new Response('', { status: 404 })).fn })).rejects.toThrow('404')
    await expect(fetchOpenIdConfiguration('https://x', { fetch: mockFetch(() => new Response('<html>')).fn })).rejects.toThrow('JSON')
  })
})
