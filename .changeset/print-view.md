---
'@dskripchenko/openapi': minor
---

Print views for a host printing its own page: `printView()` on `<OpenApiReference>` and `<OpenApiOperation>` (through a template ref), and `documentPrintView(ctx)` / `operationPrintView(entry, ctx)`, resolve with `{ html, css, title }` — the static markup `printDocument` / `printOperation` print, a stylesheet for a shadow root, and the title — without opening a dialog. The reference's ref also exposes `print()`.
