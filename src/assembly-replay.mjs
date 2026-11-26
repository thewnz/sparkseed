const prefix = 'data:image/svg+xml;base64,';
const palette = ['#2563eb', '#0f766e', '#b45309', '#9333ea', '#be123c', '#0369a1'];
const graphics = new Set(['g', 'path', 'rect', 'line', 'polyline', 'polygon', 'circle', 'ellipse', 'text', 'image']);

export function createAssemblyReplay(image) {
  if (!image?.startsWith(prefix)) return null;
  const bytes = Uint8Array.from(atob(image.slice(prefix.length)), char => char.charCodeAt(0));
  const root = new DOMParser().parseFromString(new TextDecoder().decode(bytes), 'image/svg+xml').documentElement;
  const regions = [...root.querySelectorAll(':scope > g[id^="assembly-stage-"]')].map((stage, index) => {
    const material = stage.querySelector('[data-assembly-material]');
    if (!material) return null;
    const units = material.localName === 'image' ? [material]
      : [...material.children].filter(node => graphics.has(node.localName));
    if (!units.length) return null;
    const header = stage.querySelector(':scope > rect');
    const cursor = root.ownerDocument.createElementNS(root.namespaceURI, 'path');
    cursor.setAttribute('d', 'M0 0 L0 16 L4 12 L8 19 L11 17 L7 10 L13 10 Z');
    cursor.setAttribute('fill', palette[index % palette.length]);
    cursor.setAttribute('stroke', 'white');
    cursor.setAttribute('stroke-width', '1.2');
    cursor.setAttribute('visibility', 'hidden');
    stage.append(cursor);
    const x = Number(header?.getAttribute('x') || 0);
    const y = Number(header?.getAttribute('y') || 0);
    const width = Number(header?.getAttribute('width') || 180);
    return { units, cursor, x, y, width, batch: Math.ceil(units.length / 24) };
  }).filter(Boolean);
  if (regions.length < 2) return null;
  const length = Math.max(...regions.map(({ units, batch }) => Math.ceil(units.length / batch)));
  const links = root.querySelector(':scope > #assembly-links');
  return {
    length,
    render(frame) {
      links?.setAttribute('display', 'none');
      for (const { units, cursor, x, y, width, batch } of regions) {
        const count = Math.min(units.length, (frame + 1) * batch);
        units.forEach((node, index) => {
          if (index >= count) node.setAttribute('visibility', 'hidden');
          else node.removeAttribute('visibility');
        });
        cursor.setAttribute('visibility', frame * batch < units.length ? 'visible' : 'hidden');
        cursor.setAttribute('transform', 'translate(' + (x + 12 + Math.max(0, width - 30) * count / units.length) + ' ' + (y + 28) + ')');
      }
      const encoded = new TextEncoder().encode(new XMLSerializer().serializeToString(root));
      let binary = '';
      for (let start = 0; start < encoded.length; start += 16384) {
        binary += String.fromCharCode(...encoded.subarray(start, start + 16384));
      }
      return prefix + btoa(binary);
    },
  };
}
