# OpenApiEditor

A visual editor for OpenAPI documents, with the source and a preview beside
the forms.

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { OpenApiEditor } from '@dskripchenko/openapi/vue'

const text = ref(initialYaml)
</script>

<template>
  <OpenApiEditor v-model="text" locale="en" />
</template>
```

## Props and events

| Prop | Type | Default | |
|---|---|---|---|
| `modelValue` | `string` | — | The document's text, YAML or JSON. Use `v-model`. |
| `view` | `'visual' \| 'source' \| 'preview'` | `'visual'` | The view the editor opens with. |
| `locale` | `string` | — | `'en'` or `'ru'`; also sets the kit's locale inside, as in the [reference](reference.md#languages). |
| `labels` | `Partial<EditorLabels>` | `{}` | Overrides of single editor strings. |
| `send` | `SendFn` | `fetch` | Passed to the preview's try-it. See [the proxy](reference.md#sending-through-your-server). |
| `newFormat` | `'yaml' \| 'json'` | `'yaml'` | The format of a document created from an empty text. |

| Event | Payload | |
|---|---|---|
| `update:modelValue` | `string` | The new text, after every change in any view. |

The text is the only state the editor shares with the host: save it the way
you save any other text. A new `modelValue` from outside replaces the
document being edited.

## The format is kept

The editor reads the text as YAML or JSON (JSON when it starts with `{` or
`[`) and writes it back in the same format. The bar has a YAML / JSON switch
that rewrites the whole document in the other format.

The version is kept too: the forms edit the document as it is, not a
normalized copy, so an OpenAPI 3.0 document stays 3.0. Where the two versions
spell something differently, the forms follow the document's version — a
nullable field becomes `nullable: true` in 3.0 and `type: [string, 'null']`
in 3.1.

## Three views

The bar at the top switches between them.

**Visual.** On the left, a tree of the document: info, servers, tags,
security schemes, paths with their operations, and schemas. `+` next to a
section adds an item. On the right, a form for the chosen node.

**Source.** The text, with highlighting, line numbers and the problems found
listed under it. Typing here edits the text as it is — formatting and
comments stay. Tab inserts two spaces. Very large texts (over about
150,000 characters) are shown without highlighting so that typing stays fast.

**Preview.** The document rendered by [`OpenApiReference`](reference.md),
with the same `locale` and `send`; try-it works there. The preview does not
touch `location.hash`.

## What the forms cover

- **Info** — title, version, summary, description (markdown), terms of
  service, contact name, email and URL, license name and URL.
- **Servers** — URL and description of each server, and its variables with a
  default and a list of allowed values.
- **Tags** — name and description; their order is the order of the sections
  in the reference.
- **Security schemes** — the type (`apiKey`, `http`, `oauth2`,
  `openIdConnect`, `mutualTLS`) and the fields of that type: where an API key
  goes and its name; the http scheme and bearer format; an OAuth2 flow with
  its URLs and scopes (one `name: description` per line); the OpenID Connect
  URL.
- **Paths** — the path template (renamed when the field loses focus; it must
  start with `/`), the methods it has, and "Add operation".
- **Operations** — summary, description, `operationId`, tags, deprecated;
  parameters (name, `in`, required, description, schema), with one-click
  entries for the `{names}` of the path that have no parameter yet; the
  request body with its media types and their schemas; responses by status
  code with a description and content; security — as the document, none, or
  chosen schemes.
- **Schemas** — the name (renamed on blur; references
  `#/components/schemas/{name}` across the document follow the new name) and
  the schema itself: a type, a reference to another schema, or a
  `oneOf` / `anyOf` / `allOf` composition; format, nullable, allowed values,
  default, example, pattern and the length, range and item-count limits;
  properties with their required flag, and array items — each a schema form of
  its own.

Anything the forms do not show — extensions, `examples`, `callbacks`,
`links`, document-level `security` and the rest — is kept as it is, and can
be edited in the source.

## Visual edits rewrite the text

A change in a form is written back about a quarter of a second after the last
keystroke, by serializing the whole document again. That keeps the order of
the keys, but the text is laid out anew: in YAML, 2-space indentation and
quotes only where they are needed; in JSON, 2-space pretty printing.

**Comments in YAML do not survive a visual edit**, and neither does custom
formatting. If the file's comments matter, edit it in the source view: there
the text is kept exactly as typed.

## Swagger 2.0

A Swagger 2.0 document opens in the source and preview views as usual. The
visual view shows a note instead of the forms, since the forms speak
OpenAPI 3, with a "Convert to OpenAPI 3.1" button. The conversion is the one
the reference uses for display (see [`normalize`](core.md#normalization)):
`host`, `basePath` and `schemes` become `servers`, body and form parameters
become `requestBody`, `definitions` become `components.schemas`, and so on.
It replaces the text; to keep the 2.0 file, keep a copy.

## An empty text

When `modelValue` is empty, the visual view offers "Create a document", which
writes a minimal OpenAPI 3.1 document (title, version, empty `paths`) in the
`newFormat` format.

## Problems

The bar shows the number of errors in the document — the button
"Problems: N", or "No problems". It opens the source view, where every
problem found by [`validateDocument`](core.md#validation) is listed with its
line, errors and warnings alike; a click puts the cursor on that line, and
lines with errors are marked in the gutter. Text that cannot be parsed at all
shows the parser's message and position instead; until the text reads again,
the visual view and the preview show that message too.

Problems are checked again after every parse and every form edit. While
typing in a very large text (over 100,000 characters), the parse waits for a
short pause.

## Labels

`locale` picks the editor's strings — English (`editorEn`) and Russian
(`editorRu`) ship with the package, `EDITOR_LOCALES` holds both — and
`labels` overrides single ones:

```vue
<OpenApiEditor v-model="text" locale="en" :labels="{ visual: 'Forms', newDocumentTitle: 'Untitled API' }" />
```

A full dictionary for another language has the type `EditorLabels`:

```ts
import { editorEn, type EditorLabels } from '@dskripchenko/openapi/vue'

const editorDe: EditorLabels = { ...editorEn, visual: 'Formulare', source: 'Quelltext', preview: 'Vorschau' /* … */ }
```

The preview is an `OpenApiReference` and takes its strings from `locale`
only; `labels` of the editor do not reach it.
