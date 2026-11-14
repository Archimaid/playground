export type ExportBackground = 'diagram' | 'transparent';

const svgNamespace = 'http://www.w3.org/2000/svg';
const pngScale = 2;
// Safari refuses canvases above about 16.7 million pixels and every browser caps a side at 16384 px.
const maxCanvasPixels = 16_000_000;
const maxCanvasSide = 16_384;

export interface ExportedSvg {
  readonly source: string;
  readonly width: number;
  readonly height: number;
}

// The preview SVG is sized to its pane (width 100%, a max-width style); a download gets its natural size,
// so it opens at 100% on its own. A transparent one drops the canvas, as the renderer's own
// `background: 'transparent'` option does: relationship labels and hollow markers keep their fill.
export function prepareSvg(previewSvg: string, background: ExportBackground): ExportedSvg {
  const document = new DOMParser().parseFromString(previewSvg, 'image/svg+xml');
  const svg = document.documentElement;
  if (!(svg instanceof SVGSVGElement)) throw new Error('The rendered diagram is not an SVG document.');
  const { width, height } = svg.viewBox.baseVal;
  if (!(width > 0 && height > 0)) throw new Error('The rendered diagram has no size to export.');

  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  svg.style.removeProperty('max-width');
  if (!svg.getAttribute('style')?.trim()) svg.removeAttribute('style');
  if (background === 'transparent') canvasRect(svg, width, height)?.remove();
  return { source: new XMLSerializer().serializeToString(svg), width, height };
}

// The renderer paints the canvas as the first full-size rect directly under the root, before any group.
function canvasRect(svg: SVGSVGElement, width: number, height: number): Element | undefined {
  return Array.from(svg.children).find(
    (child) =>
      child.namespaceURI === svgNamespace &&
      child.localName === 'rect' &&
      Number(child.getAttribute('width')) === width &&
      Number(child.getAttribute('height')) === height,
  );
}

export async function renderPng({ source, width, height }: ExportedSvg): Promise<Blob> {
  const scale = Math.min(
    pngScale,
    Math.sqrt(maxCanvasPixels / (width * height)),
    maxCanvasSide / Math.max(width, height),
  );
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser cannot draw a PNG.');

  const url = URL.createObjectURL(new Blob([source], { type: 'image/svg+xml' }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
  } finally {
    URL.revokeObjectURL(url);
  }
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('The PNG could not be encoded.'))), 'image/png');
  });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  // Revoking in the same task can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
