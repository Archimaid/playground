import { validateArchiMate } from 'archimaid/language';
import starterSource from './starter.mmd?raw';

export interface Example {
  readonly id: string;
  readonly title: string;
  readonly source: string;
}

// The npm package ships its examples, so the gallery always matches the installed renderer version.
const packagedSources = import.meta.glob<string>('/node_modules/archimaid/examples/*.mmd', {
  query: '?raw',
  import: 'default',
  eager: true,
});

function titleOf(id: string, source: string): string {
  const { model } = validateArchiMate(source);
  return model?.title ?? model?.accTitle ?? id.replaceAll('-', ' ');
}

function elementCount(source: string): number {
  return validateArchiMate(source).model?.elements.length ?? Number.POSITIVE_INFINITY;
}

const packagedExamples: Example[] = Object.entries(packagedSources)
  .map(([path, source]) => {
    const id = path.slice(path.lastIndexOf('/') + 1, -'.mmd'.length);
    return { id, title: titleOf(id, source), source };
  })
  // Smallest first, so the list reads as a progression from one relationship to a full view.
  .sort((left, right) => elementCount(left.source) - elementCount(right.source));

export const starterExample: Example = { id: 'starter', title: 'Starter', source: starterSource };

export const examples: readonly Example[] = [starterExample, ...packagedExamples];
