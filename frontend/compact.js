const compact = matchMedia('(max-width:700px), (pointer:coarse) and (max-width:1100px), (max-width:960px) and (max-height:540px)');
const surface = document.documentElement.dataset.surface;
if (surface === 'book') {
  const stack = document.querySelector('.paper-stack');
  const spreads = stack.querySelectorAll('.spread');
  const changePage = new MutationObserver(() => { if (compact.matches) stack.scrollTop = 0; });
  for (const spread of spreads) changePage.observe(spread, {attributes:true, attributeFilter:['class']});
}
if (surface === 'research') {
  const nav = document.createElement('nav');
  nav.id = 'compact-views';
  nav.setAttribute('aria-label','自由探索视图');
  const panes = [['curve','电流曲线'],['electron','落点与轨迹'],['scene','三维管内'],['parameters','实验参数']];
  function select(pane) {
    document.body.dataset.pane = pane;
    for (const button of nav.children) button.setAttribute('aria-pressed',String(button.dataset.pane === pane));
    document.body.scrollTop = 0;
  }
  for (const [pane,title] of panes) {
    const button = document.createElement('button');
    button.textContent = title;
    button.dataset.pane = pane;
    button.addEventListener('click',() => select(pane));
    nav.append(button);
  }
  document.querySelector('#top').after(nav);
  select('curve');
  document.addEventListener('click', event => {
    if (!compact.matches || document.body.dataset.kind !== 'sandbox') return;
    const button = event.target.closest('button');
    if (!button || button.disabled) return;
    if (['view-bench','view-tube'].includes(button.id)) select('scene');
    if (button.dataset.free === 'show-map') select('electron');
    if (button.dataset.free === 'show-electron') select('scene');
    if (button.dataset.free === 'record') select('parameters');
    if (['scan','point'].includes(button.dataset.free)) select('curve');
  });
}
if (['calibration','cutoff','research'].includes(surface)) {
  const targets = {'dock-circuit':'left-drawer','dock-inst':'left-drawer','dock-rec':'right-drawer','dock-left':'left-drawer','dock-right':'right-drawer','dock-analysis':'analysis'};
  document.querySelector('#dock')?.addEventListener('click', e => {
    if (!compact.matches) return;
    const panel = document.getElementById(targets[e.target.closest('button')?.id]);
    if (panel) requestAnimationFrame(() => (panel.clientHeight ? panel : document.querySelector('#stage,#scene'))?.scrollIntoView({block:'start'}));
  });
}

