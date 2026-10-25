/**
 * Names and literals of the generated TypeScript: PascalCase type names,
 * property keys that need quotes, string literals and JSDoc text.
 */

/**
 * A PascalCase identifier: the text is split on anything but letters and
 * digits and each part gets its first letter upper-cased (`createOrder` →
 * `CreateOrder`, `order_item` → `OrderItem`, `get /pets/{id}` → `GetPetsId`),
 * the way laravel-api names its generated types. A leading digit gets `_`;
 * text without letters or digits gives ''.
 */
export function typeName(text: string): string {
  const out = text
    .split(/[^\p{L}\p{Nd}]+/u)
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join('')
  return /^\p{Nd}/u.test(out) ? `_${out}` : out
}

/** A single-quoted TypeScript string literal. */
export function quote(text: string): string {
  return `'${JSON.stringify(text).slice(1, -1).replace(/\\"/g, '"').replace(/'/g, "\\'")}'`
}

/** A property key: bare when it is an identifier, else quoted. Reserved words are fine as keys. */
export function propertyKey(name: string): string {
  return /^[A-Za-z_$][\w$]*$/.test(name) ? name : quote(name)
}

/** A literal type for a JSON value; undefined when the value has no literal type (objects, arrays). */
export function literal(value: unknown): string | undefined {
  if (value === null) return 'null'
  if (typeof value === 'string') return quote(value)
  if (typeof value === 'boolean') return String(value)
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return undefined
}

/** A JSDoc block from its lines (empty when there are none), every line indented. */
export function jsdoc(lines: string[], indent: string): string {
  const body = lines.flatMap((l) => l.split(/\r?\n/)).map((l) => l.replace(/\*\//g, '*\\/').trimEnd())
  while (body.length && body[body.length - 1] === '') body.pop()
  if (!body.length) return ''
  if (body.length === 1) return `${indent}/** ${body[0]} */\n`
  return `${indent}/**\n${body.map((l) => (l ? `${indent} * ${l}` : `${indent} *`)).join('\n')}\n${indent} */\n`
}
