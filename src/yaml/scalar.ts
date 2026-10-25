/**
 * YAML 1.2 core schema: how an untagged plain scalar resolves, and the
 * explicit `!!int` / `!!float` / `!!bool` / `!!null` conversions.
 */

const INT_DEC = /^[-+]?[0-9]+$/
const INT_OCT = /^0o[0-7]+$/
const INT_HEX = /^0x[0-9a-fA-F]+$/
const FLOAT = /^[-+]?(?:\.[0-9]+|[0-9]+(?:\.[0-9]*)?)(?:[eE][-+]?[0-9]+)?$/
const INF = /^[-+]?\.(?:inf|Inf|INF)$/
const NAN = /^\.(?:nan|NaN|NAN)$/

export function isNullText(s: string): boolean {
  return s === '' || s === '~' || s === 'null' || s === 'Null' || s === 'NULL'
}

export function resolveBool(s: string): boolean | undefined {
  if (s === 'true' || s === 'True' || s === 'TRUE') return true
  if (s === 'false' || s === 'False' || s === 'FALSE') return false
  return undefined
}

export function resolveInt(s: string): number | undefined {
  if (INT_DEC.test(s)) return Number(s)
  if (INT_HEX.test(s)) return parseInt(s.slice(2), 16)
  if (INT_OCT.test(s)) return parseInt(s.slice(2), 8)
  return undefined
}

/** A float in any core form; integers count too (`!!float 1` is 1). */
export function resolveFloat(s: string): number | undefined {
  if (FLOAT.test(s)) return Number(s)
  if (INF.test(s)) return s.charCodeAt(0) === 45 ? -Infinity : Infinity
  if (NAN.test(s)) return NaN
  return resolveInt(s)
}

/** Resolves an untagged plain scalar: null, bool, int, float, otherwise the string itself. */
export function resolveCore(s: string): unknown {
  if (s.length === 0) return null
  const c = s.charCodeAt(0)
  // Only a handful of first characters can start a non-string; skip the regexes otherwise.
  switch (c) {
    case 126: // ~
    case 110: // n
    case 78: // N
      return isNullText(s) ? null : s
    case 116: // t
    case 84: // T
    case 102: // f
    case 70: {
      // F
      const b = resolveBool(s)
      return b === undefined ? s : b
    }
    default:
      if ((c >= 48 && c <= 57) || c === 43 || c === 45 || c === 46) {
        const n = resolveInt(s) ?? resolveFloat(s)
        return n === undefined ? s : n
      }
      return s
  }
}
