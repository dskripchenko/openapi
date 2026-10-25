/**
 * A YAML 1.2 parser for one document, covering what OpenAPI specs use.
 *
 * It is a single-pass recursive descent over the text: block structure is
 * decided from line indentation, flow collections and scalars are scanned
 * character by character. Every node records where it starts under its JSON
 * Pointer — for an object member that is the position of the key, for an
 * array item the position of the item content, for the root always 1:1.
 */
import type { Parsed, Position, PositionMap } from '../core/types'
import { YamlError } from './errors'
import { appendPointer, hasOwn, setProp } from './pointer'
import { isNullText, resolveBool, resolveCore, resolveFloat, resolveInt } from './scalar'

const TAB = 9
const LF = 10
const SP = 32
const BANG = 33
const DQ = 34
const HASH = 35
const PCT = 37
const AMP = 38
const SQ = 39
const STAR = 42
const PLUS = 43
const COMMA = 44
const DASH = 45
const DOT = 46
const COLON = 58
const GT = 62
const QMARK = 63
const AT = 64
const LBRACK = 91
const BSLASH = 92
const RBRACK = 93
const BACKTICK = 96
const LBRACE = 123
const PIPE = 124
const RBRACE = 125

/**
 * Where a block node sits, which decides what may start on the current line:
 * - `map`: a mapping value — no compact collection on the key's line, but a
 *   sequence may sit at the same indentation as the key;
 * - `seq`, `explicit`, `root`: a compact mapping or sequence may start inline
 *   (`- key: v`, `- - x`, `? a: b`).
 */
type Kind = 'root' | 'map' | 'seq' | 'explicit'

interface Props {
  anchor?: string
  tag?: string
  tagPos: number
}

const isFlowIndicator = (c: number): boolean =>
  c === COMMA || c === LBRACK || c === RBRACK || c === LBRACE || c === RBRACE

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** Parses one YAML document into a value and a JSON Pointer → position map. */
export function parseYaml(text: string): Parsed {
  return new Parser(text).parseDocument()
}

class Parser {
  private readonly src: string
  private readonly len: number
  private pos = 0
  private readonly lineStarts: number[]
  private readonly anchors = new Map<string, unknown>()
  private readonly positions: PositionMap = new Map()
  /** The raw text of the last node when it was an untagged plain scalar (merge-key detection). */
  private lastPlain: string | null = null

  constructor(text: string) {
    let s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
    // CR only ever ends a line; normalizing keeps line numbers and columns intact.
    if (s.includes('\r')) s = s.replace(/\r\n?/g, '\n')
    this.src = s
    this.len = s.length
    const starts = [0]
    for (let i = s.indexOf('\n'); i !== -1; i = s.indexOf('\n', i + 1)) starts.push(i + 1)
    this.lineStarts = starts
  }

  /* ----------------------------- document ----------------------------- */

  parseDocument(): Parsed {
    this.positions.set('', { line: 1, column: 1 })
    let ind = this.toNextContent()
    let directives = false
    // %YAML / %TAG directives: skipped, but they demand an explicit '---'.
    while (ind === 0 && this.code(this.pos) === PCT) {
      directives = true
      this.pos = this.lineEnd(this.pos)
      ind = this.toNextContent()
    }
    let value: unknown = null
    if (ind === -1 && this.pos < this.len && this.src.startsWith('---', this.pos)) {
      this.pos += 3
      value = this.parseBlockValue(-1, 'root', '')
    } else {
      if (directives) this.fail("expected '---' after directives")
      if (ind >= 0) value = this.parseBlockValue(-1, 'root', '')
    }
    ind = this.toNextContent()
    if (ind >= 0) this.fail('unexpected content after the document')
    while (this.pos < this.len) {
      if (this.src.startsWith('---', this.pos)) {
        this.fail('multiple documents are not supported')
      }
      this.pos += 3 // '...'
      if (this.toNextContent() >= 0) this.fail('unexpected content after the document end marker')
    }
    return { value, positions: this.positions }
  }

  /* ----------------------------- helpers ----------------------------- */

  private code(p: number): number {
    return this.src.charCodeAt(p)
  }

  private isWsOrEnd(p: number): boolean {
    if (p >= this.len) return true
    const c = this.src.charCodeAt(p)
    return c === SP || c === TAB || c === LF
  }

  private isFlowWsOrEnd(p: number): boolean {
    return this.isWsOrEnd(p) || isFlowIndicator(this.src.charCodeAt(p))
  }

