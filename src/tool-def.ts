type ParamSpec = {
  type: 'string' | 'number' | 'boolean'
  required?: boolean
  description?: string
}

export function parametersSchema(parameters: Record<string, ParamSpec>): Record<string, unknown> {
  const properties: Record<string, unknown> = {}
  const required: string[] = []
  for (const [key, spec] of Object.entries(parameters)) {
    properties[key] = {
      type: spec.type,
      ...(spec.description ? { description: spec.description } : {}),
    }
    if (spec.required) required.push(key)
  }
  return {
    type: 'object',
    properties,
    additionalProperties: false,
    ...(required.length > 0 ? { required } : {}),
  }
}

export const OBJECT_OUTPUT = {
  schema: {
    type: 'object',
    properties: {},
    additionalProperties: true,
  },
  render: (_args: unknown, value: unknown) => [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }],
}
