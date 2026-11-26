const tags = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'P', 'BR', 'DIV', 'SPAN', 'FONT', 'UL', 'OL', 'LI']);
const styles = ['color', 'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'textDecoration'];

export function cleanHtml(html) {
  const source = new DOMParser().parseFromString(html, 'text/html').body;
  const output = document.createElement('div');
  function copy(node, parent) {
    if (node.nodeType === Node.TEXT_NODE) { parent.append(document.createTextNode(node.data)); return; }
    if (node.nodeType !== Node.ELEMENT_NODE || ['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT'].includes(node.tagName)) return;
    const element = tags.has(node.tagName) ? document.createElement(node.tagName) : parent;
    if (element !== parent) {
      for (const key of styles) {
        const value = node.style[key];
        if (value && !/url\(|var\(/i.test(value)) element.style[key] = value;
      }
      if (node.tagName === 'FONT') for (const key of ['size', 'face', 'color']) {
        const value = node.getAttribute(key);
        if (value && /^[#a-z0-9\u4e00-\u9fff ,.-]{1,70}$/i.test(value)) element.setAttribute(key, value);
      }
      parent.append(element);
    }
    for (const child of node.childNodes) copy(child, element);
  }
  for (const child of source.childNodes) copy(child, output);
  return output;
}

export function sanitizedHtml(html) {
  return cleanHtml(html).innerHTML;
}
