import { useEffect, useRef, useState, type ReactNode } from 'react';
import { IconMore } from './Icons';

export interface MenuItem { label: ReactNode; icon?: ReactNode; onClick: () => void; hint?: ReactNode }

/** The "⋯" button: where the technical and rarely used actions live. */
export function MoreMenu({ items, alert }: { items: MenuItem[]; alert?: boolean }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const off = (e: Event) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', off); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', off); document.removeEventListener('keydown', esc); };
  }, [open]);
  return (
    <div className="more" ref={root}>
      <button className="icon-btn" aria-label="More" title="More" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        <IconMore />
        {alert && <span className="dot-alert" title="The pattern has problems" />}
      </button>
      {open && (
        <div className="menu" role="menu">
          {items.map((it, i) => (
            <button key={i} role="menuitem" onClick={() => { setOpen(false); it.onClick(); }}>
              <span className="menu-ico">{it.icon}</span>
              <span className="menu-label">{it.label}</span>
              {it.hint && <span className="menu-hint">{it.hint}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
