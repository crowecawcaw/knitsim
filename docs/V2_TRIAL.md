# Trial run: the 10 corpus patterns in DSL v2

Haiku translated each pattern in [USE_CASES.md](USE_CASES.md) into the v2 syntax of [SYNTAX.md](../SYNTAX.md):

- 5 agents, with 2 patterns each.
- Every line where the spec fell short is tagged `HARD`, `FAIL`, `UNCLEAR` or `INVENTED`.

v2 is not implemented, so the checker could not run. Stitch counts were checked by hand for 2 sizes per pattern, and all
of them matched. The translations are not committed, because they are close to the original pattern text.

## Results

| Pattern | Complete | Main blocker |
|---|---|---|
| Classic Turtleneck | 95% | — |
| Lazy Day Pullover | 90% | garter-in-the-round parity |
| Checked Raglan | 85% | increased sts worked in a different fabric |
| Sampson Lila | 85% | cowl pick-up rule, trinity stitch |
| Simple Soft Baby | 85% | button placement |
| Third Coast | 85% | folded collar knit-together join |
| Cute Casual Cardigan | 80% | button band, stepped shoulders after a held neck |
| Date Night | 60% | lace charts left as placeholders |
| Wheel of Life | 55% | colourwork charts left as placeholders |
| Carousel | 50% | twisted-stitch charts, per-size-group row tables |

Tag totals: 32 HARD, 26 FAIL, 42 UNCLEAR, **0 INVENTED**. Translators never had to make up syntax. The main problem is that
the spec is **underspecified**, not that the syntax is missing. Every v1 translation was approximate, while these are mostly
faithful.

## What worked well

All 5 translators praised these, unprompted:

- `if size in …`
- `repeat until N sts` (it may stop mid-block)
- `expect back=52 …`
- `hold S cast_on NAME:N`
- `join`
- `SECTION.edges`, `markers` and `using ssk,k2tog`
- `ending ws`
- `at_same_time` (neckline and armhole, stripes and decreases)
- `like … mirrored` and `like … until MARKER`
- `rows until … from PIECE.MARKER` (measures through a join)
- quoted size names (`"XS/S"`)
- `gauge FABRIC` and `needle`
- written rows with `(…)xN`

## What didn't work (FAIL)

1. **Charts.** The syntax is fine, but transcribing lace, cable and colourwork charts from images is the bulk of the work. Translators left placeholders (DN, WL, CA).
   - Needs: chart import tooling, or charts drawn in the app.
   - The stitch list is missing `p3tog`, `lli` and `rli`, and `lt`/`rt` have no stated width.
2. **Row-by-row tables per size group.** Carousel's yoke gives rows 3–42 differently for each size group. Per-size lists can't hold whole row sequences.
   - Needs: `if size in …` blocks are the workaround, but a table form would help.
3. **Fabric for new stitches.** "Work increased sts in St st" inside a Checked section (CR) can't be expressed; new stitches take the fabric of their section.
4. **Shaping inset from an edge or marker.** "K3, k2tog" (CC) and "ssk 2 sts before marker" (CR) can't be expressed. `at I` exists, but there is no `inset N` relative to an edge or marker.
5. **Fasteners.**
   - `seam … using buttons` can't place 5 buttons along a band (CC), or put a button 1.5in from the neck opening (BP).
   - A zipper has no length (TC).
6. **Pick-up rules inside `join`.** "2 sts per 3 rows along the neck, plus held sts" (SL): `pick_up A per B` is not allowed as a join part.
7. **Knit-together joins.** A folded hem or collar "knitting each st together with the cast-on" is only an assembly `fold` (SL, TC).
8. **Methods.**
   - There is no method for a mid-piece `cast_on` (backward loop).
   - Custom bind-offs like "*BO 4, m1, BO this st*" (DN) can't be written.
   - There is nothing for stranding two yarns in a plain round without a chart (WL).
9. Blocking or stretched measurements, which were already known as uncovered.

## What's unclear (UNCLEAR)

These are the cheapest fixes: spec wording, not new syntax.

