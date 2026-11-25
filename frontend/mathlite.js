// 极简 LaTeX → MathML。程序要离线运行，不能引 CDN，也没有本地 KaTeX，
// 所以走浏览器原生的 MathML：只实现这个项目真正用到的那一小撮语法。
// 支持：\frac \sqrt \ln \cdot \times \approx \propto、上下标 ^ _、希腊字母、
// \left \right、以及普通字母数字与运算符。写错时原样显示，不会把页面弄坏。
const GREEK = {
  alpha: 'α',
  beta: 'β',
  gamma: 'γ',
  delta: 'δ',
  Delta: 'Δ',
  epsilon: 'ε',
  varepsilon: 'ε',
  theta: 'θ',
  lambda: 'λ',
  mu: 'μ',
  nu: 'ν',
  pi: 'π',
  rho: 'ρ',
  sigma: 'σ',
  tau: 'τ',
  phi: 'φ',
  varphi: 'φ',
  omega: 'ω',
  Omega: 'Ω',
  eta: 'η',
  kappa: 'κ',
  xi: 'ξ',
  zeta: 'ζ',
};
const OPS = {
  cdot: '⋅',
  times: '×',
  div: '÷',
  pm: '±',
  mp: '∓',
  approx: '≈',
  propto: '∝',
  equiv: '≡',
  neq: '≠',
  ne: '≠',
  leq: '≤',
  le: '≤',
  geq: '≥',
  ge: '≥',
  ll: '≪',
  gg: '≫',
  to: '→',
  sim: '∼',
  simeq: '≃',
  circ: '°',
  perp: '⊥',
  langle: '⟨',
  rangle: '⟩',
  rightarrow: '→',
  leftarrow: '←',
  infty: '∞',
  partial: '∂',
  nabla: '∇',
  sum: '∑',
  int: '∫',
  ldots: '…',
  cdots: '⋯',
  quad: '\u2003',
  qquad: '\u2003\u2003',
  ',': '\u2009',
  ';': '\u2005',
};
const FUNCS = new Set(['ln', 'log', 'exp', 'sin', 'cos', 'tan', 'max', 'min', 'lim']);
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);

function group(text, start) {
  // 取一个 {…} 组；没有花括号就取单个记号（一个字符，或一条 \命令）。
  if (text[start] === '{') {
    let depth = 0,
      i = start;
    while (i < text.length) {
      if (text[i] === '{') depth++;
      else if (text[i] === '}') {
        depth--;
        if (!depth) return { body: text.slice(start + 1, i), next: i + 1 };
      }
      i++;
    }
    return { body: text.slice(start + 1), next: text.length };
  }
  const command = /^\\[a-zA-Z]+/.exec(text.slice(start));
  if (command) return { body: command[0], next: start + command[0].length };
  return { body: text[start] ?? '', next: start + 1 };
}

