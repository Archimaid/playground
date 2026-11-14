import '@fontsource-variable/space-grotesk';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/600.css';
import './styles.css';

import { validateArchiMate, type ArchiMateDiagnostic, type ArchiMateModel } from 'archimaid/language';
import { createSourceEditor } from './editor.ts';
import { examples, starterExample } from './examples.ts';
import { downloadBlob, prepareSvg, renderPng, type ExportBackground } from './export.ts';
import { convertNotation, detectNotation, type Notation } from './notation.ts';
import { renderDiagram, type DiagramTheme } from './render.ts';
import { decodeShareHash, encodeShareHash } from './share.ts';
import { setUpSplit } from './split.ts';
import { readStored, writeStored } from './storage.ts';
import { applyZoom, clampZoom, displayedScale, maxZoom, minZoom, stepZoom, type Zoom } from './zoom.ts';

const sourceKey = 'archimaid.playground.source';
const themeKey = 'archimaid.playground.theme';
const notationKey = 'archimaid.playground.notation';
const exportBackgroundKey = 'archimaid.playground.export-background';
const renderDelayMs = 250;

function byId<T extends HTMLElement>(id: string, type: new () => T): T {
  const element = document.getElementById(id);
  if (!(element instanceof type)) throw new Error(`Missing #${id} in index.html.`);
  return element;
}

const ui = {
  workspace: byId('workspace', HTMLElement),
  divider: byId('divider', HTMLDivElement),
  editor: byId('editor', HTMLDivElement),
  statusChip: byId('status-chip', HTMLSpanElement),
  notationLong: byId('notation-long', HTMLButtonElement),
  notationShorthand: byId('notation-shorthand', HTMLButtonElement),
  problems: byId('problems', HTMLDivElement),
  problemsCount: byId('problems-count', HTMLSpanElement),
  problemsList: byId('problems-list', HTMLUListElement),
  cursorPosition: byId('cursor-position', HTMLSpanElement),
  modelSummary: byId('model-summary', HTMLSpanElement),
  storageState: byId('storage-state', HTMLSpanElement),
  canvas: byId('diagram-pane', HTMLElement),
  preview: byId('preview', HTMLDivElement),
  previewState: byId('preview-state', HTMLParagraphElement),
  previewStateText: byId('preview-state-text', HTMLSpanElement),
  examples: byId('examples', HTMLSelectElement),
  zoomOut: byId('zoom-out', HTMLButtonElement),
  zoomReset: byId('zoom-reset', HTMLButtonElement),
  zoomIn: byId('zoom-in', HTMLButtonElement),
  zoomFit: byId('zoom-fit', HTMLButtonElement),
  themeLight: byId('theme-light', HTMLButtonElement),
  themeDark: byId('theme-dark', HTMLButtonElement),
  download: byId('download', HTMLButtonElement),
  downloadControl: byId('download-control', HTMLDivElement),
  downloadMenu: byId('download-menu', HTMLDivElement),
  downloadSvg: byId('download-svg', HTMLButtonElement),
  downloadPng: byId('download-png', HTMLButtonElement),
  share: byId('share', HTMLButtonElement),
  tabCode: byId('tab-code', HTMLButtonElement),
  tabCodeBadge: byId('tab-code-badge', HTMLSpanElement),
  tabDiagram: byId('tab-diagram', HTMLButtonElement),
  toast: byId('toast', HTMLDivElement),
};

type PreviewState = 'loading' | 'ready' | 'stale' | 'failed';

let theme: DiagramTheme = readStored(themeKey) === 'dark' ? 'dark' : 'light';
let zoom: Zoom = 'fit';
const storedNotation = readStored(notationKey);
// Undefined until the viewer picks one; examples then load as written.
let preferredNotation: Notation | undefined =
  storedNotation === 'long' || storedNotation === 'shorthand' ? storedNotation : undefined;
let latest: { source: string; model: ArchiMateModel | undefined; errors: number } = {
  source: '',
  model: undefined,
  errors: 0,
};
let rendered: { svg: string; model: ArchiMateModel } | undefined;
let renderTimer: ReturnType<typeof setTimeout> | undefined;

