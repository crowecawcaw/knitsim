// Public shapes produced by the engine in core.ts (which is still untyped inside).

export type Level = 'error' | 'warn';
export interface Problem { line: number; msg: string; level: Level }

export type StitchType = 'k' | 'p';
export type StitchOp = 'co' | 'pu' | 'n' | 'inc' | 'dec' | 'bo';

export interface Stitch {
  id: number;
  piece: string;
  x: number;
  row: number;
  op: StitchOp;
  t: StitchType;
  lean?: 'l' | 'r';
  color: string;
  line: number;
  parents: Stitch[];
  children?: Stitch[];
  /** work-order index within the piece */
  ord: number;
  /** position within its row, in work order */
  inRow: number;
  top?: number;
}

export interface Row {
  index: number;
  dir: 'CO' | 'RS' | 'WS';
  line: number;
  desc: string;
  fabric?: string;
  stitches: Stitch[];
  order: Stitch[];
  firstOrd: number;
}

export interface Piece {
  sg: number; rg: number;
  name: string;
  round: boolean;
  line: number;
  rows: Row[];
  nrows: number;
  total: number;
  minx: number;
  maxx: number;
  widthIn: number;
  heightIn: number;
  top: Stitch[][] | null;
  gather?: boolean;
}

export interface Param {
  name: string;
  type: 'enum' | 'int' | 'float' | 'color';
  label: string;
  line: number;
  options?: string[];
  min?: number;
  max?: number;
  default: string | number;
  value: string | number;
  used?: boolean;
}

export interface Check {
  kind: 'count' | 'seam';
  line: number;
  ok: boolean;
  level?: 'ok' | 'ease' | 'bad';
  text: string;
}

export interface Seam { a: string; b: string; stage: number; hidden?: boolean }

export interface KnitDoc {
  name: string;
  source: string;
  errors: Problem[];
  params: Param[];
  expanded: string;
  checks: Check[];
  seams: Seam[];
  built: { pieces: Record<string, Piece>; order: Piece[]; sg: number; rg: number };
}

export type ParamValues = Record<string, string | number>;