- **Per-size lists:** are they allowed inside `every K`, `repeat N`, `until N sts`, `sections`, and written rows? (raised by 5 of 5 translators)
- **`match PIECE`** counts whole-piece rows, which is wrong after a split or a join. Patterns mean "same length as back *to the underarm*". Allow `match back.underarm`.
- **Row parity.**
  - Does garter in the round alternate knit and purl rounds?
  - Which side does the first row face after a `fold`, a `join`, or a `ws` cast-on?
  - How should "ending with row 2 or 4" be written?
- **Locations.** It's unclear what `start`, `end`, `left`, `right` and `center` mean:
  - inside a section;
  - on a round (where is "center"?);
  - on a split piece.
- **`join`.**
  - Does it consume the joining round?
  - How are sections named from `pick_up` parts?
  - Which fabric carries on when the joined parts had different fabrics?
- **Held stitches.** Can a piece end with only held stitches? In what order do several holds on one row apply? Do `piece.left` ranges cross a split?
- **Reworking held shoulders.** The only way is a new piece started with `join`, which makes every shoulder its own piece.
- **Shaping on the last row of a `rows until` run.** "Inc N sts across the last rib row" has no clean form.
- **`stitch` blocks.** Are unlabeled lines rows 1..n? How does a 2-line stitch repeat?
- **`expect width`.**
  - The default 3% tolerance tripped on a pattern's own numbers (LD XS).
  - Widths across mixed gauges (Checked + St st) aren't defined.

## Hard but possible (HARD)

