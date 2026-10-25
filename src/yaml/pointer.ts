/** Appends one reference token to a JSON Pointer (RFC 6901: `~` → `~0`, `/` → `~1`). */
export function appendPointer(path: string, token: string | number): string {
  if (typeof token === 'number') return `${path}/${token}`
  if (token.includes('~') || token.includes('/')) {
    token = token.replace(/~/g, '~0').replace(/\//g, '~1')
  }
  return `${path}/${token}`
}

/** Sets an own enumerable property, `__proto__` included (plain assignment would set the prototype). */
export function setProp(obj: Record<string, unknown>, key: string, value: unknown): void {
  if (key === '__proto__') {
    Object.defineProperty(obj, key, { value, enumerable: true, writable: true, configurable: true })
  } else {
    obj[key] = value
  }
}

export const hasOwn = (obj: object, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(obj, key)
