/**
 * A strict JSON parser (RFC 8259) that also records where every value
 * starts, with the same JSON Pointer convention as the YAML parser: an
 * object member points at its key, an array item at the item, the root at 1:1.
 */
import type { Parsed, Position, PositionMap } from '../core/types'
import { appendPointer, hasOwn, setProp } from '../yaml/pointer'

export { detectFormat } from './detect'

/** A JSON syntax error with the 1-based place where it was found. */
export class JsonError extends Error {
  readonly line: number
  readonly column: number
  /** The message without the location suffix. */
  readonly reason: string

  constructor(reason: string, line: number, column: number) {
    super(`${reason} (line ${line}, column ${column})`)
    this.name = 'JsonError'
    this.reason = reason
    this.line = line
    this.column = column
  }
}

/**
 * Parses JSON text. A UTF-8 BOM is tolerated. Unlike `JSON.parse`, a
 * duplicate key is an error: in a spec it is always a mistake.
 */
export function parseJson(text: string): Parsed {
  return new JsonParser(text).parse()
}

/** `JSON.stringify` with indentation; `undefined` and the like become `null`. */
export function stringifyJson(value: unknown, indent = 2): string {
  return JSON.stringify(value, null, indent) ?? 'null'
}

const NUMBER = /-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][-+]?[0-9]+)?/y

class JsonParser {
  private readonly src: string
  private readonly len: number
  private pos = 0
  private line = 1
  private lineStart = 0
  private readonly positions: PositionMap = new Map()

  constructor(text: string) {
    this.src = text
    this.len = text.length
    if (text.charCodeAt(0) === 0xfeff) {
      // The BOM is not a column.
      this.pos = 1
      this.lineStart = 1
    }
  }

  parse(): Parsed {
    this.positions.set('', { line: 1, column: 1 })
    this.ws()
    const value = this.value('')
    this.ws()
    if (this.pos < this.len) this.fail('unexpected content after the JSON value')
    return { value, positions: this.positions }
  }

  /** Valid JSON has line breaks only between tokens, so the line is tracked here. */
  private ws(): void {
    const src = this.src
    let p = this.pos
    for (;;) {
      const c = src.charCodeAt(p)
      if (c === 32 || c === 9 || c === 13) p++
      else if (c === 10) {
        p++
        this.line++
        this.lineStart = p
      } else break
    }
    this.pos = p
  }

  private loc(p: number): Position {
    if (p >= this.lineStart) return { line: this.line, column: p - this.lineStart + 1 }
    // An earlier line (an error reported at an opening bracket): count from the start.
    let line = 1
    let start = this.src.charCodeAt(0) === 0xfeff ? 1 : 0
    for (let i = this.src.indexOf('\n'); i !== -1 && i < p; i = this.src.indexOf('\n', i + 1)) {
      line++
      start = i + 1
    }
    return { line, column: p - start + 1 }
  }

  private fail(reason: string, p: number = this.pos): never {
    const { line, column } = this.loc(p)
    throw new JsonError(reason, line, column)
  }

  private value(path: string): unknown {
    const c = this.src.charCodeAt(this.pos)
    switch (c) {
      case 123:
        return this.object(path)
      case 91:
        return this.array(path)
      case 34:
        return this.string()
      case 116:
        return this.literal('true', true)
      case 102:
        return this.literal('false', false)
      case 110:
        return this.literal('null', null)
    }
    if (c === 45 || (c >= 48 && c <= 57)) return this.number()
    if (this.pos >= this.len) this.fail('unexpected end of input')
    this.fail(`unexpected character '${this.src[this.pos] ?? ''}'`)
  }

  private literal(word: string, value: unknown): unknown {
    if (!this.src.startsWith(word, this.pos)) this.fail(`unexpected token, expected '${word}'`)
    this.pos += word.length
    return value
  }

  private number(): number {
    NUMBER.lastIndex = this.pos
    const m = NUMBER.exec(this.src)
    if (!m) this.fail('invalid number')
    const end = this.pos + m[0].length
    const next = this.src.charCodeAt(end)
    // `01`, `1.`, `1e`, `-`: the grammar match stops short of a number-ish character.
    if (
      (next >= 48 && next <= 57) ||
      next === 46 ||
      next === 101 ||
      next === 69 ||
      next === 43 ||
      next === 45
    ) {
      this.fail('invalid number')
    }
    this.pos = end
    return Number(m[0])
  }

  private string(): string {
    const src = this.src
    const open = this.pos
    let p = open + 1
    let out = ''
    let run = p
    for (;;) {
      if (p >= this.len) this.fail('unterminated string', open)
      const c = src.charCodeAt(p)
      if (c === 34) break
      if (c < 0x20) this.fail(c === 10 ? 'unterminated string' : 'control character in a string', p)
      if (c !== 92) {
        p++
        continue
      }
      out += src.slice(run, p)
      const e = src[p + 1]
      switch (e) {
        case '"':
        case '\\':
        case '/':
          out += e
          break
        case 'b':
          out += '\b'
          break
        case 'f':
          out += '\f'
          break
        case 'n':
          out += '\n'
          break
        case 'r':
          out += '\r'
          break
        case 't':
          out += '\t'
          break
        case 'u': {
          const hex = src.slice(p + 2, p + 6)
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) this.fail('invalid \\u escape', p)
          out += String.fromCharCode(parseInt(hex, 16))
          p += 4
          break
        }
        default:
          this.fail(`invalid escape '\\${e ?? ''}'`, p)
      }
      p += 2
      run = p
    }
    out += src.slice(run, p)
    this.pos = p + 1
    return out
  }

  private object(path: string): Record<string, unknown> {
    const open = this.pos
    this.pos++
    const obj: Record<string, unknown> = {}
    this.ws()
    if (this.src.charCodeAt(this.pos) === 125) {
      this.pos++
      return obj
    }
    for (;;) {
      this.ws()
      if (this.src.charCodeAt(this.pos) !== 34) {
        if (this.pos >= this.len) this.fail('unterminated object', open)
        this.fail('expected a string key')
      }
      const keyPos = this.pos
      const key = this.string()
      if (hasOwn(obj, key)) this.fail(`duplicate key '${key}'`, keyPos)
      const childPath = appendPointer(path, key)
      this.positions.set(childPath, this.loc(keyPos))
      this.ws()
      if (this.src.charCodeAt(this.pos) !== 58) this.fail("expected ':' after a key")
      this.pos++
      this.ws()
      setProp(obj, key, this.value(childPath))
      this.ws()
      const c = this.src.charCodeAt(this.pos)
      if (c === 44) {
        this.pos++
        continue
      }
      if (c === 125) {
        this.pos++
        return obj
      }
      if (this.pos >= this.len) this.fail('unterminated object', open)
      this.fail("expected ',' or '}'")
    }
  }

  private array(path: string): unknown[] {
    const open = this.pos
    this.pos++
    const arr: unknown[] = []
    this.ws()
    if (this.src.charCodeAt(this.pos) === 93) {
      this.pos++
      return arr
    }
    for (;;) {
      this.ws()
      const childPath = appendPointer(path, arr.length)
      this.positions.set(childPath, this.loc(this.pos))
      arr.push(this.value(childPath))
      this.ws()
      const c = this.src.charCodeAt(this.pos)
      if (c === 44) {
        this.pos++
        continue
      }
      if (c === 93) {
        this.pos++
        return arr
      }
      if (this.pos >= this.len) this.fail('unterminated array', open)
      this.fail("expected ',' or ']'")
    }
  }
}
