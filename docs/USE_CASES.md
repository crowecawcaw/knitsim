# Use cases the Knit DSL must cover

This list was gathered by translating 10 free sweater patterns into the DSL (see [SYNTAX.md](../SYNTAX.md)). For each one we
noted every instruction the language could express, express only awkwardly, or not express at all. The patterns themselves
are not stored here. Each entry links to its source and quotes only short, characteristic phrases.

Status:

- ✅ supported
- 🟡 possible but awkward (the workaround is described)
- ❌ gap (the "Proposed" syntax is only a sketch)
- 🐞 engine bug

## Pattern corpus

| ID | Pattern | Construction | Sizes | Result |
|---|---|---|---|---|
| LD | [Lazy Day Pullover](https://leeleeknits.com/chunky-knit-sweater-pattern-the-lazy-day-pullover/) | top-down garter raglan, in the round | 7 | passes, approximated as 4 flat yoke panels |
| CR | [Checked Raglan](https://knitty.com/ISSUEss17/PATTraglan/PATTraglan.php) | bottom-up seamless raglan, textured panel | 7 | passes, but the yoke join is not connected |
| WL | [Wheel of Life](https://knitty.com/ISSUEw20/PATTwheel/PATTwheel.php) | bottom-up stranded colourwork yoke | 9 | 8/9 sizes pass ("dec 22 evenly" from 150 can't be expressed) |
| DN | [Date Night Pullover](https://knitty.com/ISSUEff11/PATTdatenight.php) | top-down lace yoke, shell/tunic variants | 7 | passes; lace is replaced by `st` |
| CA | [Carousel](https://knitty.com/ISSUEff26/PATTcarousel.php) | saddle strips → picked-up V-neck yoke, twisted stitches | 9 × 2 sleeve lengths | passes, approximated |
| TC | [Third Coast](https://knitty.com/ISSUEdf24/PATTthirdcoast/) | folded collar, flat raglan yoke with zip, stripes, high-low split hem | 9 | passes, approximated |
| SL | [When Sampson Met Lila](https://knitty.com/ISSUEdf11/PATTlila.php) | flat pieces, folded hem, waist shaping, gathered set-in sleeves | 7 | counts pass; the gathered-cap seams fail (by design) |
| BT | [Classic Turtleneck (Bernat)](https://www.allfreeknitting.com/Knitted-Sweaters/Classic-Turtleneck-Sweater-from-Bernat) | flat set-in sleeves, picked-up turtleneck | 6 | 5/6 pass (largest sleeve cap is 16% short) |
| CC | [Cute and Casual Cardigan (Patons)](https://www.allfreeknitting.com/Knit-Cardigans/Cute-and-Casual-Cardigan-from-Patons) | flat cardigan, bands grow into a shawl collar, buttonholes, stripes | 6 | counts pass; the cap seam fails in 2 sizes |
| BP | [Simple and Soft Baby Pullover](https://www.allfreeknitting.com/Baby-Sweater/Simple-and-Soft-Baby-Pullover-from-Red-Heart) | one piece, hem → over the shoulders → hem, slot neck | 3 | passes |

The checker also caught real errata in the published patterns:

- SL: the front split counts don't add up.
- CC: the buttonhole collar row count is wrong.
- WL: one sleeve line is shifted one size to the left.
- CC, size L: the V-neck overshoots the armhole depth by one row.

## Engine bugs

- 🐞 **Fixed.** `inc edges N` / `dec edges N` ignored N and did nothing (`dec neck N` worked only by accident). Seen in all 10 patterns.
- 🐞 **Fixed.** Per-size lists after `:` were not expanded (`garter:4/6`). Seen in DN and CA.
- 🐞 **Fixed.** `(a > b ? x : y)` inside parentheses or function arguments failed with "missing )". Seen in DN.
- 🐞 **Open.** `bind_off center N` and `dec neck` on the same row decrease into the bound-off stitches. Seen in CC.
- 🐞 **Open.** `piece B like A` also copies A's `pick_up` source, so a mirrored second sleeve that picks up elsewhere has to be written out in full. Seen in LD.

## Structure and flow

| | Use case | Example phrase | Seen in | Proposed |
|---|---|---|---|---|
| ✅ | Work N rows, or work to a length | "work even until sleeve measures 17.5in" | all | |
| ✅ | Measure from a marked row | "until armhole measures 7in" | SL BT BP | |
| ✅ | Repeat a block | "repeat these 8 rows 3 more times" (written `repeat 4`) | all | |
| ✅ | Match another piece's length | "work as for back until…" (counted in rows) | BT | |
| 🟡 | Repeat until a stitch count is reached | "rep rnds 3–4 until 142 sts", "inc every 6th row to 44 sts" | LD BT CC | `repeat until 44 sts { … }` |
| 🟡 | Size-specific sections | "Sizes XS, XL and 2X only:" (written `repeat 1/0/0/1/…`) | LD WL CC CA | `if size in XS XL 2X { … }` |
| 🟡 | Mutually exclusive versions | shell vs tunic, long vs short sleeve (written `repeat ${cond?1:0}`) | DN CA | `if sleeve == long { … }` |
| ❌ | End on a given side or row | "ending with a WS row", "ending with Round 8 of chart" | SL BT CC CA DN | `… ending ws`, `ending row 8` |
| ❌ | First row after cast-on is WS | "CO 16. Next row (WS): purl" | CA | `cast_on 16 ws` |
| ❌ | AT THE SAME TIME (overlapping instructions) | "Read ahead! neck shaping begins while armhole shaping continues" | SL CA TC | parallel tracks: `at_same_time { … } { … }` |
| ❌ | Name rows and reuse them | "Rows 19–24: repeat Rows 13–18" | CA | `define rowsA { … }` then `rowsA` |
| ❌ | Copy a piece up to a point | "work as for Front until…", "as for Back to 13in" | SL TC CC | `piece front like back until neck` |
| ❌ | Either/or stopping rule | "repeat 4 times more, or until body measures 12in" | TC | `repeat 4 or until 12in` |
| ❌ | Measure across pieces | "until body measures 12.5in from top / at centre back" | LD DN | `until 12.5in from yoke.cast_on` |
| ❌ | Target relative to the wearer | "until 3in shorter than desired length" | TC | a `length` param (already possible) |

## Stitch counts and shaping

| | Use case | Example phrase | Seen in | Proposed |
|---|---|---|---|---|
| ✅ | Decrease or increase at both edges | "k1, k2tog … ssk, k1", "inc 1 st each end every 6th row" | SL BT CC | |
| ✅ | Neck-edge decrease after a split | "dec 1 st at neck edge every alt row" | BT SL | |
| ✅ | Crown-style even decreases | "*k16, k2tog* around" | LD WL | |
| ✅ | Check stitch counts | "You should have 160 sts" | all | |
| 🟡 | Decrease or increase N evenly (irregular) | "decrease 22 sts evenly", "k7, k2tog, *k12, k2tog*…" | WL CA SL CC | `dec 22 evenly`, `inc 3 evenly` |
| 🟡 | Asymmetric repeat in an inc/dec round | "K19, (M1, k39) 5 times, M1, k20" | WL | `inc 6 evenly` |
| ❌ | One-sided shaping (fronts, necklines) | "K3, K2tog, knit to end", "knit to last 3, ssk, k1" | CC SL | `dec left`, `dec right`, `inc right 2` |
| ❌ | Bind off or cast on at the start of rows | "bind off 4 sts at beg of next 2 rows", "cast on 25 sts at beg of next 2 rows" | SL BT CC BP | `rows 2 st bind_off start 4`, `rows 2 st cast_on start 25` |
| ❌ | Stepped shoulders | "cast off 6 sts beg of next and following alt row" | BT CC | same as above |
| ❌ | Shaping at markers | "knit to marker, M1R, sm, k1, M1L", "k2tog, sm, ssk" ×4 | LD CR CA TC | `marker` per stitch position; `inc at markers`, `dec at markers` |
| ❌ | Per-section counts in the round | "back 6, sleeve 8, front 11", "52 sts each front and back, 8 each sleeve" | LD CR CA | `expect back=52 sleeve=8 …` |
| ❌ | Increase at the start of the round | "inc 1 st at beg of rnd" | WL | `inc start 1` |
| ❌ | Centred double decrease at a marked stitch | "cdd at centre front" | CA | `dec center 2` |
| ❌ | Increase or decrease type | M1R/M1L/M1PR, ssk vs k2tog, k2tog tbl, LLI/RLI | CR CA TC WL | `dec edges ssk/k2tog` (it shows the lean) |
| ❌ | Slot or buttonhole: bind off, then cast on over the gap | "bind off centre 35 sts / cast on 35 sts", "cast off 2 … cast on 2 over cast-off sts" | BP CC | `bind_off center 35` then `cast_on center 35`; `buttonhole 2 at 3` |
| ❌ | Space buttonholes evenly | "bottom 4 rows up, top at last row, rem 3 spaced evenly" | CC | `buttonholes 5 evenly from 4 to end` |

## Joining, holding, and multiple pieces

| | Use case | Example phrase | Seen in | Proposed |
|---|---|---|---|---|
| ✅ | Pick up from one or more edges | "pick up 48 sts around the neck" | BT SL | |
| ✅ | Seams sewn in order, side slits left unseamed | | all, TC | |
| 🟡 | Second sleeve picked up elsewhere | `like` also copies the pick-up source | LD | `like sleeve_r from …` |
| ❌ | Place stitches on hold and resume them | "place sleeve sts on scrap yarn", "leave rem 30 sts on a holder" | LD CR WL DN BT CC CA TC | `hold 30 as neck`; `resume body.held.neck` |
| ❌ | Divide a round into body and sleeves | "place 32 sts on waste yarn, CO 12, k48; rep from *" | DN LD CA TC | `divide sleeve:32 body:48 …` |
| ❌ | Join several pieces into one round | "Joining rnd: k40 sleeve sts, k77 body sts, …" | CR WL | `join sleeve_l.live + body.live.1 + …` |
| ❌ | Cast on in the middle of a row | "cast on 2 sts under the arm" | LD DN CA TC | `cast_on 2` inside a row or divide |
| ❌ | Mixed pick-up row | "pick up 21 down left front, k18 from holder, 21 up right, k30 from back" | BT CA | `pick_up 21 from … + held front.neck + …` |
| ❌ | Pick-up ratio rule | "pick up 2 sts for every 3 rows, then adjust to a multiple of 4" | SL | `pick_up 2:3 from … mult 4` |
| ❌ | Edge ranges on top or bottom edges | underarm cast-on segment, half the back neck | DN CA CC | `body.bottom[ua1]`, `back.neck.1` |
| ❌ | Graft live stitches | "graft underarm sts with Kitchener st" | CR WL | `graft A.held.x = B.held.y` |
| ❌ | Three-needle bind-off | "join shoulders with 3-needle BO" | SL | `seam … 3nbo` |
| ❌ | Split a round into flat pieces | "turn and continue on these 80 sts only" | TC | `split front:80 back:80 flat` |
| ❌ | Band worked to fit | "work until band fits along front edge to marked row" | CC | `rows until fits front.right[start:neck]` |
| ❌ | Intentional ease, gathers, pleats | gathered sleeve cap, "ease in fullness" | SL CC | `seam A = B gather` / `ease 4in` |
| ❌ | Fold, facing and hem join | "fold at turning row and join to cast-on", folded collar | SL TC BT | `hem 16`, `fold collar 4in` |
| ❌ | Provisional cast-on | "CO provisionally" | TC | `cast_on 80 provisional` |
| ❌ | Zipper or buttons | "sew in zipper", "sew buttons through both layers" | TC CC BP | `zipper yoke.left = yoke.right` |
| ❌ | Placement of new shapes | yoke or body tubes, two fronts side by side, a piece folded over the shoulders | LD CC BP | `place body at torso`, `at front_left` |

## Fabrics and colour

| | Use case | Example phrase | Seen in | Proposed |
|---|---|---|---|---|
| ✅ | Basic fabrics and ribs | "k2, p2 rib", garter, seed | all | |
| ✅ | Panels across a row | "K12, work chart over 48" | DN | |
| ✅ | Whole-row stripes | "2 rows A, 4 rows B" | TC CC | |
| 🟡 | Stripe sequence that keeps running across shaping | 44-row stripe repeat through armhole and neck | CC TC | `stripes A:2 B:4 … from here` |
| 🟡 | Panel widths after shaping | fixed `fabric:count` goes stale once stitches change | CR | widths relative to the centre or a marker |
| ❌ | Rib phase and symmetric ribs | "P2, *K2, P2*", "K3, *p2, k2* to last 5, p2, k3" | BT TC CC | `rib2x2 from p`, `rib2x2 centered` |
| ❌ | Custom stitch patterns | Checked stitch, trinity stitch, twisted rib (k1 tbl) | CR SL CA | `stitch checked 5x8 { … }` |
| ❌ | Charts: lace and cables | yo/p3tog lace, LT/RT twisted cables | DN CA | `chart A 12x8 { … }` with symbols; the checker verifies repeats |
| ❌ | Charts that change stitch count | lace repeat grows 12 → 16 → 24; yoke chart with decreases | DN WL | chart symbols for inc/dec |
| ❌ | Work part of a chart | "Work Rounds 9 through 13 of Chart A" | DN | `rows chartA[9:13]` |
| ❌ | Stranded colourwork | "*K1 MC, K1 CC*", 3-colour yoke chart | WL TC | colour charts with a key |
| ❌ | Work new stitches in pattern | "working increased sts in St st" | CR | rule for edge stitches |

## Gauge, tools and finishing

| | Use case | Example phrase | Seen in | Proposed |
|---|---|---|---|---|
| ✅ | Gauge as a param | "CHECK YOUR GAUGE" | all | |
| ❌ | Gauge per fabric | "18 sts St st, 23 sts Checked" | CR WL | `gauge seed 23 sts x 25 rows = 4 in` |
| ❌ | Needle changes | "change to larger needles" | all | `needle 4.5mm` (sets gauge from a table) |
| ❌ | Yarn held double, number of strands | | WL | `yarn #… x2` |
| ❌ | Bind-off method | "BO in rib", "*BO 4, m1, BO this st*" (picot) | WL DN | `bind_off rib`, `bind_off picot 4` |
| ❌ | Finished measurements | "Finished bust 36in" | LD CC BP | `measure chest = 36in` (checked) |
| ❌ | Blocking or stretched measurements | "lengths given stretched 25%" | DN | `block stretch 25%` |
| 🟡 | Size labels containing `/` | "XS/S", "2/3XL" clash with per-size lists | BT CC | allow quoted options: `"XS/S"` |

## Takeaways

1. **Flat, bottom-up, set-in or drop-shoulder** pullovers (SL, BT) mostly work. The main gaps there are "bind off at the beginning of the next N rows", one-sided shaping, holders, and "ending with a WS row".
2. **Seamless constructions** (raglan, yoke, top-down, contiguous) are the biggest gap; 6 of the 10 patterns are seamless. They need three things together:
   - stitch-position markers with `inc/dec at markers`;
   - `hold`/`divide`/`join` for moving live stitches between pieces;
   - per-section `expect`.
3. **Charts** (lace, cables, colourwork) need a stitch-symbol grid that can change stitch counts.
4. **Flow control:** `repeat until N sts`, size conditionals and AT THE SAME TIME would remove most of the hand-calculated repeat counts.
