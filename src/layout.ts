import { useEffect, useState } from 'react';

/** Phones (and phones in landscape): the knit sits on top and the cards stack below it. Keep in sync with styles.css. */
export const STACKED_QUERY = '(max-width: 860px), (max-width: 960px) and (max-height: 500px) and (orientation: landscape)';
export const isStacked = () => window.matchMedia(STACKED_QUERY).matches;

/** Live `isStacked()`: re-renders when the window crosses the phone breakpoint. */
export function useStacked() {
  const [v, setV] = useState(isStacked);
  useEffect(() => {
    const mq = window.matchMedia(STACKED_QUERY); const on = () => setV(mq.matches);
    mq.addEventListener('change', on); return () => mq.removeEventListener('change', on);
  }, []);
  return v;
}
