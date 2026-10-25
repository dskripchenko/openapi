/** Shared schemas for the schema specs: a petstore-like component set and a resolver. */
import type { Schema } from '../../../src/core/types'
import type { Resolver } from '../../../src/schema/util'

export const components: Record<string, Schema> = {
  Category: {
    type: 'object',
    properties: { id: { type: 'integer', format: 'int64' }, name: { type: 'string' } },
    xml: { name: 'category' },
  },
  Tag: {
    type: 'object',
    properties: { id: { type: 'integer', format: 'int64' }, name: { type: 'string' } },
    xml: { name: 'tag' },
  },
  Pet: {
    type: 'object',
    required: ['name', 'photoUrls'],
    properties: {
      id: { type: 'integer', format: 'int64', readOnly: true, example: 10 },
      name: { type: 'string', example: 'doggie' },
      category: { $ref: '#/components/schemas/Category' },
      photoUrls: { type: 'array', xml: { wrapped: true }, items: { type: 'string', xml: { name: 'photoUrl' } } },
      tags: { type: 'array', xml: { wrapped: true }, items: { $ref: '#/components/schemas/Tag' } },
      status: { type: 'string', enum: ['available', 'pending', 'sold'] },
    },
    xml: { name: 'pet' },
  },
  User: {
    type: 'object',
    required: ['email', 'password'],
    properties: {
      id: { type: 'string', format: 'uuid', readOnly: true },
      email: { type: 'string', format: 'email' },
      password: { type: 'string', format: 'password', writeOnly: true, minLength: 8 },
      createdAt: { type: 'string', format: 'date-time', readOnly: true },
    },
  },
  Node: {
    type: 'object',
    required: ['value'],
    properties: {
      value: { type: 'integer' },
      next: { $ref: '#/components/schemas/Node' },
      children: { type: 'array', items: { $ref: '#/components/schemas/Node' } },
    },
  },
  // Discriminated union, mapping style.
  Animal: {
    oneOf: [{ $ref: '#/components/schemas/Cat' }, { $ref: '#/components/schemas/Dog' }],
    discriminator: { propertyName: 'kind', mapping: { cat: '#/components/schemas/Cat', dog: '#/components/schemas/Dog' } },
  },
  Cat: {
    type: 'object',
    required: ['kind', 'meows'],
    properties: { kind: { type: 'string' }, meows: { type: 'boolean' } },
  },
  Dog: {
    type: 'object',
    required: ['kind', 'barks'],
    properties: { kind: { type: 'string' }, barks: { type: 'integer', minimum: 1 } },
  },
  // Inheritance style: base with discriminator, children via allOf.
  Shape: {
    type: 'object',
    required: ['shapeType'],
    properties: { shapeType: { type: 'string' } },
    discriminator: { propertyName: 'shapeType', mapping: { circle: '#/components/schemas/Circle' } },
  },
  Circle: {
    allOf: [{ $ref: '#/components/schemas/Shape' }, { type: 'object', required: ['radius'], properties: { radius: { type: 'number', exclusiveMinimum: 0 } } }],
  },
  Square: {
    allOf: [{ $ref: '#/components/schemas/Shape' }, { type: 'object', properties: { side: { type: 'number' } } }],
  },
  LoopA: { $ref: '#/components/schemas/LoopB' },
  LoopB: { $ref: '#/components/schemas/LoopA' },
}

export const resolve: Resolver = (ref) => {
  const prefix = '#/components/schemas/'
  return ref.startsWith(prefix) ? components[ref.slice(prefix.length)] : undefined
}

export const ref = (name: string): Schema => ({ $ref: `#/components/schemas/${name}` })
