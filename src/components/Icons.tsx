// Small line icons, drawn on a 24px grid, so every control renders the same on every platform (no emoji glyphs).
const I = ({ d, size = 20, w = 1.8 }: { d: string; size?: number; w?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
    <path d={d} fill="none" stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
export const IconPlay = ({ size = 22 }) => <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" fill="currentColor" /></svg>;
export const IconPause = ({ size = 22 }) => <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true"><rect x="6" y="5" width="4" height="14" fill="currentColor" /><rect x="14" y="5" width="4" height="14" fill="currentColor" /></svg>;
export const IconPrev = () => <I d="M15 6l-6 6 6 6" w={2} />;
export const IconNext = () => <I d="M9 6l6 6-6 6" w={2} />;
export const IconRowPrev = () => <I d="M17 6l-6 6 6 6M7 6v12" w={2} />;
export const IconRowNext = () => <I d="M7 6l6 6-6 6M17 6v12" w={2} />;
export const IconDown = ({ size = 18 }) => <I d="M6 9l6 6 6-6" size={size} w={2} />;
export const IconUp = ({ size = 18 }) => <I d="M6 15l6-6 6 6" size={size} w={2} />;
export const IconClose = ({ size = 18 }) => <I d="M6 6l12 12M18 6L6 18" size={size} w={2} />;
export const IconShare = () => <I d="M12 15V4M8 8l4-4 4 4M5 13v6h14v-6" />;
export const IconCheck = () => <I d="M5 12.5l4.5 4.5L19 7.5" w={2} />;
export const IconFit = () => <I d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />;
export const IconSliders = ({ size = 20 }) => <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h4M12 17h8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /><circle cx="16" cy="7" r="2" fill="none" stroke="currentColor" strokeWidth="1.8" /><circle cx="10" cy="17" r="2" fill="none" stroke="currentColor" strokeWidth="1.8" /></svg>;
export const IconMore = () => <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><circle cx="5" cy="12" r="1.8" fill="currentColor" /><circle cx="12" cy="12" r="1.8" fill="currentColor" /><circle cx="19" cy="12" r="1.8" fill="currentColor" /></svg>;
export const IconList = ({ size = 20 }) => <I d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" size={size} w={2} />;
export const IconPieces = ({ size = 20 }) => <I d="M4 4h7v9H4zM14 4h6v6h-6zM14 13h6v7h-6zM4 16h7v4H4z" size={size} />;
export const IconCode = ({ size = 20 }) => <I d="M9 7l-5 5 5 5M15 7l5 5-5 5" size={size} />;
export const IconChecks = ({ size = 20 }) => <I d="M4 6l2 2 3.5-3.5M4 14l2 2 3.5-3.5M13 7h7M13 15h7" size={size} />;
export const IconSpark = ({ size = 20 }) => <I d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6" size={size} />;