- Side increases inferred from counts (TC).
- Placed m1s approximated with `inc N evenly` (CA, DN).
- A hold that straddles a marker ("5 sts each side") needs the sections declared again (CR).
- Long fabric:count panel lists repeated per size (CR's 13-part pattern round). A `define`d panel or a section-scoped fabric would shorten it.

## Pattern errata found again

- SL: the printed join-decrease row doesn't add up (72 of 77 sts consumed, giving 67 rather than the stated 72).
- SL: "K19 per side" is impossible with 72 sts on the needle.

## Suggested next steps

1. **Tighten the spec** on the UNCLEAR list. Above all, say that per-size lists are allowed everywhere.
2. **Add primitives:**
   - `inset N` for shaping (`dec right inset 3`, `dec markers inset 2`);
   - a fabric for new stitches (`inc … as st`);
   - `pick_up A per B` as a join part;
   - `match PIECE.MARKER`;
   - `buttons N on EDGE [spaced|at …]` and `zipper LEN`;
   - a knit-together fold (`fold … join`).
3. **Implement**, starting with sections, the `VERB N WHERE` form, and `hold`/`join`.
   - Those 3 features unlock most of the 85%+ translations, which can then be run through the checker.

## Spec revision

SYNTAX.md was revised after this trial. Cross-cutting rules are in its new "Semantics" section. Nothing below is implemented yet.

### FAIL items

| Item | Resolution |
|---|---|
| Charts: transcription effort | No image import. Typing is shorter: `chart NAME odd` (only odd rows drawn), run counts (`.5`), `stitch` labels `odd:`/`even:`/`1-4:`. The spec now says how repeats work across, up, when they don't fit, and under shaping. |
| Missing stitches | Added `p3tog lli rli m1 m1p k2togtbl ssp`, any `cNf`/`cNb`, and `(…)in1` (trinity stitch). `lt`/`rt` are 2 stitches wide. |
| Row tables per size group | `if size in … { … } else if … { … } else { … }`, with an example. No table form was added. `if` may also wrap top-level `chart`/`stitch`, so a panel can differ per group under one name. |
| Fabric for new stitches | `inc … in FABRIC`, `cast_on … in FABRIC`. |
| Shaping inset from an edge or marker | `inset I` after the places: `dec edges inset 3`, `dec markers inset 1`. |
| Buttons | `buttons N on EDGE [at LEN …]`. `seam … using buttons` is now defined as an overlapping closure. |
| Zipper length | `seam A = B using zipper LEN`. |
| Pick-up rule inside `join` | `pick_up A per B from EDGE` is a join part; `(edge + edge)` in a part; a trailing `mult M` rounds the total. |
| Knit-together fold | Piece statement `fold [at MARKER]`: one row that knits the live stitches together with the cast-on. |
| Mid-piece cast-on method | `cast_on … using METHOD` (informational). |
| Custom bind-off | `bind_off using "*bo4 m1 bo*"`, with the new written-row word `bo`. |
| Two yarns in a plain round | A one-line colour chart (`M C`). Colour inside written rows was not added. |
| Two gauges, needle changes (DN, WL) | Already covered. Clarified: a `gauge` may name a fabric declared later, and `needle` labels are free text. |
| Turning the cowl WS out (SL) | No syntax: write the fabric as it looks from the finished outside. |
| Blocking, stretched lengths, finishing notes | Still not covered. |

### UNCLEAR items

| Item | Resolution |
|---|---|
| Per-size lists and `${}` | Allowed wherever a number or length may stand; the positions are listed. Exceptions: `param` lines and chart bodies. `0` is a no-op. A list of the wrong length is an error. |
| `match PIECE` | Added `match PIECE.MARKER` and `match PIECE[a:b]`, with an optional `from MARKER` on this piece. |
| Garter in the round | A fabric is the RS look: garter alternates knit (row 1) and purl (row 2) rounds. "Next knit round" = `ending row 2`. |
| First row after `fold`, `join`, `ws` cast-on | Start statements are not rows; row 1 is RS unless the start statement ends with `ws` (now also on `join` and `pick_up`). `flat` and `resume` restart at RS unless `ws`. A piece `fold` is one row. |
| "Ending with row 2 or 4" | `ending row 2,4`. `ending` adds the fewest rows, and they are ordinary rows of the run (stripes keep running). |
| `start`/`end`/`left`/`right`/`center` | Defined in the WHERE table for sections, rounds (`center` = halfway round; `edges` = either side of the round start) and split pieces (the outer edges of the whole row). |
| Does `join` consume a round? | No. The first `row` after it is the joining round. |
| Section names from join parts | From the source; `NAME:` on `cast_on`/`pick_up` parts; otherwise `p1`, `p2`, … by position. |
| Fabric after `join` | Each live part keeps its fabric and its place in the repeat. New parts are `st`. Yarn and needle come from the first live part. |
| Piece ending with held stitches only | Allowed. |
| Several holds in one row | Applied in the order written (= the order worked). Counts refer to the stitches before the row. Places that touch merge into one run. |
| `piece.left` across a split | Yes: `left`/`right` are the outer edges for the whole height. `neck.1`/`neck.2` name the two neck sides; `1` is the left side seen from the RS. |
| Reworking held shoulders | `resume HOLDER` continues held stitches in the same piece. |
| Shaping on the last row of an `until` run | Schedule `last`. With `until N sts`, the run ends right after the row that reaches N. |
| `stitch` blocks | Unlabelled lines are rows 1…n; labels are all or none. As a fabric the rows cycle, so a 2-line stitch alternates. |
| Written `k` on a WS row | Written rows are always as worked. |
| Rib phase after another fabric | Naming the fabric in force continues it; a different fabric starts at its row 1, aligned to the right edge. Leave the fabric out to continue as established. |
| `expect width` tolerance | Same thresholds as seams: 5% passes, 5–15% warns, more is an error. `within LEN\|P%` makes it strict. |
| Width over mixed gauges | The sum of the parts, each at its own gauge. Row height comes from the fabric covering the most stitches. |
| Lengths after a hem fold | Measured from the fold line after a piece `fold`; `from MARKER` otherwise. |
| `place … at shoulders` fold line | The middle row, or the `fold` marker. |
| Placement of joined pieces | Pieces linked by `join` or `pick_up` move together; place one of them. |
| `${}` in a named yarn colour | Allowed: `${}` is replaced as text before parsing. |

### Not changed

- Start-of-round marker moved mid-piece (CA sleeves): only at a `join`, by splitting a part with a range.
- Placed increases written as `inc N evenly`: use a written row for exact positions.
- Long `fabric:count` lists (CR): after the first row, sticky per-part fabric makes later rows short. No panel macro was added.

## Round 2: the revised spec

The same 10 patterns were translated again from scratch by Haiku, against the revised SYNTAX.md. Each translator then
sorted every tag from round 1 into resolved, still open, or made worse. This round also asked for full chart
transcription (DN, WL) and Carousel's per-size yoke table.

| Pattern | Round 1 | Round 2 | Notes |
|---|---|---|---|
| Wheel of Life | 55% | 90% | both charts transcribed |
| Date Night | 60% | 80% | both charts transcribed; 5 chart rounds left as placeholders |
| Carousel | 50% | 75% | yoke rows 1–42 for all 9 sizes are now complete |
| Lazy Day | 90% | 95% | |
| Checked Raglan | 85% | 90% | |
| Classic Turtleneck | 95% | 90% | corrected two round-1 mistakes |
| Sampson Lila | 85% | 85% | the remaining gaps are mostly the pattern's own errata |
| Third Coast | 85% | 85% | fixed round-1 count and placement errors |
| Simple Soft Baby | 85% | 85% | |
| Cute Casual Cardigan | 80% | 80% | |
| **Average** | **76%** | **86%** | |

Round-1 tags (103):

- **67 resolved** (65%).
- **36 still open.** 17 of them are in the two chart patterns, and several are pattern ambiguities ("desired length", errata).
- **1 made worse**: re-declaring `sections` drops the name of a cast-on edge.
- **49 new tags.** Most are finer-grained, the kind of question that only comes up once the bigger gaps are closed.
- **0 invented syntax.**

### Remaining problems by theme

1. **Rows with several shaping places.** This was the most common new friction.
   - Raglan rounds need asymmetric insets (M1R on the marker, M1L one stitch in), and each place has to be written as its own item.
   - It's unstated how a `using` pair alternates over explicit places, and whether touching places merge.
   - Purl-side M1PR/M1PL are needed on WS rows.
   - It's unclear what `SECTION.start`/`end` means on a WS row.
   - Idea: allow marker tokens in written rows, so `"*k to 1 before m, m1r, k1, sm, k1, m1l*"` reads exactly like the pattern.
2. **Start of the round.**
   - The start can't be moved (CA, TC divide at the underarm).
   - A chart can't start mid-round alongside knit sections (DN).
   - Sub-ranges of a chart had to be copied as separate charts.
   - Need: `round_start at SECTION.start`, and a chart offset (`row 25 of chart`) for a part of a row.
3. **Phase.**
   - Rib phase is still missing (`rib2x2` that starts with p2).
   - It's unclear whether `st` restarts its RS/WS phase after a written row.
   - `mirrored` doesn't say how the RS/WS phase works.
   - Does a fold happen on the marker row or the row after it?
   - Rounds can't be worked WS-out (a turned cowl).
4. **Held stitches and edges.**
   - Held counts can't be checked with `expect`.
   - A pick-up from a cast-on edge that now sits inside a held section may not resolve.
   - Split halves have no markers for side-seam ranges.
   - `resume` versus `from MARKER` lengths is unclear.
   - The sleeve cap has no named edge.
5. **`repeat until`.** It stops after any row. Patterns sometimes mean "after whole repeats", so both are needed (`until … at block end`).
6. **Partial measurements.** You can't assert yoke depth, upper arm, cuff, or chest across a folded one-piece garment. `expect width` only measures a whole row.
7. **Small vocabulary gaps.**
   - `p2togtbl`;
   - a slipped edge on WS rows only;
   - a reversed seam for a turned-back collar;
   - needle labels per section;
   - graft pairing;
   - finishing and blocking.
8. **Charts are expensive.** Transcribing the DN and WL charts from images took about 55 tool calls. The errors included a row offset, misread symbols, and columns off by one, all caught only by pixel checks and row-balance arithmetic. The syntax is fine. The cost is input, and that argues for chart tooling: an in-app chart editor, or image-assisted entry with row-balance validation.

## Corpus 2 revision (round 1 of 3)

The corpus was widened to 37 non-sweater patterns: hats, mittens, gloves, socks, skirts, shorts, tops, shawls,
blankets, bags and toys (see [USE_CASES.md](USE_CASES.md#corpus-2-other-objects)). They were read and judged against
the spec; no translations have been run yet. The spec was then revised and split: SYNTAX.md is the core reference, and
written rows, charts, 3D objects and the worked examples moved to [docs/syntax](syntax).

A few general mechanisms carry most of the new use cases:

- **Row ends and stops in written rows.** `turn` (short rows), `slide` (two-pass rows), and the stops `|` (marker) and
  `^` (the gap of an earlier turn). Rows no longer have to cover every stitch, so each stitch column keeps its own row
  count.
- **Positions.** One grammar for range ends and points (`start mid end`, ±N stitches, lengths, markers, offsets), used
  on edges, on held and live stitches, and on lines drawn on the fabric (`piece.row[R][a:b]`, `piece.col[P][a:b]`).
  Partial holders, afterthought openings, surface pick-ups, tacks, trims and embroidery all use it.
- **`join` in mid-piece**, `hold` without a row, and `round_start`.
- **`for`, `define` with arguments and `let`** for modular pieces, templates and a second size axis.
- **Closing and filling:** closed cast-on methods, `close`, `gather EDGE`, `icord`, `stuff`, `trim`, `embroider`, `finish`.

### How the Round-2 themes were resolved

| Round-2 theme | Resolution |
|---|---|
| 1. Rows with several shaping places | Marker tokens in written rows: `"*k1 m1l k m1r k1 \|*"` reads like the pattern, with a fill per section. `each.where` shapes the same place in every section. A `using` pair alternates over explicit places. `SECTION.start`/`.end` are as worked, like `start`/`end`. `m1pl`/`m1pr` were already there. |
| 2. Start of the round | `round_start WHERE` moves it (`sole.center`, `at 16`, `at -1`), and a section may straddle it. A chart part can start mid-chart: `st leaf[25:32]:48 st`. Per-size chart columns still need one chart per size group. |
| 3. Phase | A rib that starts with purls is a written row (`"*p2 k2*"`). Built-in fabrics are defined by their RS look, so `st` has no phase to restart, and `mirrored` never changes which rows are RS. The fold line is the marker's row. Open: rounds worked WS-out (an assembly `fold … out` shows the WS of a cuff, nothing more). |
| 4. Held stitches and edges | `expect NAME=N` checks holders. Named cast-on and bind-off edges survive a new `sections` line (the item round 2 made worse). Markers belong to the piece, so split halves can use them in ranges. After `resume`, `from MARKER` counts on the columns being worked. Point markers (`marker NAME WHERE`) and positions name stretches of any edge, which covers the sleeve cap. |
| 5. `repeat until` granularity | `repeat until COND whole { … }` checks only after each full pass of the block. Without `whole` it still stops after any row. |
| 6. Partial measurements | `expect length LEN of EDGE` measures any edge or row line (`of sleeve.row[upperarm]`, `of body.row[chest][front]`), and `at WHERE` measures up one column (yoke depth at the centre back). |
| 7. Small vocabulary gaps | Added `p2togtbl`, `sk2p`, `kfbf`, `yo2`, `k1b`, `sl1wyif`/`sl1wyib`, seam methods `backstitch` and `tie`, `fold … out`, `note "…"` for finishing text and `finish block\|felt` for blocked sizes. Graft pairing of one tube is `close A B`. Not changed: a slipped edge on WS rows only (write the rows), needle labels per section. |
| 8. Charts are expensive | No syntax change; it is still a tooling problem. `chart … mosaic` halves the typing for slip-stitch colour, and `stitch` lines may now use every written-row feature. |

### Proposals not taken

- `short_rows … step … pairs …` and `@gap`/`@ds` targets: `turn` plus `^-N` in a `repeat` says the same.
- `afterthought`, `cut`, `pin`, `tack`, `cinch`, `attach`, `eyes`, `tassel`, `elastic`, `drawstring`, `insert`, `roll`:
  covered by row lines with `.below`/`.above`, point markers, seams to points, `gather LINE` and `trim KIND`.
- `before_markers`/`after_markers`, `row each "…"`: `each.start`/`each.end` and `|` inside a repeat.
- `group`, `piece NAME x4`, `edge NAME = EDGE` aliases, a second list separator for two size families: `for` and `let`.
- `shape mitre`, `center_out`, `place … rotate`, a `double` fabric, `chart … wrap`, chart column ranges: left to the
  engine or to existing syntax.
- A knitted-in join of two pieces (`row attach other.live`), a casing left open, "until the yarn runs out": seen once
  each; listed as open in USE_CASES.md.

### Engine work this implies

Short rows, mitres, toys and centre-out shapes all need two things the v1 engine doesn't have: a row count per stitch
column, and a layout computed from how stitches connect, not one rectangle per piece.

## Corpus 2 — round 1 test and spec revision 2

Five hard corpus-2 patterns were test-translated by Haiku with the Round-1 spec. The spec was then revised again.

| Pattern | Done | Main issues |
|---|---|---|
| MIB mitered blanket (25 joined squares) | 90% | No garter gauge; pick-up count not checked against the edge; overall size not assertable; mitre edge names and `center` on odd counts unclear. The spec's own mitre example was wrong (56 rows, two colours). |
| GAM shorts (2 families × 5 sizes) | 90% | FAIL: "desired length" target, "remove marker". Size families and per-family yarn; short rows inside a cable panel; "work to CB marker"; what `resume` restores; pick-up starting mid-edge. |
| NBP toy head | 80% | FAIL: pattern count errata (not syntax); hand shaping of the nose. No name for a cast-on run inside a written row or for a point between short-row blocks; sticky fabric after written rows; `start` on WS rows; `mid` on a two-edge seam. |
| GLV gloves (5 sizes, both hands) | 90% | FAIL: per-needle counts; length cuff→fingertip. Size-dependent leftover in a tip round; `like` doesn't copy joins; width of a tube vs flat width; empty fills; holder and section with one name. |
| PAL socks (two socks in one tube) | 80% | FAIL: unravelling the tube into two socks; two placements. Pattern phase across turned short rows; rib phase per size; order of the closing round after a heel; which section owns an increase beside a marker. |

### Resolutions

FAIL:

- Separate one piece into two (PAL) → top-level `cut PIECE at ROW [to ROW] as A B`; the ends are live `A.top`, `B.bottom`.
- One piece on both feet or hands (PAL, GLV) → `place PIECE at SPOT SPOT [mirrored]` makes the piece and its joined pieces twice.
- Per-needle counts (GLV) → needles are sections: `sections front:23 back:21`, `expect front=23 back=21`. No new syntax.
- Length across pieces (GLV, MIB) → `expect length LEN from POINT to POINT`, the shortest distance over the fabric through joins.
- Remove a marker (GAM) → `sections NAME = A + B` and `sections off`.
- "Desired length" (GAM) → a `float` param used as a target (`rows until ${rise - 2.25}in at front.center`); its default may be a per-size list.
- Hand shaping (NBP) → out of scope: `note`, or a tack (`seam POINT = POINT`) when the shape matters.
- Pattern count errors (NBP) → not syntax: translate as printed, keep the printed `expect`, add a `note`.

UNCLEAR:

- `center` on odd and even counts → middle stitch, or the gap between the two middle stitches; an off-parity run leaves the extra stitch on the `end` side.
- `mid` on a two-edge seam → a position applies to one edge, or to a parenthesised sum: `(a.left + b.left)[mid]`.
- Sticky fabric after written rows → a single `row "…"` is a one-off and leaves the fabric in force; `rows N "…"` sets it. A piece starts in `st`.
- `start` on WS rows, point markers → `marker NAME WHERE` reads WHERE on the row just worked, as worked; `left`/`right` are fixed.
- `resume` after `hold all` → restores sections, per-part fabric and phase, yarn and needle exactly.
- Section and holder with one name → a name follows its stitches (no clash); reusing it for other stitches is an error.
- Owner of an increase beside a marker → the section of the stitch it is worked into; a strand increase goes to the section worked last unless `|` comes first; in a written row, the segment it is written in.
- Closing round after a short-row heel → the first unturned row runs from the last turn to the end of the round; the next round, from the round start in section order, closes the rest. `round_start` changes where it begins.
- `expect width` in the round → the circumference; `expect width LEN flat` is half of it.
- Empty fills → a fill and a `*…*` may be empty.
- Fabric parts with sections → FABRIC:SECTION, `row st:k_a cable:cp st:k_b`.
- Pick-up starting mid-edge → two ranges in a parenthesised sum.
- Quoted enum options in `if` → `if size in "XS/S" M`.
- Magic-loop "turn the work" → not a `turn`.
- Block order → header, `stitch`/`chart`/`define`, pieces in knitting order, `assemble`.
- `slp1 wyif` → `sl1wyif`; slip direction is not recorded.
- Mitre edges → `bottom` is the whole cast-on, `left`/`right` the row-end edges that meet at the last stitch (objects.md).

HARD:

- Pattern phase across turned short rows; partial panel; "work to CB marker" → the fill word `pat`/`patN` ("in pattern") and the stop `|NAME[-N]`; each stitch column keeps its own pattern row.
- Rib phase per size; chart start column per size → `FABRIC shift N`, N may be a per-size list.
- Size families and per-family yarn → `param size enum women(…) men(…)`, `//` between groups in lists, `if size in women`, top-level `if` round any header statement.
- Trailing remainder in a repeat → optional group `(…)?` after `*…*`: `"*k2tog k2* (k2tog)? k"`.
- `like` and joins → the `for h in l r` idiom is the stated form for differing hands; pairs use `place … at SPOT SPOT`.
- Naming a cast-on run in a row; points between short-row blocks → `WORD:NAME` (`co3:nose`, `bo8:slot`, `k12:lid`) and a bare `:NAME` point.
- Garter gauge → with no `gauge garter` line garter is taken as square (rows = 2 × stitches), and the checker says so.
- Pick-up count vs edge length → every `pick_up N` is compared with its edge; ratio reported, warning beyond 15%, never an error.
- Outer edges and cast-on legs of modular pieces → `cast_on a:28 corner:1 b:28` (named runs), `bottom[start:mid]`, and the `from … to` measure for the overall size.
- Opposite cable rotations → `stitch` bodies expand `${}`: `let lc = c6b` in a top-level `if`.
- The mitre example now has 55 rows, one colour, and asserts the blanket's size.

Not changed: cable phase that depends on knitted length; hip and leg circumference with no stated location; positions
given only in figures; "same reps as leg 1" (still `match PIECE[a:b]`, which counts rows); steeks (a cut up a column).

## Corpus 2 — round 2 test and spec revision 3

Three patterns were test-translated by Haiku with the revision-2 spec: Palindrome again, and two new ones. This was
the last round; the spec was revised once more.

| Pattern | Done | Main issues |
|---|---|---|
| PAL socks (retest) | 80% → 90% | Solved since round 1: unravelling (`cut … to … as`), two placements, per-size rib phase (`shift`), LLI/RLI ownership, `slp1`. FAIL: no way to put the heel centre in EOP before the short rows, so `pat` read it as `st`. Still unclear: order of the resolve round; `shift` on a section part. "Same length as leg 1" counted rows. |
| GOA Gothic Arches socks (new) | 85% | FAIL: KYOK (3 in, 3 out) left as an unknown word, so every row with it miscounted. Cable crossing the round start; `round_start at -1`; printed counts that are wrong; "until all sts are worked"; per-size values inside `${}`; `pfb`; `sl1 wyif`. |
| KKT Kate's Kitten (new) | 95% | FAIL: a mouth of two Vs; yarn split to half thickness. "Gauge not important"; psso; I-cord first round; facing of surface pick-ups; default `stuff`; `like` with its own start. |

### Resolutions

FAIL:

- Section fabric without a row (PAL) → the statement `fabric FABRIC…` sets the fabric in force and works nothing: `fabric eop`, `fabric eop:hc`. A fabric with no section runs across the markers.
- User-defined multi-stitch operations (GOA) → no new form: `key NAME = STITCHES ["text"]` with an `(…)inN` body (`key kyok = (k1 yo k1)in3`), now documented as the place for every pattern abbreviation; plus `key NAME = A to B "text"` for counts only. An unknown word in a row is an error.
- V / lazy-daisy embroidery (KKT) → `embroider path at P P P …` (one thread through the points) and `embroider daisy`; any other KIND is drawn as `straight`.
- Split yarn (KKT) → fractional strands: `yarn fine = CC1 x0.5`. Drawn thinner; no effect on gauge.

HARD:

- Cable crossing the round start → `overN` ends a round N stitches late; the next round is N shorter; the start does not move.
- Loose gauge → `gauge approx …`: size mismatches are reports only; counts are checked as usual.
- psso → `psso`, `p2sso` (pass the stitch before the last over it). Also `pfb`, `slN`.
- `sl1 wyif`/`wyib` → already `sl1wyif`/`sl1wyib`; the spaced spelling is accepted, and `sl1` is defined as yarn on the WS.
- Per-size lists inside `${}` → a `let` name holding a list is the current size's value in an expression.
- "Same length as" → `match length PIECE[a:b]` compares lengths; `match … ±N` adjusts by rows ("less one row").
- Pattern errata → `expect … printed ["text"]`: reported as an erratum beside the computed value, not an error.

UNCLEAR:

- Resolve order after a short-row heel → one rule with or without `join`: the first unturned row runs from the needle to the end of the round, the next round closes the rest; a different printed order is the same round. KDS/PDS are plain `k`/`p`.
- `round_start at -1` → forward moves work the stitches passed; backward moves work nothing, and the next round is N shorter. Fabrics and sections stay on their stitches.
- `shift` with a section part → after the part: `rib1x1:ia shift 1/0`, that part only.
- Increases on both sides of `|` → in a written row every stitch belongs to the segment it is written in; this overrides the worked-into rule.
- "Until all sts are worked" → the condition `worked [in SECTION]`; `(k1)?` for a last pass with nothing left.
- I-cord first round → an ordinary row: worked, counted, measured.
- `like` with another start → start statement, then the copied rows, then the body.
- `~` and facing of pick-ups → RS of the source always faces; on a surface line the new piece's RS faces the left of the direction of travel (the cast-on for a row line; the top with `~`).
- Default `stuff` → filled to the knitted shape without stretching; `firm` about 10% wider, `light` soft.
- One-off `row` and per-section state → a one-off stands in for one pattern row of the stitches it works and sets no fabric, also as one part of a row.

### Remaining open

- Face and feature positions given only in photos; which sock of a cut pair is the left one (translator's estimate, `note`).
- A gap that has an extent ("sew the gap between the legs closed"): still a single-point tack or a `col` line chosen by hand.
- Edge stitches beside a chart that differ per size inside one section (GOA foot): needs extra sections.
- Rejoining rounds where the pattern redistributes stitches while decreasing (GOA after the heel): written per size in `if`.
- "Without breaking the yarn" between pieces (yarn continuity) is a `note`.
- Cable phase that depends on knitted length; curved attachment lines; a second piece's live stitches knitted into a row;
  a casing left partly open; "until the yarn runs out"; double-knit drawn as two layers; steeks.
- None of revision 3 is implemented; `overN`, `until worked` and `fabric` have not been tested by a translator.

## Corpus 2 — round 3 test (after spec revision 3)

| Pattern | r1 | r2 | r3 | Remaining |
|---|---|---|---|---|
| PAL Palindrome socks | ~80% | ~90% | ~90% | all r2 tags solved; `fabric` restart-vs-continue contradiction; `cut … to ROW` keeps or unravels? |
| GOA Gothic Arches socks | – | ~85% | ~85% | no FAIL left; heel rejoin and foot length approximate |

Solved in r3: heel-centre EOP (`fabric eop:hc`), KYOK (`key … in3`), cable across round start (`overN`), "same length as" (`match length`), per-size `let` in `${}`, `repeat until worked`, `expect … printed` for errata, pfb.

Open for the next revision:
- `fabric` text says the next row is row 1, the phase rule says it continues: pick one (and how `shift` interacts with a fabric already in force).
- Forward `round_start at N` after a finished round: are the N stitches worked? (also "move sts without working them").
- `cut A at R to R2`: are rows between kept or unravelled; must `at` be a row marker?
- Does `|` in a written row create sections that persist for later `:SECTION` rows?
- One-off `row "…"` vs sticky fabric still confuses translators.
- "Knit to the midpoint and stop" without turning needs `hold` first.
- Rib phase when one run crosses a section boundary.
- "As they appear" after a chart's last row: does it cycle?
