/** Phones (and phones in landscape): the knit sits on top and the cards stack below it. Keep in sync with styles.css. */
export const STACKED_QUERY = '(max-width: 860px), (max-width: 960px) and (max-height: 500px) and (orientation: landscape)';
export const isStacked = () => window.matchMedia(STACKED_QUERY).matches;
