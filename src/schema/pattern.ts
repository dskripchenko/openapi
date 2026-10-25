/**
 * A tiny generator for strings matching a regular expression, covering the
 * subset schemas use in practice: literals, `.`, character classes, `\d \w \s`
 * and their negations, groups with alternation and the quantifiers
 * `* + ? {n} {n,} {n,m}`. Anything else (backreferences, lookarounds,
 * `\p{…}`) makes the generator give up, and the caller falls back.
 */
import { codePointLength, compilePattern } from './util'

type Node =
  | { t: 'lit'; c: string }
  | { t: 'seq'; items: Node[] }
  | { t: 'alt'; options: Node[] }
  | { t: 'rep'; node: Node; min: number; max: number }

class Unsupported extends Error {}

/** Characters tried, in order, when a negated class needs a member. */
const CANDIDATES = 'aAz0_-. bB1'

function classEscape(c: string): ((ch: string) => boolean) | undefined {
  switch (c) {
    case 'd':
      return (ch) => ch >= '0' && ch <= '9'
    case 'D':
      return (ch) => !(ch >= '0' && ch <= '9')
    case 'w':
      return (ch) => /\w/.test(ch)
    case 'W':
      return (ch) => !/\w/.test(ch)
    case 's':
      return (ch) => /\s/.test(ch)
    case 'S':
      return (ch) => !/\s/.test(ch)
    default:
      return undefined
  }
}

const CLASS_PICK: Record<string, string> = { d: '0', D: 'a', w: 'a', W: '-', s: ' ', S: 'a' }

class Parser {
  private i = 0
  constructor(private readonly src: string[]) {}

  parse(): Node {
    const node = this.alternation()
    if (this.i < this.src.length) throw new Unsupported('unbalanced')
    return node
  }

  private peek(): string | undefined {
    return this.src[this.i]
  }

  private next(): string {
    const c = this.src[this.i++]
    if (c === undefined) throw new Unsupported('unexpected end')
    return c
  }

  private alternation(): Node {
    const options: Node[] = [this.sequence()]
    while (this.peek() === '|') {
      this.i++
      options.push(this.sequence())
    }
    return options.length === 1 ? options[0]! : { t: 'alt', options }
  }

  private sequence(): Node {
    const items: Node[] = []
    for (let c = this.peek(); c !== undefined && c !== '|' && c !== ')'; c = this.peek()) {
      const atom = this.atom()
      if (atom) items.push(this.quantified(atom))
    }
    return { t: 'seq', items }
  }

  private atom(): Node | undefined {
    const c = this.next()
    switch (c) {
      case '^':
      case '$':
        return undefined
      case '.':
        return { t: 'lit', c: 'a' }
      case '(': {
        if (this.peek() === '?') {
          this.i++
          const kind = this.next()
          if (kind === '<' && this.peek() !== '=' && this.peek() !== '!') {
            while (this.next() !== '>') {
              // skip the group name
            }
          } else if (kind !== ':') {
            throw new Unsupported('lookaround')
          }
        }
        const inner = this.alternation()
        if (this.next() !== ')') throw new Unsupported('unclosed group')
        return inner
      }
      case '[':
        return { t: 'lit', c: this.charClass() }
      case '\\':
        return { t: 'lit', c: this.escape() }
      case '*':
      case '+':
      case '?':
        throw new Unsupported('dangling quantifier')
      default:
        return { t: 'lit', c }
    }
  }

  private escape(): string {
    const c = this.next()
    const pick = CLASS_PICK[c]
    if (pick) return pick
    return this.literalEscape(c)
  }

