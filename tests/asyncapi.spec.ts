import { readFileSync } from 'node:fs'
import { detectSpecKind, groupAsyncOperations, loadAsyncApi, OpenApiError } from '../src'

const text = (name: string) => readFileSync(new URL(`./fixtures/asyncapi/${name}`, import.meta.url), 'utf8')

describe('loadAsyncApi: 3.0', () => {
  const spec = loadAsyncApi(text('orders-3.yaml'))

  it('reads info, servers and channels', () => {
    expect(spec.version).toBe('3.0.0')
    expect(spec.info).toMatchObject({ title: 'Order events', version: '1.2.0' })
    expect(spec.servers.map((s) => [s.id, s.url, s.protocol])).toEqual([
      ['production', 'kafka://broker.example.com:9092', 'kafka'],
      ['development', 'kafka://localhost:{port}', 'kafka'],
    ])
    expect(spec.servers[1]!.variables).toEqual([{ name: 'port', default: '9092', enum: ['9092', '29092'], description: undefined }])
    const placed = spec.channels.find((c) => c.id === 'orderPlaced')!
    expect(placed.address).toBe('orders.{region}.placed')
    expect(placed.parameters).toEqual([
      { name: 'region', description: 'Region code of the shop', location: '$message.payload#/region', schema: { type: 'string', enum: ['eu', 'us'], default: 'eu', examples: undefined } },
    ])
  })

  it('reads operations with their messages, traits and replies', () => {
    expect(spec.operations.map((o) => [o.id, o.action, o.channel])).toEqual([
      ['publishOrderPlaced', 'send', 'orderPlaced'],
      ['requestPayment', 'send', 'paymentRequests'],
      ['onPaymentResult', 'receive', 'paymentReplies'],
    ])
    const publish = spec.operations[0]!
    expect(publish.bindings).toEqual({ kafka: { clientId: { type: 'string', enum: ['order-service'] } } })
    const message = publish.messages[0]!
    expect(message.key).toBe('OrderPlaced')
    expect(message.payload).toEqual({ $ref: '#/components/schemas/Order' })
    expect(message.headers).toMatchObject({ type: 'object', properties: { correlationId: { type: 'string' } } })
    expect(message.examples[0]).toMatchObject({ name: 'Small order', payload: { id: 1001 } })
    expect(message.correlationId).toEqual({ location: '$message.header#/correlationId', description: undefined })
    expect(spec.operations[1]!.reply).toMatchObject({ channel: 'paymentReplies', messages: [{ key: 'PaymentResult' }] })
  })

  it('keeps payloads in other schema languages as they are', () => {
    const result = spec.messages.find((m) => m.key === 'PaymentResult')!
    expect(result.payload).toBeUndefined()
    expect(result.foreignPayload).toMatchObject({ format: 'application/vnd.apache.avro;version=1.9.0', schema: { type: 'record', name: 'PaymentResult' } })
  })

  it('shares one message object between the places that refer to it', () => {
    const a = spec.channels.find((c) => c.id === 'orderPlaced')!.messages[0]
    expect(spec.operations[0]!.messages[0]).toBe(a)
    expect(spec.messages.find((m) => m.key === 'OrderPlaced')).toBe(a)
  })

  it('groups operations by tag', () => {
    expect(groupAsyncOperations(spec).map((g) => [g.name, g.operations.map((o) => o.id)])).toEqual([
      ['orders', ['publishOrderPlaced']],
      ['payments', ['requestPayment', 'onPaymentResult']],
    ])
  })
})

describe('loadAsyncApi: 2.x', () => {
  const spec = loadAsyncApi(text('orders-2.yaml'))

  it('turns publish/subscribe into receive/send from the application side', () => {
    expect(spec.operations.map((o) => [o.id, o.action, o.channel])).toEqual([
      ['publishOrderPlaced', 'send', 'orders/{region}/placed'],
      ['payments/commands.publish', 'receive', 'payments/commands'],
    ])
    expect(spec.servers[0]).toMatchObject({ url: 'broker.example.com:9092', protocol: 'kafka' })
  })

  it('reads oneOf messages and applies message traits', () => {
    const messages = spec.operations[1]!.messages
    expect(messages.map((m) => m.key)).toEqual(['CancelOrder', 'RetryPayment'])
    expect(messages[0]!.contentType).toBe('application/json')
    expect(spec.channels[0]!.parameters[0]).toMatchObject({ name: 'region', schema: { enum: ['eu', 'us'] } })
  })
})

describe('detecting and refusing', () => {
  it('tells OpenAPI and AsyncAPI apart', () => {
    expect(detectSpecKind({ asyncapi: '3.0.0' })).toBe('asyncapi')
    expect(detectSpecKind({ openapi: '3.1.0' })).toBe('openapi')
    expect(detectSpecKind({ swagger: '2.0' })).toBe('openapi')
    expect(detectSpecKind([])).toBeNull()
  })

  it('refuses other documents and versions', () => {
    expect(() => loadAsyncApi('openapi: 3.1.0')).toThrow(OpenApiError)
    expect(() => loadAsyncApi({ asyncapi: '1.2.0' })).toThrow(/Unsupported AsyncAPI version/)
  })

  it('reports what it cannot resolve', () => {
    const spec = loadAsyncApi({
      asyncapi: '3.0.0',
      info: { title: 'x', version: '1' },
      operations: { lost: { action: 'send', channel: { $ref: '#/channels/missing' }, messages: [{ $ref: '#/components/messages/Nope' }] } },
    })
    expect(spec.warnings).toEqual(['The operation "lost" refers to a channel that is not in the document', 'The message "#/components/messages/Nope" cannot be resolved'])
  })
})
