import type { SecurityScheme } from '../core/types'
import { credentialsKey, persistable, persistMode, readCredentials, removeCredentials, writeCredentials } from './persist'

function memoryStorage(): Storage {
  const map = new Map<string, string>()
  return {
    get length() {
      return map.size
    },
    clear: () => map.clear(),
    getItem: (k) => map.get(k) ?? null,
    key: (i) => [...map.keys()][i] ?? null,
    removeItem: (k) => void map.delete(k),
    setItem: (k, v) => void map.set(k, v),
  }
}

const schemes: Record<string, SecurityScheme> = {
  key: { type: 'apiKey', in: 'header', name: 'X-Key' },
  basic: { type: 'http', scheme: 'basic' },
  oauth: { type: 'oauth2', flows: {} },
}

describe('persistable', () => {
  it('keeps keys and tokens with expiry, basic usernames only, known schemes only', () => {
    expect(
      persistable(
        { key: 'k1', basic: { username: 'u', password: 'secret' }, oauth: 'tok', gone: 'x', empty: '' },
        { oauth: 123, key: 5 },
        schemes,
      ),
    ).toEqual({ credentials: { key: 'k1', basic: { username: 'u' }, oauth: 'tok' }, expiry: { oauth: 123, key: 5 } })
  })
})

describe('storage', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage())
    vi.stubGlobal('sessionStorage', memoryStorage())
  })
  afterEach(() => vi.unstubAllGlobals())

  it('maps the prop to a mode', () => {
    expect([persistMode(true), persistMode('local'), persistMode('session'), persistMode(false), persistMode(undefined)]).toEqual([
      'session',
      'local',
      'session',
      null,
      null,
    ])
  })

  it('writes, reads and removes per key', () => {
    const key = credentialsKey('spec', 'Shop API')
    expect(key).toBe('dsk-openapi:credentials:spec:Shop API')
    writeCredentials('local', key, { credentials: { key: 'k' }, expiry: {} })
    expect(readCredentials('local', key)).toEqual({ credentials: { key: 'k' }, expiry: {} })
    expect(readCredentials('session', key)).toBeNull()
    writeCredentials('local', key, { credentials: {}, expiry: {} })
    expect(localStorage.getItem(key)).toBeNull()
    writeCredentials('session', key, { credentials: { key: 'k' }, expiry: {} })
    removeCredentials('session', key)
    expect(readCredentials('session', key)).toBeNull()
  })

  it('never throws on broken or blocked storage', () => {
    localStorage.setItem('bad', '{not json')
    expect(readCredentials('local', 'bad')).toBeNull()
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('quota')
      },
      removeItem: () => {
        throw new Error('blocked')
      },
    })
    expect(readCredentials('local', 'x')).toBeNull()
    expect(() => writeCredentials('local', 'x', { credentials: { a: 'b' }, expiry: {} })).not.toThrow()
    expect(() => removeCredentials('local', 'x')).not.toThrow()
  })
})
