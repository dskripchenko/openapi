/** JSON when the first meaningful character opens an object or an array, YAML otherwise. */
export function detectFormat(text: string): 'json' | 'yaml' {
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    if (c === 0xfeff || c === 32 || c === 9 || c === 10 || c === 13) continue
    return c === 123 || c === 91 ? 'json' : 'yaml'
  }
  return 'yaml'
}
