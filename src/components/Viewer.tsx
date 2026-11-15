import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import type { KnitDoc, Stitch } from '../knit';
import { KnitScene, type KnitState } from '../scene/KnitScene';
import type { ViewMode } from '../urlState';

export interface ViewerHandle { fit: () => void; focusPiece: (name: string) => void }

interface Props {
  doc: KnitDoc;
  mode: ViewMode;
  showSeams: boolean;
  knit: KnitState;
  onPick: (st: Stitch) => void;
}

/** Hosts the imperative three.js scene and forwards React state into it. */
export const Viewer = forwardRef<ViewerHandle, Props>(function Viewer({ doc, mode, showSeams, knit, onPick }, ref) {
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