  private literalEscape(c: string): string {
    switch (c) {
      case 't':
        return '\t'
      case 'n':
        return '\n'
      case 'r':
        return '\r'
      case 'f':
        return '\f'
      case 'v':
        return '\v'
      case '0':
        return '\0'
      case 'x':
        return String.fromCodePoint(parseInt(this.next() + this.next(), 16))
      case 'u': {
        if (this.peek() === '{') {
          this.i++
          let hex = ''
          for (let ch = this.next(); ch !== '}'; ch = this.next()) hex += ch
          return String.fromCodePoint(parseInt(hex, 16))
        }
        const hex = this.next() + this.next() + this.next() + this.next()
        const code = parseInt(hex, 16)
        if (Number.isNaN(code)) throw new Unsupported('bad escape')
        return String.fromCharCode(code)
      }
      default:
        // Digits are backreferences; letters are classes we do not model (\b, \p, \k…).
        if (/[0-9a-zA-Z]/.test(c)) throw new Unsupported(`escape \\${c}`)
        return c
    }
  }

  /** Parses `[...]` and returns one member character. */
  private charClass(): string {
    let negated = false
    if (this.peek() === '^') {
      negated = true
      this.i++
    }
    const tests: ((ch: string) => boolean)[] = []
    let first: string | undefined
    let start = true
    for (;;) {
      let c = this.next()
      if (c === ']' && !start) break
      start = false
      let lo: string
      if (c === '\\') {
        c = this.next()
        const test = classEscape(c)
        if (test) {
          tests.push(test)
          first ??= CLASS_PICK[c]
          continue
        }
        lo = c === 'b' ? '\b' : this.literalEscape(c)
      } else {
        lo = c
      }
      if (this.peek() === '-' && this.src[this.i + 1] !== undefined && this.src[this.i + 1] !== ']') {
        this.i++
        let hi = this.next()
        if (hi === '\\') hi = this.literalEscape(this.next())
        const a = lo.codePointAt(0)!
        const b = hi.codePointAt(0)!
        tests.push((ch) => {
          const code = ch.codePointAt(0)!
          return code >= a && code <= b
        })
      } else {
        tests.push((ch) => ch === lo)
      }
      first ??= lo
    }
    if (!negated) {
      if (first === undefined) throw new Unsupported('empty class')
      return first
    }
    for (const ch of CANDIDATES) if (!tests.some((t) => t(ch))) return ch
    throw new Unsupported('class excludes every candidate')
  }

  private quantified(atom: Node): Node {
    const c = this.peek()
    let min: number
    let max: number
    if (c === '*') [min, max] = [0, Infinity]
    else if (c === '+') [min, max] = [1, Infinity]
    else if (c === '?') [min, max] = [0, 1]
    else if (c === '{') {
      const rest = this.src.slice(this.i).join('')
      const m = /^\{(\d+)(,(\d*))?\}/.exec(rest)
      if (!m) return atom // a literal brace
      min = Number(m[1])
      max = m[2] === undefined ? min : m[3] ? Number(m[3]) : Infinity
      this.i += codePointLength(m[0])
      if (this.peek() === '?') this.i++
      return { t: 'rep', node: atom, min, max }
    } else return atom
    this.i++
    if (this.peek() === '?') this.i++ // lazy modifier changes nothing here
    return { t: 'rep', node: atom, min, max }
  }
}

function generate(node: Node, extra: number): string {
  switch (node.t) {
    case 'lit':
      return node.c
    case 'seq':
      return node.items.map((n) => generate(n, extra)).join('')
    case 'alt':
      return generate(node.options[0]!, extra)
    case 'rep': {
      const count = Math.min(node.max, node.min + extra)
      let out = ''
      for (let k = 0; k < count; k++) out += generate(node.node, extra)
      return out
    }
  }
}

/**
 * A string matching `pattern` within the length limits, or `undefined`
 * when the pattern is outside the supported subset.
 */
export function samplePattern(pattern: string, minLength = 0, maxLength = Infinity): string | undefined {
  const re = compilePattern(pattern)
  if (!re) return undefined
  let tree: Node
  try {
    tree = new Parser(Array.from(pattern)).parse()
  } catch {
    return undefined
  }
  for (let extra = 0; extra <= 64; extra++) {
    const s = generate(tree, extra)
    const len = codePointLength(s)
    if (len > maxLength || len > 10000) break
    if (len >= minLength && re.test(s)) return s
  }
  return undefined
}
