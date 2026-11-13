import {
  relationshipConnectors,
  validateArchiMate,
  type ArchiMateModel,
  type ArchiMateRelationship,
} from 'archimaid/language';

export type Notation = 'long' | 'shorthand';

export type NotationResult =
  | { readonly kind: 'converted'; readonly source: string; readonly converted: number; readonly kept: number }
  | { readonly kind: 'unchanged'; readonly kept: number }
  // Only a valid source is rewritten, so the result can be checked against the same model.
  | { readonly kind: 'invalid' }
  // The rewrite would have changed the diagram; this is a bug in the converter, so nothing is applied.
  | { readonly kind: 'failed' };

type Connector = keyof typeof relationshipConnectors;

const id = String.raw`[a-zA-Z_]\w*(?:-\w+)*`;
const quoted = String.raw`"(?:[^"\\\r\n]|\\.)*"`;
const comment = String.raw`(\s+%%.*)?`;
const connectorPattern = (Object.keys(relationshipConnectors) as Connector[])
  .sort((left, right) => right.length - left.length)
  .map((connector) => connector.replace(/[.*+?^${}()|[\]\\/]/gu, '\\$&'))
  .join('|');

const longFormLine = new RegExp(
  String.raw`^(\s*)relationship\s+(${id})\s+(${id})\s+(${id})\s*->\s*(${id})(?:\s+access\s+(${id}))?(\s+directed)?(?:\s+label\s+(${quoted}))?${comment}$`,
  'u',
);
const shorthandLine = new RegExp(
  String.raw`^(\s*)(${id})\s*(${connectorPattern})\s*(${id})(?:\s*:\s*(${quoted}))?${comment}$`,
  'u',
);

export function convertNotation(source: string, notation: Notation): NotationResult {
  const before = validateArchiMate(source).model;
  if (!before) return { kind: 'invalid' };
  const result = notation === 'shorthand' ? toShorthand(source) : toLongForm(source);
  if (result.converted === 0) return { kind: 'unchanged', kept: result.kept };
  const after = validateArchiMate(result.source).model;
  if (!after || diagramSignature(after) !== diagramSignature(before)) return { kind: 'failed' };
  return { kind: 'converted', ...result };
}

// Long-form relationships that must stay long (another line names their ID) do not count as a choice of notation.
export function detectNotation(source: string): Notation | 'mixed' | 'none' {
  const lines = source.split('\n');
  const long = lines.filter((line, index) => {
    const relationshipId = longFormLine.exec(line)?.[3];
    return relationshipId !== undefined && !isReferencedElsewhere(lines, index, relationshipId);
  }).length;
  const shorthand = lines.filter((line) => shorthandLine.test(line)).length;
  if (long > 0 && shorthand > 0) return 'mixed';
  if (long > 0) return 'long';
  return shorthand > 0 ? 'shorthand' : 'none';
}

interface Rewrite {
  readonly source: string;
  readonly converted: number;
  readonly kept: number;
}

function toShorthand(source: string): Rewrite {
  const lines = source.split('\n');
  let converted = 0;
  let kept = 0;
  const rewritten = lines.map((line, index) => {
    const match = longFormLine.exec(line);
    if (!match) return line;
    const [, indent, type, relationshipId, from, to, access, directed, label, trailing] = match;
    const connector = connectorFor(type ?? '', access, directed !== undefined);
    // A shorthand relationship gets a generated ID, so one that another line names must stay in long form.
    if (!connector || isReferencedElsewhere(lines, index, relationshipId ?? '')) {
      kept++;
      return line;
    }
    converted++;
    return `${indent}${from} ${connector} ${to}${label ? ` : ${label}` : ''}${trailing ?? ''}`;
  });
  return { source: rewritten.join('\n'), converted, kept };
}

function toLongForm(source: string): Rewrite {
  const lines = source.split('\n');
  const usedIds = new Set(source.match(new RegExp(id, 'gu')));
  let converted = 0;
  const rewritten = lines.map((line) => {
    const match = shorthandLine.exec(line);
    if (!match) return line;
    const [, indent, from = '', connector, to = '', label, trailing] = match;
    const notation = relationshipConnectors[connector as Connector];
    let relationshipId = `${from}_${notation.type}_${to}`;
    for (let suffix = 2; usedIds.has(relationshipId); suffix++)
      relationshipId = `${from}_${notation.type}_${to}_${suffix}`;
    usedIds.add(relationshipId);
    const access = 'access' in notation && notation.access !== 'unspecified' ? ` access ${notation.access}` : '';
    const directed = 'directed' in notation ? ' directed' : '';
    converted++;
    return `${indent}relationship ${notation.type} ${relationshipId} ${from} -> ${to}${access}${directed}${label ? ` label ${label}` : ''}${trailing ?? ''}`;
  });
  return { source: rewritten.join('\n'), converted, kept: 0 };
}

function connectorFor(type: string, access: string | undefined, directed: boolean): Connector | undefined {
  const mode = access ?? (type === 'access' ? 'unspecified' : undefined);
  return (Object.entries(relationshipConnectors) as [Connector, (typeof relationshipConnectors)[Connector]][]).find(
    ([, notation]) =>
      notation.type === type &&
      ('access' in notation ? notation.access : undefined) === mode &&
      'directed' in notation === directed,
  )?.[0];
}

function isReferencedElsewhere(lines: readonly string[], declarationIndex: number, relationshipId: string): boolean {
  const word = new RegExp(String.raw`(?<![\w-])${relationshipId.replaceAll('-', '\\-')}(?![\w-])`, 'u');
  return lines.some((line, index) => index !== declarationIndex && word.test(line.replace(/\s%%.*$/u, '')));
}

// Everything the diagram shows, with relationship IDs replaced by what the relationship is, since a
// notation switch is allowed to change IDs but nothing else.
function diagramSignature(model: ArchiMateModel): string {
  const describe = (relationship: ArchiMateRelationship): string =>
    JSON.stringify([
      relationship.type,
      relationship.source,
      relationship.target,
      relationship.access ?? null,
      relationship.directed ?? false,
      relationship.label ?? null,
    ]);
  const byId = new Map(model.relationships.map((relationship) => [relationship.id, describe(relationship)]));
  return JSON.stringify({
    ...model,
    relationships: model.relationships.map(describe).sort(),
    nesting: model.nesting?.map((nesting) => ({
      ...nesting,
      relationship:
        nesting.relationship === undefined ? null : (byId.get(nesting.relationship) ?? nesting.relationship),
    })),
  });
}
