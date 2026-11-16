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
- Lengths are a number followed by `in` or `cm`: `2.5in`, `6cm`.
- `name:value` with no spaces attaches a count or a section to a name: `garter:6`, `back:52`, `checked:front`.
- `piece.name` refers to part of a piece: an edge, a marker, a section or held stitches.
- (v2) Names are letters, digits and `_`, start with a letter, and can't be keywords. Within a piece, markers, sections,
  holders and named cast-ons share one namespace.
- (v2) `chart` bodies are read verbatim: no `${}`, per-size lists or `;` inside them.

## Header

| Statement | Meaning |
|---|---|
| `pattern "Name"` | Pattern title |
| `source URL` | Link to the original pattern |
| `gauge S sts x R rows = N in\|cm` | Stitches and rows per N inches or cm |
| `gauge FABRIC [on NEEDLE] S sts x R rows = N in\|cm` (v2) | Gauge for one fabric and/or needle. The most specific match wins |
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
  - Use `0` for a size that skips a step.
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

Rows alternate RS/WS starting with row 1 = RS, unless the piece is `round`.

(v2) `like` options:

- `mirrored` swaps `left`/`right`, the order of sections and fabric parts, and `using` pairs (cardigan fronts). A bind-off
  that lands at the end of a row moves to the start of the next row, as written patterns do.
- `until MARKER` copies OTHER only up to that marker ("work as for back to armhole").
- Body statements continue after the copied rows. A start statement in the body replaces OTHER's.

### Start statements

Exactly one, on the first line of the piece.

| Statement | Meaning |
|---|---|
| `cast_on N` | Cast on N stitches |
| `cast_on N [using METHOD] [ws]` (v2) | `ws` = the first row is a WS row. METHOD is informational: `long_tail`, `provisional`, `tubular`, … |
| `pick_up N from EDGE` | Picks up from an earlier piece's edge, and the piece is placed automatically |
| `pick_up A per B from EDGE [mult M]` (v2) | A stitches for every B rows (or stitches) of the edge, rounded to a multiple of M |
| `join PART + PART + …` (v2) | Starts from stitches of other pieces, in the order worked |

(v2) A `join` PART is one of:

- `piece.SECTION`, `piece.HOLDER` or `piece.live` (all of them): live or held stitches. Each can be used once;
- `cast_on [NAME:]N`;
- `pick_up [NAME:]N from EDGE`, which takes a single edge (the next `+` starts the next part).

Each part becomes a section of the new piece, named after its source (`body.back` → `back`, `sleeve.live` → `sleeve`).
Parts whose names clash are named `piece_section` instead (`sleeve_l_arm`, `sleeve_r_arm`).
Example: `join pick_up 21 from front.neck + front.fneck + pick_up 21 from ~front.neck + back.bneck`.

### Statements

