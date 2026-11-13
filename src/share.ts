const hashPrefix = '#code=';

export type SharedSource =
  { readonly kind: 'none' } | { readonly kind: 'source'; readonly source: string } | { readonly kind: 'invalid' };

export async function encodeShareHash(source: string): Promise<string> {
  const compressed = new Blob([source]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  const bytes = new Uint8Array(await new Response(compressed).arrayBuffer());
  return hashPrefix + toBase64Url(bytes);
}

export async function decodeShareHash(hash: string): Promise<SharedSource> {
  if (!hash.startsWith(hashPrefix)) return { kind: 'none' };
  try {
    const bytes = fromBase64Url(hash.slice(hashPrefix.length));
    const inflated = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    const source = new TextDecoder('utf-8', { fatal: true }).decode(await new Response(inflated).arrayBuffer());
    return { kind: 'source', source };
  } catch {
    // atob, inflate and the strict UTF-8 decoder all throw on a damaged or truncated link.
    return { kind: 'invalid' };
  }
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text.replaceAll('-', '+').replaceAll('_', '/'));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