const shared = await decodeShareHash(location.hash);
const initialSource = shared.kind === 'source' ? shared.source : (readStored(sourceKey) ?? starterExample.source);
const editor = createSourceEditor(ui.editor, {
  initialSource,
  onChange(source) {
    showStorageState(writeStored(sourceKey, source) ? 'saved' : 'blocked');
    // The shared link no longer describes what is in the editor.
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);
    update(source, renderDelayMs);
  },
  onCursorMove({ line, column }) {
    ui.cursorPosition.textContent = `Ln ${line}, Col ${column}`;
  },
});
if (shared.kind === 'source') showStorageState('shared');
else showStorageState(writeStored(sourceKey, initialSource) ? 'saved' : 'blocked');
if (shared.kind === 'invalid') showToast('This share link is damaged, so your last diagram was opened instead.');

function update(source: string, delayMs: number): void {
  const { model, diagnostics } = validateArchiMate(source);
  const errors = diagnostics.filter((diagnostic) => diagnostic.severity === 'error').length;
  latest = { source, model, errors };
  editor.showDiagnostics(diagnostics);
  showStatus(diagnostics, model);
  showNotation(source, model !== undefined);
  showProblems(diagnostics);
  clearTimeout(renderTimer);
  if (model) renderTimer = setTimeout(() => void draw(source, model), delayMs);
  else showPreviewState(staleMessage(), 'stale');
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
  const svg = currentSvg();
  if (svg) applyZoom(svg, zoom);
  updateZoomControls();
  ui.download.disabled = false;
  // A render that started before the latest edit may finish after it; keep the hint if the source broke since.
  if (latest.source === source || latest.model) showPreviewState('', 'ready');
  else showPreviewState(staleMessage(), 'stale');
}

function staleMessage(): string {
  const problems = plural(latest.errors, 'error');
  return rendered
    ? `Showing the last valid diagram. Fix ${problems} to update it.`
    : `Fix ${problems} in the source to see the diagram.`;
}

function showPreviewState(message: string, state: PreviewState): void {
  ui.previewStateText.textContent = message;
  ui.previewState.hidden = message === '';
  ui.canvas.dataset.state = state;
}

function showStatus(diagnostics: readonly ArchiMateDiagnostic[], model: ArchiMateModel | undefined): void {
  const errors = diagnostics.filter((diagnostic) => diagnostic.severity === 'error').length;
  const warnings = diagnostics.length - errors;
  if (errors > 0) {
    ui.statusChip.textContent = plural(errors, 'error');
    ui.statusChip.dataset.status = 'invalid';
  } else if (warnings > 0) {
    ui.statusChip.textContent = plural(warnings, 'warning');
    ui.statusChip.dataset.status = 'warning';
  } else {
    ui.statusChip.textContent = 'Valid';
    ui.statusChip.dataset.status = 'valid';
  }
  ui.tabCodeBadge.textContent = String(errors);
  ui.tabCodeBadge.hidden = errors === 0;
  ui.tabCode.setAttribute('aria-label', errors > 0 ? `Code, ${plural(errors, 'error')}` : 'Code');
  ui.modelSummary.textContent = model
    ? `${plural(model.elements.length, 'element')} · ${plural(model.relationships.length, 'relationship')}`
    : '';
}

// The pressed button shows what the source is written in, which a hand edit can change; mixed presses neither.
function showNotation(source: string, valid: boolean): void {
  const written = detectNotation(source);
  for (const [button, notation] of [
    [ui.notationLong, 'long'],
    [ui.notationShorthand, 'shorthand'],
  ] as const) {
    button.setAttribute('aria-pressed', String(written === notation));
    button.disabled = !valid;
    button.title = valid ? '' : 'Fix the errors first; only a valid diagram can be rewritten.';
  }
}

function selectNotation(notation: Notation): void {
  preferredNotation = notation;
  writeStored(notationKey, notation);
  const name = notation === 'long' ? 'long form' : 'shorthand';
  const keptNote = (kept: number): string =>
    kept > 0 ? ` ${plural(kept, 'relationship')} stay in long form because other lines refer to their IDs.` : '';
  const result = convertNotation(editor.source(), notation);
  switch (result.kind) {
    case 'converted':
      editor.rewriteSource(result.source);
      showToast(`Rewrote ${plural(result.converted, 'relationship')} in ${name}.${keptNote(result.kept)}`);
      return;
    case 'unchanged':
      showToast(`The relationships are already in ${name}.${keptNote(result.kept)}`);
      return;
    case 'invalid':
      showToast('Fix the errors first; only a valid diagram can be rewritten.');
      return;
    case 'failed':
      showToast('This diagram could not be rewritten without changing it, so it was left as it is.');
      return;
  }
}

