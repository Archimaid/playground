import { readStored, writeStored } from './storage.ts';

const storageKey = 'archimaid.playground.split';
const defaultPercent = 42;
const minPercent = 20;
const maxPercent = 80;
const keyboardStepPercent = 2;

function clamp(percent: number): number {
  return Math.min(maxPercent, Math.max(minPercent, percent));
}

// The workspace grid reads --source-width; the divider is a focusable separator that drags or steps it.
export function setUpSplit(workspace: HTMLElement, divider: HTMLElement): void {
  const stored = Number(readStored(storageKey));
  let percent = Number.isFinite(stored) && stored > 0 ? clamp(stored) : defaultPercent;

  const apply = (next: number, persist: boolean): void => {
    percent = clamp(next);
    workspace.style.setProperty('--source-width', `${percent}%`);
    divider.setAttribute('aria-valuenow', String(Math.round(percent)));
    if (persist) writeStored(storageKey, String(percent));
  };

  const percentAt = (clientX: number): number => {
    const bounds = workspace.getBoundingClientRect();
    return ((clientX - bounds.left) / bounds.width) * 100;
  };

  divider.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    divider.setPointerCapture(event.pointerId);
    workspace.classList.add('is-resizing');
  });
  divider.addEventListener('pointermove', (event) => {
    if (divider.hasPointerCapture(event.pointerId)) apply(percentAt(event.clientX), false);
  });
  const endDrag = (event: PointerEvent): void => {
    if (!divider.hasPointerCapture(event.pointerId)) return;
    divider.releasePointerCapture(event.pointerId);
    workspace.classList.remove('is-resizing');
    apply(percent, true);
  };
  divider.addEventListener('pointerup', endDrag);
  divider.addEventListener('pointercancel', endDrag);
  divider.addEventListener('dblclick', () => apply(defaultPercent, true));

  divider.addEventListener('keydown', (event) => {
    const step = { ArrowLeft: -keyboardStepPercent, ArrowRight: keyboardStepPercent }[event.key];
    if (step !== undefined) apply(percent + step, true);
    else if (event.key === 'Home') apply(minPercent, true);
    else if (event.key === 'End') apply(maxPercent, true);
    else return;
    event.preventDefault();
  });

  apply(percent, false);
}
