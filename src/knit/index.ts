import * as core from './core';
import type { KnitDoc, ParamValues } from './types';

export * from './types';
export { BODY, TABLE, makeSim } from './core';

/** Parse, expand params, build and check a pattern. Never throws. */
export function runPattern(src: string, params: ParamValues): KnitDoc {
  try {
    return core.run(src, params) as unknown as KnitDoc;
  } catch (e) {
    console.error(e);
    return {
      name: 'Untitled', source: '', params: [], expanded: src, checks: [], seams: [],
      errors: [{ line: 0, msg: 'Internal error: ' + (e as Error).message, level: 'error' }],
      built: { pieces: {}, order: [], sg: 5, rg: 7 },
    };
  }
}
