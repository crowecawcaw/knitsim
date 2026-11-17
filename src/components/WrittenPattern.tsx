import type { ReactNode } from 'react';
import { spellOut, type Prose, type ProseStep } from '../knit/prose';

/** A step the knitter can select: it has a place in a piece to preview. */
export interface Stop { id: string; piece: string; row: number; label: string; text: string; round: boolean }

/** Every selectable step, in pattern order (ids match the ones WrittenPattern renders). */
export function stopsOf(prose: Prose): Stop[] {
  const out: Stop[] = [];
  const walk = (steps: ProseStep[], piece: string, round: boolean, path: string) => steps.forEach((s, i) => {
    const id = `${path}.${i}`;
    if (s.row !== undefined) out.push({ id, piece, row: s.row, label: s.label ?? (/^Pick up/.test(s.text) ? 'Pick up' : 'Cast on'), text: s.text, round });
    if (s.steps) walk(s.steps, piece, round, id);
  });
  prose.sections.forEach((sec, i) => walk(sec.steps, sec.piece, sec.round, String(i)));
  return out;
}

interface Props {
  prose: Prose;
  errors: number;
  /** the knitter's own settings (size, yarn), shown with the materials */
  settings: ReactNode;
  selected: string | null;
  /** the step at the reading line, while scrolling */
  here: string | null;
  onSelect: (id: string) => void;
}

/** The pattern as a printed pattern reads, where each step can be tapped to see it and read it in plain words. */
export function WrittenPattern({ prose, errors, settings, selected, here, onSelect }: Props) {
  // `piece` is given for the top-level steps of a piece: those are the units scrolling knits through
  const step = (s: ProseStep, path: string, round: boolean, piece?: string) => {
    const id = path;
    const on = selected === id;
    const pick = s.row !== undefined;
    const unit = piece && pick ? { 'data-piece': piece, 'data-from': s.from ?? s.row, 'data-to': s.row } : {};
    const words = on ? spellOut(s.text, round) : null;
    return (
      <li key={id} data-step={id} {...unit} className={'wp-step wp-' + s.kind + (on ? ' on' : '') + (pick ? ' pick' : '') + (here === id ? ' here' : '')}>
        {s.kind === 'note'
          ? <p className="wp-note">{s.text}</p>
          : (
            <>
              <div
                className="wp-line"
                {...(pick ? { role: 'button', tabIndex: 0, 'aria-pressed': on, onClick: () => onSelect(id), onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(id); } } } : {})}
              >
                <p>
                  {s.label && <strong className="wp-label">{s.label}: </strong>}
                  {s.text}
                  {s.note && <span className="wp-author"> — {s.note}</span>}
                </p>
                {s.count && <span className="wp-count">{s.count}</span>}
              </div>
              {words && <p className="wp-words"><span>In plain words</span>{words}</p>}
              {s.steps && <ol className="wp-steps wp-sub">{s.steps.map((c, j) => step(c, `${id}.${j}`, round))}</ol>}
            </>
          )}
      </li>
    );
  };

  return (
    <article className="wp">
      <header className="wp-head">
        <h1>{prose.title || 'Untitled pattern'}</h1>
        {prose.source && <p className="wp-src">Adapted from <a href={prose.source} target="_blank" rel="noopener">{prose.source.replace(/^https?:\/\/(www\.)?/, '').replace(/\/.*$/, '')}</a></p>}
        {prose.intro.length > 0 && <p className="wp-intro">{prose.intro.join(' ')}</p>}
      </header>

      {errors > 0 && <p className="wp-warn">This pattern has {errors} error{errors > 1 ? 's' : ''} in its source, so parts of these instructions may be missing.</p>}

      <section className="wp-yours">
        <h2>Your version</h2>
        {settings}
      </section>

      <section>
        <h2>Materials</h2>
        <dl className="wp-materials">
          {prose.materials.filter((m) => m.label !== 'Size').map((m) => (
            <div key={m.label}>
              <dt>{m.label}</dt>
              <dd>{m.color && <span className="wp-swatch" style={{ background: m.color }} />}{m.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {prose.abbreviations.length > 0 && (
        <section>
          <h2>Abbreviations</h2>
          <dl className="wp-abbr">
            {prose.abbreviations.map(([a, m]) => <div key={a}><dt>{a}</dt><dd>{m}</dd></div>)}
          </dl>
        </section>
      )}

      <p className="wp-hint">As you scroll, the preview knits along with the pattern. Tap a step to read it in plain words.</p>

      {prose.sections.map((sec, i) => (
        <section key={sec.piece}>
          <h2>{sec.title}</h2>
          <p className="wp-size">Finished piece: {sec.size}{sec.round ? ' · worked in the round' : ''}</p>
          {sec.like
            ? <p>Work as for the {sec.like}.</p>
            : <ol className="wp-steps">{sec.steps.map((s, j) => step(s, `${i}.${j}`, sec.round, sec.piece))}</ol>}
        </section>
      ))}

      <section>
        <h2>Finishing</h2>
        <ol className="wp-steps">{prose.finishing.map((s, j) => step(s, `f.${j}`, false))}</ol>
      </section>
    </article>
  );
}
