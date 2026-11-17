import { useMemo } from 'react';
import type { KnitDoc } from '../knit';
import { toProse, type ProseStep } from '../knit/prose';

interface Props {
  doc: KnitDoc;
  /** the source the doc was built from */
  code: string;
  panelOpen: boolean;
  onShowRow: (piece: string, row: number) => void;
  onGotoLine: (line: number) => void;
}

/** The pattern as a printed pattern reads: materials, each piece row by row, finishing. */
export function WrittenPattern({ doc, code, panelOpen, onShowRow, onGotoLine }: Props) {
  const prose = useMemo(() => toProse(doc, code), [doc, code]);
  const errs = doc.errors.filter((e) => e.level === 'error');

  const step = (s: ProseStep, piece: string | null, i: number) => (
    <li key={i} className={'wp-step wp-' + s.kind}>
      {s.kind === 'note'
        ? <p className="wp-note">{s.text}</p>
        : (
          <>
            <div className="wp-line">
              <p>
                {s.label && <strong className="wp-label">{s.label}: </strong>}
                {s.text}
                {s.note && <span className="wp-author"> — {s.note}</span>}
              </p>
              {s.count && <span className="wp-count">{s.count}</span>}
              <span className="wp-tools">
                {piece && s.row !== undefined && (
                  <button className="wp-tool" title="Show this in the simulation" aria-label="Show in simulation" onClick={() => onShowRow(piece, s.row!)}>
                    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12s-3.5 6.5-9.5 6.5S2.5 12 2.5 12z" fill="none" stroke="currentColor" strokeWidth="1.8" /><circle cx="12" cy="12" r="2.6" fill="none" stroke="currentColor" strokeWidth="1.8" /></svg>
                  </button>
                )}
                {s.line > 0 && (
                  <button className="wp-tool mono" title={`Line ${s.line} of the source`} aria-label={`Source line ${s.line}`} onClick={() => onGotoLine(s.line)}>{s.line}</button>
                )}
              </span>
            </div>
            {s.steps && <ol className="wp-steps wp-sub">{s.steps.map((c, j) => step(c, piece, j))}</ol>}
          </>
        )}
    </li>
  );

  return (
    <div className={'written' + (panelOpen ? ' with-panel' : '')}>
      <article className="wp">
        <header className="wp-head">
          <p className="wp-kicker">Written pattern</p>
          <h1>{prose.title || 'Untitled pattern'}</h1>
          {prose.source && <p className="wp-src">Adapted from <a href={prose.source} target="_blank" rel="noopener">{prose.source.replace(/^https?:\/\/(www\.)?/, '').replace(/\/.*$/, '')}</a></p>}
          {prose.intro.length > 0 && <p className="wp-intro">{prose.intro.join(' ')}</p>}
          <button className="soft-btn wp-print" onClick={() => window.print()}>Print</button>
        </header>

        {errs.length > 0 && (
          <p className="wp-warn">The pattern source has {errs.length} error{errs.length > 1 ? 's' : ''}, so parts of these instructions may be missing.{' '}
            <button className="linkish" onClick={() => onGotoLine(errs[0].line)}>Show the first one</button></p>
        )}

        <section>
          <h2>Materials</h2>
          <dl className="wp-materials">
            {prose.materials.map((m) => (
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

        {prose.sections.map((sec) => (
          <section key={sec.piece}>
            <h2>{sec.title}</h2>
            <p className="wp-size">Finished piece: {sec.size}{sec.round ? ' · worked in the round' : ''}</p>
            {sec.like
              ? <p>Work as for the {sec.like}.</p>
              : <ol className="wp-steps">{sec.steps.map((s, i) => step(s, sec.piece, i))}</ol>}
          </section>
        ))}

        <section>
          <h2>Finishing</h2>
          <ol className="wp-steps">{prose.finishing.map((s, i) => step(s, null, i))}</ol>
        </section>
      </article>
    </div>
  );
}
