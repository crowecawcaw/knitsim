import { useState, type ReactNode } from 'react';
import { loadPref, savePref } from '../prefs';

interface Props { id: string; icon: string; title: string; children: ReactNode }

/** A floating card whose body folds away under its title; the choice is remembered. */
export function Card({ id, icon, title, children }: Props) {
  const key = 'card.' + id;
  const [open, setOpen] = useState(() => loadPref(key) !== 'closed');
  const toggle = () => { setOpen(!open); savePref(key, open ? 'closed' : 'open'); };
  return (
    <section className={'card' + (open ? '' : ' folded')}>
      <h2>
        <button className="card-toggle" aria-expanded={open} onClick={toggle}>
          <span className="h-ico">{icon}</span> {title}
          <svg className="chev" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      </h2>
      {open && children}
    </section>
  );
}