function parse(text) {
  let out = '',
    i = 0;
  const emit = (node, base) => {
    let sub = null,
      sup = null;
    while (text[i] === '^' || text[i] === '_') {
      const isSup = text[i] === '^';
      const script = group(text, i + 1);
      i = script.next;
      const value = `<mrow>${parse(script.body)}</mrow>`;
      if (isSup) sup = value;
      else sub = value;
    }
    if (sub && sup) return `<msubsup>${base}${sub}${sup}</msubsup>`;
    if (sub) return `<msub>${base}${sub}</msub>`;
    if (sup) return `<msup>${base}${sup}</msup>`;
    return base;
  };
  while (i < text.length) {
    const ch = text[i];
    if (ch === ' ' || ch === '\n') {
      i++;
      continue;
    }
    if (ch === '{') {
      const g = group(text, i);
      i = g.next;
      out += emit(g.body, `<mrow>${parse(g.body)}</mrow>`);
      continue;
    }
    if (ch === '\\') {
      const command = /^\\([a-zA-Z]+|.)/.exec(text.slice(i));
      if (!command) {
        i++;
        continue;
      }
      const name = command[1];
      i += command[0].length;
      if (name === 'frac' || name === 'dfrac' || name === 'tfrac') {
        const a = group(text, i);
        i = a.next;
        const b = group(text, i);
        i = b.next;
        out += emit('', `<mfrac><mrow>${parse(a.body)}</mrow><mrow>${parse(b.body)}</mrow></mfrac>`);
        continue;
      }
      if (name === 'sqrt') {
        const a = group(text, i);
        i = a.next;
        out += emit('', `<msqrt><mrow>${parse(a.body)}</mrow></msqrt>`);
        continue;
      }
      if (name === 'left' || name === 'right') continue;
      if (name === 'mathbf' || name === 'mathit' || name === 'mathrm' || name === 'operatorname') {
        // MathML Core ignores mathvariant on <mstyle>; set it on each identifier instead.
        const a=group(text,i);i=a.next;let inner=parse(a.body);
        if(name==='mathrm'||name==='operatorname')inner=inner.replace(/<mi>/g,'<mi mathvariant="normal">');
        if(name==='mathbf')inner=inner.replace(/<mi>([A-Za-z])<\/mi>/g,(m,c)=>`<mi mathvariant="normal">${String.fromCodePoint((c<='Z'?0x1d400:0x1d41a)+c.toLowerCase().charCodeAt(0)-97)}</mi>`);
        out+=emit('',`<mrow>${inner}</mrow>`);
        continue;
      }
      if (name === ' ') {
        out += '<mspace width="0.25em"></mspace>';
        continue;
      }
      if (name === 'hat' || name === 'vec' || name === 'bar') {
        const a=group(text,i);i=a.next;
        out+=emit('',`<mover accent="true"><mrow>${parse(a.body)}</mrow><mo>${name==='hat'?'^':name==='vec'?'→':'¯'}</mo></mover>`);
        continue;
      }
      if (name === 'text') {
        const a = group(text, i);
        i = a.next;
        // MathML collapses edge spaces; keep intentional unit spacing in \text{ V}.
        out += emit('', `<mtext>${esc(a.body).replace(/ /g, '\u00a0')}</mtext>`);
        continue;
      }
      if (GREEK[name]) {
        out += emit('', `<mi>${GREEK[name]}</mi>`);
        continue;
      }
      if (OPS[name]) {
        out += emit('', `<mo>${OPS[name]}</mo>`);
        continue;
      }
      if (FUNCS.has(name)) {
        out += emit('', `<mi mathvariant="normal">${name}</mi>`) + (text.slice(i).trim() ? '<mspace width="0.17em"></mspace>' : '');
        continue;
      }
      out += `<mi>${esc(name)}</mi>`;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      const number = /^[0-9.]+/.exec(text.slice(i))[0];
      i += number.length;
      out += emit('', `<mn>${number}</mn>`);
      continue;
    }
    if (/[a-zA-Z]/.test(ch)) {
      i++;
      out += emit('', `<mi>${ch}</mi>`);
      continue;
    }
    const symbol = { '-': '−', '*': '⋅', "'": '′' }[ch] ?? ch;
    i++;
    out += emit('', `<mo>${esc(symbol)}</mo>`);
  }
  return out;
}

export function latexToMathML(source, display = false) {
  const body = `<mrow>${parse(String(source).trim())}</mrow>`;
  return `<math display="${display ? 'block' : 'inline'}" class="mathml">${body}</math>`;
}

// 页面里用 $…$ 写行内公式，$$…$$ 写独立公式；扫描一遍就地替换。
export function renderMath(root = document) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const targets = [];
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (!node.nodeValue.includes('$')) continue;
    if (node.parentElement?.closest('math,code,pre,svg,script,style,textarea,option')) continue;
    targets.push(node);
  }
  for (const node of targets) {
    const parts = node.nodeValue.split(/(\$\$[^$]+\$\$|\$[^$]+\$)/g);
    if (parts.length < 2) continue;
    const holder = document.createElement('span');
    for (const part of parts) {
      if (part.startsWith('$$') && part.endsWith('$$')) {
        holder.insertAdjacentHTML('beforeend', latexToMathML(part.slice(2, -2), true));
      } else if (part.startsWith('$') && part.endsWith('$') && part.length > 2) {
        holder.insertAdjacentHTML('beforeend', latexToMathML(part.slice(1, -1), false));
      } else {
        holder.appendChild(document.createTextNode(part));
      }
    }
    node.replaceWith(holder);
  }
}

// 内容变化后自动重跑：引导实验与真实数据的公式是运行时生成的。
export function autoRender(root = document.body) {
  const run = () => renderMath(root);
  run();
  let timer = null;
  new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(run, 80);
  }).observe(root, { childList: true, subtree: true });
}