  private lineIndex(p: number): number {
    const starts = this.lineStarts
    let lo = 0
    let hi = starts.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if ((starts[mid] as number) <= p) lo = mid
      else hi = mid - 1
    }
    return lo
  }

  private lineStartOf(p: number): number {
    return this.lineStarts[this.lineIndex(p)] as number
  }

  private lineEnd(p: number): number {
    const e = this.src.indexOf('\n', p)
    return e === -1 ? this.len : e
  }

  private loc(p: number): Position {
    const i = this.lineIndex(p)
    return { line: i + 1, column: p - (this.lineStarts[i] as number) + 1 }
  }

  private fail(reason: string, p: number = this.pos): never {
    const { line, column } = this.loc(Math.min(p, this.len))
    throw new YamlError(reason, line, column)
  }

  /** Records a node start unless the pointer already has one (a member records its key first). */
  private record(path: string | null, p: number): void {
    if (path !== null && !this.positions.has(path)) this.positions.set(path, this.loc(p))
  }

  private skipInlineWs(): void {
    let p = this.pos
    let c = this.src.charCodeAt(p)
    while (c === SP || c === TAB) c = this.src.charCodeAt(++p)
    this.pos = p
  }

  /** At the end of the line, ignoring a comment. `#` starts a comment only after whitespace. */
  private atLineEnd(): boolean {
    const p = this.pos
    if (p >= this.len) return true
    const c = this.src.charCodeAt(p)
    if (c === LF) return true
    if (c === HASH) {
      const prev = this.src.charCodeAt(p - 1)
      return p === 0 || prev === SP || prev === TAB || prev === LF
    }
    return false
  }

  /** `---` or `...` at the start of a line, followed by whitespace or the end. */
  private isDocMarker(p: number): boolean {
    if (p > 0 && this.src.charCodeAt(p - 1) !== LF) return false
    const c = this.src.charCodeAt(p)
    if (c !== DASH && c !== DOT) return false
    return (
      this.src.charCodeAt(p + 1) === c && this.src.charCodeAt(p + 2) === c && this.isWsOrEnd(p + 3)
    )
  }

  /**
   * Moves to the first content character of the next line that has content
   * and returns its indentation; -1 at the end of input or at a document
   * marker (then `pos` is the marker). Idempotent when `pos` already sits at
   * the content start of a line. The rest of the current line must be blank
   * or a comment.
   */
  private toNextContent(): number {
    const src = this.src
    const len = this.len
    const ls = this.lineStartOf(this.pos)
    let q = this.pos
    let c = src.charCodeAt(q)
    while (c === SP || c === TAB) c = src.charCodeAt(++q)
    if (q < len && c !== LF && !(c === HASH && (q === ls || this.isWsOrEnd(q - 1)))) {
      for (let i = ls; i < this.pos; i++) {
        if (src.charCodeAt(i) !== SP) this.fail('unexpected content after the value', q)
      }
      for (let i = ls; i < q; i++) {
        if (src.charCodeAt(i) === TAB) this.fail('tabs are not allowed for indentation', i)
      }
      this.pos = q
      if (q === ls && this.isDocMarker(q)) return -1
      return q - ls
    }
    let p = this.lineEnd(q)
    while (p < len) {
      const start = p + 1
      if (start >= len) break
      let s = start
      while (src.charCodeAt(s) === SP) s++
      let t = s
      c = src.charCodeAt(t)
      while (c === SP || c === TAB) c = src.charCodeAt(++t)
      if (t >= len) break
      if (c === LF) {
        p = t
        continue
      }
      if (c === HASH) {
        p = this.lineEnd(t)
        continue
      }
      if (t > s) this.fail('tabs are not allowed for indentation', s)
      if (s === start && this.isDocMarker(s)) {
        this.pos = s
        return -1
      }
      this.pos = s
      return s - start
    }
    this.pos = len
    return -1
  }

  /* --------------------------- block nodes --------------------------- */

  /**
   * Parses the node that follows an indicator (`key:`, `-`, `?`) or starts
   * the document. `parentIndent` is the indentation of the collection that
   * owns it: content on later lines must be indented deeper.
   */
  private parseBlockValue(parentIndent: number, kind: Kind, path: string | null): unknown {
    this.skipInlineWs()
    const start = this.pos
    if (kind !== 'map' && !this.atLineEnd()) {
      const c = this.code(start)
      const col = start - this.lineStartOf(start)
      if (c === DASH && this.isWsOrEnd(start + 1)) {
        this.record(path, start)
        return this.parseBlockSequence(col, path)
      }
      if ((c === QMARK && this.isWsOrEnd(start + 1)) || this.looksLikeKey(start)) {
        this.record(path, start)
        return this.parseBlockMapping(col, path)
      }
    }
    const props = this.parseProps(false, null)
    if (this.atLineEnd()) {
      // The node (if any) is on the following lines.
      const ind = this.toNextContent()
      if (ind >= 0) {
        const p = this.pos
        const c = this.code(p)
        const isSeq = c === DASH && this.isWsOrEnd(p + 1)
        // A sequence may sit at the very indentation of its mapping key.
        if (ind > parentIndent || (ind === parentIndent && isSeq && kind === 'map')) {
          this.record(path, p)
          let node: unknown
          if (isSeq) node = this.parseBlockSequence(ind, path)
          else if ((c === QMARK && this.isWsOrEnd(p + 1)) || this.looksLikeKey(p)) {
            node = this.parseBlockMapping(ind, path)
          } else return this.parseInlineNode(parentIndent, path, props)
          return this.finishCollection(node, props)
        }
      }
      this.record(path, start)
      return this.finishEmpty(props)
    }
    this.record(path, this.pos)
    return this.parseInlineNode(parentIndent, path, props)
  }

  /** A scalar, alias or flow collection that starts on the current line. */
  private parseInlineNode(parentIndent: number, path: string | null, props: Props | null): unknown {
    let pr = props
    const c0 = this.code(this.pos)
    if (c0 === AMP || c0 === BANG) pr = this.parseProps(false, pr)
    const p = this.pos
    const c = this.code(p)
    this.lastPlain = null
    switch (c) {
      case STAR:
        if (pr) this.fail('an alias cannot have an anchor or a tag')
        return this.parseAlias()
      case PIPE:
      case GT:
        return this.finishScalar(this.parseBlockScalar(parentIndent), false, pr)
      case LBRACK:
      case LBRACE: {
        const node = this.parseFlowCollection(path)
        let q = this.pos
        while (this.code(q) === SP || this.code(q) === TAB) q++
        if (this.code(q) === COLON && this.isWsOrEnd(q + 1)) {
          this.fail('flow collections as mapping keys are not supported', p)
        }
        return this.finishCollection(node, pr)
      }
      case DQ:
        return this.finishScalar(this.parseDouble(), false, pr)
      case SQ:
        return this.finishScalar(this.parseSingle(), false, pr)
    }
    if ((c === DASH || c === QMARK || c === COLON) && this.isWsOrEnd(p + 1)) {
      this.fail(
        c === DASH
          ? 'a block sequence cannot start here'
          : c === QMARK
            ? 'an explicit key cannot start here'
            : 'mapping values are not allowed here',
      )
    }
    if (c === COMMA || c === RBRACK || c === RBRACE || c === PCT || c === AT || c === BACKTICK) {
      this.fail(`unexpected character '${String.fromCharCode(c)}'`)
    }
    return this.finishScalar(this.parsePlainBlock(parentIndent), true, pr)
  }

  private parseBlockMapping(indent: number, path: string | null): Record<string, unknown> {
    const obj: Record<string, unknown> = {}
    // Keys that came from a merge (`<<`) and may still be overridden by an explicit key.
    let merged: Set<string> | null = null
    for (;;) {
      const keyPos = this.pos
      let key: string
      let isMerge = false
      let value: unknown
      if (this.code(keyPos) === QMARK && this.isWsOrEnd(keyPos + 1)) {
        // Explicit entry: `? key` then, on its own line, `: value`.
        this.pos++
        key = this.keyString(this.parseBlockValue(indent, 'explicit', null), keyPos)
        const childPath = path === null ? null : appendPointer(path, key)
        this.claimKey(obj, merged, key, keyPos, childPath)
        const ind = this.toNextContent()
        if (ind === indent && this.code(this.pos) === COLON && this.isWsOrEnd(this.pos + 1)) {
          this.pos++
          value = this.parseBlockValue(indent, 'explicit', childPath)
        } else {
          this.record(childPath, keyPos)
          value = null
        }
      } else {
        const k = this.parseImplicitKey()
        key = k.key
        isMerge = k.isMerge
        const childPath = isMerge || path === null ? null : appendPointer(path, key)
        if (!isMerge) this.claimKey(obj, merged, key, keyPos, childPath)
        value = this.parseBlockValue(indent, 'map', childPath)
      }
      if (isMerge) merged = this.merge(obj, merged, value, keyPos, path)
      else {
        setProp(obj, key, value)
        merged?.delete(key)
      }
      const ind = this.toNextContent()
      if (ind < indent) break
      if (ind > indent) this.fail('bad indentation of a mapping entry')
    }
    return obj
  }

  private parseBlockSequence(indent: number, path: string | null): unknown[] {
    const arr: unknown[] = []
    for (;;) {
      this.pos++ // '-'
      const itemPath = path === null ? null : appendPointer(path, arr.length)
      arr.push(this.parseBlockValue(indent, 'seq', itemPath))
      const ind = this.toNextContent()
      if (ind < indent) break
      if (ind > indent) this.fail('bad indentation of a sequence entry')
      // Same indentation but not '-': the owning mapping continues.
      if (this.code(this.pos) !== DASH || !this.isWsOrEnd(this.pos + 1)) break
    }
    return arr
  }

  /** Checks a key for duplicates and records its position under the member pointer. */
  private claimKey(
    obj: Record<string, unknown>,
    merged: Set<string> | null,
    key: string,
    keyPos: number,
    childPath: string | null,
  ): void {
    if (hasOwn(obj, key) && !merged?.has(key)) this.fail(`duplicate key '${key}'`, keyPos)
    if (childPath !== null) this.positions.set(childPath, this.loc(keyPos))
  }

  /**
   * `<<: *base` or `<<: [*a, *b]` copies the members that are not set yet:
   * explicit keys always win, and an earlier source wins over a later one.
   * Merged members point at the `<<` key.
   */
  private merge(
    obj: Record<string, unknown>,
    merged: Set<string> | null,
    value: unknown,
    keyPos: number,
    path: string | null,
  ): Set<string> | null {
    const sources = Array.isArray(value) ? value : [value]
    for (const source of sources) {
      if (!isPlainObject(source)) {
        this.fail('the merge key << expects a mapping or a sequence of mappings', keyPos)
      }
      for (const k of Object.keys(source)) {
        if (hasOwn(obj, k)) continue
        setProp(obj, k, source[k])
        ;(merged ??= new Set()).add(k)
        if (path !== null) this.positions.set(appendPointer(path, k), this.loc(keyPos))
      }
    }
    return merged
  }

  private keyString(v: unknown, p: number): string {
    if (typeof v === 'object' && v !== null) this.fail('complex mapping keys are not supported', p)
    return String(v)
  }

  /** `key:` / `"key":` / `*alias :` on one line; leaves `pos` after the colon. */
  private parseImplicitKey(): { key: string; isMerge: boolean } {
    const start = this.pos
    const props = this.parseProps(false, null)
    const c = this.code(this.pos)
    let value: unknown
    let isMerge = false
    if (c === DQ || c === SQ) {
      const line = this.lineIndex(this.pos)
      const raw = c === DQ ? this.parseDouble() : this.parseSingle()
      if (this.lineIndex(this.pos) !== line) this.fail('a mapping key must fit on one line', start)
      value = this.convertScalar(raw, false, props)
    } else if (c === STAR) {
      if (props) this.fail('an alias cannot have an anchor or a tag')
      value = this.parseAlias()
    } else {
      if (c === LBRACK || c === LBRACE) {
        this.fail('flow collections as mapping keys are not supported')
      }
      const keyStart = this.pos
      const { text, stop } = this.scanPlainLine(false)
      if (stop !== COLON) this.fail("expected a mapping key followed by ':'", keyStart)
      if (text === '') this.fail('empty mapping keys are not supported', keyStart)
      value = this.convertScalar(text, true, props)
      isMerge = text === '<<' && props?.tag === undefined
    }
    if (props?.anchor !== undefined) this.anchors.set(props.anchor, value)
    this.skipInlineWs()
    if (this.code(this.pos) !== COLON || !this.isWsOrEnd(this.pos + 1)) {
      this.fail("expected ':' after a mapping key")
    }
    this.pos++
    return { key: this.keyString(value, start), isMerge }
  }

  /** Does an implicit key (`key:` followed by whitespace) start at `p` on this line? */
  private looksLikeKey(p: number): boolean {
    const src = this.src
    const len = this.len
    let c = src.charCodeAt(p)
    // Skip node properties: they belong to the key.
    while (c === AMP || c === BANG) {
      while (p < len && !this.isWsOrEnd(p)) p++
      c = src.charCodeAt(p)
      while (c === SP || c === TAB) c = src.charCodeAt(++p)
    }
    if (p >= len || c === LF || c === HASH) return false
    if (c === DQ || c === SQ) {
      p++
      for (;;) {
        if (p >= len) return false
        const d = src.charCodeAt(p)
        if (d === LF) return false
        if (c === DQ && d === BSLASH) {
          p += 2
          continue
        }
        if (d === c) {
          if (c === SQ && src.charCodeAt(p + 1) === SQ) {
            p += 2
            continue
          }
          p++
          break
        }
        p++
      }
    } else if (c === STAR) {
      p++
      while (p < len && !this.isFlowWsOrEnd(p)) p++
    } else {
      if (
        isFlowIndicator(c) ||
        c === PIPE ||
        c === GT ||
        c === PCT ||
        c === AT ||
        c === BACKTICK ||
        ((c === DASH || c === QMARK || c === COLON) && this.isWsOrEnd(p + 1))
      ) {
        return false
      }
      for (; p < len; p++) {
        const d = src.charCodeAt(p)
        if (d === LF) return false
        if (d === COLON && this.isWsOrEnd(p + 1)) return true
        if (d === HASH) {
          const prev = src.charCodeAt(p - 1)
          if (prev === SP || prev === TAB) return false
        }
      }
      return false
    }
    c = src.charCodeAt(p)
    while (c === SP || c === TAB) c = src.charCodeAt(++p)
    return c === COLON && this.isWsOrEnd(p + 1)
  }

  /* ---------------------------- properties ---------------------------- */

  /** Anchors `&a` and tags `!!str`, `!local`, `!<verbatim>` in any order. */
  private parseProps(flow: boolean, existing: Props | null): Props | null {
    let props = existing
    for (;;) {
      const c = this.code(this.pos)
      if (c === AMP) {
        if (props?.anchor !== undefined) this.fail('a node can have only one anchor')
        const start = this.pos++
        const name = this.scanName()
        if (name === '') this.fail('an anchor name is expected', start)
        props ??= { tagPos: start }
        props.anchor = name
      } else if (c === BANG) {
        if (props?.tag !== undefined) this.fail('a node can have only one tag')
        const start = this.pos
        let p = start + 1
        if (this.code(p) === 60 /* < */) {
          const end = this.src.indexOf('>', p)
          if (end === -1 || this.src.slice(p, end).includes('\n')) this.fail('unterminated tag')
          p = end + 1
        } else {
          while (p < this.len && !this.isWsOrEnd(p) && !(flow && isFlowIndicator(this.code(p)))) p++
        }
        this.pos = p
        props ??= { tagPos: start }
        props.tag = normalizeTag(this.src.slice(start, p))
        props.tagPos = start
      } else break
      if (flow) this.skipFlowWs()
      else this.skipInlineWs()
    }
    return props
  }

  private scanName(): string {
    const start = this.pos
    let p = start
    while (p < this.len && !this.isFlowWsOrEnd(p)) p++
    this.pos = p
    return this.src.slice(start, p)
  }

  private parseAlias(): unknown {
    const start = this.pos++
    const name = this.scanName()
    if (name === '') this.fail('an alias name is expected', start)
    if (!this.anchors.has(name)) this.fail(`unknown anchor '${name}'`, start)
    return this.anchors.get(name)
  }

  /** Applies a tag to scalar text. Quoted and block scalars are strings unless a tag says otherwise. */
  private convertScalar(raw: string, plain: boolean, props: Props | null): unknown {
    const tag = props?.tag
    if (tag === undefined) return plain ? resolveCore(raw) : raw
    let v: unknown
    switch (tag) {
      case 'str':
      case '!': // the non-specific tag: "not resolved", i.e. a string
        return raw
      case 'null':
        if (!isNullText(raw)) this.fail(`'${raw}' is not a valid !!null`, props?.tagPos)
        return null
      case 'bool':
        v = resolveBool(raw)
        break
      case 'int':
        v = resolveInt(raw)
        break
      case 'float':
        v = resolveFloat(raw)
        break
      default:
        // Unknown and collection tags are ignored.
        return plain ? resolveCore(raw) : raw
    }
    if (v === undefined) this.fail(`'${raw}' is not a valid !!${tag}`, props?.tagPos)
    return v
  }

  private finishScalar(raw: string, plain: boolean, props: Props | null): unknown {
    const value = this.convertScalar(raw, plain, props)
    this.lastPlain = plain && props?.tag === undefined ? raw : null
    if (props?.anchor !== undefined) this.anchors.set(props.anchor, value)
    return value
  }

  private finishCollection(value: unknown, props: Props | null): unknown {
    this.lastPlain = null
    if (props?.anchor !== undefined) this.anchors.set(props.anchor, value)
    return value
  }

  private finishEmpty(props: Props | null): unknown {
    this.lastPlain = null
    const value = props?.tag === 'str' || props?.tag === '!' ? '' : null
    if (props?.anchor !== undefined) this.anchors.set(props.anchor, value)
    return value
  }

  /* ------------------------------ scalars ------------------------------ */

  /**
   * Scans plain scalar text up to the end of the line. Stops at `: ` (a
   * mapping indicator), at ` #` (a comment) and, inside flow collections, at
   * `,[]{}`. Returns the text without trailing whitespace and the stop code.
   */
  private scanPlainLine(flow: boolean): { text: string; stop: number } {
    const src = this.src
    const len = this.len
    const start = this.pos
    let p = start
    let end = start
    let stop = LF
    while (p < len) {
      const c = src.charCodeAt(p)
      if (c === LF) break
      if (c === COLON) {
        const n = src.charCodeAt(p + 1)
        if (p + 1 >= len || n === SP || n === TAB || n === LF || (flow && isFlowIndicator(n))) {
          stop = COLON
          break
        }
      } else if (c === HASH) {
        const prev = src.charCodeAt(p - 1)
        if (p > start && (prev === SP || prev === TAB)) {
          stop = HASH
          break
        }
      } else if (flow && isFlowIndicator(c)) {
        stop = c
        break
      }
      if (c !== SP && c !== TAB) end = p + 1
      p++
    }
    this.pos = p
    return { text: src.slice(start, end), stop }
  }

  /**
   * A plain scalar in block context. It may continue on following lines that
   * are indented deeper than its collection: a single line break folds into
   * a space, each blank line into a newline. A comment ends it.
   */
  private parsePlainBlock(parentIndent: number): string {
    const src = this.src
    const len = this.len
    let { text, stop } = this.scanPlainLine(false)
    let out = text
    for (;;) {
      if (stop === COLON) this.fail('mapping values are not allowed here')
      if (stop !== LF) return out
      let p = this.pos
      let breaks = 0
      let found = false
      while (p < len) {
        const ls = p + 1
        if (ls >= len) break
        let s = ls
        while (src.charCodeAt(s) === SP) s++
        let t = s
        let c = src.charCodeAt(t)
        while (c === SP || c === TAB) c = src.charCodeAt(++t)
        if (t >= len) break
        if (c === LF) {
          breaks++
          p = t
          continue
        }
        if (s - ls <= parentIndent || c === HASH) break
        if (s === ls && this.isDocMarker(ls)) break
        this.pos = t
        ;({ text, stop } = this.scanPlainLine(false))
        out += breaks > 0 ? '\n'.repeat(breaks) : ' '
        out += text
        found = true
        break
      }
      if (!found) return out
    }
  }

  /** A plain scalar inside a flow collection; continuation lines need no particular indentation. */
  private parsePlainFlow(): string {
    const src = this.src
    let { text, stop } = this.scanPlainLine(true)
    let out = text
    while (stop === LF && this.pos < this.len) {
      let p = this.pos
      let breaks = 0
      for (;;) {
        p++
        let c = src.charCodeAt(p)
        while (c === SP || c === TAB) c = src.charCodeAt(++p)
        if (c === LF) {
          breaks++
          continue
        }
        break
      }
      if (p >= this.len) break
      const c = src.charCodeAt(p)
      if (isFlowIndicator(c) || c === HASH || (c === COLON && this.isFlowWsOrEnd(p + 1))) break
      if (this.isDocMarker(p)) this.fail('a document marker inside a flow collection', p)
      this.pos = p
      ;({ text, stop } = this.scanPlainLine(true))
      out += breaks > 0 ? '\n'.repeat(breaks) : ' '
      out += text
    }
    return out
  }

  /**
   * Line folding inside quoted scalars: `p` is at a line break. Returns the
   * replacement (one space, or a newline per blank line) and the position of
   * the first non-blank character of the continuation line.
   */
  private foldQuoted(p: number, open: number): { text: string; p: number } {
    const src = this.src
    let breaks = 0
    for (;;) {
      p++ // the line break
      if (this.isDocMarker(p)) this.fail('a document marker inside a quoted scalar', p)
      let c = src.charCodeAt(p)
      while (c === SP || c === TAB) c = src.charCodeAt(++p)
      if (p >= this.len) this.fail('unterminated quoted scalar', open)
      if (c !== LF) break
      breaks++
    }
    return { text: breaks > 0 ? '\n'.repeat(breaks) : ' ', p }
  }

  private parseDouble(): string {
    const src = this.src
    const len = this.len
    const open = this.pos
    let p = open + 1
    let out = ''
    // `out` before this index came from escapes and survives trimming at a fold.
    let keep = 0
    for (;;) {
      if (p >= len) this.fail('unterminated double-quoted scalar', open)
      const c = src.charCodeAt(p)
      if (c === DQ) {
        p++
        break
      }
      if (c === BSLASH) {
        const e = src.charCodeAt(p + 1)
        if (e === LF) {
          // An escaped line break joins the lines without a space; blank lines after it still count.
          p += 2
          for (;;) {
            let d = src.charCodeAt(p)
            while (d === SP || d === TAB) d = src.charCodeAt(++p)
            if (d !== LF) break
            out += '\n'
            p++
          }
          keep = out.length
          continue
        }
        const r = this.unescape(p)
        out += r.text
        p = r.p
        keep = out.length
        continue
      }
      if (c === LF) {
        out = trimEndFrom(out, keep)
        const f = this.foldQuoted(p, open)
        out += f.text
        p = f.p
        keep = out.length
        continue
      }
      let q = p + 1
      for (; q < len; q++) {
        const d = src.charCodeAt(q)
        if (d === DQ || d === BSLASH || d === LF) break
      }
      out += src.slice(p, q)
      p = q
    }
    this.pos = p
    return out
  }

  /** One escape sequence at `p` (the backslash). */
  private unescape(p: number): { text: string; p: number } {
    const e = this.src[p + 1]
    switch (e) {
      case '0':
        return { text: '\0', p: p + 2 }
      case 'a':
        return { text: '\x07', p: p + 2 }
      case 'b':
        return { text: '\b', p: p + 2 }
      case 't':
      case '\t':
        return { text: '\t', p: p + 2 }
      case 'n':
        return { text: '\n', p: p + 2 }
      case 'v':
        return { text: '\v', p: p + 2 }
      case 'f':
        return { text: '\f', p: p + 2 }
      case 'r':
        return { text: '\r', p: p + 2 }
      case 'e':
        return { text: '\x1b', p: p + 2 }
      case ' ':
      case '"':
      case '/':
      case '\\':
        return { text: e, p: p + 2 }
      case 'N':
        return { text: '\x85', p: p + 2 }
      case '_':
        return { text: '\xa0', p: p + 2 }
      case 'L':
        return { text: '\u2028', p: p + 2 }
      case 'P':
        return { text: '\u2029', p: p + 2 }
      case 'x':
      case 'u':
      case 'U': {
        const n = e === 'x' ? 2 : e === 'u' ? 4 : 8
        const hex = this.src.slice(p + 2, p + 2 + n)
        if (hex.length !== n || !/^[0-9a-fA-F]+$/.test(hex)) {
          this.fail(`invalid escape '\\${e}${hex}'`, p)
        }
        const cp = parseInt(hex, 16)
        if (cp > 0x10ffff) this.fail(`invalid escape '\\${e}${hex}'`, p)
        return { text: String.fromCodePoint(cp), p: p + 2 + n }
      }
      default:
        this.fail(`invalid escape '\\${e ?? ''}'`, p)
    }
  }

  private parseSingle(): string {
    const src = this.src
    const len = this.len
    const open = this.pos
    let p = open + 1
    let out = ''
    let keep = 0
    for (;;) {
      if (p >= len) this.fail('unterminated single-quoted scalar', open)
      const c = src.charCodeAt(p)
      if (c === SQ) {
        if (src.charCodeAt(p + 1) === SQ) {
          out += "'"
          p += 2
          keep = out.length
          continue
        }
        p++
        break
      }
      if (c === LF) {
        out = trimEndFrom(out, keep)
        const f = this.foldQuoted(p, open)
        out += f.text
        p = f.p
        keep = out.length
        continue
      }
      let q = p + 1
      for (; q < len; q++) {
        const d = src.charCodeAt(q)
        if (d === SQ || d === LF) break
      }
      out += src.slice(p, q)
      p = q
    }
    this.pos = p
    return out
  }

  /**
   * `|` (literal) and `>` (folded) with chomping (`-` strip, `+` keep,
   * default clip) and an optional indentation indicator, which is relative
   * to the indentation of the owning collection.
   */
  private parseBlockScalar(parentIndent: number): string {
    const src = this.src
    const len = this.len
    const literal = this.code(this.pos) === PIPE
    this.pos++
    let chomp = 0 // -1 strip, 0 clip, 1 keep
    let sawChomp = false
    let explicit = 0
    for (let i = 0; i < 2; i++) {
      const c = this.code(this.pos)
      if ((c === PLUS || c === DASH) && !sawChomp) {
        chomp = c === PLUS ? 1 : -1
        sawChomp = true
        this.pos++
      } else if (c >= 49 && c <= 57 && explicit === 0) {
        explicit = c - 48
        this.pos++
      } else break
    }
    if (!this.isWsOrEnd(this.pos)) this.fail('invalid block scalar header')
    this.skipInlineWs()
    if (this.code(this.pos) === HASH) this.pos = this.lineEnd(this.pos)
    else if (!this.atLineEnd()) this.fail('invalid block scalar header')

    const minIndent = parentIndent + 1
    // The indicator counts from the owning collection; the document root counts as 0, as
    // libyaml and other parsers do.
    let indent = Math.max(parentIndent, 0) + explicit
    if (explicit === 0) {
      // Auto-detect: the indentation of the first non-blank line or, when the block has
      // only blank lines, of the longest of them.
      let blank = minIndent
      indent = -1
      let p = this.pos
      while (p < len) {
        const ls = p + 1
        let s = ls
        while (src.charCodeAt(s) === SP) s++
        if (s >= len) {
          blank = Math.max(blank, s - ls)
          break
        }
        if (src.charCodeAt(s) === LF) {
          blank = Math.max(blank, s - ls)
          p = s
          continue
        }
        if (s - ls >= minIndent) indent = s - ls
        break
      }
      if (indent < 0) indent = blank
    }

    const lines: string[] = []
    let p = this.pos
    let end = this.pos
    while (p < len) {
      const ls = p + 1
      if (ls >= len) break
      const le = this.lineEnd(ls)
      let s = ls
      while (s < le && src.charCodeAt(s) === SP) s++
      if (s === le) {
        // Only spaces: empty, unless it has spaces beyond the indentation (then they are text).
        lines.push(s - ls > indent ? src.slice(ls + indent, le) : '')
      } else {
        if (s - ls < indent) break
        if (indent === 0 && this.isDocMarker(ls)) break
        lines.push(src.slice(ls + indent, le))
      }
      p = le
      end = le
    }
    this.pos = end

    let last = lines.length - 1
    while (last >= 0 && lines[last] === '') last--
    if (last < 0) return chomp === 1 ? '\n'.repeat(lines.length) : ''
    const body = literal ? lines.slice(0, last + 1).join('\n') : foldLines(lines, last)
    if (chomp === -1) return body
    if (chomp === 0) return body + '\n'
    return body + '\n'.repeat(lines.length - last)
  }

  /* ------------------------------- flow ------------------------------- */

  /** Whitespace, line breaks and comments between flow tokens. */
  private skipFlowWs(): void {
    const src = this.src
    let p = this.pos
    for (;;) {
      const c = src.charCodeAt(p)
      if (c === SP || c === TAB) p++
      else if (c === LF) {
        p++
        if (this.isDocMarker(p)) this.fail('a document marker inside a flow collection', p)
      } else if (c === HASH && (p === 0 || this.isWsOrEnd(p - 1))) p = this.lineEnd(p)
      else break
    }
    this.pos = p
  }

  private parseFlowNode(path: string | null): unknown {
    this.lastPlain = null
    this.record(path, this.pos)
    const props = this.parseProps(true, null)
    const p = this.pos
    const c = this.code(p)
    if (props && (p >= this.len || c === COMMA || c === RBRACK || c === RBRACE)) {
      return this.finishEmpty(props)
    }
    if (props && c === COLON && this.isFlowWsOrEnd(p + 1)) return this.finishEmpty(props)
    switch (c) {
      case STAR:
        if (props) this.fail('an alias cannot have an anchor or a tag')
        return this.parseAlias()
      case LBRACK:
      case LBRACE:
        return this.finishCollection(this.parseFlowCollection(path), props)
      case DQ:
        return this.finishScalar(this.parseDouble(), false, props)
      case SQ:
        return this.finishScalar(this.parseSingle(), false, props)
      case PIPE:
      case GT:
        this.fail('block scalars are not allowed inside flow collections')
    }
    if (p >= this.len) this.fail('unexpected end of input inside a flow collection')
    if (isFlowIndicator(c) || c === HASH || c === PCT || c === AT || c === BACKTICK) {
      this.fail(`unexpected character '${String.fromCharCode(c)}'`)
    }
    if ((c === DASH || c === QMARK || c === COLON) && this.isFlowWsOrEnd(p + 1)) {
      this.fail(`unexpected '${String.fromCharCode(c)}' inside a flow collection`)
    }
    return this.finishScalar(this.parsePlainFlow(), true, props)
  }

  private parseFlowCollection(path: string | null): unknown {
    const open = this.pos
    const isSeq = this.code(open) === LBRACK
    this.pos++
    if (isSeq) {
      const arr: unknown[] = []
      for (;;) {
        this.skipFlowWs()
        const c = this.code(this.pos)
        if (c === RBRACK) {
          this.pos++
          return arr
        }
        if (this.pos >= this.len) this.fail('unterminated flow sequence', open)
        if (c === COMMA) this.fail("unexpected ','")
        const itemPath = path === null ? null : appendPointer(path, arr.length)
        const itemStart = this.pos
        let explicitPair = false
        if (c === QMARK && this.isFlowWsOrEnd(this.pos + 1)) {
          explicitPair = true
          this.pos++
          this.skipFlowWs()
        }
        let item = this.parseFlowNode(explicitPair ? null : itemPath)
        this.skipFlowWs()
        if (this.code(this.pos) === COLON || explicitPair) {
          // A single-pair mapping inside a flow sequence: `[a: b]`.
          const key = this.keyString(item, itemStart)
          let value: unknown = null
          if (this.code(this.pos) === COLON) {
            this.pos++
            this.skipFlowWs()
            const d = this.code(this.pos)
            if (d !== COMMA && d !== RBRACK) value = this.parseFlowNode(null)
            this.skipFlowWs()
          }
          const pair: Record<string, unknown> = {}
          setProp(pair, key, value)
          item = pair
          this.record(itemPath, itemStart)
        }
        arr.push(item)
        const d = this.code(this.pos)
        if (d === COMMA) this.pos++
        else if (d !== RBRACK) {
          if (this.pos >= this.len) this.fail('unterminated flow sequence', open)
          this.fail("expected ',' or ']' in a flow sequence")
        }
      }
    }
    const obj: Record<string, unknown> = {}
    let merged: Set<string> | null = null
    for (;;) {
      this.skipFlowWs()
      const c = this.code(this.pos)
      if (c === RBRACE) {
        this.pos++
        return obj
      }
      if (this.pos >= this.len) this.fail('unterminated flow mapping', open)
      if (c === COMMA) this.fail("unexpected ','")
      const keyPos = this.pos
      if (c === QMARK && this.isFlowWsOrEnd(this.pos + 1)) {
        this.pos++
        this.skipFlowWs()
      }
      if (this.code(this.pos) === COLON && this.isFlowWsOrEnd(this.pos + 1)) {
        this.fail('empty mapping keys are not supported')
      }
      const k = this.parseFlowNode(null)
      const isMerge = this.lastPlain === '<<'
      const key = this.keyString(k, keyPos)
      const childPath = isMerge || path === null ? null : appendPointer(path, key)
      if (!isMerge) this.claimKey(obj, merged, key, keyPos, childPath)
      this.skipFlowWs()
      let value: unknown = null
      // After a key, ':' is always the value indicator (a plain key never ends at a bare ':').
      if (this.code(this.pos) === COLON) {
        this.pos++
        this.skipFlowWs()
        const d = this.code(this.pos)
        if (d !== COMMA && d !== RBRACE) value = this.parseFlowNode(childPath)
      }
      if (isMerge) merged = this.merge(obj, merged, value, keyPos, path)
      else {
        setProp(obj, key, value)
        merged?.delete(key)
      }
      this.skipFlowWs()
      const d = this.code(this.pos)
      if (d === COMMA) this.pos++
      else if (d !== RBRACE) {
        if (this.pos >= this.len) this.fail('unterminated flow mapping', open)
        this.fail("expected ',' or '}' in a flow mapping")
      }
    }
  }
}

