import {waitForChapter} from '../chapter-ready.js';
// Chapter UI and the shared, original 3D bench have independent lifecycles.
export function createChapter3Host({ scene, getState, save, book, back, menu, finish, measurements }) {
  const frame = document.createElement('iframe');
  frame.id = 'chapter3-frame';
  frame.title = '第三章 · 正式磁截止实验';
  frame.dataset.src = './chapter3/studio.html';
  frame.hidden = true;
  frame.style.cssText =
    'position:fixed;inset:0;width:100%;height:100%;border:0;z-index:20;background:#07121d';
  document.body.append(frame);
  let generation = 0;
  return {
    frame,
    async open() {
      const token = ++generation;
      await waitForChapter(frame);
      if (token !== generation) return;
      frame.hidden = false;
      const live = () => token === generation && !frame.hidden && getState().chapter === 3;
      const state = getState();
      const bridge = {
        update: (p) => {
          if (!live()) return;
          scene().setPower({
            heater: true,
            accelerator: true,
            magnet: true,
            current: p.imAct_A,
            coilVoltage: p.v1_V,
            reading: p.a1_uA,
            acceleratingVoltage: p.uaAct_V,
            filamentVoltage: p.uf_V,
            filamentCurrent: p.if_A,
            fieldMT: p.bPhys_mT,
            trajectoryVoltage: p.trajectoryVoltage,
            actualPoint: true,
          });
          return scene().debug().orbit;
        },
        save: (chapter3, result) => {
          if (!live()) return;
          getState().chapter3 = chapter3;
          getState().stage = chapter3.stage;
          getState().chapter3Result = result;
          save();
        },
        view: (view) => {
          if (!live()) return Promise.resolve({interrupted:true});
          getState().view = view;
          return scene().setMode(view);
        },
        focus: (id) => { if (live()) scene().select(id); },
        highlight: (id) => { if (live()) scene().select(id, { focus: false }); },
        orbit: () => { if (live()) scene().focusOrbit(); },
        reset: () => { if (live()) scene().reset(); },
        book,
        back,
        menu,
        finish,
      };
      const viewport = frame.contentWindow.initialize(
        bridge,
        state.chapter3,
        measurements(),
        state.calibrationResult ?? state.calibrationHandoff,
        state.guess,
      );
      scene().attachViewport(viewport);
      scene().setLit(['L1', 'L2', 'L3', 'L4', 'L5']);
      await scene().setMode(state.chapter3?.viewMode ?? 'bench', { instant: true });
    },
    close() {
      if (frame.hidden) { generation++; return; }
      frame.contentWindow.suspend?.();
      generation++;
      frame.hidden = true;
      scene().attachViewport(document.querySelector('#scene'));
    },
    pick: (tag) => frame.contentWindow.scenePick?.(tag),
    hover: (text, id) => frame.contentWindow.sceneHover?.(text, id),
    guess: (value) => frame.contentWindow.updateGuess?.(value),
    dockBook: () => frame.contentDocument?.querySelector('#dock-book'),
    getState: () => frame.contentWindow.getState?.(),
    debug: () => frame.contentWindow.getDebug?.(),
  };
}
