/** Thrown for a block whose data is readable but not a valid block; `pointer` is the value at fault. */
export class BlockError extends Error {
  readonly pointer: string

  constructor(message: string, pointer = '') {
    super(message)
    this.name = 'BlockError'
    this.pointer = pointer
  }
}
