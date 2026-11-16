import { useEffect, useMemo, useRef } from 'react';
import type { Piece } from '../knit';

interface Step { first: number; last: number; side: string; what: string; sts: string; firstOrd: number; endOrd: number }

/** Consecutive rows written by the same pattern line read as one instruction: "Rows 10–63 · rev st until 18in". */
export function groupSteps(P: Piece): Step[] {
  const steps: Step[] = [];
  P.rows.forEach((r, i) => {
    const m = /^Row \d+ \((RS|WS)\): (.*?)(?: → (.*))?$/.exec(r.desc);
    const what = m ? m[2] : r.desc.replace(/ → .*$/, '');
    const sts = m?.[3] ?? (/ → (.*)$/.exec(r.desc)?.[1] ?? '');
    const prev = steps[steps.length - 1];
    const endOrd = r.firstOrd + r.order.length;
    if (prev && i > 0 && P.rows[i - 1].line === r.line && prev.what === what && r.dir !== 'CO') {
      prev.last = i; prev.endOrd = endOrd; prev.sts = sts; prev.side = '';
    } else steps.push({ first: i, last: i, side: r.dir === 'CO' ? '' : r.dir, what, sts, firstOrd: r.firstOrd, endOrd });
  });
  return steps;
}

const FABRIC: Record<string, string> = { st: 'stockinette', rev_st: 'reverse stockinette', garter: 'garter', seed: 'seed', moss: 'moss' };
/** "rib2x2 — until 2.5in" → "2×2 rib, until 2.5in": the engine's shorthand in knitters' words */
function plain(what: string) {
  return what
    .replace(/^(\w+)/, (f) => FABRIC[f] ?? f.replace(/^rib(\d)x(\d)$/, '$1×$2 rib'))
    .replace(/ —\s+/, ', ').replace(/_/g, ' ');
}

interface Props { piece: Piece | null; progress: number; setProgress: (p: number) => void }

/** The pattern written out for knitters: one line per instruction, the current one highlighted. */
export function Steps({ piece: P, progress, setProgress }: Props) {
  const steps = useMemo(() => (P ? groupSteps(P) : []), [P]);
  const list = useRef<HTMLOListElement>(null);
  const cur = P && progress < P.total ? steps.findIndex((s) => progress < s.endOrd) : -1;
  useEffect(() => {
    const el = list.current?.querySelector<HTMLElement>('.cur'); const box = list.current?.closest<HTMLElement>('.scroll-y');
    if (el && box) box.scrollTo({ top: el.offsetTop - box.clientHeight / 3, behavior: 'smooth' });
  }, [cur]);
  if (!P) return <p className="muted">Nothing to knit yet.</p>;
  const R = P.round ? 'Rnd' : 'Row';
  const label = (s: Step) => s.first === 0 && !s.side ? 'Cast on'
    : s.first === s.last ? `${R} ${s.first}` : `${R}s ${s.first}–${s.last}`;
  return (
    <ol className="steps" ref={list}>
      {steps.map((s, i) => {
        const done = progress >= s.endOrd;
        return (
          <li key={i} className={i === cur ? 'cur' : done ? 'done' : ''}>
            <button onClick={() => setProgress(i === cur ? s.endOrd : s.firstOrd)}>
              <span className="st-label">{label(s)}{s.side && <span className="st-side"> {s.side}</span>}</span>
              <span className="st-what">{label(s) === 'Cast on' ? s.what.replace(/^Cast on /, '') : plain(s.what)}</span>
              {s.sts && <span className="st-count">{s.sts}</span>}
            </button>
          </li>
        );
      })}
    </ol>
  );
}
