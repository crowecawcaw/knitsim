import { useState, type ReactNode } from 'react';
import type { Ui } from '../urlState';
import { IconCheck, IconShare } from './Icons';

export interface BarProps {
  name: string;
  /** false for a shared link that hasn't been saved yet */
  saved: boolean;
  saveState: 'idle' | 'saving' | 'saved' | 'error';
  ui: Ui;
  onUi: (ui: Ui) => void;
  /** rename (designer only) */
  onRename?: (name: string) => void;
  onBack: () => void;
  onSaveCopy: () => void;
  /** the link a share should send */
  link: () => string;
  children?: ReactNode;
}

/** The header both interfaces share: back to projects, the project's name, knit/design, share. */
export function ProjectBar({ name, saved, saveState, ui, onUi, onRename, onBack, onSaveCopy, link, children }: BarProps) {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    const url = link();
    if (navigator.share && matchMedia('(pointer: coarse)').matches) {
      try { await navigator.share({ title: name, url }); } catch { /* cancelled */ }
      return;
    }
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* blocked */ }
  };
  const status = !saved ? 'Shared with you · not saved'
    : saveState === 'saving' ? 'Saving…'
    : saveState === 'error' ? 'Couldn’t save'
    : 'Saved';
  return (
    <header className="bar">
      <button className="icon-btn" title="All projects" aria-label="All projects" onClick={onBack}>
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      <div className="bar-title">
        {onRename && saved
          ? <input className="title-input" aria-label="Project name" value={name} onChange={(e) => onRename(e.target.value)} />
          : <h1>{name}</h1>}
        <p className={saveState === 'error' ? 'bad' : ''}>{status}</p>
      </div>
      <div className="seg" role="tablist" aria-label="Interface">
        <button role="tab" aria-selected={ui === 'knit'} className={ui === 'knit' ? 'on' : ''} onClick={() => onUi('knit')}>Knit</button>
        <button role="tab" aria-selected={ui === 'design'} className={ui === 'design' ? 'on' : ''} onClick={() => onUi('design')}>Design</button>
      </div>
      {children}
      <div className="bar-actions">
        {!saved && <button className="soft-btn save-btn" onClick={onSaveCopy}>Save</button>}
        <button className="icon-btn" title={copied ? 'Link copied' : 'Share a link'} aria-label="Share" onClick={share}>
          {copied ? <IconCheck /> : <IconShare />}
        </button>
      </div>
    </header>
  );
}
