import { HighlightStyle, StreamLanguage, syntaxHighlighting, type StringStream } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { elementTypes, relationshipConnectors, relationshipTypes } from 'archimaid/language';

const keywords = new Set([
  'direction',
  'layout',
  'element',
  'description',
  'relationship',
  'access',
  'directed',
  'label',
  'note',
  'on',
  'nest',
  'in',
  'via',
  'click',
  'href',
]);
const typeNames = new Set<string>([...Object.keys(elementTypes), ...relationshipTypes]);
const metadataKeys = /^(?:title|accTitle|accDescr)\s*:/u;
// Longest first, so `<..>` wins over `<..` and `..`.
const connectors = [...Object.keys(relationshipConnectors), '->'].sort((left, right) => right.length - left.length);

interface State {
  inMetadataValue: boolean;
}

function token(stream: StringStream, state: State): string | null {
  if (stream.sol()) state.inMetadataValue = false;
  if (stream.eatSpace()) return null;
  if (stream.match('%%')) {
    stream.skipToEnd();
    return 'comment';
  }
  if (state.inMetadataValue) {
    if (stream.match(/^[^%]+/u) || stream.next()) return 'string';
  }
  if (stream.match(metadataKeys)) {
    state.inMetadataValue = true;
    return 'meta';
  }
  if (stream.match('archimate-beta')) return 'heading';
  if (stream.peek() === '"') {
    stream.next();
    let escaped = false;
    while (!stream.eol()) {
      const character = stream.next();
      if (character === '"' && !escaped) break;
      escaped = !escaped && character === '\\';
    }
    return 'string';
  }
  for (const connector of connectors) {
    if (stream.match(connector)) return 'operator';
  }
  const word = stream.match(/^[a-zA-Z_]\w*(?:-\w+)*/u);
  if (Array.isArray(word)) {
    const text = word[0];
    if (keywords.has(text)) return 'keyword';
    if (typeNames.has(text)) return 'typeName';
    if (/^(?:TB|BT|LR|RL|architecture|framework|graph|read|write|readWrite|unspecified)$/u.test(text)) return 'atom';
    return 'variableName';
  }
  stream.next();
  return null;
}

const archimateLanguage = StreamLanguage.define<State>({
  name: 'archimate',
  startState: () => ({ inMetadataValue: false }),
  copyState: (state) => ({ ...state }),
  token,
  languageData: { commentTokens: { line: '%%' } },
});

const highlightStyle = HighlightStyle.define([
  { tag: tags.heading, color: 'var(--syntax-heading)', fontWeight: '600' },
  { tag: tags.keyword, color: 'var(--syntax-keyword)', fontWeight: '600' },
  { tag: tags.typeName, color: 'var(--syntax-type)' },
  { tag: tags.string, color: 'var(--syntax-string)' },
  { tag: tags.operator, color: 'var(--syntax-operator)', fontWeight: '600' },
  { tag: tags.atom, color: 'var(--syntax-atom)' },
  { tag: tags.meta, color: 'var(--syntax-keyword)', fontWeight: '600' },
  { tag: tags.comment, color: 'var(--syntax-comment)', fontStyle: 'italic' },
]);

export const archimateSyntax = [archimateLanguage, syntaxHighlighting(highlightStyle)];
