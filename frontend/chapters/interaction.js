// Keep a native range's DOM ancestry intact throughout a pointer gesture.
// Asynchronous results may update its siblings, but must not remove the thumb
// that currently owns the mouse. This also covers a pause halfway through a drag.
import {renderMath} from '../mathlite.js';
let dragging = null;
const pending = new Map();
document.addEventListener('pointerdown', e => {
  if (e.target.matches('input[type="range"]')) dragging = e.target;
}, true);
function release() {
  dragging = null;
  const updates = [...pending]; pending.clear();
  for (const [container, html] of updates) if (container.isConnected) { renderPanel(container, html); renderMath(container); }
}
document.addEventListener('pointerup', () => queueMicrotask(release), true);
document.addEventListener('pointercancel', release, true);
window.addEventListener('blur', release);

export function renderPanel(container, html) {
  pending.delete(container);
  if (!dragging || !container.contains(dragging)) {
    container.innerHTML = html;
    return;
  }
  const template = document.createElement('template'); template.innerHTML = html;
  const selector = dragging.id ? `#${dragging.id}` : `input[data-param="${dragging.dataset.param}"]`;
  const replacement = template.content.querySelector(selector);
  // A genuine stage change is applied once the gesture ends.
  if (!replacement) { pending.set(container, html); return; }
  const oldPath = [dragging], newPath = [replacement];
  while (oldPath.at(-1).parentNode !== container) oldPath.push(oldPath.at(-1).parentNode);
  while (newPath.at(-1).parentNode !== template.content) newPath.push(newPath.at(-1).parentNode);
  if (oldPath.length !== newPath.length) { pending.set(container, html); return; }
  // Replace siblings only; even a detach/reinsert of the input cancels native drag.
  for (let level = oldPath.length - 1; level >= 0; level--) {
    const keep = oldPath[level], fresh = newPath[level], parent = keep.parentNode;
    for (const sibling of [...parent.childNodes]) if (sibling !== keep) sibling.remove();
    for (const sibling of [...fresh.parentNode.childNodes]) {
      if (sibling === fresh) break;
      parent.insertBefore(sibling.cloneNode(true), keep);
    }
    let after = fresh.nextSibling;
    while (after) { parent.append(after.cloneNode(true)); after = after.nextSibling; }
  }
}

export {fieldGrid} from './scan-grid.js';
