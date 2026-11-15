import sweater from './sweater.knit?raw';
import scarf from './scarf.knit?raw';
import hat from './hat.knit?raw';
import cowl from './cowl.knit?raw';
import blanket from './blanket.knit?raw';

export const EXAMPLES = [
  { key: 'sweater', label: 'Sweater', src: sweater },
  { key: 'scarf', label: 'Scarf', src: scarf },
  { key: 'hat', label: 'Hat', src: hat },
  { key: 'cowl', label: 'Cowl', src: cowl },
  { key: 'blanket', label: 'Baby blanket', src: blanket },
] as const;

export type ExampleKey = (typeof EXAMPLES)[number]['key'];

export const DEFAULT_EXAMPLE = EXAMPLES[0];

export const findExample = (src: string) => EXAMPLES.find((e) => e.src === src);
