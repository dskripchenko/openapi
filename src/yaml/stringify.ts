/**
 * Deterministic YAML output: key order preserved, block style, scalars
 * quoted only when the plain form would read back differently.
 */
import { resolveCore } from './scalar'

export interface StringifyYamlOptions {
  /** Spaces per nesting level, 1–8. Default 2. */
  indent?: number
  /** Single-line strings longer than this are folded (`>-`) at spaces. 0 disables. Default 80. */
  lineWidth?: number
}

/** Characters that only survive in a double-quoted scalar (control, C1, line/paragraph separators, BOM). */
// eslint-disable-next-line no-control-regex -- matching control characters is the point
const NEEDS_DOUBLE = /[\x00-\x08\x0b-\x1f\x7f-\x9f\u2028\u2029\ufeff]/
/** A surrogate half without its partner. */
const LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?:^|[^\ud800-\udbff])[\udc00-\udfff]/
/** A line of only spaces/tabs (not an empty line). */
const BLANK_LINE = /(?:^|\n)[ \t]+(?:\n|$)/
/** Inside a plain scalar these would start a comment or a mapping value. */
const PLAIN_BREAKERS = /[ \t]#|:[ \t]|:$/
/** First characters that make a plain scalar mean something else. */
const INDICATORS = new Set('-?:,[]{}#&*!|>\'"%@`')

export function stringifyYaml(value: unknown, opts: StringifyYamlOptions = {}): string {
  const indent = Math.min(8, Math.max(1, Math.floor(opts.indent ?? 2)))
  const lineWidth = opts.lineWidth ?? 80
  const emitter = new Emitter(indent, lineWidth)
  return emitter.root(value)
}

type Entry = [string, unknown]

class Emitter {
  private readonly lines: string[] = []
  private readonly stack = new Set<object>()

  constructor(
    private readonly indent: number,
    private readonly lineWidth: number,
  ) {}

  root(value: unknown): string {
    const v = normalize(value)
    if (Array.isArray(v) && v.length > 0) this.seq(v, 0)
    else if (isObject(v) && entries(v).length > 0) this.map(v, 0)
    else {
      // A block scalar indicator at the root counts from column 0.
      const s = this.scalar(v, 0, this.indent)
      this.lines.push(s.head, ...s.body)
    }
    return this.lines.join('\n') + '\n'
  }

  private enter(v: object): void {
    if (this.stack.has(v)) throw new TypeError('stringifyYaml: cyclic structure')
    this.stack.add(v)
  }

  /** A mapping whose keys sit at column `col`. */
  private map(obj: object, col: number): void {
    this.enter(obj)
    const pad = ' '.repeat(col)
    for (const [k, v] of entries(obj)) {
      const key = pad + formatKey(k) + ':'
      if (Array.isArray(v) && v.length > 0) {
        this.lines.push(key)
        this.seq(v, col + this.indent)
      } else if (isObject(v) && entries(v).length > 0) {
        this.lines.push(key)
        this.map(v, col + this.indent)
      } else {
        const s = this.scalar(v, col, col + this.indent)
        this.lines.push(`${key} ${s.head}`, ...s.body)
      }
    }
    this.stack.delete(obj)
  }

  /** A sequence whose dashes sit at column `col`; nested collections go compact (`- key: v`). */
  private seq(arr: unknown[], col: number): void {
    this.enter(arr)
    const pad = ' '.repeat(col)
    for (const item of arr) {
      let v = normalize(item)
      if (v === undefined || typeof v === 'function' || typeof v === 'symbol') v = null
      const nonEmptySeq = Array.isArray(v) && v.length > 0
      const nonEmptyMap = !nonEmptySeq && isObject(v) && entries(v).length > 0
      if (nonEmptySeq || nonEmptyMap) {
        const first = this.lines.length
        if (nonEmptySeq) this.seq(v as unknown[], col + 2)
        else this.map(v as object, col + 2)
        this.lines[first] = `${pad}- ${(this.lines[first] as string).slice(col + 2)}`
      } else {
        const s = this.scalar(v, col, col + this.indent)
        this.lines.push(`${pad}- ${s.head}`, ...s.body)
      }
    }
    this.stack.delete(arr)
  }

