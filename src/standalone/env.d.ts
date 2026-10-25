// Styles are bundled by Vite.
declare module '*.css'
// A stylesheet as text (Vite's ?raw).
declare module '*.css?raw' {
  const css: string
  export default css
}
