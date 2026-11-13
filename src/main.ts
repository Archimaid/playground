import '@fontsource-variable/space-grotesk';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/600.css';
import './styles.css';

import { validateArchiMate, type ArchiMateDiagnostic, type ArchiMateModel } from 'archimaid/language';
import { createSourceEditor } from './editor.ts';
import { examples, starterExample } from './examples.ts';
import { renderDiagram, type DiagramTheme } from './render.ts';
import { decodeShareHash, encodeShareHash } from './share.ts';
import { readStored, writeStored } from './storage.ts';

const sourceKey = 'archimaid.playground.source';
const themeKey = 'archimaid.playground.theme';
const renderDelayMs = 250;

function byId<T extends HTMLElement>(id: string, type: new () => T): T {
  const element = document.getElementById(id);
  if (!(element instanceof type)) throw new Error(`Missing #${id} in index.html.`);
  return element;
}

const ui = {
  workspace: byId('workspace', HTMLElement),
  editor: byId('editor', HTMLDivElement),
  problems: byId('problems', HTMLDivElement),
  preview: byId('preview', HTMLDivElement),
  previewState: byId('preview-state', HTMLParagraphElement),
  examples: byId('examples', HTMLSelectElement),
  theme: byId('theme', HTMLButtonElement),
  download: byId('download', HTMLButtonElement),
  share: byId('share', HTMLButtonElement),
  tabCode: byId('tab-code', HTMLButtonElement),
  tabDiagram: byId('tab-diagram', HTMLButtonElement),
  toast: byId('toast', HTMLDivElement),
};

let theme: DiagramTheme = readStored(themeKey) === 'dark' ? 'dark' : 'light';
let latest: { source: string; model: ArchiMateModel | undefined } = { source: '', model: undefined };
let rendered: { svg: string; model: ArchiMateModel } | undefined;
let renderTimer: ReturnType<typeof setTimeout> | undefined;

const shared = await decodeShareHash(location.hash);
const editor = createSourceEditor(
  ui.editor,
  shared.kind === 'source' ? shared.source : (readStored(sourceKey) ?? starterExample.source),
  (source) => {
    writeStored(sourceKey, source);
    // The shared link no longer describes what is in the editor.
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);
    update(source, renderDelayMs);
  },
);
if (shared.kind === 'invalid') showToast('This share link is damaged, so your last diagram was opened instead.');

function update(source: string, delayMs: number): void {
  const { model, diagnostics } = validateArchiMate(source);
  latest = { source, model };
  editor.showDiagnostics(diagnostics);
  showProblems(diagnostics, model);
  clearTimeout(renderTimer);
  if (model) {
    renderTimer = setTimeout(() => void draw(source, model), delayMs);
  } else if (rendered) {
    showPreviewState('Showing the last valid diagram. Fix the problems in the source to update it.', 'stale');
  } else {
    showPreviewState('Fix the problems in the source to see the diagram.', 'stale');
  }
}

async function draw(source: string, model: ArchiMateModel): Promise<void> {
  if (!rendered) showPreviewState('Loading the renderer…', 'loading');
  const outcome = await renderDiagram(source, theme);
  if (outcome.kind === 'superseded') return;
  if (outcome.kind === 'failed') {
    showPreviewState(`The diagram could not be drawn: ${outcome.message}`, 'failed');
    return;
  }
  rendered = { svg: outcome.svg, model };
  ui.preview.innerHTML = outcome.svg;
  ui.download.disabled = false;
  // A render that started before the latest edit may finish after it; keep the stale hint if the source broke since.
  if (latest.source === source || latest.model) showPreviewState('', 'ready');
  else showPreviewState('Showing the last valid diagram. Fix the problems in the source to update it.', 'stale');
}

function showPreviewState(message: string, state: 'loading' | 'ready' | 'stale' | 'failed'): void {
  ui.previewState.textContent = message;
  ui.previewState.hidden = message === '';
  ui.preview.dataset.state = state;
}

