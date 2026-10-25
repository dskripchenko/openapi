/** Thrown when the input cannot be read as an OpenAPI or Swagger document. */
export class OpenApiError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OpenApiError'
  }
}