  /**
   * A scalar or an empty collection. `parentIndent` is the indentation the
   * parser will see for the owning collection, `contentCol` where block
   * scalar lines go.
   */
  private scalar(
    v: unknown,
    parentIndent: number,
    contentCol: number,
  ): { head: string; body: string[] } {
    if (v === null || v === undefined || typeof v === 'function' || typeof v === 'symbol') {
      return { head: 'null', body: [] }
    }
    if (Array.isArray(v)) return { head: '[]', body: [] }
    if (typeof v === 'object') return { head: '{}', body: [] }
    if (typeof v === 'boolean') return { head: v ? 'true' : 'false', body: [] }
    if (typeof v === 'number') return { head: formatNumber(v), body: [] }
    if (typeof v === 'bigint') return { head: v.toString(), body: [] }
    return this.string(String(v), parentIndent, contentCol)
  }

  private string(
    s: string,
    parentIndent: number,
    contentCol: number,
  ): { head: string; body: string[] } {
    if (NEEDS_DOUBLE.test(s) || LONE_SURROGATE.test(s)) return { head: doubleQuote(s), body: [] }
    if (s.includes('\n')) {
      // Parsers disagree on whitespace-only lines inside block scalars; quote those strings.
      return BLANK_LINE.test(s)
        ? { head: doubleQuote(s), body: [] }
        : literal(s, parentIndent, contentCol)
    }
    if (this.lineWidth > 0 && contentCol + s.length > this.lineWidth) {
      const folded = fold(s, Math.max(this.lineWidth - contentCol, 20))
      if (folded) return { head: '>-', body: folded.map((l) => ' '.repeat(contentCol) + l) }
    }
    return { head: needsQuotes(s) ? singleQuote(s) : s, body: [] }
  }
}

function normalize(v: unknown): unknown {
  if (
    v !== null &&
    typeof v === 'object' &&
    typeof (v as { toJSON?: unknown }).toJSON === 'function'
  ) {
    return (v as { toJSON: () => unknown }).toJSON()
  }
  return v
}

