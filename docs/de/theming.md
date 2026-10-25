# Theming

Die Referenz und der Editor werden mit den Tokens von
[`@dskripchenko/ui`](https://github.com/dskripchenko/ui) gezeichnet — seinen
Flächen, Textfarben, Rahmen, Akzent- und Statusfarben — und mit seinen
Komponenten. Welches Theme das Kit auch zeigt, das Paket folgt ihm: Auch ein
eigenes Kit-Theme gestaltet es um.

## Dunkles Theme

Es gibt nichts einzurichten. Das Kit wechselt Themes über das Attribut
`data-theme` an `<html>` (oder einem beliebigen Vorfahren), und die Farben des
Pakets stammen aus den Tokens des Kits:

```html
<html data-theme="dark">
```

Um der Systemeinstellung zu folgen, setzen Sie das Attribut aus der
Anwendung — `useTheme()` des Kits tut das —, und Referenz und Editor folgen
zusammen mit dem Rest der Seite.

Der Seitenhintergrund ist Sache des Hosts: Setzen Sie ihn auf `body` oder den
Container, zum Beispiel auf `--uid-surface-base` des Kits.

## Variablen

Einige paketeigene Dinge sind CSS Custom Properties.

| Variable | Standard | Verwendet für |
|---|---|---|
| `--oa-sticky-top` | `0px` | Den Abstand der sticky Navigation, der Beispielspalte und des Editor-Baums von oben sowie der Scrollposition der Anker — setzen Sie ihn auf die Höhe einer festen Kopfzeile. |
| `--oa-source-height` | `560px` | Die Höhe der Quelltext-Ansicht des Editors. |
| `--oa-nav-width` | `272px` | Die Breite der Navigationsspalte der Referenz. |
| `--oa-gap` | `24px` | Den Abstand zwischen den Spalten und zwischen den Blöcken einer Operation. |
| `--oa-radius` | `8px` | Den Eckenradius von Panels. |
| `--oa-mono` | `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace` | Die Monospace-Schrift für Pfade, Typen und Code. |
| `--oa-get` / `--oa-get-bg` | `var(--uid-info)` / `var(--uid-info-subtle)` | Das `GET`-Badge: Text / Hintergrund. |
| `--oa-post` / `--oa-post-bg` | `var(--uid-success)` / `var(--uid-success-subtle)` | `POST`. |
| `--oa-put` / `--oa-put-bg` | `var(--uid-warning)` / `var(--uid-warning-subtle)` | `PUT`. |
| `--oa-patch` / `--oa-patch-bg` | `var(--uid-warning)` / `var(--uid-warning-subtle)` | `PATCH`. |
| `--oa-delete` / `--oa-delete-bg` | `var(--uid-danger)` / `var(--uid-danger-subtle)` | `DELETE`. |
| `--oa-other` / `--oa-other-bg` | `var(--uid-text-secondary)` / `var(--uid-color-bg-subtle)` | `HEAD`, `OPTIONS`, `TRACE`. |

## Wo man sie setzt

Die Variablen haben keine eigenen Werte: Jeder Standardwert oben ist ein
Fallback an der Stelle, an der er verwendet wird. Setzen Sie sie auf der
Komponente, auf einem beliebigen Vorfahren oder auf `:root`:

```css
:root {
  --oa-sticky-top: 64px;    /* the height of the site header */
}

.docs {
  --oa-nav-width: 320px;
  --oa-get: #0284c7;
  --oa-get-bg: #e0f2fe;
}

[data-theme='dark'] .docs {
  --oa-get: #7dd3fc;
  --oa-get-bg: #0c4a6e;
}
```

Lassen Sie die Methodenfarben unverändert, bleiben sie in beiden Themes im
Einklang mit den Statusfarben des Kits.

## Codefarben

Codeblöcke — Anfragebeispiele, Beispiele, Antworten und der Quelltext des
Editors — verwenden die Codehervorhebung des Kits und seine
`--uid-code-tok-*`-Tokens; gestalten Sie sie über das Kit um.

## Klassennamen

Elemente tragen stabile Klassennamen mit dem Präfix `oa-` — `oa-reference`,
`oa-nav`, `oa-op`, `oa-method oa-method--get`, `oa-schema`, `oa-tryit`,
`oa-editor` und so weiter — zum Gestalten von außen. Die Anker von
Operationen und Schemas sind ihre Element-ids: `operation/{id}` und
`schema/{name}`.
