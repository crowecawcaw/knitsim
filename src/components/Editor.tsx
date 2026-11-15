import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import type { Problem } from '../knit';

export interface EditorHandle { gotoLine: (n: number) => void }

interface Props {
  value: string;
  onChange: (v: string) => void;
  problems: Problem[];
  activeLine: number;
}

export const Editor = forwardRef<EditorHandle, Props>(function Editor({ value, onChange, problems, activeLine }, ref) {
  const ta = useRef<HTMLTextAreaElement>(null);
  const gutter = useRef<HTMLDivElement>(null);
  const [, force] = useState(0);

  useImperativeHandle(ref, () => ({
    gotoLine(n: number) {
      const el = ta.current; if (!el) return;
      const lines = el.value.split('\n'); let p = 0;
      for (let i = 0; i < n - 1 && i < lines.length; i++) p += lines[i].length + 1;
      el.focus(); el.setSelectionRange(p, p + (lines[n - 1] || '').length);
      const lh = parseFloat(getComputedStyle(el).lineHeight) || 18;
      el.scrollTop = Math.max(0, (n - 4) * lh);
      force((x) => x + 1);
    },
  }));

  const errLines = new Set(problems.filter((e) => e.level === 'error').map((e) => e.line));
  const warnLines = new Set(problems.filter((e) => e.level !== 'error').map((e) => e.line));
  const n = value.split('\n').length;

  return (
    <div className="editor">
      <div id="gutter" ref={gutter}>
        {Array.from({ length: n }, (_, k) => {
          const i = k + 1;
          const cls = (errLines.has(i) ? 'gl-err' : warnLines.has(i) ? 'gl-warn' : '') + (activeLine === i ? ' gl-active' : '');
          return <div key={i} className={cls.trim() || undefined}>{i}</div>;
        })}
      </div>
      <textarea
        id="src"
        ref={ta}
        spellCheck={false}
        autoCapitalize="off"
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onScroll={(e) => { if (gutter.current) gutter.current.scrollTop = e.currentTarget.scrollTop; }}
        onKeyDown={(e) => {
          if (e.key !== 'Tab') return;
          e.preventDefault();
          const el = e.currentTarget; const s = el.selectionStart;
          el.setRangeText('  ', s, el.selectionEnd, 'end');
          onChange(el.value);
        }}
      />
    </div>
  );
});
