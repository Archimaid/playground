export type Zoom = 'fit' | number;

export const minZoom = 0.25;
export const maxZoom = 4;
const zoomSteps = [minZoom, 0.33, 0.5, 0.67, 0.75, 0.9, 1, 1.25, 1.5, 2, 3, maxZoom] as const;

// Steps from the scale on screen, so zooming in from "fit" starts at what the viewer sees.
export function stepZoom(currentScale: number, direction: 'in' | 'out'): number {
  if (direction === 'in') return zoomSteps.find((step) => step > currentScale + 0.001) ?? maxZoom;
  return zoomSteps.findLast((step) => step < currentScale - 0.001) ?? minZoom;
}

export function clampZoom(scale: number): number {
  return Math.min(maxZoom, Math.max(minZoom, scale));
}

interface NaturalSize {
  readonly width: number;
  readonly height: number;
}

// Mermaid sizes the SVG from its viewBox; a diagram without one cannot be scaled reliably.
function naturalSize(svg: SVGSVGElement): NaturalSize | undefined {
  const { width, height } = svg.viewBox.baseVal;
  return width > 0 && height > 0 ? { width, height } : undefined;
}

export interface AvailableSize {
  readonly width: number;
  readonly height: number;
}

// Fit shrinks a large diagram until it fits both ways but never enlarges a small one past its natural size.
export function applyZoom(svg: SVGSVGElement, zoom: Zoom, available: AvailableSize): void {
  const size = naturalSize(svg);
  if (!size) return;
  const scale =
    zoom === 'fit'
      ? Math.max(minZoom / 4, Math.min(1, available.width / size.width, available.height / size.height))
      : zoom;
  svg.style.width = `${size.width * scale}px`;
  svg.style.maxWidth = 'none';
  svg.style.height = `${size.height * scale}px`;
}

export function displayedScale(svg: SVGSVGElement): number | undefined {
  const size = naturalSize(svg);
  const width = svg.getBoundingClientRect().width;
  return size && width > 0 ? width / size.width : undefined;
}