function showProblems(diagnostics: readonly ArchiMateDiagnostic[], model: ArchiMateModel | undefined): void {
  ui.problems.replaceChildren();
  if (diagnostics.length === 0 && model) {
    const summary = document.createElement('p');
    summary.className = 'problems-summary is-valid';
    summary.textContent = `Valid · ${plural(model.elements.length, 'element')}, ${plural(model.relationships.length, 'relationship')}`;
    ui.problems.append(summary);
    return;
  }
  const errors = diagnostics.filter((diagnostic) => diagnostic.severity === 'error').length;
  const warnings = diagnostics.length - errors;
  const summary = document.createElement('p');
  summary.className = errors > 0 ? 'problems-summary is-invalid' : 'problems-summary is-valid';
  summary.textContent = [errors > 0 && plural(errors, 'error'), warnings > 0 && plural(warnings, 'warning')]
    .filter(Boolean)
    .join(', ');
  const list = document.createElement('ul');
  for (const diagnostic of diagnostics) {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `problem is-${diagnostic.severity}`;
    const position = document.createElement('span');
    position.className = 'problem-position';
    position.textContent = `${diagnostic.line}:${diagnostic.column}`;
    button.append(position, ` ${diagnostic.message}`);
    button.addEventListener('click', () => {
      selectView('code');
      editor.revealDiagnostic(diagnostic);
    });
    item.append(button);
    list.append(item);
  }
  ui.problems.append(summary, list);
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;
function showToast(message: string): void {
  ui.toast.textContent = message;
  ui.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (ui.toast.hidden = true), 4000);
}

function selectView(view: 'code' | 'diagram'): void {
  ui.workspace.dataset.view = view;
  ui.tabCode.setAttribute('aria-selected', String(view === 'code'));
  ui.tabDiagram.setAttribute('aria-selected', String(view === 'diagram'));
}

function slug(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/gu, '-')
      .replace(/^-|-$/gu, '') || 'archimaid-diagram'
  );
}

function applyTheme(): void {
  ui.theme.setAttribute('aria-pressed', String(theme === 'dark'));
  document.documentElement.dataset.diagramTheme = theme;
}

const placeholder = new Option('Load an example…', '', true, true);
placeholder.disabled = true;
ui.examples.append(placeholder, ...examples.map((example) => new Option(example.title, example.id)));
ui.examples.addEventListener('change', () => {
  const example = examples.find((candidate) => candidate.id === ui.examples.value);
  ui.examples.value = '';
  if (!example) return;
  editor.replaceSource(example.source);
  showToast(`Loaded “${example.title}”. Undo brings back your previous diagram.`);
});

ui.theme.addEventListener('click', () => {
  theme = theme === 'dark' ? 'light' : 'dark';
  writeStored(themeKey, theme);
  applyTheme();
  if (latest.model) void draw(latest.source, latest.model);
});

ui.download.addEventListener('click', () => {
  if (!rendered) return;
  const { model, svg } = rendered;
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${slug(model.title ?? model.accTitle ?? '')}.svg`;
  link.click();
  // Revoking in the same task can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 0);
});

ui.share.addEventListener('click', async () => {
  history.replaceState(null, '', await encodeShareHash(editor.source()));
  try {
    await navigator.clipboard.writeText(location.href);
    showToast('Link copied. Anyone with it sees this diagram; nothing is stored on a server.');
  } catch {
    // Clipboard access can be denied (permissions, insecure context); the link is still in the address bar.
    showToast('Copy the link from the address bar to share this diagram.');
  }
});

ui.tabCode.addEventListener('click', () => selectView('code'));
ui.tabDiagram.addEventListener('click', () => selectView('diagram'));

// Pasting another share link into the address bar of an open playground only changes the hash.
window.addEventListener('hashchange', async () => {
  const next = await decodeShareHash(location.hash);
  if (next.kind === 'source') editor.replaceSource(next.source);
  else if (next.kind === 'invalid') showToast('This share link is damaged, so the diagram was not changed.');
});

applyTheme();
update(editor.source(), 0);
