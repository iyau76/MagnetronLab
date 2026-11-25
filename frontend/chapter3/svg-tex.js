// Small, explicit SVG counterpart of the project's MathML renderer.
// Labels use typeset subscripts/superscripts rather than Unicode lookalikes.
const escape = (text) =>
  String(text).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
export function svgTex(source) {
  const text = String(source)
    .replace(/\\mu(?![A-Za-z])/g, 'μ')
    .replace(/\\Omega(?![A-Za-z])/g, 'Ω')
    .replace(/\\Delta(?![A-Za-z])/g, 'Δ')
    .replace(/\\theta(?![A-Za-z])/g, 'θ')
    .replace(/\\phi(?![A-Za-z])/g, 'φ')
    .replace(/\\varphi(?![A-Za-z])/g, 'φ')
    .replace(/\\partial(?![A-Za-z])/g, '∂')
    .replace(/\\eta(?![A-Za-z])/g, 'η')
    .replace(/\\perp(?![A-Za-z])/g, '⊥')
    .replace(/\\circ(?![A-Za-z])/g, '°')
    .replace(/\\simeq(?![A-Za-z])/g, '≃')
    .replace(/\\sigma(?![A-Za-z])/g, 'σ')
    .replace(/\\times(?![A-Za-z])/g, '×')
    .replace(/\\approx(?![A-Za-z])/g, '≈')
    .replace(/\\(?:mathrm|text|mathbf|boldsymbol|operatorname)\{([^{}]*)\}/g, '$1')
    .replace(/\\(?:mathrm|mathbf)\s*([A-Za-z])/g, '$1')
    .replace(/\\hat\{([^{}]*)\}/g, '$1̂')
    .replace(/\\(min|max|cos|sin|ln|exp|log)(?![A-Za-z])/g, '$1')
    .replace(/\\pm(?![A-Za-z])/g, '±')
    .replace(/\\cdot(?![A-Za-z])/g, '·')
    .replace(/\\to(?![A-Za-z])/g, '→')
    .replace(/\\[,;]/g, ' ')
    .replace(/\\ /g, ' ');
  let out = '',
    i = 0;
  while (i < text.length) {
    if (text[i] === '_' || text[i] === '^') {
      const kind = text[i++] === '_' ? 'sub' : 'super';
      let body = '';
      if (text[i] === '{') {
        const end = text.indexOf('}', i);
        body = text.slice(i + 1, end);
        i = end + 1;
      } else body = text[i++] ?? '';
      out += `<tspan baseline-shift="${kind}" font-size="72%">${escape(body)}</tspan>`;
    } else out += escape(text[i++]);
  }
  return out;
}
export function svgLabel(x, y, source, attrs = '') {
  return `<text x="${x}" y="${y}" ${attrs}>${svgTex(source)}</text>`;
}
