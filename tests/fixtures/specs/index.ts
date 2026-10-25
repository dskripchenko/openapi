import { readFileSync } from 'node:fs'

/** Raw text of a fixture in this directory. */
export function fixtureText(name: string): string {
  return readFileSync(new URL(`./${name}`, import.meta.url), 'utf8')
}

/** A JSON fixture parsed with the built-in JSON.parse. */
export function fixtureJson(name: string): unknown {
  return JSON.parse(fixtureText(name))
}
