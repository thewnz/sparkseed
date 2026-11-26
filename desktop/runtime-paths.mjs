import { join } from 'node:path';

// mth
export function packagedPaths({ packaged, resourcesPath, root }) {
  const pdfjs = packaged
    ? join(resourcesPath, 'node_modules', 'pdfjs-dist')
    : join(root, 'node_modules', 'pdfjs-dist');
  const worker = packaged ? join(resourcesPath, 'desktop', 'pdf-worker.mjs') : '';
  return {
    pdfjs,
    worker,
    brand: packaged ? join(resourcesPath, 'brand-mark.png') : join(root, 'dist', 'brand-mark.png'),
    preload: join(root, 'desktop', 'preload.cjs'),
    renderer: join(root, 'dist', 'index.html'),
    commands: packaged ? { worker, pdfjs } : {},
  };
}
