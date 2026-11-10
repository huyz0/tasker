import { z } from 'zod/v4';

/** Protobuf's runtime tag is metadata, not a user-selectable query field. */
function withoutCodecTag(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const { $typeName: _tag, ...fields } = value as Record<string, unknown>;
  return fields;
}
const text = z.string().max(500).regex(/^[^\u0000-\u001f\u007f]*$/u, 'search cannot contain control characters');
const sort = z.string().regex(/^(createdAt|priority|title|status):(asc|desc)$/, 'unsupported task sort');
const tasks = z.preprocess(withoutCodecTag, z.object({
  viewMode: z.enum(['board', 'table']).default('board'),
  search: text.default(''),
  priority: z.number().int().min(0).max(4).optional(),
  ready: z.boolean().default(false),
  sort: sort.optional(),
}).strict());
const reports = z.preprocess(withoutCodecTag, z.object({
  windowDays: z.union([z.literal(7), z.literal(30), z.literal(90)]).default(30),
}).strict());
export const DefinitionSchema = z.preprocess(withoutCodecTag, z.discriminatedUnion('screen', [
  z.object({ version: z.literal(1), screen: z.literal('tasks'), tasks }).strict(),
  z.object({ version: z.literal(1), screen: z.literal('reports'), reports }).strict(),
]));
export const ViewNameSchema = z.string().transform(value => value.trim().normalize('NFC')).pipe(
  z.string().min(1, 'a view needs a name').max(128).regex(/^[^\u0000-\u001f\u007f]*$/u, 'name cannot contain control characters'),
);
export const VisibilitySchema = z.enum(['personal', 'organization']);
export const ScreenSchema = z.enum(['tasks', 'reports']);

/** Invalid/future persisted content remains metadata, never an applied query. */
export function readDefinition(row: { definitionJson: string; screen: string }) {
  if (typeof row.definitionJson !== 'string' || row.definitionJson.length > 4096) return null;
  try {
    const parsed = DefinitionSchema.safeParse(JSON.parse(row.definitionJson));
    return parsed.success && parsed.data.screen === row.screen ? parsed.data : null;
  } catch { return null; }
}
