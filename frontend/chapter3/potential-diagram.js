import { svgLabel as label } from './svg-tex.js';
export function potentialDiagram(position = 'H', mean = false) {
  const nodes = {
      H: { x: 230, phi: 0, name: 'H 端' },
      middle: { x: 490, phi: 1.84, name: '中点' },
      K: { x: 750, phi: 3.68, name: 'K 端' },
    },
    p = nodes[position] ?? nodes.H;
  let g = `<defs><linearGradient id="filament-voltage" gradientUnits="userSpaceOnUse" x1="230" y1="167" x2="750" y2="167"><stop stop-color="#75b6e6"/><stop offset=".5" stop-color="#e5d4a9"/><stop offset="1" stop-color="#f0a161"/></linearGradient><linearGradient id="anode-metal" x2="0" y2="1"><stop stop-color="#d8be8b"/><stop offset=".5" stop-color="#7d6542"/><stop offset="1" stop-color="#d6b477"/></linearGradient><filter id="filament-glow"><feGaussianBlur stdDeviation="3"/></filter><marker id="voltage-arrow" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto-start-reverse"><path d="M0 0L8 4L0 8Z" fill="#e6c68b"/></marker></defs>`;
  g += `<rect x="196" y="68" width="590" height="18" rx="3" fill="url(#anode-metal)"/><rect x="196" y="240" width="590" height="12" rx="3" fill="url(#anode-metal)" opacity=".5"/><path d="M180 55Q120 160 180 265H803Q870 160 803 55Z" fill="#a8c8de08" stroke="#91b5c34d"/>`;
  g += label(490, 42, '阳极 +10.00 V', 'text-anchor="middle" fill="#ebd3a7" font-size="18"');
  g += `<path d="M58 204H142V167H230" fill="none" stroke="#8aa3b4" stroke-width="3"/><path class="wire-trace" d="M58 204H142V167H230" fill="none" stroke="#9ad4f5" stroke-width="2"/><path d="M230 167H750" stroke="url(#filament-voltage)" stroke-width="10" opacity=".45" filter="url(#filament-glow)"/><path d="M230 167H750" stroke="url(#filament-voltage)" stroke-width="4"/>`;
  g +=
    label(22, 235, 'CH2^-', 'fill="#bfd9e7" font-size="18"') +
    label(22, 258, '接到 H 端', 'fill="#8eafc2" font-size="18"');
  g +=
    `<path d="M230 167V288H437M543 288H750V167" fill="none" stroke="#647d8c" stroke-width="1.5"/><rect x="437" y="272" width="106" height="31" rx="4" fill="#203748" stroke="#ad9270"/>` +
    label(490, 293, 'CH3 · 3.68 V', 'text-anchor="middle" fill="#e7cba3" font-size="18"');
  for (const [key, n] of Object.entries(nodes)) {
    const color = key === 'H' ? '#8ac7ee' : key === 'K' ? '#f2b37c' : '#e1cf9c';
    g +=
      `<g data-probe="${key}" role="button" tabindex="0" aria-label="${n.name}"><rect x="${n.x - 40}" y="141" width="80" height="91" fill="transparent"/><circle cx="${n.x}" cy="167" r="${position === key ? 8 : 5}" fill="${color}" stroke="${position === key ? 'white' : color}" stroke-width="2"/>` +
      label(n.x, 203, n.name, `text-anchor="middle" fill="${color}" font-size="22"`) +
      label(
        n.x,
        226,
        `${n.phi ? '+' : ''}${n.phi.toFixed(2)} V`,
        `text-anchor="middle" fill="${color}" font-size="20"`,
      ) +
      '</g>';
  }
  const arrowX = mean ? 490 : p.x;
  g +=
    `<path d="M${arrowX} 151V101" stroke="#e6c68b" stroke-width="2" marker-end="url(#voltage-arrow)"/>` +
    label(arrowX + 17, 129, `${(10 - (mean ? 1.84 : p.phi)).toFixed(2)} V`, 'fill="#f2d19a" font-size="21"');
  if (mean) {
    const x = (t) => 1010 + 240 * t,
      y = (phi) => 252 - (phi / 3.68) * 176;
    g +=
      '<path d="M935 28V304" stroke="#63798855"/>' +
      label(980, 36, '沿灯丝的线性电位', 'fill="#d5e6ee" font-size="21"');
    g += `<path d="M1010 76V252H1250" fill="none" stroke="#647d8c"/><path d="M1010 252L1250 76V252Z" fill="#ddb87810"/><path d="M1010 252L1250 76" stroke="#d5bd90" stroke-width="2.5"/><path d="M995 ${y(1.84)}H1267" stroke="#e6c68b" stroke-dasharray="6 4"/>`;
    for (const t of [0, 0.25, 0.5, 0.75, 1])
      g += `<circle cx="${x(t)}" cy="${y(t * 3.68)}" r="5" fill="${t < 0.5 ? '#8ac7ee' : '#f2b37c'}"/>`;
    g +=
      label(998, 257, '0', 'text-anchor="end" fill="#8ac7ee" font-size="19"') +
      label(1260, 81, '3.68', 'fill="#f2b37c" font-size="19"');
    g +=
      label(1065, 231, '0.92', 'fill="#8ac7ee" font-size="18"') +
      label(1170, 105, '2.76', 'fill="#f2b37c" font-size="18"');
    g +=
      label(1023, 151, '平均 1.84 V', 'fill="#f2d19a" font-size="21"') +
      label(1010, 277, 'H', 'text-anchor="middle" fill="#bdd0dc" font-size="18"') +
      label(1250, 277, 'K', 'text-anchor="middle" fill="#bdd0dc" font-size="18"');
    g += label(
      1130,
      310,
      '(0 + 3.68) / 2 = (0.92 + 2.76) / 2',
      'text-anchor="middle" fill="#c7d9e3" font-size="17"',
    );
  }
  return g;
}
