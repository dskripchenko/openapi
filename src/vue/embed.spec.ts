import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Schema } from '../core/types'
import { loadSpec } from '../load'
import { findOperation, sharedSpec } from './embed'
import { flattenSchema } from './printSchema'

const kitchenText = readFileSync(resolve(import.meta.dirname, '../../tests/fixtures/specs/kitchen-sink-31.json'), 'utf8')
const kitchen = loadSpec(kitchenText)

describe('findOperation', () => {
  it('finds by operationId', () => {
    expect(findOperation(kitchen, 'createOrder')?.path).toBe('/orders')
  })
  it('finds by METHOD /path, with or without the server base path', () => {
    expect(findOperation(kitchen, 'GET /orders/{orderId}')?.id).toBe('getOrder')
    expect(findOperation(kitchen, 'delete /orders/{orderId}')?.id).toBe('deleteOrder')
    expect(findOperation(kitchen, 'POST /v2/orders')?.id).toBe('createOrder')
  })
  it('finds by our anchors and Scalar ones', () => {
    expect(findOperation(kitchen, '#operation/listOrders')?.id).toBe('listOrders')
    expect(findOperation(kitchen, 'shop/operation/listOrders')?.id).toBe('listOrders')
    expect(findOperation(kitchen, 'tag/orders/POST/orders')?.id).toBe('createOrder')
  })
  it('gives nothing for an unknown name or a tag', () => {
    expect(findOperation(kitchen, 'nope')).toBeUndefined()
    expect(findOperation(kitchen, 'PUT /orders')).toBeUndefined()
    expect(findOperation(kitchen, 'tag/orders')).toBeUndefined()
    expect(findOperation(kitchen, '')).toBeUndefined()
  })
})

describe('sharedSpec', () => {
  it('loads one text once', () => {
    expect(sharedSpec(kitchenText, undefined)).toBe(sharedSpec(kitchenText, undefined))
  })
  it('shares a loader between callers and calls it once', async () => {
    let calls = 0
    const loader = async () => {
      calls++
      return kitchenText
    }
    const [a, b] = await Promise.all([sharedSpec(loader, undefined), sharedSpec(loader, undefined)])
    expect(a).toBe(b)
    expect(calls).toBe(1)
    expect(sharedSpec(loader, undefined)).toBe(a)
  })
  it('tries a failed loader again', async () => {
    let calls = 0
    const loader = async () => {
      if (calls++ === 0) throw new Error('offline')
      return kitchenText
    }
    await expect(sharedSpec(loader, undefined)).rejects.toThrow('offline')
    await expect(sharedSpec(loader, undefined)).resolves.toBeTruthy()
    expect(calls).toBe(2)
  })
})

describe('flattenSchema', () => {
  const resolveRef = (r: string) => kitchen.resolver.get(r) as Schema | undefined
  const order = { $ref: '#/components/schemas/Order' }

  it('expands nested objects and array items, indented', () => {
    const rows = flattenSchema(order, { resolve: resolveRef, mode: 'request' })
    const amount = rows.find((r) => r.name === 'amount')
    expect(amount?.depth).toBe(2)
    expect(rows.find((r) => r.name === 'sku')?.depth).toBe(2)
    expect(rows[0]!.name).toBe('')
  })
  it('points a cycle back instead of opening it again', () => {
    const parent = flattenSchema(order, { resolve: resolveRef }).find((r) => r.name === 'parent')
    expect(parent?.cycle).toBe('Order')
  })
  it('leaves read-only properties out of requests and write-only ones out of responses', () => {
    const request = flattenSchema(order, { resolve: resolveRef, mode: 'request' }).map((r) => r.name)
    const response = flattenSchema(order, { resolve: resolveRef, mode: 'response' }).map((r) => r.name)
    expect(request).not.toContain('id')
    expect(response).toContain('id')
    expect(request).toContain('callbackUrl')
    expect(response).not.toContain('callbackUrl')
  })
  it('heads each oneOf branch', () => {
    const rows = flattenSchema(
      { oneOf: [{ title: 'Card', type: 'object', properties: { pan: { type: 'string' } } }, { type: 'string' }] },
      { resolve: resolveRef },
    )
    expect(rows.filter((r) => r.branch === 'oneOf').map((r) => r.name)).toEqual(['oneOf 1: Card', 'oneOf 2'])
    expect(rows.find((r) => r.name === 'pan')?.depth).toBe(2)
  })
})
