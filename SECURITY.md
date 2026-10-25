# Security policy

A spec shown by the reference is often written by someone other than the
person reading it — a partner's API, a file uploaded to a back office. And
"Try it" sends requests with credentials the reader types. The package is
built so that a spec's text does not become active content in the page, and
so that the reader's credentials and cookies go only where the reader sends
them.

## What is guaranteed

- **Markdown is escaped.** Every `description` — of the document, tags,
  operations, parameters, schemas and security schemes — is rendered by the
  kit's `UidMarkdown`, which escapes the source before producing any markup:
  raw HTML in a description is shown as text, and links and images accept
  only `http(s)`, `mailto`, relative and anchor targets.
- **Links are filtered.** Links taken from the spec outside descriptions —
  `info.contact.url`, `info.license.url`, `info.termsOfService` and an
  operation's `externalDocs.url` — are rendered only for `http(s)`, `mailto`
  and relative addresses; anything else (`javascript:`, `data:` …) is dropped.
  Links that open in a new tab get `rel="noopener noreferrer"`.
- **No markup from the spec.** Everything else from the spec — titles, names,
  paths, examples, samples — is inserted as text. The components do not use
  `v-html`; the editor's source view highlights the text with text nodes.
- **Nothing is fetched behind the host's back.** An external `$ref` is
  resolved only through the loader the host passes (`external`); without one
  it stays unresolved. The components request nothing from the URLs in a
  spec on their own: requests leave the page only when the reader presses
  "Send" or "Get token". (An image in a markdown description is loaded by the
  browser like any other image.)
- **No code from the spec runs.** Nothing in the document is evaluated.
- **Cookies stay on their origin.** Try-it sends with
  `credentials: 'same-origin'` by default: the page's cookies go only to the
  page's own origin, never to a foreign API.
- **Credentials stay in the page.** What the reader types into the
  authentication panel is kept in memory for the page's lifetime, used only
  for that page's requests and samples, and never stored.

## What the host is responsible for

- **A try-it proxy.** A `send` function that routes requests through your
  server makes that server call URLs taken from a spec. Allow only the hosts
  you mean to, and protect the endpoint like the rest of your back office;
  otherwise it is an open relay.
- **Specs you did not write.** Showing a spec does not make its API
  trustworthy: "Try it" sends whatever the reader types to the server the
  spec names.

## Supported versions

The latest minor version of the current major receives security fixes.

## Reporting a vulnerability

Please report privately through GitHub's
[security advisories](https://github.com/dskripchenko/openapi/security/advisories/new)
rather than a public issue. Include a spec that reproduces the problem. You
will get an answer within a few days.
