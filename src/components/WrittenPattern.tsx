import type { ReactNode } from 'react';
import type { Prose, ProseStep } from '../knit/prose';

/** A step with a place in a piece to preview. */
export interface Stop { id: string; piece: string; row: number; label: string; text: string }

/** Steps for the enlarged preview's arrows, in pattern order. */
export function stopsOf(prose: Prose): Stop[] {
  const out: Stop[] = [];
  const walk = (steps: ProseStep[], piece: string, path: string) => steps.forEach((s, i) => {
    const id = `${path}.${i}`;
    if (s.row !== undefined) out.push({ id, piece, row: s.row, label: s.label ?? (/^Pick up/.test(s.text) ? 'Pick up' : 'Cast on'), text: s.text });
    if (s.steps) walk(s.steps, piece, id);
  });
  prose.sections.forEach((sec, i) => walk(sec.steps, sec.piece, String(i)));
  return out;
}

interface Props {
  prose: Prose;
  errors: number;
  /** the knitter's own settings (size, yarn), shown with the materials */
  settings: ReactNode;
  version: ReactNode;
  /** the step at the reading line, while scrolling */
  here: string | null;
}

export function PatternHeading({ prose }: { prose: Prose }) {
  return (
      <header className="wp-head">
        <h1>{prose.title || 'Untitled pattern'}</h1>
        {prose.source && <p className="wp-src">Adapted from <a href={prose.source} target="_blank" rel="noopener">{prose.source.replace(/^https?:\/\/(www\.)?/, '').replace(/\/.*$/, '')}</a></p>}
        {prose.intro.length > 0 && <p className="wp-intro">{prose.intro.join(' ')}</p>}
      </header>
  );
}

/** Written instructions with a marker at the current reading position. */
export function WrittenPattern({ prose, errors, settings, version, here }: Props) {
  // `piece` is given for the top-level steps of a piece: those are the units scrolling knits through
  const step = (s: ProseStep, id: string, piece?: string) => {
    const unit = piece && s.row !== undefined ? { 'data-piece': piece, 'data-from': s.from ?? s.row, 'data-to': s.row } : {};
    const finishing = id.startsWith('f.');
    const Note = finishing ? 'h3' : 'p';
    return (
      <li key={id} data-step={id} data-source-line={finishing && s.kind !== 'note' ? s.line : undefined}
        {...unit} aria-current={here === id ? 'step' : undefined}>
        {s.kind === 'note'
          ? <Note className="wp-note">{s.text}</Note>
          : (
            <>
              <div className="wp-line">
                <p>
                  {s.label && <strong className="wp-label">{s.label}: </strong>}
                  {s.text}
                  {s.note && <span className="wp-author"> — {s.note}</span>}
                </p>
                {s.count && <span className="wp-count">{s.count}</span>}
              </div>
              {s.steps && <ol className="wp-steps wp-sub">{s.steps.map((c, j) => step(c, `${id}.${j}`))}</ol>}
            </>
          )}
      </li>
    );
  };

  return (
    <article className="wp">
      {errors > 0 && <p className="wp-warn">This pattern has {errors} error{errors > 1 ? 's' : ''} in its source, so parts of these instructions may be missing.</p>}

      <section>
        <h2>Materials</h2>
        {settings && <details className="wp-yours">
          <summary><strong>Your version</strong>{version}</summary>
          {settings}
        </details>}
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

      <p className="wp-hint">Scroll through the instructions to advance the preview.</p>

      {prose.sections.map((sec, i) => (
        <section key={sec.piece} data-pattern-piece={sec.piece}>
          <h2>{sec.title}</h2>
          <p className="wp-size">Finished piece: {sec.size}{sec.round ? ' · worked in the round' : ''}</p>
          {sec.like
            ? <p>Work as for the {sec.like}.</p>
            : <ol className="wp-steps">{sec.steps.map((s, j) => step(s, `${i}.${j}`, sec.piece))}</ol>}
        </section>
      ))}

      <section data-finishing>
        <h2>Finishing</h2>
        <ol className="wp-steps">{prose.finishing.map((s, j) => step(s, `f.${j}`))}</ol>
      </section>
    </article>
  );
}
