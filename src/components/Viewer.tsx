import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import type { KnitDoc, Stitch } from '../knit';
import { KnitScene, type KnitState } from '../scene/KnitScene';
import type { ViewMode } from '../urlState';
import { STACKED_QUERY } from '../layout';

export interface ViewerHandle { fit: () => void; focusPiece: (name: string) => void }

interface Props {
  doc: KnitDoc;
  mode: ViewMode;
  showSeams: boolean;
  knit: KnitState;
  onPick: (st: Stitch) => void;
  /** the project cards are showing on the left */
  panelOpen: boolean;
  /** the player is shrunk to a small pill */
  dockMini: boolean;
}

/** Hosts the imperative three.js scene and forwards React state into it. */
export const Viewer = forwardRef<ViewerHandle, Props>(function Viewer({ doc, mode, showSeams, knit, onPick, panelOpen, dockMini }, ref) {
  const host = useRef<HTMLDivElement>(null);
  const status = useRef<HTMLDivElement>(null);
  const scene = useRef<KnitScene | null>(null);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  useEffect(() => {
    const s = new KnitScene(host.current!, status.current!, { onPick: (st) => onPickRef.current(st) });
    s.mode = mode; // initial mode from the URL, no transition
    scene.current = s;
    return () => { s.dispose(); scene.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // the view fills the window; keep the knit clear of the header, cards and dock floating over it
  useEffect(() => {
    const s = scene.current; if (!s) return;
    const mq = window.matchMedia(STACKED_QUERY);
    const insets = () => {
      const landscape = mq.matches && window.innerHeight < window.innerWidth;
      if (!mq.matches) s.setInsets({ l: panelOpen ? 330 : 0, r: 0, t: 80, b: dockMini ? 90 : 130 });
      else if (landscape) s.setInsets({ l: 0, r: 0, t: 56, b: dockMini ? 70 : 110 });
      else s.setInsets({ l: 0, r: 0, t: 120, b: dockMini ? 90 : 130 });
    };
    insets(); mq.addEventListener('change', insets); window.addEventListener('resize', insets);
    return () => { mq.removeEventListener('change', insets); window.removeEventListener('resize', insets); };
  }, [panelOpen, dockMini]);

  // order matters: knit state first so the rebuilt textures include it
  useEffect(() => { scene.current?.setKnitState(knit); }, [knit]);
  useEffect(() => { scene.current?.setDoc(doc); }, [doc]);
  useEffect(() => { scene.current?.setMode(mode); }, [mode]);
  useEffect(() => { scene.current?.setShowSeams(showSeams); }, [showSeams]);

  useImperativeHandle(ref, () => ({
    fit: () => scene.current?.fit(),
    focusPiece: (name) => scene.current?.focusPiece(name),
  }));

  return <div id="view3d" ref={host}><div id="simStatus" ref={status} /></div>;
});