function inPreferredNotation(source: string): string {
  if (!preferredNotation) return source;
  const result = convertNotation(source, preferredNotation);
  return result.kind === 'converted' ? result.source : source;
}

function showProblems(diagnostics: readonly ArchiMateDiagnostic[]): void {
  ui.problems.hidden = diagnostics.length === 0;
  ui.problemsCount.textContent = String(diagnostics.length);
  ui.problemsList.replaceChildren(
    ...diagnostics.map((diagnostic) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `problem is-${diagnostic.severity}`;
      const position = document.createElement('span');
      position.className = 'problem-position';
      position.textContent = `${diagnostic.line}:${diagnostic.column}`;
      const message = document.createElement('span');
      message.textContent = diagnostic.message;
      button.append(position, message);
      button.addEventListener('click', () => {
        selectView('code');
        editor.revealDiagnostic(diagnostic);
      });
      const item = document.createElement('li');
      item.append(button);
      return item;
    }),
  );
}

function showStorageState(state: 'saved' | 'blocked' | 'shared'): void {
  ui.storageState.textContent = {
    saved: 'Saved in this browser',
    blocked: 'Not saved: browser storage is blocked',
    shared: 'Opened from a share link',
  }[state];
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
  // The pane was display: none, so its fitted scale is only known once it is visible again.
  if (view === 'diagram') updateZoomControls();
}

function slug(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/gu, '-')
      .replace(/^-|-$/gu, '') || 'archimaid-diagram'
  );
}

function currentSvg(): SVGSVGElement | undefined {
  const svg = ui.preview.querySelector('svg');
  return svg instanceof SVGSVGElement ? svg : undefined;
}

// Keeps the point in the middle of the view in place, instead of jumping to the diagram's top-left corner.
function setZoom(next: Zoom): void {
  zoom = next;
  const svg = currentSvg();
  if (!svg) {
    updateZoomControls();
    return;
  }
  const { preview } = ui;
  const centreX = (preview.scrollLeft + preview.clientWidth / 2) / preview.scrollWidth;
  const centreY = (preview.scrollTop + preview.clientHeight / 2) / preview.scrollHeight;
  applyZoom(svg, zoom);
  preview.scrollLeft = centreX * preview.scrollWidth - preview.clientWidth / 2;
  preview.scrollTop = centreY * preview.scrollHeight - preview.clientHeight / 2;
  updateZoomControls();
}

function updateZoomControls(): void {
  const svg = currentSvg();
  const scale = svg ? displayedScale(svg) : undefined;
  ui.zoomReset.textContent = scale === undefined ? '100%' : `${Math.round(scale * 100)}%`;
  ui.zoomFit.setAttribute('aria-pressed', String(zoom === 'fit'));
  ui.zoomOut.disabled = scale === undefined || scale <= minZoom + 0.001;
  ui.zoomIn.disabled = scale === undefined || scale >= maxZoom - 0.001;
  ui.zoomReset.disabled = scale === undefined;
  ui.zoomFit.disabled = scale === undefined;
}

function stepFromScreen(direction: 'in' | 'out'): void {
  const svg = currentSvg();
  const scale = svg ? displayedScale(svg) : undefined;
  if (scale !== undefined) setZoom(stepZoom(scale, direction));
}

function applyTheme(): void {
  ui.themeLight.setAttribute('aria-pressed', String(theme === 'light'));
  ui.themeDark.setAttribute('aria-pressed', String(theme === 'dark'));
}

function selectTheme(next: DiagramTheme): void {
  if (next === theme) return;
  theme = next;
  writeStored(themeKey, theme);
  applyTheme();
  if (latest.model) void draw(latest.source, latest.model);
}

const placeholder = new Option('Examples', '', true, true);
placeholder.disabled = true;
ui.examples.append(placeholder, ...examples.map((example) => new Option(example.title, example.id)));
ui.examples.addEventListener('change', () => {
  const example = examples.find((candidate) => candidate.id === ui.examples.value);
  ui.examples.value = '';
  if (!example) return;
  zoom = 'fit';
  editor.replaceSource(inPreferredNotation(example.source));
  showToast(`Loaded “${example.title}”. Undo brings back your previous diagram.`);
});

