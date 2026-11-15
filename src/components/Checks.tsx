import type { KnitDoc } from '../knit';

export function Checks({ doc, gotoLine }: { doc: KnitDoc; gotoLine: (n: number) => void }) {
  const counts = doc.checks.filter((c) => c.kind === 'count');
  const seams = doc.checks.filter((c) => c.kind === 'seam');
  const Ln = ({ n }: { n: number }) => <span className="ln">line {n}</span>;
  return (
    <div className="card" id="checks">
      {doc.errors.length ? (
        <>
          <h3>Problems</h3>
          <ul className="clist">
            {doc.errors.map((e, i) => (
              <li key={i} className={e.level === 'error' ? 'bad' : 'warn'} onClick={() => gotoLine(e.line)}>
                <b>{e.level === 'error' ? 'Error' : 'Warning'}</b> <Ln n={e.line} /> {e.msg}
              </li>
            ))}
          </ul>
        </>
      ) : <p className="good big">No problems found.</p>}

      <h3>Stitch counts</h3>
      <ul className="clist">
        {counts.length ? counts.map((c, i) => (
          <li key={i} className={c.ok ? 'good' : 'bad'} onClick={() => gotoLine(c.line)}>{c.ok ? '✓' : '✗'} <Ln n={c.line} /> {c.text}</li>
        )) : <li className="muted">Add <code>expect N</code> lines to check counts.</li>}
      </ul>

      <h3>Seams</h3>
      <ul className="clist">
        {seams.length ? seams.map((c, i) => (
          <li key={i} className={c.level === 'ok' ? 'good' : c.level === 'ease' ? 'warn' : 'bad'} onClick={() => gotoLine(c.line)}>
            {c.level === 'ok' ? '✓' : c.level === 'ease' ? '≈' : '✗'} <Ln n={c.line} /> {c.text}
          </li>
        )) : <li className="muted">No seams yet.</li>}
      </ul>

      <h3>Pieces</h3>
      <table className="ptable">
        <tbody>
          <tr><th>Piece</th><th>Rows</th><th>Stitches worked</th><th>Size</th></tr>
          {doc.built.order.filter((p) => p.nrows).map((p) => (
            <tr key={p.name}>
              <td>{p.name}{p.round && <span className="muted"> (round)</span>}</td>
              <td>{p.nrows - 1}</td>
              <td>{p.total.toLocaleString()}</td>
              <td>{p.widthIn.toFixed(1)}″ × {p.heightIn.toFixed(1)}″</td>
            </tr>
          ))}
        </tbody>
      </table>

      {doc.params.length > 0 && (
        <>
          <h3>Parameters</h3>
          <ul className="clist">
            {doc.params.map((p) => (
              <li key={p.name} onClick={() => gotoLine(p.line)}>
                <Ln n={p.line} /> <code>{p.name}</code> = <b>{String(p.value)}</b>
                {p.value !== p.default && <span className="muted"> (default {String(p.default)})</span>}
                {!p.used && <span className="warn"> — not used in the pattern (info only)</span>}
              </li>
            ))}
          </ul>
          <details>
            <summary>Pattern with current parameters filled in</summary>
            <pre className="ref">{doc.expanded.replace(/^\s*\n/gm, '')}</pre>
          </details>
        </>
      )}
    </div>
  );
}
