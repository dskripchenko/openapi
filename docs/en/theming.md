# Theming

The reference and the editor are drawn with the tokens of
[`@dskripchenko/ui`](https://github.com/dskripchenko/ui) — its surfaces,
text colours, borders, accent and status colours — and with its components.
Whatever theme the kit shows, the package follows: a custom kit theme
restyles it too.

## Dark theme

There is nothing to set up. The kit switches themes by the `data-theme`
attribute on `<html>` (or any ancestor), and the package's colours come from
the kit's tokens:

```html
<html data-theme="dark">
```

To follow the system setting, set the attribute from the app — the kit's
`useTheme()` does this — and the reference and the editor follow along with
the rest of the page.

The page background is the host's: set it on `body` or the container, for
example to the kit's `--uid-surface-base`.

## Variables

A few things of the package's own are CSS custom properties.

| Variable | Default | Used for |
|---|---|---|
| `--oa-sticky-top` | `0px` | The offset of the sticky navigation, samples column and editor tree from the top, and of the anchors' scroll position — set it to the height of a fixed header. |
| `--oa-source-height` | `560px` | The height of the editor's source view. |
| `--oa-nav-width` | `272px` | The width of the reference's navigation column. |
| `--oa-gap` | `24px` | The gap between the columns and between the blocks of an operation. |
| `--oa-radius` | `8px` | The corner radius of panels. |
| `--oa-mono` | `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace` | The monospace font of paths, types and code. |
| `--oa-get` / `--oa-get-bg` | `var(--uid-info)` / `var(--uid-info-subtle)` | The `GET` badge: text / background. |
| `--oa-post` / `--oa-post-bg` | `var(--uid-success)` / `var(--uid-success-subtle)` | `POST`. |
| `--oa-put` / `--oa-put-bg` | `var(--uid-warning)` / `var(--uid-warning-subtle)` | `PUT`. |
| `--oa-patch` / `--oa-patch-bg` | `var(--uid-warning)` / `var(--uid-warning-subtle)` | `PATCH`. |
| `--oa-delete` / `--oa-delete-bg` | `var(--uid-danger)` / `var(--uid-danger-subtle)` | `DELETE`. |
| `--oa-other` / `--oa-other-bg` | `var(--uid-text-secondary)` / `var(--uid-color-bg-subtle)` | `HEAD`, `OPTIONS`, `TRACE`. |

## Where to set them

The variables have no values of their own: each default above is a fallback
at the place it is used. Set them on the component, on any ancestor or on
`:root`:

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

Leave the method colours alone and they stay in step with the kit's status
colours in both themes.

## Code colours

Code blocks — request samples, examples, responses and the editor's source —
use the kit's code highlighting and its `--uid-code-tok-*` tokens; restyle
them through the kit.

## Class names

Elements carry stable class names with the `oa-` prefix — `oa-reference`,
`oa-nav`, `oa-op`, `oa-method oa-method--get`, `oa-schema`, `oa-tryit`,
`oa-editor` and so on — for styling from outside. The anchors of operations
and schemas are their element ids: `operation/{id}` and `schema/{name}`.
