# Deep links and prefilled links

The reference reads two kinds of addresses: links to a section, and links
that open an operation with its try-it form already filled.

## Section anchors

The reference's own anchors are the element ids of its sections:

| Anchor | Opens |
|---|---|
| `#operation/{id}` | an operation — `{id}` is the `operationId`, or a slug such as `get-pets-id` |
| `#schema/{name}` | a schema of `components.schemas` |
| `#tag/{name}` | a tag's section |

With [several specs](reference.md#several-specs) on the page, each anchor
starts with the spec's id — `#v1/operation/getPet` — and `#v1` alone opens
that spec.

The address is read when the page opens and whenever the hash changes
afterwards. With `hashNavigation` (the default) a click in the navigation
writes the section's anchor into the address, and every operation header has
a button that copies the link to it.

## Scalar links

Links built for a Scalar page are understood too, so existing links — from
laravel-api's `DocLink`, from its IDE plugin, from bookmarks — keep working
after a switch:

| Scalar form | Opens |
|---|---|
| `#[{doc}/]tag/{tagSlug}/{METHOD}{path}` | the operation with that method and path |
| `#[{doc}/]tag/{tagSlug}` | the tag's section |
| `#[{doc}/]model/{name}` | the schema |

For example `#v1/tag/pets/GET/pets/{id}` opens `GET /pets/{id}` of the spec
`v1`.

How the parts are matched:

- **The document segment** names the spec whose id equals it, else the spec
  whose id or name, slugified by Scalar's rule, equals it (for versions,
  dots and slashes become hyphens, so a spec named `v1.1` answers to `v1-1`). A segment
  that names no spec but stands before a section — `v1/tag/…` on a page with
  one spec — is ignored, and the open spec is meant.
- **The tag and schema names** are compared by slug: `Pet Store` matches
  `pet-store`.
- **The path** matches the operation's path, or that path with a server's
  base path in front (or the other way round), so a link built from the full
  URI `/api/v2/pets` finds `/pets` in a spec whose server is `…/api/v2`.
  When the operation is not found, the link opens its tag.

With `hashNavigation` the address is then replaced with the canonical
anchor, so reloading or copying it gives the reference's own form.

`scalarSlug(text)` and `scalarDocumentSlug(version)` — the slug rules — are
exported from `@dskripchenko/openapi`, for building such links elsewhere.

## Prefilled links

A prefilled link opens an operation with its try-it form filled: parameters,
the body, the server, optionally credentials. **Nothing is sent by itself**:
the reader sees a notice — "Form filled from a link — check the values before
sending" — next to the filled form, which the page scrolls to, and presses
"Send" when ready.

### Copy link

The try-it panel of every operation has a "Copy link" button: it copies a
prefilled link with the form as it is now. Credentials are left out unless
"Include credentials" is ticked — off by default, with a warning that anyone
who gets the link can use them.

To keep links short, the encoder leaves out what the page would fill in by
itself: empty values, the first server (index 0) and server variables at
their defaults, the first media type, and a body equal to the generated
sample. Files never travel in a link.

Once the form is filled, the address is replaced with the operation's plain
anchor (with `hashNavigation`), so a reload does not fill it again and
credentials leave the address bar.

### The format

The format is stable, version 1. Other tools can build such links — laravel-api
does, in PHP.

```text
{page}#{anchor}?f={payload}        the payload in the hash
{page}?oa-f={payload}#{anchor}     or as a query parameter (the hash wins)
```

`{anchor}` is an operation anchor, canonical (`[{spec}/]operation/{id}`) or
a Scalar form (`{doc}/tag/{tag}/{METHOD}{path}`). `{payload}` is one
character and base64url (RFC 4648 §5, without padding):

- `z` + base64url of the UTF-8 JSON compressed with raw DEFLATE (RFC 1951) —
  `CompressionStream('deflate-raw')` in a browser, `gzdeflate()` in PHP;
- `j` + base64url of the UTF-8 JSON itself.

The JSON:

```json
{
  "v": 1,
  "server": 0,
  "vars": { "region": "us" },
  "path": { "id": "42" },
  "query": { "limit": "10" },
  "header": { "X-Trace": "abc" },
  "cookie": { "session": "…" },
  "mediaType": "application/json",
  "body": "{\"name\":\"Rex\"}",
  "auth": { "bearerAuth": "token", "basicAuth": { "username": "u", "password": "p" } }
}
```

| Key | |
|---|---|
| `v` | The version: `1`. Required. |
| `server` | An index into the operation's servers, or a server URL. A URL that matches one of the servers (as written, or with `vars` filled in) chooses it; any other URL becomes a custom server. |
| `vars` | Server variables. |
| `path`, `query`, `header`, `cookie` | Parameter values as typed, as strings, by parameter name (header names in any case). |
| `mediaType` | The body's media type, when the operation accepts it. |
| `body` | The body text as typed. |
| `auth` | Credentials by security scheme name: a key or token, or `{ username, password }`. |

Every key but `v` is optional, and unknown keys are ignored. Numbers and
booleans among the values are read as their text; other values are dropped.
A payload that is malformed, inflates past 1 MB, or has a `v` other than 1 is
ignored (a later version with a console warning), and the link simply opens
the operation.

In PHP:

```php
$data = ['v' => 1, 'path' => ['id' => '42'], 'body' => '{"name":"Rex"}'];
$payload = 'z' . rtrim(strtr(base64_encode(gzdeflate(json_encode($data, JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES))), '+/', '-_'), '=');
$link = "https://example.com/docs#v1/operation/updatePet?f={$payload}";
```

In TypeScript, with the core:

```ts
import { encodePrefill, prefillHash } from '@dskripchenko/openapi'

const payload = await encodePrefill({ v: 1, path: { id: '42' } })
const link = `https://example.com/docs#${prefillHash('v1/operation/updatePet', payload)}`
```

`encodePrefill(data, { compress? })` makes a `z` payload where
`CompressionStream` exists and a `j` one otherwise; `decodePrefill(payload)`
returns the data or `null`; `prefillHash(anchor, payload)` gives
`{anchor}?f={payload}`. `PREFILL_VERSION` is `1`; the types are `PrefillData`
and `PrefillValues`.

## The core functions

All exported from `@dskripchenko/openapi`:

| | |
|---|---|
| `splitLink(hash)` | `{ anchor, payload? }`: the anchor (decoded) and the `?f=` payload of a hash. |
| `pickSpec(anchor, specs)` | `{ spec?, rest }`: which spec of `LinkSpec[]` (`{ id, name? }`) the document segment names, and the rest of the anchor. |
| `resolveSection(rest, spec)` | The canonical section of a loaded spec — `operation/{id}`, `schema/{name}` or `tag/{name}` — for our or Scalar's form, or `null`. |
| `scalarSlug(text)`, `scalarDocumentSlug(version)` | Scalar's slug rules. |
| `encodePrefill`, `decodePrefill`, `prefillHash`, `PREFILL_VERSION` | Prefilled links, above. |