/** `!!x` and `!<tag:yaml.org,2002:x>` become `x`; other tags stay as written (and are ignored). */
function normalizeTag(raw: string): string {
  if (raw.startsWith('!!')) return raw.slice(2)
  if (raw.startsWith('!<tag:yaml.org,2002:') && raw.endsWith('>')) return raw.slice(20, -1)
  return raw
}

/** Drops trailing spaces/tabs, but never below `keep` (content produced by escapes). */
function trimEndFrom(s: string, keep: number): string {
  let i = s.length
  while (i > keep) {
    const c = s.charCodeAt(i - 1)
    if (c !== SP && c !== TAB) break
    i--
  }
  return i === s.length ? s : s.slice(0, i)
}

/**
 * Folded block scalar body: a line break between two ordinary lines becomes
 * a space, blank lines become newlines, and lines that start with whitespace
 * ("more indented") keep their surrounding line breaks.
 */
function foldLines(lines: string[], last: number): string {
  let out = ''
  let empties = 0
  let prevMore = false
  let first = true
  for (let i = 0; i <= last; i++) {
    const line = lines[i] as string
    if (line === '') {
      empties++
      continue
    }
    const c = line.charCodeAt(0)
    const more = c === SP || c === TAB
    if (first) out += '\n'.repeat(empties)
    else if (more || prevMore) out += '\n'.repeat(empties + 1)
    else out += empties > 0 ? '\n'.repeat(empties) : ' '
    out += line
    first = false
    prevMore = more
    empties = 0
  }
  return out
}
