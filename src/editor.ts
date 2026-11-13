import { basicSetup } from 'codemirror';
import { EditorState, type Text } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { lintGutter, setDiagnostics, type Diagnostic } from '@codemirror/lint';
import type { ArchiMateDiagnostic } from 'archimaid/language';
import { archimateSyntax } from './syntax.ts';

export interface SourceEditor {
  readonly source: () => string;
  readonly replaceSource: (source: string) => void;
  readonly rewriteSource: (source: string) => void;
  readonly showDiagnostics: (diagnostics: readonly ArchiMateDiagnostic[]) => void;
  readonly revealDiagnostic: (diagnostic: ArchiMateDiagnostic) => void;
}

export interface CursorPosition {
  readonly line: number;
  readonly column: number;
}

export interface SourceEditorOptions {
  readonly initialSource: string;
  readonly onChange: (source: string) => void;
  readonly onCursorMove: (position: CursorPosition) => void;
}

export function createSourceEditor(
  parent: HTMLElement,
  { initialSource, onChange, onCursorMove }: SourceEditorOptions,
): SourceEditor {
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: initialSource,
      extensions: [
        basicSetup,
        lintGutter(),
        archimateSyntax,
        EditorState.tabSize.of(2),
        EditorView.contentAttributes.of({ 'aria-label': 'Diagram source' }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChange(update.state.doc.toString());
          if (update.docChanged || update.selectionSet) onCursorMove(cursorPosition(update.state));
        }),
      ],
    }),
  });
  onCursorMove(cursorPosition(view.state));

  return {
    source: () => view.state.doc.toString(),
    // A normal transaction, so loading an example can be undone with the editor's undo.
    replaceSource(source) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: source }, selection: { anchor: 0 } });
      view.scrollDOM.scrollTo({ top: 0, left: 0 });
    },
    // For a rewrite that keeps the lines in place: the cursor stays on its line and the view does not scroll.
    rewriteSource(source) {
      const { scrollTop, scrollLeft } = view.scrollDOM;
      const cursorLine = view.state.doc.lineAt(view.state.selection.main.head).number;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: source } });
      const line = view.state.doc.line(Math.min(cursorLine, view.state.doc.lines));
      view.dispatch({ selection: { anchor: line.from } });
      view.scrollDOM.scrollTo({ top: scrollTop, left: scrollLeft });
    },
    showDiagnostics(diagnostics) {
      const doc = view.state.doc;
      view.dispatch(
        setDiagnostics(
          view.state,
          diagnostics.map((diagnostic): Diagnostic => {
            const { from, to } = toOffsets(doc, diagnostic);
            return { from, to, severity: diagnostic.severity, message: diagnostic.message, source: diagnostic.code };
          }),
        ),
      );
    },
    revealDiagnostic(diagnostic) {
      const { from, to } = toOffsets(view.state.doc, diagnostic);
      view.dispatch({
        selection: { anchor: from, head: to },
        effects: EditorView.scrollIntoView(from, { y: 'center' }),
      });
      view.focus();
    },
  };
}

function cursorPosition(state: EditorState): CursorPosition {
  const head = state.selection.main.head;
  const line = state.doc.lineAt(head);
  return { line: line.number, column: head - line.from + 1 };
}

// Diagnostics use 1-based lines and columns with an exclusive end; the validator can report a position past
// the end of the document (an empty source), so every offset is clamped to the current text.
function toOffsets(doc: Text, range: ArchiMateDiagnostic): { from: number; to: number } {
  const from = offsetAt(doc, range.line, range.column);
  const to = Math.max(from, offsetAt(doc, range.endLine, range.endColumn));
  // An empty range has nothing to underline, so widen it to the next character on the same line.
  if (to === from && from < doc.lineAt(from).to) return { from, to: from + 1 };
  return { from, to };
}

function offsetAt(doc: Text, line: number, column: number): number {
  const docLine = doc.line(Math.min(Math.max(line, 1), doc.lines));
  return Math.min(docLine.from + Math.max(column - 1, 0), docLine.to);
}