| Statement | Meaning |
|---|---|
| `row [FABRIC] [SHAPING…]` | Work one row. (v2) the fabric is optional; see [Fabrics](#fabrics) |
| `rows N [FABRIC] [SHAPING…]` | Work N rows, applying the shaping on every row |
| `rows 2in [FABRIC]` | Work enough rows to add that length |
| `rows until COND [FABRIC] [SHAPING…]` | Work until a condition holds (rounds up) |
| `rows NAME` / `rows NAME[a:b]` (v2) | Work every row, or rows a to b, of a `stitch` or `chart` once |
| `repeat N { … }` | Repeat a block |
| `marker NAME` | Name the current **row** so edges and lengths can refer to it. `start` and `end` always exist |
| `sections NAME:N …` (v2) | Name runs of live **stitches**; see [Sections](#sections-v2) |
| `expect N [N …]` | Assert the live stitch count. After a split, give one number per section |
| `expect NAME=N …` (v2) | Assert the count of named sections |
| `expect width\|length LEN [within LEN]` (v2) | Assert a finished measurement at this row (default tolerance 3%). In the round, width is the circumference |
| `yarn NAME`, `stripes …`, `needle NAME` (v2) | See [Colour](#colour-v2) |
| `round` / `flat` (v2) | Switch mode mid-piece: "join to work in the round", "turn and work back and forth" |
| `bind_off [using METHOD]` | Bind off all live stitches, forming the top edge. (v2) METHOD is informational: `rib`, `picot`, `tubular`, … |
| `gather` | Thread yarn through the live stitches and pull tight (hat crowns) |

(v2) A piece may end with live stitches. They stay available to `join` and to `seam … using graft|3needle`. Live
stitches that nothing uses are a warning.

### Row conditions and schedules

`until` conditions (used by `rows until` and, in v2, `repeat until`):

| Condition | Meaning |
|---|---|
| `18in` | The piece measures 18in |
| `9in from MARKER` | Measured from a marker |
| `9in from PIECE.MARKER` (v2) | Measured back through a `join` or `pick_up` into the source piece: `until 12in from yoke.start` |
| `match PIECE` | Same row count as another piece |
| `N sts [in SECTION]` (v2) | The stitch count reaches N. Overshooting is an error |
| `fits EDGE` (v2) | The piece is as long as that edge (bands) |

(v2) Any length or condition may be followed by `ending ws`, `ending rs` or `ending row K` (row K of the current stitch
pattern or chart). It adds rows until that is the last row worked: `rows until 7in ending ws`.

(v2) A schedule goes between the fabric and the shaping, and limits the shaping to some rows of the run:

| Schedule | Shaping happens on |
|---|---|
| `every K [from row F]` | rows F, F+K, F+2K, … of the run. F defaults to K |
| `spaced N [from row F]` | N rows spread evenly from row F (default 1) to the last row |

```knit
rows until 44 sts st every 6 from row 5 inc edges    # "inc each end of 5th and every foll 6th row to 44 sts"
rows 24 every 4 dec edges ; rows until 15in          # "dec every 4th row 6 times, then work even"
rows until fits front.left rib1x1 spaced 5 from row 4 buttonhole center
```

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
including its place in a multi-row repeat. New stitches take the fabric of the part or section they land in.

### Written rows (v2)

A quoted row is read as worked, the way the pattern prints it. Commas are ignored, so text can be pasted.

- Stitches: `k p k1tbl p1tbl sl1 yo m1l m1r m1pl m1pr kfb k2tog ssk p2tog k3tog sssk cdd c4f c4b c6f c6b lt rt`. `k3` = knit 3.
- A bare `k` or `p` fills: `"k3 k2tog k ssk k3"` = "k3, k2tog, knit to last 5, ssk, k3".
- `*…*` repeats to fill and `(…)xN` repeats N times: `"k19 (m1l k39)x5 m1l k20"`.
- The checker verifies that the row uses exactly the live stitches, and computes the new count.
- When a written row stays in force for later rows, they are worked as the stitches present themselves (knit the knits).

`row "*k6 k2tog*"` is the v2 spelling of crown shaping; `dec every 8` remains as an alias.

### Stitch patterns and charts (v2)

Declare both at the top level.

```knit
stitch checked              # written rows, row 1 first; flat: odd rows are RS, even rows as worked on the WS
  1,3: k2 p3                # optional row labels; unlabelled lines are rows 1, 2, 3, …
  2,4: k3 p2
  5,7: p3 k2                # a line with no *…* repeats across the row
  6,8: p2 k3
end

chart leaf                  # a picture of the RS, drawn as printed: the last line is row 1
  key t = k1tbl             # extra symbols: key SYMBOL = [YARN] [STITCH]
  t | . . o ^ o . | t       # |…| marks the repeat; cells outside it are worked once
  t | o / . . \ o | t
end
```

- Add `round` after a `stitch` name if the pattern wrote it in rounds. The engine converts either form.
- A chart cell is one character; spaces are optional. Built-in symbols: `.` knit, `-` purl, `o` yo, `/` k2tog, `\` ssk,
  `^` cdd, `x` no stitch, `<<` lt, `>>` rt.
- A symbol whose stitch is several stitches wide (cables, defined with `key`) fills that many cells: `key c = c4f`, then `cccc`.
- **Colour charts:** a cell that is a one-letter yarn name is a knit stitch in that yarn. Use `key` for longer yarn names
  or coloured shaping: `key d = M k2tog`.
- Rows may change the stitch count. Pad them with `x`; the checker tracks the count per repeat.
- Use them like any fabric: `rows 16 checked`, `rows until 8in leaf`, `st leaf:48 st`, `rows leaf[9:13]`.
- A repeat that doesn't divide the stitches is centred, with a warning.

### Colour (v2)

| Statement | Meaning |
|---|---|
| `yarn NAME` | Switch yarn from this row on. Ends any stripes |
| `stripes A:2 B:4 C:2` | Sticky colour cycle (yarn:rows). It keeps running across statements and shaping until `stripes off` |
| `needle NAME` | Switch needle. Changes the gauge if one is declared `on` that needle |

## Sections (v2)

Sections are stitch markers: named runs of live stitches. (`marker` names a row; `sections` names stitches.)

```knit
sections back:52 sleeve_l:8 front:52 sleeve_r:8     # "pm" between them; one count may be omitted
```

- The counts must add up to the live count. Declaring sections again replaces them.
- Sections follow the shaping. A piece with no sections is one section.
- A neckline split keeps its v1 names: `1` and `2`.
- `piece.SECTION` is a horizontal edge when bound off, and live stitches otherwise.

## Shaping

Canonical form: `VERB [N] WHERE… [using TYPE[,TYPE]]`. N defaults to 1. The v1 order `VERB WHERE N` (`inc edges 2`,
`bind_off center 10`) is an alias when there is a single WHERE.

| Verb | Meaning |
|---|---|
| `inc`, `dec` | Increase or decrease N at each WHERE |
| `bind_off N [WHERE]` (v2) | Bind off N stitches. WHERE defaults to `start`: `rows 2 bind_off 4` = "bind off 4 at beg of next 2 rows" |
| `cast_on [NAME:]N [WHERE]` (v2) | Cast on N mid-piece, default `start`. `center` closes a split (slot neck). NAME makes it a section and an edge |
| `hold [N] WHERE\|SECTION\|all [as NAME]` (v2) | Like `bind_off`, but the stitches stay live as `piece.NAME` (default: the section name) |
| `hold SECTION cast_on [NAME:]N` (v2) | Hold a section and cast on N in its place ("place sleeve sts on waste yarn, CO 8 under arm") |
| `buttonhole [N] WHERE [wide W]` (v2) | N holes, W stitches wide (default 2). The count is unchanged |

| WHERE | Meaning |
|---|---|
| `edges` | Both outer edges of the piece. In the round: both sides of the start of the round |
| `neck` | The edges next to a split |
| `center` | The centre of the row. `bind_off N center` and `hold N center` split the piece for a neckline |
| `every N` | Legacy `dec` only: `*k N-2, k2tog*` across. `dec every 2` = k2tog all |
| `start`, `end` (v2) | The beginning or end of the row as worked. On flat pieces the side alternates |
| `left`, `right` (v2) | A fixed side as seen from the RS. Flat pieces only |
| `markers` (v2) | Both sides of every section boundary: `inc markers` on a 4-section raglan round = 8 increases |
| `evenly` (v2) | N in total, spread evenly: `dec 22 evenly` |
| `at I [I…]` (v2) | I stitches in from the right edge (RS view) or the start of the round. Negative counts from the other edge |
| `SECTION.where` (v2) | Any of the above inside one section: `inc front.edges back.edges`, `inc 6 front.evenly`, `dec 2 front.center` |

- N counts stitches per place. With `evenly` and `center` it is the total.
- (v2) `using` names the stitch: `dec edges using ssk,k2tog`, `inc markers using m1r,m1l`, `inc start using kfb`,
  `dec 2 center using cdd`. In a pair, the first is used at the first place in the row. It affects rendering, not counts.
- Stepped shoulders: `rows 4 bind_off 6`. One-sided: `row dec left`, `rows 6 every 2 bind_off 5 right`.

## Flow control (v2)

| Statement | Meaning |
|---|---|
| `repeat [N] [until COND] { … }` | Stops after N times or when COND holds, whichever is first. COND is checked after every row, so it can stop mid-block |
| `if EXPR { … } [else { … }]` | EXPR needs no `${}`: `if size in XS XL 2X { … }`, `if sleeve == "long" { … }` |
| `define NAME { … }` | Name a block of statements, at the top level or in a piece. Run it by writing `NAME` as a statement |
| `at_same_time { … } and { … }` | Work two or more blocks over the same rows ("AT THE SAME TIME") |

`at_same_time` merges its tracks row by row:

- Row k of the run gets the shaping of row k of every track. A finished track adds nothing.
- Fabric, yarn and stripes come from the one track that sets them; two tracks setting them on the same row is an error.
- Lengths and stitch counts are measured on the whole piece. The run ends when every track is done.
- Tracks hold only `row`, `rows`, `repeat`, `if`, `marker`, `yarn`, `expect` and defined blocks.

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
| `place PIECE at torso\|front_left\|front_right\|shoulders` | Tubes and yokes, cardigan fronts, a piece folded over the shoulders. Pieces started with `join` are placed automatically |
| `seam A = B using METHOD` | `mattress` (default), `whip`, `graft`, `3needle`, `zipper`, `buttons`. Graft and 3needle need live or held stitches |
| `seam A = B ease LEN` / `gather` | Declare an intended length difference so the checker doesn't flag it |
| `fold PIECE at MARKER` | Fold along a row (hem facing, doubled collar). Sew it down with an ordinary `seam` |

### Edges

```
piece.left[a:b]   piece.right[a:b]   piece.bottom
piece.top         piece.top.1        piece.neck
```

- `a`, `b` can be `start`, `end`, a marker name or a row number. A reversed range runs backwards.
- `~EDGE` reverses an edge, and `+` joins edges: `back.neck + front.neck`.
- `left`/`right` are as seen from the right side, so the front's left edge meets the back's right edge.
- `top.N` is the Nth section of a split top. For example, after a neckline the shoulders are `top.1` and `top.2`.
- (v2) `piece.NAME` is a named cast-on, a bound-off section or held stitches. `piece.live` is every live stitch.
- (v2) `piece.row[MARKER]` is a line across the fabric (fold lines, picking up from a row).
- (v2) Horizontal edges take ranges too: `back.neck[start:mid]`, `body.bottom[front]`. The ends can be `start`, `mid`,
  `end`, a section name or a stitch number.

The checker compares seam lengths: within 5% passes, 5–15% is reported as ease, and more than that is a mismatch.

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

- **Rows:** sticky fabric; `until N sts`, `fits`, `from PIECE.MARKER`; `ending`; `every` and `spaced` schedules.
- **Shaping:** `VERB N WHERE` order; `start end left right markers evenly at`; `SECTION.where`; `using`; mid-piece
  `bind_off N`, `cast_on`, `hold`, `buttonhole`.
- **Sections:** `sections`, `expect NAME=N`, `fabric:SECTION`.
- **Pieces:** `join`, `pick_up A per B`, `cast_on … using`/`ws`, `top_down`, `round`/`flat` statements, `like … mirrored`/`until`
  with a body, pieces that end live.
- **Flow:** `repeat until`, `if`/`else`, `define`, `at_same_time`; `&& || ! in` in expressions.
- **Fabrics and colour:** written rows, `stitch`, `chart`, named yarns, `stripes`, `needle`, per-fabric gauge.
- **Assembly:** `seam … using`/`ease`/`gather`, `fold`, new `place` spots, `expect width|length`, named and ranged
  horizontal edges, `piece.row[…]`.
- **Lexical:** quoted enum options, per-size lists inside written rows, verbatim chart bodies.

## Tips

- See [docs/USE_CASES.md](docs/USE_CASES.md) for what real patterns need and how each need maps onto this spec.
- Add an `expect` line wherever the written pattern states a stitch count, so the checker can verify the translation.
- Translate every size the pattern gives, and make the gauge a param when the pattern says "check your gauge".
