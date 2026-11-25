// Shape-preserving cubic Hermite interpolation. Each interval stays between its
// two observed endpoint values; a measured maximum remains a measured maximum.
// This changes drawing only, never sampling, readouts, exported rows or fitting.
export function smoothPath(points, x = v => v, y = v => v) {
  const p = points.filter(q => Number.isFinite(q[0]) && Number.isFinite(q[1]));
  if (!p.length) return '';
  const h = [], d = [], t = [];
  for (let i = 1; i < p.length; i++) {
    h.push(p[i][0] - p[i-1][0]);
    d.push((p[i][1] - p[i-1][1]) / (h.at(-1) || 1));
  }
  if (h.some(v => v <= 0)) {
    // Several measured low-current samples share B = 0 after calibration.
    // Preserve those vertical joins without making the entire curve polygonal.
    let out = '', run = [p[0]];
    const flush = () => { const part = smoothPath(run,x,y); out += out ? part.replace(/^M/,' L') : part; };
    for (let i=1; i<p.length; i++) {
      if (p[i][0] <= p[i-1][0]) { flush(); run = []; }
      run.push(p[i]);
    }
    flush(); return out;
  }
  t[0] = d[0] ?? 0; t[p.length-1] = d.at(-1) ?? 0;
  for (let i = 1; i < p.length-1; i++) {
    const a = d[i-1], b = d[i], w1 = 2*h[i] + h[i-1], w2 = h[i] + 2*h[i-1];
    t[i] = a*b <= 0 ? 0 : (w1+w2)/(w1/a+w2/b);
  }
  const xy = (a,b) => `${x(a).toFixed(3)},${y(b).toFixed(3)}`;
  let out = 'M' + xy(...p[0]);
  for (let i=0; i<p.length-1; i++) {
    const [a,b] = p[i], [c,e] = p[i+1], s = h[i]/3;
    out += ` C${xy(a+s,b+s*t[i])} ${xy(c-s,e-s*t[i+1])} ${xy(c,e)}`;
  }
  return out;
}
