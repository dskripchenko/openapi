/**
 * Response types are named after what the status means, not its number:
 * `GetOrderSuccess`, `GetOrderNotFound`, `CreateOrderCreated`.
 *
 * The short words the author asked for come first (200 Success, 301 Redirect,
 * 500 Error); every other code takes its standard reason phrase. Ranges and
 * `default` have names of their own, and a code missing from the table is
 * `Status{code}`. Hosts can override any entry.
 */
export const STATUS_TYPE_NAMES: Readonly<Record<string, string>> = Object.freeze({
  '100': 'Continue',
  '101': 'SwitchingProtocols',
  '102': 'Processing',
  '103': 'EarlyHints',
  '200': 'Success',
  '201': 'Created',
  '202': 'Accepted',
  '203': 'NonAuthoritative',
  '204': 'NoContent',
  '205': 'ResetContent',
  '206': 'PartialContent',
  '207': 'MultiStatus',
  '208': 'AlreadyReported',
  '226': 'ImUsed',
  '300': 'MultipleChoices',
  '301': 'Redirect',
  '302': 'Found',
  '303': 'SeeOther',
  '304': 'NotModified',
  '305': 'UseProxy',
  '307': 'TemporaryRedirect',
  '308': 'PermanentRedirect',
  '400': 'BadRequest',
  '401': 'Unauthorized',
  '402': 'PaymentRequired',
  '403': 'Forbidden',
  '404': 'NotFound',
  '405': 'MethodNotAllowed',
  '406': 'NotAcceptable',
  '407': 'ProxyAuthenticationRequired',
  '408': 'RequestTimeout',
  '409': 'Conflict',
  '410': 'Gone',
  '411': 'LengthRequired',
  '412': 'PreconditionFailed',
  '413': 'PayloadTooLarge',
  '414': 'UriTooLong',
  '415': 'UnsupportedMediaType',
  '416': 'RangeNotSatisfiable',
  '417': 'ExpectationFailed',
  '418': 'ImATeapot',
  '421': 'MisdirectedRequest',
  '422': 'UnprocessableEntity',
  '423': 'Locked',
  '424': 'FailedDependency',
  '425': 'TooEarly',
  '426': 'UpgradeRequired',
  '428': 'PreconditionRequired',
  '429': 'TooManyRequests',
  '431': 'HeaderFieldsTooLarge',
  '451': 'UnavailableForLegalReasons',
  '500': 'Error',
  '501': 'NotImplemented',
  '502': 'BadGateway',
  '503': 'ServiceUnavailable',
  '504': 'GatewayTimeout',
  '505': 'HttpVersionNotSupported',
  '506': 'VariantAlsoNegotiates',
  '507': 'InsufficientStorage',
  '508': 'LoopDetected',
  '510': 'NotExtended',
  '511': 'NetworkAuthenticationRequired',
  '1XX': 'Informational',
  '2XX': 'AnySuccess',
  '3XX': 'AnyRedirect',
  '4XX': 'ClientError',
  '5XX': 'ServerError',
  default: 'Default',
})

/** The name part for a response code: the overrides, then the table, else `Status{code}`. */
export function statusTypeName(code: string, overrides: Readonly<Record<string, string>> = {}): string {
  const key = code === 'default' ? code : code.toUpperCase()
  const name = overrides[key] ?? overrides[code] ?? STATUS_TYPE_NAMES[key]
  if (name) return name.replace(/[^A-Za-z0-9_]/g, '')
  return `Status${key.replace(/[^0-9A-Z]/g, '')}`
}
