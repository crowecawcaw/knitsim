import type { Param } from '../knit';

interface Props {
  params: Param[];
  onSet: (name: string, v: string | number) => void;
  onReset: (name: string) => void;
}

export function Params({ params, onSet, onReset }: Props) {
  return (
    <div id="params" className="params">
      {params.map((p) => {
        const changed = p.value !== p.default;
        return (
          <div className="param" key={p.name} title={p.used ? undefined : 'Not used in the pattern — information only'}>
            <div>
              <span className={'pl' + (changed ? ' changed' : '')}>{p.label}</span>{' '}
              {changed && <span className="reset" onClick={() => onReset(p.name)}>reset</span>}
            </div>
            <div className="pv"><Control p={p} onSet={(v) => onSet(p.name, v)} /></div>
          </div>
        );
      })}
    </div>
  );
}

function Control({ p, onSet }: { p: Param; onSet: (v: string | number) => void }) {
  if (p.type === 'enum') {
    const opts = p.options || [];
    if (opts.length <= 6 && opts.join('').length < 40)
      return <>{opts.map((o) => <button key={o} className={'opt' + (o === p.value ? ' on' : '')} onClick={() => onSet(o)}>{o}</button>)}</>;
    return <select value={String(p.value)} onChange={(e) => onSet(e.target.value)}>{opts.map((o) => <option key={o}>{o}</option>)}</select>;
  }
  if (p.type === 'color') return <input type="color" value={String(p.value)} onChange={(e) => onSet(e.target.value)} />;
  const ranged = p.min !== undefined && p.max !== undefined;
  const step = p.type === 'int' ? 1 : ranged ? Math.max(0.01, +((p.max! - p.min!) / 100).toPrecision(1)) : 0.1;
  return (
    <>
      {ranged && <input type="range" min={p.min} max={p.max} step={step} value={Number(p.value)} onChange={(e) => onSet(+e.target.value)} />}
      <NumberInput value={Number(p.value)} step={step} min={p.min} max={p.max} onCommit={onSet} />
    </>
  );
}

/** Number box that only commits on change/blur, so typing "1" on the way to "12" doesn't re-run the pattern. */
function NumberInput({ value, step, min, max, onCommit }: { value: number; step: number; min?: number; max?: number; onCommit: (v: number) => void }) {
  return (
    <input
      key={value}
      type="number"
      step={step}
      min={min}
      max={max}
      defaultValue={value}
      onBlur={(e) => { if (+e.target.value !== value) onCommit(+e.target.value); }}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
    />
  );
}