ui.zoomIn.addEventListener('click', () => stepFromScreen('in'));
ui.zoomOut.addEventListener('click', () => stepFromScreen('out'));
ui.zoomReset.addEventListener('click', () => setZoom(1));
ui.zoomFit.addEventListener('click', () => setZoom('fit'));
ui.preview.addEventListener(
  'wheel',
  (event) => {
    // Pinch on a trackpad arrives as a wheel event with ctrlKey set; plain scrolling still pans.
    if (!event.ctrlKey && !event.metaKey) return;
    const svg = currentSvg();
    const scale = svg ? displayedScale(svg) : undefined;
    if (scale === undefined) return;
    event.preventDefault();
    setZoom(clampZoom(scale * Math.exp(-event.deltaY * 0.01)));
  },
  { passive: false },
);
new ResizeObserver(() => {
  if (zoom === 'fit') updateZoomControls();
}).observe(ui.preview);

ui.notationLong.addEventListener('click', () => selectNotation('long'));
ui.notationShorthand.addEventListener('click', () => selectNotation('shorthand'));
ui.themeLight.addEventListener('click', () => selectTheme('light'));
ui.themeDark.addEventListener('click', () => selectTheme('dark'));

const backgroundInputs = Array.from(
  ui.downloadMenu.querySelectorAll<HTMLInputElement>('input[name="download-background"]'),
);
const storedBackground = readStored(exportBackgroundKey);
for (const input of backgroundInputs) {
  if (storedBackground === 'transparent' || storedBackground === 'diagram')
    input.checked = input.value === storedBackground;
  input.addEventListener('change', () => writeStored(exportBackgroundKey, input.value));
}

function exportBackground(): ExportBackground {
  return backgroundInputs.find((input) => input.checked)?.value === 'transparent' ? 'transparent' : 'diagram';
}

function setDownloadMenu(open: boolean): void {
  ui.downloadMenu.hidden = !open;
  ui.download.setAttribute('aria-expanded', String(open));
  if (open) backgroundInputs.find((input) => input.checked)?.focus();
}

async function exportDiagram(format: 'svg' | 'png'): Promise<void> {
  if (!rendered) return;
  const background = exportBackground();
  const { model, svg } = rendered;
  const name = `${slug(model.title ?? model.accTitle ?? '')}${background === 'transparent' ? '-transparent' : ''}`;
  setDownloadMenu(false);
  ui.download.focus();
  try {
    const exported = prepareSvg(svg, background);
    if (format === 'svg') downloadBlob(new Blob([exported.source], { type: 'image/svg+xml' }), `${name}.svg`);
    else downloadBlob(await renderPng(exported), `${name}.png`);
  } catch (error) {
    showToast(
      `The ${format.toUpperCase()} could not be made: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

ui.download.addEventListener('click', () => setDownloadMenu(ui.download.getAttribute('aria-expanded') !== 'true'));
ui.downloadSvg.addEventListener('click', () => void exportDiagram('svg'));
ui.downloadPng.addEventListener('click', () => void exportDiagram('png'));
document.addEventListener('pointerdown', (event) => {
  if (!ui.downloadMenu.hidden && event.target instanceof Node && !ui.downloadControl.contains(event.target)) {
    setDownloadMenu(false);
  }
});
ui.downloadControl.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || ui.downloadMenu.hidden) return;
  setDownloadMenu(false);
  ui.download.focus();
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

// Matches the phone breakpoint in styles.css, where only one of the two panes is shown.
const singlePaneLayout = matchMedia('(max-width: 760px)');

// Someone opening a share link came to see the diagram; on a phone that is the second tab.
function showSharedDiagram(): void {
  if (singlePaneLayout.matches) selectView('diagram');
}

// Pasting another share link into the address bar of an open playground only changes the hash.
window.addEventListener('hashchange', async () => {
  const next = await decodeShareHash(location.hash);
  if (next.kind === 'source') {
    editor.replaceSource(next.source);
    showSharedDiagram();
  } else if (next.kind === 'invalid') {
    showToast('This share link is damaged, so the diagram was not changed.');
  }
});

setUpSplit(ui.workspace, ui.divider);
applyTheme();
updateZoomControls();
update(editor.source(), 0);
if (shared.kind === 'source') showSharedDiagram();
