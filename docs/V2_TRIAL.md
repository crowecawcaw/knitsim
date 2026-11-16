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
