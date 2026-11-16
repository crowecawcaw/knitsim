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
