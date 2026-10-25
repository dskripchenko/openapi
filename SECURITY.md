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
  operation's `externalDocs.url`, an example's `externalValue` — are rendered
  only for `http(s)`, `mailto` and relative addresses; anything else (`javascript:`, `data:` …) is dropped.
  Links that open in a new tab get `rel="noopener noreferrer"`.
- **No markup from the spec.** Everything else from the spec — titles, names,
  paths, examples, samples — is inserted as text. The components do not use
  `v-html`; the editor's source view highlights the text with text nodes.
- **Nothing is fetched behind the host's back.** An external `$ref` is
  resolved only through the loader the host passes (`external`); without one
  it stays unresolved. An example's `externalValue` is shown as a link and
  never fetched. Requests to the API leave the page only when the reader
  presses "Send", "Get token" or "Authorize"; the one request made without a
  click is the OpenID Connect discovery document of an `openIdConnect` scheme,
  read when the reader opens the authentication panel. (An image in a
  markdown description is loaded by the browser like any other image.)
- **No code from the spec runs.** Nothing in the document is evaluated.
- **Cookies stay on their origin.** Try-it sends with
  `credentials: 'same-origin'` by default: the page's cookies go only to the
  page's own origin, never to a foreign API.
- **Credentials stay in the page unless the host asks otherwise.** What the
  reader types into the authentication panel is kept in memory for the page's
  lifetime and used only for that page's requests and samples. Only with the
  host's `persistCredentials` are API keys, tokens and basic-auth usernames
  kept in `sessionStorage` or `localStorage`; basic-auth passwords, client
  secrets and password-flow passwords are never stored. "Forget" clears them.
- **A link never sends a request.** A prefilled link only fills the try-it
  form and shows a notice; the reader presses "Send". "Copy link" leaves
  credentials out unless the reader ticks "Include credentials", which warns
  that anyone with the link can use them. After the form is filled, the
  address is replaced with the plain anchor, so credentials do not stay in
  the address bar or come back on reload. A payload is limited to 1 MB.
- **OAuth responses are checked.** The sign-in window's response is accepted
  only with the `state` the request carried. The authorization code flow
  uses PKCE (S256). A redirect page relays the response only to a same-origin
  opener, and the reference accepts a relayed message only from the redirect
  URI's origin.

## What the host is responsible for

- **A try-it proxy.** A `send` function — or the standalone bundle's
  `proxy` — that routes requests through your server makes that server call
  URLs taken from a spec, token endpoints included. Allow only the hosts you
  mean to, and protect the endpoint like the rest of your back office;
  otherwise it is an open relay. The standalone proxy sends same-origin
  cookies and the page's `<meta name="csrf-token">` as `X-CSRF-TOKEN`, so a
  CSRF-protected endpoint works as it is.
- **Stored credentials.** `persistCredentials: 'local'` keeps tokens until
  they are removed, readable by any script on the page's origin. Turn it on
  only where that is acceptable.
- **The OAuth redirect URI.** The identity provider must allow it; register
  only addresses you control.
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