function isObject(v: unknown): v is object {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** Own enumerable members as JSON would write them: undefined, functions and symbols dropped. */
function entries(obj: object): Entry[] {
  const out: Entry[] = []
  for (const k of Object.keys(obj)) {
    const v = normalize((obj as Record<string, unknown>)[k])
    if (v === undefined || typeof v === 'function' || typeof v === 'symbol') continue
    out.push([k, v])
  }
  return out
}

function formatNumber(n: number): string {
  if (Number.isNaN(n)) return '.nan'
  if (n === Infinity) return '.inf'
  if (n === -Infinity) return '-.inf'
  if (Object.is(n, -0)) return '-0'
  return String(n)
}

/** Would the plain form of `s` read back as something other than this string? */
export function needsQuotes(s: string): boolean {
  if (s === '') return true
  if (typeof resolveCore(s) !== 'string') return true
  return syntaxNeedsQuotes(s)
}

function syntaxNeedsQuotes(s: string): boolean {
  if (INDICATORS.has(s[0] as string)) return true
  const first = s.charCodeAt(0)
  const last = s.charCodeAt(s.length - 1)
  if (first === 32 || first === 9 || last === 32 || last === 9) return true
  if (PLAIN_BREAKERS.test(s)) return true
  // A document marker at column 0 (only a root scalar can land there; cheap to always guard).
  return s.startsWith('...')
}

function formatKey(k: string): string {
  if (NEEDS_DOUBLE.test(k) || LONE_SURROGATE.test(k) || k.includes('\n')) return doubleQuote(k)
  // Plain keys are resolved and then converted with String(): `200` stays "200", `1.0` would become "1".
  if (k === '' || k === '<<' || String(resolveCore(k)) !== k || syntaxNeedsQuotes(k)) {
    return singleQuote(k)
  }
  return k
}

function singleQuote(s: string): string {
  return `'${s.replace(/'/g, "''")}'`
}

const ESCAPES: Record<string, string> = {
  '\0': '\\0',
  '\x07': '\\a',
  '\b': '\\b',
  '\t': '\\t',
  '\n': '\\n',
  '\v': '\\v',
  '\f': '\\f',
  '\r': '\\r',
  '\x1b': '\\e',
  '"': '\\"',
  '\\': '\\\\',
  '\x85': '\\N',
  '\u2028': '\\L',
  '\u2029': '\\P',
}

function doubleQuote(s: string): string {
  let out = '"'
  for (let i = 0; i < s.length; i++) {
    const ch = s[i] as string
    const c = s.charCodeAt(i)
    const esc = ESCAPES[ch]
    if (esc !== undefined) out += esc
    else if (c < 0x20 || (c >= 0x7f && c <= 0x9f)) out += '\\x' + c.toString(16).padStart(2, '0')
    else if (c === 0xfeff) out += '\\uFEFF'
    else if (c >= 0xd800 && c <= 0xdfff) {
      // Keep a valid pair as is; escape a lone half.
      const next = s.charCodeAt(i + 1)
      if (c <= 0xdbff && next >= 0xdc00 && next <= 0xdfff) {
        out += ch + (s[i + 1] as string)
        i++
      } else out += '\\u' + c.toString(16).toUpperCase().padStart(4, '0')
    } else out += ch
  }
  return out + '"'
}

/**
 * A literal block `|`. Chomping keeps the exact trailing newlines: `|-`
 * none, `|` one, `|+` several (or a string of newlines only). An explicit
 * indentation indicator is needed when the first text line starts with a
 * space, which auto-detection would otherwise swallow.
 */
function literal(
  s: string,
  parentIndent: number,
  contentCol: number,
): { head: string; body: string[] } {
  let chomp: string
  let body: string
  if (s.endsWith('\n')) {
    body = s.slice(0, -1)
    chomp = body !== '' && !body.endsWith('\n') ? '' : '+'
  } else {
    body = s
    chomp = '-'
  }
  const lines = body.split('\n')
  const firstText = lines.find((l) => l !== '')
  const indicator =
    firstText !== undefined && firstText.charCodeAt(0) === 32
      ? String(contentCol - parentIndent)
      : ''
  const pad = ' '.repeat(contentCol)
  return { head: `|${indicator}${chomp}`, body: lines.map((l) => (l === '' ? '' : pad + l)) }
}

/**
 * Splits a long single-line string for a folded block `>-`. Breaks only at
 * a single space between two non-blank characters, so folding the lines back
 * with spaces restores the string. Null when it cannot or need not split.
 */
function fold(s: string, width: number): string[] | null {
  const first = s.charCodeAt(0)
  const last = s.charCodeAt(s.length - 1)
  if (first === 32 || first === 9 || last === 32 || last === 9) return null
  const out: string[] = []
  let start = 0
  let cand = -1
  const isBlank = (c: number) => c === 32 || c === 9
  for (let i = 1; i < s.length - 1; i++) {
    if (s.charCodeAt(i) !== 32 || isBlank(s.charCodeAt(i - 1)) || isBlank(s.charCodeAt(i + 1)))
      continue
    if (i - start > width && cand > start) {
      out.push(s.slice(start, cand))
      start = cand + 1
    }
    cand = i
  }
  if (s.length - start > width && cand > start) {
    out.push(s.slice(start, cand))
    start = cand + 1
  }
  if (out.length === 0) return null
  out.push(s.slice(start))
  return out
}
