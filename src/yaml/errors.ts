/** A YAML syntax error with the 1-based place where it was found. */
export class YamlError extends Error {
  readonly line: number
  readonly column: number
  /** The message without the location suffix. */
  readonly reason: string

  constructor(reason: string, line: number, column: number) {
    super(`${reason} (line ${line}, column ${column})`)
    this.name = 'YamlError'
    this.reason = reason
    this.line = line
    this.column = column
  }
}
