# Knit DSL

A plain-text language for knitting patterns. The app parses it, builds every stitch,
checks counts and seams, and simulates the result in 3D.

> **Status.** This is the v2 spec. The engine (`src/knit/core.ts`) implements **v1 only**. Everything tagged `(v2)` is
> specified but not built yet; see [Implementation status](#implementation-status). Every v1 pattern is a valid v2 pattern.

```knit
pattern "Ribbed Beanie"
param size enum 16in 18in 20in = 20in "Size"
gauge 16 sts x 20 rows = 4 in
yarn #3d6274

piece hat round
  cast_on 64/72/80
  rows until 6/6.5/7in rib6x2
  row st dec every 8 ; expect 56/63/70
  row st dec every 2 ; expect 8/9/10
  gather
end

assemble
  place hat at head
end
```

## Lexical rules

- One statement per line. `;` separates statements on one line.
- `#` starts a comment when it begins the line or follows a space, except `#rrggbb` colours. Write a space after it: `# note`.
- `"…"` quotes a value containing spaces, or a written row (see [Written rows](#written-rows-v2)).
- `{ … }` blocks (`repeat`, and in v2 `if`, `else`, `define`, `at_same_time`) may span lines. `end` closes `piece`, `assemble`, `stitch` and `chart`.
- (v2) A per-size list or `${}` may stand wherever a number or length may; see [Semantics](#semantics-v2).
- Lengths are a number followed by `in` or `cm`: `2.5in`, `6cm`.
- `name:value` with no spaces attaches a count or a section to a name: `garter:6`, `back:52`, `checked:front`.
- `piece.name` refers to part of a piece: an edge, a marker, a section or held stitches.
- (v2) Names are letters, digits and `_`, start with a letter, and can't be keywords. Within a piece, markers, sections,
  holders and named cast-ons share one namespace.
- (v2) `chart` bodies are read verbatim: no `${}`, per-size lists or `;` inside them. (`stitch` bodies are written rows and allow both.)

## Header

| Statement | Meaning |
|---|---|
| `pattern "Name"` | Pattern title |
| `source URL` | Link to the original pattern |
| `gauge S sts x R rows = N in\|cm` | Stitches and rows per N inches or cm |
| `gauge [FABRIC] [on NEEDLE] S sts x R rows = N in\|cm` (v2) | Gauge for one fabric and/or needle. The most specific match wins. FABRIC is a built-in fabric or a `stitch`/`chart` name (it may be declared later); NEEDLE is any label used by a `needle` statement |
| `yarn #rrggbb` | Default yarn colour. Inside a piece it changes the colour from that point on |
| `yarn NAME #rrggbb [x2] ["Label"]` (v2) | Named yarn; `xN` = strands held together. The first one declared is the default. Inside a piece, `yarn NAME` switches |

## Parameters

Parameters show up as live controls in the app. Declare them before you use them.

```knit
param size   enum S M L 1X = M "Size"        # enum (alias: select)
param length float 40..100 = 86 "Length (in)"
param border int 3..10 = 6
param main   color = #c4a27a "Yarn"
```

Syntax: `param NAME TYPE [OPTIONS | MIN..MAX] = DEFAULT ["Label"]`.

- **Expressions:** `${expr}` anywhere in a line, for example `cast_on ${odd(width * sts / 4)}` or `rows until ${length}in st`.
  The operators are `+ - * / %`, the comparisons `== != < <= > >=` and `cond ? a : b`. The functions are
  `round ceil floor min max abs even odd mult(x, m)` and `pick(i, a, b, …)` (the i-th value, counting from 0). The variable `size_index`
  is also available, so `${pick(size_index, 30, 34, 38) * 2}` is a per-size value inside an expression.
  (v2) adds `&& || !` and `x in A B C`.
- **Per-size lists:** `a/b/c` picks the value for the current size. The size comes from the `size` param, or from the
  first `enum` if there is no `size`. The list must have one value per option: `cast_on 50/54/58`, `rows until 2.5/2.5/3in rib2x2`, `garter:4/6/6 st garter:4/6/6`.
  - A list is numbers only, joined by `/` with no spaces. Inside `${}`, `/` is always division.
  - Use `0` for a size that skips a step. A list with too few or too many values is an error.
  - (v2) A list may follow a stitch word inside a written row: `"k3/4/5 *p2 k2*"`.
  - (v2) Enum options may be quoted so they can contain `/`: `param size enum "XS/S" M L "2/3XL"`. `param` lines are never expanded.

## Pieces

```knit
piece NAME [round] [top_down]     # round = worked in the round (every row is RS)
  …                               # top_down (v2) = the cast-on edge is the top
end
piece NAME like OTHER             # identical copy of OTHER (e.g. second sleeve)
piece NAME like OTHER [mirrored] [until MARKER]   # (v2) may have a body
  …
end
```

Rows alternate RS/WS starting with row 1 = RS, unless the piece is `round`. (v2) See [Rows and sides](#rows-and-sides).

(v2) `like` options:

- `mirrored` swaps `left`/`right`, the order of sections and fabric parts, and `using` pairs (cardigan fronts). A bind-off
  that lands at the end of a row moves to the start of the next row, as written patterns do.
- `until MARKER` copies OTHER only up to that marker ("work as for back to armhole").
- Body statements continue after the copied rows. A start statement in the body replaces OTHER's, whatever its kind
  (a `join` may replace a `cast_on`).

### Start statements

Exactly one, on the first line of the piece.

| Statement | Meaning |
|---|---|
| `cast_on N` | Cast on N stitches |
| `cast_on N [using METHOD] [ws]` (v2) | METHOD is informational: `long_tail`, `provisional`, `tubular`, … |
| `pick_up N from EDGE` | Picks up from an earlier piece's edge, and the piece is placed automatically |
| `pick_up A per B from EDGE [mult M]` (v2) | A stitches for every B rows (or stitches) of the edge, rounded to a multiple of M |
| `join PART + PART + … [mult M]` (v2) | Starts from stitches of other pieces, in the order worked |

(v2) A start statement only puts stitches on the needle. It is **not a row**: the first `row` after a `join` is the
joining round, and the first row after a `pick_up` is the row after the pick-up. Any start statement may end with
`ws` to make the first row a WS row.

(v2) A `join` PART is one of:

- `piece.SECTION`, `piece.HOLDER` or `piece.live` (every stitch still live, in order): live or held stitches. Each
  stitch can be used once;
- `cast_on [NAME:]N`;
- `pick_up [NAME:]N from EDGE` or `pick_up [NAME:]A per B from EDGE`. Put edges joined by `+` in parentheses:
  `pick_up 2 per 3 from (front.neck.1 + back.left[neck:end])`.

Rules:

- **Order.** Parts are listed as worked. In the round, the round starts at the first part. To start it mid-part, split
  that part with a range: `pick_up 5 from body.ua[mid:end] + yoke.sleeve + pick_up 4 from body.ua[start:mid]`.
- **Sections.** Each part becomes a section named after its source: `body.back` → `back`, a section-less `sleeve.live` →
  `sleeve`, `cast_on neck:38` → `neck`. A `piece.live` with sections brings them all. Names that clash become
  `piece_section` (`sleeve_l_arm`, `sleeve_r_arm`). Unnamed `cast_on`/`pick_up` parts are named by position: `p1`, `p3`.
- **Carry-over.** Each live part keeps its fabric, including its place in a repeat, so a `row` with no fabric works every
  section as established. New parts are `st` until a fabric is given. Yarn and needle are those of the first live part;
  stripes don't carry over.
- **`mult M`** rounds the total to a multiple of M by adjusting the `per` parts ("pick up 2 for every 3 rows, adjusting
  to a multiple of 4").

Example: `join pick_up 21 from front.neck.1 + front.fneck + pick_up 21 from front.neck.2 + back.bneck`.

### Statements

| Statement | Meaning |
|---|---|
| `row [FABRIC] [SHAPING…]` | Work one row. (v2) the fabric is optional; see [Fabrics](#fabrics) |
| `rows N [FABRIC] [SHAPING…]` | Work N rows, applying the shaping on every row |
| `rows 2in [FABRIC]` | Work enough rows to add that length |
| `rows until COND [FABRIC] [SHAPING…]` | Work until a condition holds (rounds up) |
| `rows NAME` / `rows NAME[a:b]` (v2) | Work every row, or rows a to b, of a `stitch` or `chart` once, starting at row 1 (or a) |
| `repeat N { … }` | Repeat a block |
| `marker NAME` | Name the current **row** so edges and lengths can refer to it. `start` and `end` always exist |
| `sections NAME:N …` (v2) | Name runs of live **stitches**; see [Sections](#sections-v2) |
| `expect N [N …]` | Assert the live stitch count. After a split, give one number per section |
| `expect NAME=N …` (v2) | Assert the count of named sections |
| `expect width\|length LEN [within LEN\|P%]` (v2) | Assert a finished measurement at this row. In the round, width is the circumference. Default: the seam thresholds (within 5% passes, 5–15% is a warning, more is an error); with `within`, anything outside is an error. See [Measuring](#measuring) |
| `yarn NAME`, `stripes …`, `needle NAME` (v2) | See [Colour](#colour-v2) |
| `round` / `flat [ws]` (v2) | Switch mode mid-piece: "join to work in the round", "work back and forth". The row after `flat` is RS; `flat ws` = "turn" first |
| `fold [at MARKER]` (v2) | One row that folds the piece along MARKER (default: halfway) and knits each live stitch together with the cast-on edge: a knitted-in hem or doubled collar. The live count must equal the cast-on count. Later lengths are measured from the fold line |
| `resume HOLDER [ws]` (v2) | When nothing is live: put this piece's held stitches back on the needle and go on from the row where they were held ("rejoin yarn to rem sts"). The next row is RS unless `ws` |
| `bind_off [using METHOD]` | Bind off all live stitches, forming the top edge. (v2) METHOD is informational (`rib`, `picot`, `stretchy`, …; the default is in pattern), or a written row of `bo`: `bind_off using "*bo4 m1 bo*"` |
| `gather` | Thread yarn through the live stitches and pull tight (hat crowns) |

(v2) A piece may end with live stitches, or with held stitches only (`hold all`). Both stay available to `join` and to
`seam … using graft|3needle`. Stitches that nothing uses are a warning.

### Row conditions and schedules

`until` conditions (used by `rows until` and, in v2, `repeat until`):

| Condition | Meaning |
|---|---|
| `18in` | The piece measures 18in |
| `9in from MARKER` | Measured from a marker |
| `9in from PIECE.MARKER` (v2) | Measured back through a `join` or `pick_up` into the source piece: `until 12in from yoke.start` |
| `match PIECE` | Same row count as another piece |
| `match PIECE.MARKER`, `match PIECE[a:b]` (v2) | Same row count as PIECE from its start to MARKER, or between its markers a and b: "same length as back to underarm" = `match back.underarm`. Add `from MARKER` to count this piece's rows from a marker instead of its start. Compared as lengths when the row gauges differ |
| `N sts [in SECTION]` (v2) | The stitch count reaches N. Overshooting is an error |
| `fits EDGE` (v2) | The piece is as long as that edge (bands) |

A run never stops short: it ends with the first row at which the condition holds, so a length may be exceeded by part
of a row.

(v2) Any length or condition may be followed by `ending ws`, `ending rs` or `ending row K[,K…]` (rows of the current
fabric: "ending with row 2 or 4" = `ending row 2,4`). It adds the fewest rows that make that the last row worked:
`rows until 7in ending ws`. The added rows are ordinary rows of the run (stripes and schedules keep running).

(v2) A schedule goes between the fabric and the shaping, and limits the shaping to some rows of the run:

| Schedule | Shaping happens on |
|---|---|
| `every K [from row F]` | rows F, F+K, F+2K, … of the run. F defaults to K |
| `spaced N [from row F]` | N rows spread evenly from row F (default 1) to the last row |
| `last` | the final row of the run, after any `ending` rows: `rows until 2.5in rib2x2 ending ws last inc 2 evenly` |

```knit
rows until 44 sts st every 6 from row 5 inc edges    # "inc each end of 5th and every foll 6th row to 44 sts"
rows 24 every 4 dec edges ; rows until 15in          # "dec every 4th row 6 times, then work even"
rows until fits front.left rib1x1 spaced 5 from row 4 buttonhole center
```

With `until N sts`, the run ends right after the shaping row that reaches N.

## Fabrics

A fabric describes how the **right side** looks.

| Fabric | Look |
|---|---|
| `st` | stockinette (knit side) |
| `rev_st` | reverse stockinette (purl side) |
| `garter` | garter (knit every row) |
| `seed` | seed stitch |
| `moss` | moss stitch |
| `edge` | slipped selvedge |
| `ribAxB` | A knit, B purl rib, e.g. `rib2x2`, `rib6x2` |
| `"k3 *p2 k2* p2 k3"` (v2) | a written row |
| NAME (v2) | a `stitch` or `chart` declared at the top level |

Combine fabrics across a row with `name:count`, for example `garter:6 st garter:6`. One part may leave out its count and
fills the remaining stitches. (v2) A part may name a section instead of a count: `st checked:front`.

(v2) **Fabric is sticky.** A `row`/`rows` with no fabric continues the previous one ("work in pattern as established"),
including its place in a multi-row repeat. New stitches take the fabric of the part or section they land in, unless the
shaping says `in FABRIC`. Details are under [Sticky state](#sticky-state).

(v2) Because a fabric is the RS look, the engine works whatever produces it: `st` is knit every round in the round and
knit/purl rows flat; `garter` is knit every row flat and alternates knit (row 1) and purl (row 2) rounds in the round.
"On the next knit round" is `ending row 2` on the garter before it.

### Written rows (v2)

A quoted row is read as worked, the way the pattern prints it. Commas are ignored, so text can be pasted.

- Stitches: `k p k1tbl p1tbl sl1 yo m1 m1l m1r m1p m1pl m1pr lli rli kfb k2tog ssk k2togtbl p2tog ssp k3tog sssk p3tog cdd
  cNf cNb lt rt bo`. `k3` = knit 3.
  - `lt`/`rt` are twists over 2 stitches. `cNf`/`cNb` cross N stitches (N even: `c4f`, `c6b`). Neither changes the count.
  - `(…)in1` works the group into one stitch: `(p1 k1 p1)in1` makes 3 from 1 (trinity stitch: `*(p1 k1 p1)in1 k3tog*`).
  - `bo` binds off the next stitch, or the one just made. It is only allowed in `bind_off using "…"`.
- A written row is always **as worked**: on a WS row `k` is a knit as you face it, so it shows as a purl on the RS.
- A bare `k` or `p` fills: `"k3 k2tog k ssk k3"` = "k3, k2tog, knit to last 5, ssk, k3".
- `*…*` repeats to fill and `(…)xN` repeats N times: `"k19 (m1l k39)x5 m1l k20"`.
- The checker verifies that the row uses exactly the live stitches, and computes the new count.
- When a written row stays in force for later rows, they are worked as the stitches present themselves (knit the knits).

`row "*k6 k2tog*"` is the v2 spelling of crown shaping; `dec every 8` remains as an alias.

### Stitch patterns and charts (v2)

Declare both at the top level.

```knit
stitch checked              # written rows, row 1 first; flat: odd rows are RS, even rows as worked on the WS
  1,3: k2 p3                # labels are optional: 1,3:  1-4:  odd:  even:
  2,4: k3 p2
  5,7: p3 k2                # a line with no *…* repeats across the row
  6,8: p2 k3
end

chart leaf odd              # a picture of the RS, drawn as printed: the last line is row 1
  key t = k1tbl             # extra symbols: key SYMBOL = [YARN] [STITCH]
  t | .2 o ^ o . | t        # |…| marks the repeat; cells outside it are worked once
  t | o / .2 \ o | t        # odd = only rows 1, 3, 5, … are drawn
end
```

**`stitch`** (written rows; usually the quickest form, also for lace):

- With no labels, the lines are rows 1, 2, 3, … in order. Either every line is labelled or none is; a labelled row may
  be given once only. `odd:`/`even:` fill the rows that have no number of their own (`even: p`).
- Add `round` after the name if the pattern wrote it in rounds. The engine converts either form.

**`chart`** (a grid; made to be typed quickly):

- A cell is one character and spaces are optional. A number repeats the cell before it: `.5` = `.....`.
- Built-in symbols: `.` knit, `-` purl, `o` yo, `/` k2tog, `\` ssk, `^` cdd, `x` no stitch, `<<` lt, `>>` rt.
- `key` adds symbols for anything else (`key w = p3tog`); a digit can't be a symbol. A stitch several stitches wide fills that many cells:
  `key c = c4f`, then `cccc` or `c4`.
- `odd` after the name means only odd rows are drawn, as most lace charts are printed. The rows between are worked as
  the stitches present themselves (yarn-overs plain), so a 16-row lace chart is 8 typed lines.
- **Colour charts:** a cell that is a one-letter yarn name is a knit stitch in that yarn. Use `key` for longer yarn names
  or coloured shaping: `key d = M k2tog`. "*K1 MC, k1 CC*" is the one-line chart `M C`.
- Rows may change the stitch count. Pad them with `x`; the checker tracks the count per repeat.

**Both:**

- Use them like any fabric: `rows 16 checked`, `rows until 8in leaf`, `st leaf:48 st`, `rows leaf[9:13]`.
- **Across:** the `*…*` or `|…|` repeat is worked as many times as fits the part it fills; stitches outside it are worked
  once at each side. With no marks, the whole line is the repeat.
- **Up:** as a fabric, the rows cycle 1…n for as long as it stays in force. `rows NAME` works them exactly once.
- **Partial repeats:** leftover stitches are split between the two sides (in the round: left at the end) and worked as
  the next columns of the pattern, with a warning. A yarn-over, decrease or cable cut off from its partner is worked plain.
- **Under shaping** the pattern stays aligned stitch over stitch, so edge shaping grows or eats partial repeats.
- A pattern that differs per size group is declared once per group inside a top-level `if` (see
  [Flow control](#flow-control-v2)).

### Colour (v2)

| Statement | Meaning |
|---|---|
| `yarn NAME` | Switch yarn from this row on. Ends any stripes |
| `stripes A:2 B:4 C:2` | Sticky colour cycle (yarn:rows). It keeps running across statements and shaping until `stripes off` |
| `needle NAME` | Switch needle. NAME is any label (`US7`, `4mm`, `small`) and needs no declaration. Changes the gauge if one is declared `on` that needle |

## Sections (v2)

Sections are stitch markers: named runs of live stitches. (`marker` names a row; `sections` names stitches.)

```knit
sections back:52 sleeve_l:8 front:52 sleeve_r:8     # "pm" between them; one count may be omitted
```

- Sections are listed in the order worked on an RS row or round: from the right edge (RS view) or the start of the round.
- The counts must add up to the live count. Declaring sections again replaces them.
- Sections follow the shaping. A piece with no sections is one section.
- Binding off or holding stitches from the middle of a section splits it. In a piece with no sections the halves keep
  their v1 names `1` and `2`, where `1` is the left side seen from the RS (the lower stitch numbers of v1). The halves
  of a named section are `NAME_1` and `NAME_2`.
- Both sides of a split are worked over the same rows. To work one after the other, `hold` one side and `resume` it later.
- `piece.SECTION` is a horizontal edge when bound off, and live stitches otherwise.

## Shaping

Canonical form: `VERB [N] WHERE… [inset I] [using TYPE[,TYPE]] [in FABRIC]`. N defaults to 1. The v1 order
`VERB WHERE N` (`inc edges 2`, `bind_off center 10`) is an alias when there is a single WHERE.

| Verb | Meaning |
|---|---|
| `inc`, `dec` | Increase or decrease N at each WHERE |
| `bind_off N [WHERE] [as NAME]` (v2) | Bind off N stitches. WHERE defaults to `start`: `rows 2 bind_off 4` = "bind off 4 at beg of next 2 rows". NAME makes the bound-off run an edge, `piece.NAME` |
| `cast_on [NAME:]N [WHERE]` (v2) | Cast on N mid-piece, default `start`. `center` closes a split (slot neck). NAME makes it a section and an edge. `using METHOD` is informational (`backward_loop`, `cable`) |
| `hold [N] WHERE\|SECTION\|all [as NAME]` (v2) | Like `bind_off`, but the stitches stay live as `piece.NAME` (default: the section name) |
| `hold SECTION cast_on [NAME:]N` (v2) | Hold a section and cast on N in its place ("place sleeve sts on waste yarn, CO 8 under arm") |
| `buttonhole [N] WHERE [wide W]` (v2) | N holes, W stitches wide (default 2). The count is unchanged |

| WHERE | Meaning |
|---|---|
| `edges` | Both outer edges of the piece, also after a split (the armhole edges). In the round: the first and last stitches of the round, on either side of its start |
| `neck` | The edges next to a split |
| `center` | The centre of the row. In the round: the point halfway round from the start. `bind_off N center` and `hold N center` remove N stitches centred there and split the piece (flat: a neckline; round: the second underarm) |
| `every N` | Legacy `dec` only: `*k N-2, k2tog*` across. `dec every 2` = k2tog all |
| `start`, `end` (v2) | The beginning or end of the row as worked: `start` is the right side (RS view) on RS rows and rounds, the left on WS rows |
| `left`, `right` (v2) | A fixed side as seen from the RS. In the round only inside a section (`front.left`), where `right` is where the section starts |
| `markers` (v2) | Both sides of every section boundary: `inc markers` on a 4-section raglan round = 8 increases. The start of the round is a boundary; the outer edges of a flat piece are not |
| `evenly` (v2) | N in total, spread evenly: `dec 22 evenly`. For exact positions use a written row |
| `at I [I…]` (v2) | I stitches in from the right edge (RS view) or the start of the round. Negative counts from the other edge |
| `SECTION.where` (v2) | Any of the above inside one section: `inc front.edges back.edges`, `inc 6 front.evenly`, `dec 2 front.center`, `dec back.end front.start` |

- N counts stitches per place. With `evenly` and `center` it is the total.
- On a split piece a row runs across both sides, so `start`, `end`, `left`, `right` and `edges` are the outer edges of
  the whole row: `rows 2 bind_off 6` steps both shoulders. For one side use its section: `dec 1.left`.
- (v2) Shaping in one row is applied in the order written, which must be the order worked. Counts and places refer to
  the stitches as they were before the row: `row hold 26 center as neck hold 16 end as shoulder_l`.
- (v2) Places that touch merge into one run. In the round `hold 4 edges as ua` is one holder of 8 stitches straddling the
  start of the round, and `hold 5 back.end front.start as ua` straddles a marker.
- (v2) `inset I` leaves I stitches between each place and its shaping: `dec edges inset 3 using k2tog,ssk` = "k3, k2tog,
  work to last 5, ssk, k3"; `inc markers inset 1` = "m1r, k1, sm, k1, m1l". The default is 0. Counts don't change.
- (v2) `using` names the stitch: `dec edges using ssk,k2tog`, `inc markers using m1r,m1l`, `inc start using kfb`,
  `dec 2 center using cdd`. In a pair, the first is used at the first place of the row as worked (at `markers`: before
  each marker, the second after it). It affects rendering, not counts.
- (v2) `in FABRIC` (with `inc` and `cast_on`) works the new stitches in FABRIC, not in the fabric they land in:
  `inc markers inset 1 in st` = "work increased sts in St st". They form a strip that later increases at the same place widen.
- Stepped shoulders: `rows 4 bind_off 6`. One-sided: `row dec left`, `rows 6 every 2 bind_off 5 right`.

## Flow control (v2)

| Statement | Meaning |
|---|---|
| `repeat [N] [until COND] { … }` | Stops after N times or when COND holds, whichever is first. COND is checked after every row, so it can stop mid-block |
| `if EXPR { … } [else if EXPR { … }] [else { … }]` | EXPR needs no `${}`: `if size in XS XL 2X { … }`, `if sleeve == "long" { … }`. Allowed in pieces, in `assemble` and at the top level, where it may wrap `stitch`, `chart`, `gauge` and `define` |
| `define NAME { … }` | Name a block of statements, at the top level or in a piece. Run it by writing `NAME` as a statement |
| `at_same_time { … } and { … }` | Work two or more blocks over the same rows ("AT THE SAME TIME") |

Rows that differ per size group ("Sizes XS–M: … Sizes L–2X: …") are `if` blocks; inside one, per-size lists still have a
value for every size. The same form gives a chart or stitch pattern one name with a different body per group.

```knit
if size in XS S M {              # sizes: XS S M L 1X 2X
  chart panel
    …
  end
} else {
  chart panel
    …
  end
}

if size in XS S M {
  repeat 12/13/14/0/0/0 { row inc markers using m1r,m1l ; row }
} else if size in L 1X {
  repeat 8 { row inc markers ; row inc front_l.end front_r.start }
} else {
  rows yoke_2x
}
```

`at_same_time` merges its tracks row by row:

- Row k of the run gets the shaping of row k of every track. A finished track adds nothing.
- Fabric, yarn and stripes come from the one track that sets them; two tracks setting them on the same row is an error.
- Lengths and stitch counts are measured on the whole piece. The run ends when every track is done.
- Tracks hold only `row`, `rows`, `repeat`, `if`, `marker`, `yarn`, `stripes`, `expect` and defined blocks.

## Assembly

```knit
assemble
  place PIECE at front|back|left_arm|right_arm|neck|head|scarf|table
  seam EDGE = EDGE
end
```

Each `seam` statement is sewn in the order it is written.

| Statement (v2) | Meaning |
|---|---|
| `place PIECE at torso\|front_left\|front_right\|shoulders` | Tubes and yokes, cardigan fronts, a piece folded over the shoulders (at its middle row, or at a `fold`). Pieces linked by `join` or `pick_up` move together: place one of them and the rest follow |
| `seam A = B using METHOD` | `mattress` (default), `whip`, `graft`, `3needle`, `zipper`, `buttons`. Graft and 3needle need live or held stitches |
| `seam A = B using zipper LEN` | A zipper of that length (`12/14/16in`), checked against the edges |
| `seam A = B using buttons` | An overlapping closure, not sewn. Buttons sit opposite the buttonholes of either piece |
| `buttons N on EDGE [at LEN …]` | Sew N buttons along an edge, evenly spaced, or at the given distances from its start (negative: from its end): `buttons 2 on body.slot at 1.5in -1.5in` |
| `seam A = B ease LEN` / `gather` | Declare an intended length difference so the checker doesn't flag it |
| `fold PIECE at MARKER` | Fold along a row after knitting (hem facing, doubled collar). Sew it down with an ordinary `seam`, or leave it loose (turned-back collar or cuff). A hem joined while knitting is the piece statement `fold` |

### Edges

```
piece.left[a:b]   piece.right[a:b]   piece.bottom
piece.top         piece.top.1        piece.neck
```

- `a`, `b` can be `start`, `end`, a marker name or a row number. A reversed range runs backwards.
- `~EDGE` reverses an edge, and `+` joins edges: `back.neck + front.neck`.
- `left`/`right` are as seen from the right side, so the front's left edge meets the back's right edge.
- `top.N` is the Nth section of a split top. For example, after a neckline the shoulders are `top.1` (left, from the
  RS) and `top.2`.
- `left` and `right` are the outer side edges for the whole height of the piece, through a split. If one side was
  finished in another piece, add that piece's edge with `+`.
- `neck` runs from the top of side 1 down, across the centre stitches (bound off or held) and up side 2.
  (v2) `neck.1` and `neck.2` are the two sides alone, in that direction.
- (v2) `piece.NAME` is a named cast-on, a bound-off section or held stitches. `piece.live` is every live stitch.
- (v2) `piece.row[MARKER]` is a line across the fabric (fold lines, picking up from a row).
- (v2) Horizontal edges take ranges too: `back.neck[start:mid]`, `body.bottom[front]`. The ends can be `start`, `mid`,
  `end`, a section name or a stitch number.

The checker compares seam lengths: within 5% passes, 5–15% is reported as ease, and more than that is a mismatch.

## Semantics (v2)

Rules that apply across statements.

### Values

- A per-size list or `${}` may stand wherever a number or length may: counts, lengths, `repeat N`, `every K`,
  `from row F`, `spaced N`, `until N sts`, `sections`, `expect`, `at I`, `inset I`, `name:count`, row ranges, join parts
  and after a stitch word in a written row or `stitch` body.
- `${}` is replaced as text before the line is parsed, so it also works in names and colours (`yarn A ${mc}`).
- The exceptions are `param` lines and `chart` bodies.
- A count of `0` makes that step a no-op for the size: `repeat 0`, `rows 0`, `inc 0 evenly`, `bind_off 0`, `hold 0 …`,
  `cast_on ua:0`, `k0`.

### Rows and sides

- Start statements are not rows. Row 1 is the first `row` and is RS, unless the start statement ends with `ws`.
- Flat rows alternate RS and WS. In the round every row is RS. `flat` and `resume` restart at RS unless followed by `ws`.
- A piece statement `fold` is one row. An assembly `fold` and a `seam` don't change any row.
- Both sides of a split share their rows and their side.
- Row numbers in schedules (`every K from row F`) count from the first row of the run. Row numbers in `ending row K`
  and `NAME[a:b]` are rows of the fabric.

### Sticky state

- Fabric, yarn, `stripes`, needle and sections stay in force until changed, across statements, blocks and shaping.
- **Fabric is remembered per part.** Parts given with a count keep it and the uncounted part takes up shaping; parts tied
  to a section follow the section. A fabric named on a row replaces the fabric of the whole row.
- **Phase.** Naming the fabric already in force continues it. A different fabric starts at its row 1, aligned to the
  right edge (RS view) or the start of the round of the part it fills. To carry on "as established", leave the fabric out.
- `rows NAME` always starts at row 1 of NAME, and NAME then stays in force after its last row.
- A new piece starts with the default yarn and no stripes, except after `join` (see [Start statements](#start-statements)).

### Names

- Markers name rows; sections, holders, named cast-ons and named bind-offs name stitches. Within a piece they share one
  namespace.
- Automatic names: `start` and `end` (markers); `1`, `2`, `NAME_1`, `NAME_2` (split halves); `p1`, `p2`, … (unnamed join
  parts); the section name (a `hold` with no `as`).
- `piece.live` is whatever is still live; held stitches are reached only by their holder name. A stitch can be joined,
  resumed, grafted or bound off once.

### Measuring

- Width is the sum of the row's parts, each at its own fabric's stitch gauge. Row height comes from the fabric that
  covers the most stitches of the row.
- Lengths are measured along the rows from the cast-on, or from the fold line after a piece statement `fold`; `from MARKER`
  overrides both.
- `expect width|length` and seams share one tolerance: within 5% passes, 5–15% is a warning, more is an error.

## Worked examples (v2)

### Top-down raglan

```knit
param size enum S M L = M
gauge 18 sts x 24 rows = 4 in

piece body round top_down
  cast_on 80/88/96
  rows 1in rib1x1
  sections back:28/30/32 sleeve_l:12/14/16 front:28/30/32 sleeve_r:12/14/16
  rows until 240/264/288 sts st every 2 inc markers using m1r,m1l
  expect back=68/74/80 sleeve_l=52/58/64 front=68/74/80 sleeve_r=52/58/64
  marker underarm
  row hold sleeve_l cast_on underarm_l:8 hold sleeve_r cast_on underarm_r:8
  expect 152/164/176 ; expect width 34/36.5/39in
  rows until 13in from underarm
  rows 2in rib1x1 ; bind_off using rib
end

piece sleeve_l round top_down
  join body.sleeve_l + pick_up 8 from body.underarm_l
  expect 60/66/72
  rows until 40/44/48 sts st every 8/7/6 dec edges
  rows until 16in
  rows 2in rib1x1 ; bind_off using rib
end

piece sleeve_r like sleeve_l
  join body.sleeve_r + pick_up 8 from body.underarm_r
end

assemble
  place body at torso
end
```

### Cardigan fronts

Same header as the raglan.

```knit
piece left_front                 # wearer's left: the neck is the left edge, the armhole the right
  cast_on 40/44/48
  rows 2in rib2x2
  rows until 14in st ending ws
  marker underarm
  at_same_time {                 # armhole
    row bind_off 4/5/6 right
    rows 10 every 2 dec right
    rows until 7/7.5/8in from underarm ending ws
  } and {                        # V-neck: every 4th row
    repeat 10/11/12 { row dec left using k2tog ; rows 3 }
  }
  expect 21/23/25
  bind_off
end

piece right_front like left_front mirrored

piece band
  pick_up 3 per 4 from right_front.right[start:underarm]
  rows 3 rib1x1
  row buttonhole 5 evenly
  rows 3 ; bind_off using rib
end

assemble
  place left_front at front_left ; place right_front at front_right
  seam band.top = left_front.left[start:underarm] using buttons
end
```

### Colourwork yoke

```knit
gauge 20 sts x 26 rows = 4 in
yarn M #2f4858 "Main" ; yarn C #f2e8cf "Cream" ; yarn R #c8553d "Rust"

chart band                       # 8-stitch repeat; row 6 decreases it to 6
  key d = M k2tog
  M M M x M M M x
  M M d x M M d x
  C M C M C M C M
  C C C M C C C M
  C R C M C R C M
  C C C M C C C M
  C M C M C M C M
end

piece body round
  cast_on 160 ; rows 2in rib2x2 ; rows until 14in st
  sections back:72 ua_l:8 front:72 ua_r:8      # left live: no bind_off
end
piece sleeve_l round
  cast_on 40 ; rows 2in rib2x2
  rows until 56 sts st every 8 inc edges ; rows until 17in
  sections arm:48 ua:8
end
piece sleeve_r like sleeve_l

piece yoke round
  join body.back + sleeve_l.arm + body.front + sleeve_r.arm
  expect 240 ; rows 2in st
  rows band ; expect 180
  rows 1in st ; row dec 60 evenly ; expect 120
  rows 1in rib2x2 ; bind_off using rib
end

assemble
  place body at torso
  seam body.ua_l = sleeve_l.ua using graft ; seam body.ua_r = sleeve_r.ua using graft
end
```

## Implementation status

Implemented (v1): everything not tagged `(v2)`, with fabric and `N` written out in full (`row st inc edges 2`).

Specified, not yet implemented (v2):

- **Rows:** sticky fabric; `until N sts`, `fits`, `from PIECE.MARKER`, `match PIECE.MARKER`/`PIECE[a:b]`; `ending`;
  `every`, `spaced` and `last` schedules.
- **Shaping:** `VERB N WHERE` order; `start end left right markers evenly at`; `SECTION.where`; `inset`, `using`, `as`;
  mid-piece `bind_off N`, `cast_on`, `hold`, `buttonhole`.
- **Sections:** `sections`, `expect NAME=N`, `fabric:SECTION`, `NAME_1`/`NAME_2` split names.
- **Pieces:** `join` (with `pick_up … per`, `mult`), `pick_up A per B`, `cast_on … using`, `ws` on start statements,
  `top_down`, `round`/`flat` statements, piece `fold`, `resume`, `like … mirrored`/`until` with a body, pieces that end
  live or held.
- **Flow:** `repeat until`, `if`/`else if`/`else` (also at the top level), `define`, `at_same_time`; `&& || ! in` in
  expressions.
- **Fabrics and colour:** written rows (with `(…)in1`, `bo`), `stitch`, `chart`, named yarns, `stripes`, `needle`,
  per-fabric gauge, `bind_off using "…"`.
- **Assembly:** `seam … using`/`ease`/`gather`, `zipper LEN`, `buttons`, `fold`, new `place` spots,
  `expect width|length`, named and ranged horizontal edges, `neck.1`/`neck.2`, `piece.row[…]`.
- **Lexical:** quoted enum options, per-size lists and `${}` in every numeric position, verbatim chart bodies.
- **Semantics:** the rules under [Semantics](#semantics-v2).

## Tips

- See [docs/USE_CASES.md](docs/USE_CASES.md) for what real patterns need and how each need maps onto this spec.
- Add an `expect` line wherever the written pattern states a stitch count, so the checker can verify the translation.
- Translate every size the pattern gives, and make the gauge a param when the pattern says "check your gauge".
