import type { Mermaid } from 'mermaid';

export type DiagramTheme = 'light' | 'dark';

export type RenderOutcome =
  | { readonly kind: 'rendered'; readonly svg: string }
  | { readonly kind: 'failed'; readonly message: string }
  // A newer render started before this one finished; its result was dropped.
  | { readonly kind: 'superseded' };

let mermaidPromise: Promise<Mermaid> | undefined;

// Mermaid and the renderer are large, so they load only when the first diagram is drawn.
function loadMermaid(): Promise<Mermaid> {
  mermaidPromise ??= Promise.all([import('mermaid'), import('archimaid')])
    .then(async ([{ default: mermaid }, { archimate }]) => {
      await mermaid.registerExternalDiagrams([archimate]);
      return mermaid;
    })
    .catch((error: unknown) => {
      // Forget the failed load (for example a dropped connection), so the next render tries again.
      mermaidPromise = undefined;
      throw error;
    });
  return mermaidPromise;
}

let latestRequest = 0;

export async function renderDiagram(source: string, theme: DiagramTheme): Promise<RenderOutcome> {
  const request = ++latestRequest;
  try {
    const mermaid = await loadMermaid();
    if (request !== latestRequest) return { kind: 'superseded' };
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: theme === 'dark' ? 'dark' : 'default' });
    const { svg } = await mermaid.render(`archimaid-preview-${request}`, source);
    return request === latestRequest ? { kind: 'rendered', svg } : { kind: 'superseded' };
  } catch (error) {
    if (request !== latestRequest) return { kind: 'superseded' };
    return { kind: 'failed', message: error instanceof Error ? error.message : String(error) };
  }
}
