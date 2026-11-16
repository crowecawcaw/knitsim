# Use cases the Knit DSL must cover

This list was gathered from two corpora of free patterns, judged against the DSL (see [SYNTAX.md](../SYNTAX.md)): 10
sweaters, which were translated in full, and then 37 other objects (hats, mittens, gloves, socks, skirts, shorts, tops,
shawls, blankets, bags and toys), which were read and judged but not yet translated; see [Corpus 2](#corpus-2-other-objects).
For each one we noted every instruction the language could express, express only awkwardly, or not express at all. The patterns themselves
are not stored here. Each entry links to its source and quotes only short, characteristic phrases.

Status:

- ✅ supported
- 🟡 possible but awkward (the workaround is described)
- ❌ gap (the "Proposed" syntax is only a sketch)
- 📝 specified in [SYNTAX.md](../SYNTAX.md) v2, not yet implemented (the "Proposed" column shows the spec syntax)
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
| 📝 | Match part of another piece | "same length as back to underarm", "same as upper left front" | BT CC SL | `rows until match back.underarm`, `match front[split:end]` |
| 📝 | Shaping on the last row of a run | "inc 2 sts evenly across last rib row" | CC | `rows until 2.5in rib2x2 ending ws last inc 2 evenly` |
| 📝 | Row tables per size group | "Sizes XS–M: rows 3–42 … Sizes L–2X: …" | CA TC | `if size in XS S M { … } else if size in L 1X { … } else { … }`, also around `chart`/`stitch` |
| 📝 | Work the sides of a split one after the other | "leave rem sts on a holder; rejoin yarn and work to match" | BT CC SL | `hold … as left`, finish one side, `resume left` |
| 📝 | Repeat until a stitch count is reached | "rep rnds 3–4 until 142 sts", "inc every 6th row to 44 sts" | LD BT CC | `repeat until 44 sts { … }`, `rows until 44 sts st every 6 inc edges` |
| 📝 | Size-specific sections | "Sizes XS, XL and 2X only:" (written `repeat 1/0/0/1/…`) | LD WL CC CA | `if size in XS XL 2X { … }` |
| 📝 | Mutually exclusive versions | shell vs tunic, long vs short sleeve (written `repeat ${cond?1:0}`) | DN CA | `if sleeve == "long" { … } else { … }` |
| 📝 | End on a given side or row | "ending with a WS row", "ending with Round 8 of chart", "ending with row 2 or 4" | SL BT CC CA DN | `rows until 7in ending ws`, `… ending row 8`, `… ending row 2,4` |
| 📝 | First row after cast-on is WS | "CO 16. Next row (WS): purl" | CA | `cast_on 16 ws` |
| 📝 | AT THE SAME TIME (overlapping instructions) | "Read ahead! neck shaping begins while armhole shaping continues" | SL CA TC | `at_same_time { … } and { … }` |
| 📝 | Name rows and reuse them | "Rows 19–24: repeat Rows 13–18" | CA | `define rowsA { … }` then `rowsA` |
| 📝 | Copy a piece up to a point | "work as for Front until…", "as for Back to 13in" | SL TC CC | `piece front like back until neck` + own statements |
| 📝 | Either/or stopping rule | "repeat 4 times more, or until body measures 12in" | TC | `repeat 4 until 12in { … }` |
| 📝 | Measure across pieces | "until body measures 12.5in from top / at centre back" | LD DN | `rows until 12.5in from yoke.start` |
| 📝 | Target relative to the wearer | "until 3in shorter than desired length" | TC | `rows until ${length - 3}in` with a `length` param |

## Stitch counts and shaping

| | Use case | Example phrase | Seen in | Proposed |
|---|---|---|---|---|
| ✅ | Decrease or increase at both edges | "k1, k2tog … ssk, k1", "inc 1 st each end every 6th row" | SL BT CC | |
| ✅ | Neck-edge decrease after a split | "dec 1 st at neck edge every alt row" | BT SL | |
| ✅ | Crown-style even decreases | "*k16, k2tog* around" | LD WL | |
| ✅ | Check stitch counts | "You should have 160 sts" | all | |
| 📝 | Decrease or increase N evenly (irregular) | "decrease 22 sts evenly", "k7, k2tog, *k12, k2tog*…" | WL CA SL CC | `dec 22 evenly`, `inc 3 evenly`, or a written row `"k7 k2tog *k12 k2tog*"` |
| 📝 | Asymmetric repeat in an inc/dec round | "K19, (M1, k39) 5 times, M1, k20" | WL | `row "k19 (m1l k39)x5 m1l k20"` or `inc 6 evenly` |
| 📝 | One-sided shaping (fronts, necklines) | "K3, K2tog, knit to end", "knit to last 3, ssk, k1" | CC SL | `dec left`, `dec right inset 3`, `inc 2 right`; exact text as `row "k3 k2tog k"` |
| 📝 | Shaping set in from an edge or marker | "k3, k2tog", "ssk 2 sts before marker" | CC CR DN | `dec edges inset 3`, `dec markers inset 1` |
| 📝 | Bind off or cast on at the start of rows | "bind off 4 sts at beg of next 2 rows", "cast on 25 sts at beg of next 2 rows" | SL BT CC BP | `rows 2 bind_off 4`, `rows 2 cast_on 25` |
| 📝 | Stepped shoulders | "cast off 6 sts beg of next and following alt row" | BT CC | `rows 4 every 2 from row 1 bind_off 6` |
| 📝 | Shaping at markers | "knit to marker, M1R, sm, k1, M1L", "k2tog, sm, ssk" ×4 | LD CR CA TC | `sections back:52 sleeve_l:8 …` then `inc markers inset 1`, `dec markers`, `inc front.edges back.edges` |
| 📝 | Per-section counts in the round | "back 6, sleeve 8, front 11", "52 sts each front and back, 8 each sleeve" | LD CR CA | `expect back=52 sleeve_l=8 …` |
| 📝 | Increase at the start of the round | "inc 1 st at beg of rnd" | WL | `inc start` |
| 📝 | Centred double decrease at a marked stitch | "cdd at centre front" | CA | `dec 2 center using cdd`, `dec 2 front.center` |
| 📝 | Increase or decrease type | M1R/M1L/M1PR, ssk vs k2tog, k2tog tbl, LLI/RLI | CR CA TC WL | `dec edges using ssk,k2tog`, `inc markers using rli,lli` |
| 📝 | Slot or buttonhole: bind off, then cast on over the gap | "bind off centre 35 sts / cast on 35 sts", "cast off 2 … cast on 2 over cast-off sts" | BP CC | `row bind_off 35 center` then `row cast_on 35 center`; `buttonhole at 3` |
| 📝 | Space buttonholes evenly | "bottom 4 rows up, top at last row, rem 3 spaced evenly" | CC | `rows until fits EDGE spaced 5 from row 4 buttonhole center`; across a row: `buttonhole 5 evenly` |

## Joining, holding, and multiple pieces

| | Use case | Example phrase | Seen in | Proposed |
|---|---|---|---|---|
| ✅ | Pick up from one or more edges | "pick up 48 sts around the neck" | BT SL | |
| ✅ | Seams sewn in order, side slits left unseamed | | all, TC | |
| 📝 | Second sleeve picked up elsewhere | `like` also copies the pick-up source | LD | `piece sleeve_l like sleeve_r` with its own start statement in the body |
| 📝 | Place stitches on hold and resume them | "place sleeve sts on scrap yarn", "leave rem 30 sts on a holder" | LD CR WL DN BT CC CA TC | `hold all as neck`, `hold 18 center as fneck`; resume with `join body.neck` |
| 📝 | Divide a round into body and sleeves | "place 32 sts on waste yarn, CO 12, k48; rep from *" | DN LD CA TC | `row hold sleeve_l cast_on underarm_l:12 hold sleeve_r cast_on underarm_r:12` |
| 📝 | Join several pieces into one round | "Joining rnd: k40 sleeve sts, k77 body sts, …" | CR WL | `join sleeve_l.live + body.front + sleeve_r.live + body.back` |
| 📝 | Cast on in the middle of a row | "cast on 2 sts under the arm" | LD DN CA TC | `hold S cast_on underarm:2`, `cast_on N center using backward_loop` |
| 📝 | Hold stitches on both sides of a marker or of the round start | "place last 4 and first 4 sts on hold", "5 sts each side of marker" | WL CR | `hold 4 edges as ua`, `hold 5 back.end front.start as ua` |
| 📝 | Mixed pick-up row | "pick up 21 down left front, k18 from holder, 21 up right, k30 from back" | BT CA | `join pick_up 21 from front.neck.1 + front.fneck + pick_up 21 from front.neck.2 + back.bneck` |
| 📝 | Pick-up ratio rule | "pick up 2 sts for every 3 rows, then adjust to a multiple of 4" | SL | `pick_up 2 per 3 from … mult 4`; with held stitches: `join pick_up 2 per 3 from front.neck.1 + front.fneck + … mult 4` |
| 📝 | Edge ranges on top or bottom edges | underarm cast-on segment, half the back neck | DN CA CC | `body.underarm_l` (named cast-on), `back.neck[start:mid]`, `body.bottom[front]` |
| 📝 | Graft live stitches | "graft underarm sts with Kitchener st" | CR WL | `seam body.ua_l = sleeve_l.ua using graft` |
| 📝 | Three-needle bind-off | "join shoulders with 3-needle BO" | SL | `seam … using 3needle` |
| 📝 | Split a round into flat pieces | "turn and continue on these 80 sts only" | TC | `row hold back` then `flat`; the back is a new piece: `join body.back` |
| 📝 | Band worked to fit | "work until band fits along front edge to marked row" | CC | `rows until fits front.right[start:neck]` |
| 📝 | Intentional ease, gathers, pleats | gathered sleeve cap, "ease in fullness" | SL CC | `seam A = B gather` / `ease 4in` |
| 📝 | Fold, facing and hem join | "fold at turning row and join to cast-on", folded collar | SL TC BT | knitted in: piece statement `fold at turning`; sewn: `fold body at turning` + `seam body.bottom = body.row[hem_top]` |
| 📝 | Provisional cast-on | "CO provisionally" | TC | `cast_on 80 using provisional` |
| 📝 | Zipper or buttons | "sew in zipper", "sew buttons through both layers" | TC CC BP | `seam yoke.left = yoke.right using zipper 12/14/16in`, `… using buttons`, `buttons 2 on body.slot at 1.5in -1.5in` |
| 📝 | Placement of new shapes | yoke or body tubes, two fronts side by side, a piece folded over the shoulders | LD CC BP | `place body at torso`, `at front_left`, `at shoulders`; joined pieces are placed automatically |

## Fabrics and colour

| | Use case | Example phrase | Seen in | Proposed |
|---|---|---|---|---|
| ✅ | Basic fabrics and ribs | "k2, p2 rib", garter, seed | all | |
| ✅ | Panels across a row | "K12, work chart over 48" | DN | |
| ✅ | Whole-row stripes | "2 rows A, 4 rows B" | TC CC | |
| 📝 | Stripe sequence that keeps running across shaping | 44-row stripe repeat through armhole and neck | CC TC | `stripes A:2 B:4 …` (sticky until `stripes off`) |
| 📝 | Panel widths after shaping | fixed `fabric:count` goes stale once stitches change | CR | `sections` + `st checked:panel st` |
| 📝 | Rib phase and symmetric ribs | "P2, *K2, P2*", "K3, *p2, k2* to last 5, p2, k3" | BT TC CC | written row as fabric: `rows 2in "k3 *p2 k2* p2 k3"` |
| 📝 | Custom stitch patterns | Checked stitch, trinity stitch, twisted rib (k1 tbl) | CR SL CA | `stitch checked … end`; trinity: `*(p1 k1 p1)in1 k3tog*` |
| 📝 | Charts: lace and cables | yo/p3tog lace, LT/RT twisted cables | DN CA | `chart A odd … end` with symbols, `key` and run counts (`.5`); the checker verifies repeats |
| 📝 | Charts that change stitch count | lace repeat grows 12 → 16 → 24; yoke chart with decreases | DN WL | chart rows padded with `x` (no stitch) |
| 📝 | Work part of a chart | "Work Rounds 9 through 13 of Chart A" | DN | `rows chartA[9:13]` |
| 📝 | Stranded colourwork | "*K1 MC, K1 CC*", 3-colour yoke chart | WL TC | colour chart: cells are yarn names; `key d = M k2tog` |
| 📝 | Work new stitches in pattern | "working increased sts in St st" | CR | new stitches take the fabric of the section they land in (`fabric:SECTION`), or another one: `inc markers inset 1 in st` |

## Gauge, tools and finishing

| | Use case | Example phrase | Seen in | Proposed |
|---|---|---|---|---|
| ✅ | Gauge as a param | "CHECK YOUR GAUGE" | all | |
| 📝 | Gauge per fabric | "18 sts St st, 23 sts Checked" | CR WL | `gauge checked 23 sts x 25 rows = 4 in` |
| 📝 | Needle changes | "change to larger needles" | all | `needle US7` + `gauge on US7 …` |
| 📝 | Yarn held double, number of strands | | WL | `yarn A #… x2` |
| 📝 | Bind-off method | "BO in rib", "*BO 4, m1, BO this st*" (picot) | WL DN | `bind_off using rib`, `bind_off using "*bo4 m1 bo*"` |
| 📝 | Finished measurements | "Finished bust 36in" | LD CC BP | `expect width 36in` (5% passes, as for seams), `expect length 24in within 0.5in` |
| 📝 | Blocking or stretched measurements | "lengths given stretched 25%" | DN | header `finish block length 125%`; `expect` then checks the finished size |
| 📝 | Size labels containing `/` | "XS/S", "2/3XL" clash with per-size lists | BT CC | quoted options: `param size enum "XS/S" M "2/3XL"` |

## Takeaways

1. **Flat, bottom-up, set-in or drop-shoulder** pullovers (SL, BT) mostly work. The main gaps there are "bind off at the beginning of the next N rows", one-sided shaping, holders, and "ending with a WS row".
2. **Seamless constructions** (raglan, yoke, top-down, contiguous) are the biggest gap; 6 of the 10 patterns are seamless. They need three things together:
   - stitch-position markers with `inc/dec at markers`;
   - `hold`/`divide`/`join` for moving live stitches between pieces;
   - per-section `expect`.
3. **Charts** (lace, cables, colourwork) need a stitch-symbol grid that can change stitch counts.
4. **Flow control:** `repeat until N sts`, size conditionals and AT THE SAME TIME would remove most of the hand-calculated repeat counts.
5. **v2 spec.** Every 📝 row is now specified in SYNTAX.md or [docs/syntax](syntax) and tagged `(v2)` there. The engine still implements v1 only.
6. **Still not covered** from the sweater corpus (the corpus-2 gaps are listed [below](#still-not-covered-corpus-2)):
   - Turning a piece inside out ("turn cowl so WS faces out"). Seen in SL; write the fabric as it looks from the finished outside.
   - `like` with overrides ("work as for front hem, but to 5in"). Seen in TC; use `define` with arguments.
   - Importing charts from images. Charts are typed; `odd`, run counts and `stitch` rows keep that short. Seen in DN, WL and CA.
   - Buttonholes at computed positions on a body copied with `like` (the band must be its own piece). Seen in CC.
7. **Closed by the corpus-2 revision:** moving the start of the round (`round_start`), colour inside a written row
   (`@YARN`), blocking (`finish block`), and finishing notes (`note "…"`).

## Corpus 2: other objects

Read and judged against the v2 spec, not yet translated. IDs have three letters so they can't clash with the sweaters.
"+" marks a supplementary pattern, read for one technique.

| ID | Pattern | Category | Construction |
|---|---|---|---|
| EFH | [Knit Earflap Hat (Red Heart)](https://www.yarnspirations.com/products/red-heart-knit-earflap-hat) | hat | sideways double-knit band with earflaps, seamed into a ring; crown picked up from its row edge, 4-wedge decreases |
| OMB | [Ombre Double Brim Beanie](https://leeleeknits.com/ombre-double-brim-beanie-knitting-pattern) | hat | provisional cast-on, knitted-in folded brim, colour chart, 8-wedge crown, pompom |
| BRI | [Bridget](https://woollywormhead.com/blog/2007/10/10/bridget) | hat | two yarns held together, turned-up cuff, square top closed by 3-needle bind-off, corner pompoms |
| WSM | [The World's Simplest Mittens](https://blog.tincanknits.com/2016/12/01/letsknitsimplemittens/) | mittens | thumb gusset to waste yarn, spade top; 5 sizes × 4 yarn weights |
| GLV | [Gloves, 5 sizes](https://octopus-clementine-tsbs.squarespace.com/hands/gloves-5sizes) | gloves | gusset thumb; each finger takes stitches from both ends of the held hand, plus the previous finger's cast-on |
| PTC + | [PentaCap](https://www.woollywormhead.com/blog/2022/10/4/new-free-pattern-the-pentacap) | hat | garter brim, bind-off braid, 5-point swirl crown |
| DOK + | [Do or Do Knot Baby Hat](https://knitterspride.blogspot.com/2018/07/free-knitting-pattern-do-or-do-knot.html) | hat | fast crown to 3 sts, knotted i-cord top |
| BEC + | [Earflap Cap (Bernat)](https://www.yarnspirations.com/products/bernat-earflap-cap) | hat | earflaps first, joined with cast-ons between; twisted cord and tassel |
| BCB + | [Beyond Cozy Double Brimmed Beanie](https://leeleeknits.com/?p=40913) | hat | double brim, duplicate-stitch heart, asymmetric marker decreases |
| POM + | [Pomegranate Ripple](https://knitty.com/ISSUEdf20/PATTpomegranateripple/) | mittens | garter palm, U-shaped pick-up, afterthought thumb, grafted sides |
| PRN + | [PRN mittens](https://knitty.com/ISSUEff21/PATTprn/) | mittens | fingertip-up from a closed cast-on, knit to fit, hand and thumb tubes joined |
| RUG + | [Really Useful Gloves](https://knitty.com/ISSUEff25/PATTuseful.php) | gloves | tuck stitch (k1b), mirrored hands in the round |
| MNK | [Monkey](https://knitty.com/ISSUEwinter06/PATTmonkey.html) | sock | cuff-down, heel flap, heel turn, picked-up gusset, lace instep, wedge toe grafted |
| GOA | [Gothic Arches](https://knotions.com/gothic-arches-socks/) | sock | cuff-down, twisted-stitch charts, fleegle heel, cables across the round start; 3 sizes |
| PAL | [Palindrome](https://knitty.com/ISSUEff25/PATTpalindrome.php) | sock | toe-up from Judy's cast-on, German short-row heel, then top-down into the second sock; cut apart; 6 sizes |
| CRY | [Crystal](https://knitty.com/ISSUEss12/PATTcrystal.php) | sock | toe-up, flat toe picked up into a round, swirl toe, stranded, afterthought heel |
| STR | [Stripodot](https://knitty.com/ISSUEss17/PATTstripodot/) | sock | cuff-down, two-colour slipped rib, increases then German short rows for the heel, CDD toe gathered |
| STT + | [Star-toe recipe](https://oolongknits.blogspot.com/2018/04/fall-colours-socks-ii-star-toe.html) | sock | toe-up star toe from a pinhole cast-on |
| GAM | [Gams](https://knitty.com/ISSUEss10/PATTgams.php) | shorts | two leg tubes joined into a body, crotch grafted, short-row back rise, rib waist; 10 sizes in two families |
| BLC | [Bell Curve](https://knitty.com/ISSUEwinter07/PATTbellcurve.html) | skirt | top-down, knitted-in elastic casing, star-stitch increases at 4 panels |
| CHT | [Chicory Tank](https://knitty.com/ISSUEss22/PATTchicorytank/PATTchicorytank.php) | top | lace tube, back bound off, front flat with garter bands, straps sewn at offsets from centre back |
| OPP | [Opportune](https://knitty.com/ISSUEss19/PATTopportune/PATTopportune.php) | vest | lace rectangles, short-row garter shoulders, partial side seams, hood, i-cord ties |
| JAN | [Jane](https://knitty.com/ISSUEsummer03/PATTjane.html) | baby bikini | halter triangles into i-cord straps; one-piece bottoms back → crotch → front; knitted-in ruffles |
| CNB + | [Carnaby](https://knitty.com/ISSUEdf10/PATTcarnaby.php) | skirt | sideways, flare from short-row wedges |
| DDS | [Daydreamer Shawl](https://leeleeknits.com/garter-tab-cast-on-shawl/) | shawl | garter-tab start, top-down triangle with a centre spine |
| DAS | [Diana Asymmetrical Shawl](https://www.handylittleme.com/diana-asymmetrical-shawl-knitting-pattern/) | shawl | bias triangle: +2 at one edge, −1 at the other; tassels |
| MIB | [Knit Mitered Blanket (Red Heart)](https://www.yarnspirations.com/products/red-heart-knit-mitered-blanket) | blanket | 25 mitered garter squares, each picked up from its neighbours |
| ALY | [Alysa](https://knitty.com/ISSUEff26/PATTalysa.php) | scarf | two-colour brioche, two passes per row, syncopated stripes |
| GGS | [Go-Go Shawl](https://leeleeknits.com/easy-mosaic-knit-shawl-pattern/) | shawl | mosaic slip-stitch triangle grown from 3 sts |
| FMB | [French Market Bag](https://knitty.com/ISSUEwinter03/PATTfrenchmarket.html) | bag | centre-out square base into a tube, four flaps grafted into handles, felted |
| CRS + | [Top-Down Crescent Shawl](https://www.handylittleme.com/crescent-shawl-knitting-pattern/) | shawl | 10 wedges with yarn-overs at 8 boundaries |
| KKT | [Kate's Kitten](https://knitty.com/ISSUEw17/PATTkateskitten/) | toy | two leg tubes joined into the body; arms and ears picked up on the surface; embroidered face |
| ELY | [Ellery the Elephant](https://knitty.com/ISSUEw20/PATTellery/) | toy | flat garter pieces with short rows, sewn with a stuffing gap, felted, safety eyes |
| NBP | [New Born Puppy](https://www.frombritainwithlove.com/wp-content/uploads/2023/04/NEW_BORN_PUPPY_DOG_PATTERN.FREE_-1.pdf) | toy | one flat piece sculpted by about 30 short-row blocks; marker-matched seams; staged stuffing |
| ZOZ | [Zozo](https://knitty.com/ISSUEfall09/PATTzozo.php) | toy | body and head in one round piece; i-cord toes joined into limbs; shaping by sewing |
| CSB | [Chirripo Short Row Ball](https://www.craftfoxes.com/how_tos/short-row-ball/print_preview) | toy | ten short-row wedges, grafted to the provisional cast-on, poles gathered |
| SDL + | [Short Dog, Long Dog](https://mochimochiland.com/2025/02/free-pattern-short-dog-long-dog/) | toy | tiny tube, i-cord legs threaded through yarn-over holes |

The checker would catch two more errata: OMB's small size can't work crown round 9 as printed, and MIB prints "52 sts"
where there are 51.

The tables below hold the use cases that are new with this corpus, grouped by theme. Everything marked 📝 is specified
in [docs/syntax](syntax) and not implemented.

### Short rows and uneven rows

| | Use case | Example phrase | Seen in | Proposed |
|---|---|---|---|---|
| 📝 | Turn before the end of the row | "K17, ssk, k1, turn", "K44, w&t" | MNK GOA PAL STR ELY NBP CSB OPP GAM | `row "k17 ssk k1 turn"`; `wt` and `ds` record the method |
| 📝 | Work to the gap of an earlier turn | "sl1, knit to 1 st before gap, ssk, k1, turn" | MNK GOA | `repeat until 18 sts { row "sl1 k ^-1 ssk k1 turn" ; row "sl1 p ^-1 p2tog p1 turn" }` |
| 📝 | German short-row heel, both halves | "DS, k to DS, turn"; "k to DS, k the DS, k1, turn" | PAL STR | `row "ds k ^-1 turn"`, then `row "ds k ^ k1 turn"` |
| 📝 | Stepped short rows from an edge | "k to last 4 sts, w&t … to last 8" | OPP CNB ELY | `repeat 3 { row "k ^-4 wt" ; row "k" }` |
| 📝 | Centred short rows (seat rise) | "k to 2 sts before previous wrapped st, w&t", 9 times | GAM | `row "k44 wt" ; row "p88 wt" ; repeat 9 { row "k ^-2 wt" ; row "p ^-2 wt" }` |
| 📝 | Short-row wedge repeated | 20-row wedge worked 10 times | CSB CNB | a `stitch wedge` whose lines end in `turn`; `repeat 10 { rows wedge }` |
| 📝 | Shaping, cast-on or bind-off inside a short row | "Cast on 12 sts, k19, W+T"; "K13, LLI, …, RLI, k1. Turn" | NBP PAL STR | `row "co12 k19 turn"`, `row "k13 lli k4 rli k1 turn"` |
| 📝 | Heel flap worked flat on half the round | "heel flap worked on these 32 sts; rem 32 on hold" | MNK | `hold instep` (no row), `flat`, flap rows, heel turn |
| 📝 | Length measured at one point of the row | "back will be 4.5in higher than front"; foot length along the sole | GAM ELY CSB PAL | `expect length 13in at back.center`, `rows until 6in from heel at instep.center` |
| 📝 | A pattern that pauses on unworked stitches | "mark where you are on chart B" during the heel | MNK GOA PAL | rule: a section's fabric moves on only when its stitches are worked; `ending row 1,10,11 in instep` |

### Markers and sections in a row

| | Use case | Example phrase | Seen in | Proposed |
|---|---|---|---|---|
| 📝 | A fill per marker segment | "k3, m1l, (k1, yo, k2tog) to marker, m1r, sm, k1, sm, …" | DDS CRS | `row "k3 m1l *k1 yo k2tog* m1r \| k1 \| m1l *k1 yo k2tog* m1r k3"` |
| 📝 | The same sequence in every section | "[k1, make star, k to 6 before m, make star, k1] 4 times" | BLC GAM | `row "*k1 star k star k1 \|*"` |
| 📝 | One-sided shaping at every marker (swirl, star) | "*knit to 2 sts before marker, k2tog*" | PTC CRY STT PRN | `dec each.end using k2tog`, `inc each.start`; or `row "*k k2tog \|*"` |
| 📝 | Asymmetric shaping at a marker | "k to 2 before m, skpo, sm, k1, k2tog" | BCB | `row "(k ssk \| k1 k2tog)x2 k"` |
| 📝 | Equal sections without listing them | "place 4 more markers so 5 are evenly spaced" | PTC EFH OMB PRN | `sections 5` (`s1`…`s5`) |
| 📝 | Repeat with a leftover that depends on the row | "*yo, k2tog* to last 2 sts, k2 (some rows: k1)" | DAS GLV | `"sl1 kfbf *yo k2tog* k"`: the fill takes the leftover, no warning |
| 📝 | Name one stitch as a landmark | "pm on first and last st (nose seam markers)", "centre-back marker" | NBP CHT OPP | `marker nose start`, `marker cb back.center`; then `back.top[cb+3in:cb+4.5in]` |

### Round start

| | Use case | Example phrase | Seen in | Proposed |
|---|---|---|---|---|
| 📝 | Move the round start to a new place | "k to midpoint of sole; this is the new start of round" | MNK PAL STR CRY GOA (TC CA) | `round_start sole.center`, `round_start at 16` |
| 📝 | Shift the round start by a stitch | "remove marker, k1, replace marker" | CHT BLC GOA | `round_start at 1`, `round_start at -1` |
| 📝 | A section across the round start | sole = last 16 + first 16 sts | MNK PAL | `sections sole:16 instep:32 sole:16` |
| 📝 | Mirrored second hand or foot in the round | "left: gusset after 5 reps, right: after 7" | RUG STR GLV | `piece sock_r like sock_l mirrored` reflects across the round start |

### Holders, openings and joins

| | Use case | Example phrase | Seen in | Proposed |
|---|---|---|---|---|
| 📝 | Take stitches from both ends of a holder | "pick up first 5 and last 5 sts from the waste yarn" | GLV | `join hand.palm[0:5] + cast_on gap:2 + hand.palm[end-5:end] + pick_up 2 from index.gap` |
| 📝 | Hold without working a row | "break yarn; place first 10 sts on waste yarn" | GAM GLV MNK | `hold 10 start as crotch` as a statement of its own |
| 📝 | Afterthought heel or thumb | "knit 28 sts in waste yarn … pick up the sts above and below" | CRY POM | `marker heel`, then `join sock.row[heel][sole].below + sock.row[heel][sole].above` |
| 📝 | Cut one piece into two | "these two rounds are unravelled to separate the socks" | PAL | a second piece that starts `join pair.row[cut].above` |
| 📝 | Rejoin held stitches and pick up, mid-piece | "pick up 15 along flap, k instep, pick up 15, k heel" | MNK CRY FMB | mid-piece `join live + pick_up 16 from left[flap:end] + instep + pick_up 16 from right[flap:end]` |
| 📝 | Garter-tab start | "CO 3, knit 6 rows, pick up 3 along the side and 3 along the cast-on" | DDS | `cast_on 3 ; rows 6 garter ; join live + pick_up 3 from left + pick_up 3 from bottom` |
| 📝 | Pick up at a corner or at a point of an edge | "pick up 2 sts from the corner where the thumb joins"; "3 sts at the natural waist" | GLV OPP | `pick_up 2 from hand.thumb[start]`, `pick_up 3 from front_l.right[9in]` |
| 📝 | Pick up from a purl ridge or any row | "pick up the 60 purl bumps around the top" | PAL PTC | `pick_up 60 from pair.row[ridge]` |
| 📝 | Partial seams measured by length | "seam from 2in above the hem to 8in below the shoulder" | OPP CHT JAN | `seam front.right[2in:-8in] = back.left[4in:-8in]` |
| 📝 | Bind off several runs inside one row | "K12, BO 25, K25, BO 25 …"; "bind off 8, m1, k to end" | FMB ELY NBP | `row "k12 bo25 k24 bo25 …"` (`bo` in any written row) |

### Closed shapes, cords and stuffing

| | Use case | Example phrase | Seen in | Proposed |
|---|---|---|---|---|
| 📝 | Closed cast-on (toe-up, fingertip-up) | "using Judy's Magic CO, CO 24 … join" | PAL PRN STT | `cast_on 24 using judys`; a point: `using pinhole` |
| 📝 | Close live stitches in two halves | "graft sts on needle 3 to needle 4"; square top by 3-needle BO | MNK GOA PAL CRY BRI POM OPP | piece end `close`, `close instep sole`, `close using 3needle` |
| 📝 | Close a cast-on hole or a row-end edge | "sew up small hole at base"; "draw the selvedge sts together" | ZOZ CSB CRY | `gather body.bottom`, `gather ball.left` in `assemble` |
| 📝 | Graft the end to a provisional cast-on | "undo provisional CO … graft 40 sts" | CSB OMB | `seam ball.top = ball.bottom using graft` (a provisional edge is live) |
| 📝 | I-cord pieces, straps and tops | "work 9 rows of I-cord"; "with rem 3 sts work 3.5in of i-cord" | SDL ZOZ KKT DOK JAN OPP | `piece leg icord`; mid-piece `icord ; rows 3.5in` |
| 📝 | Stuff before the last decreases, by region | "stuff the piece … Rnd 23"; "stuff neck firmly, head lightly" | KKT ZOZ SDL | piece statement `stuff firm` / `stuff light` covers the rows since the last one |
| 📝 | Stuff between seams; close the gap after | "graft 40, partially stuff, graft final 10"; "leave a 2in opening" | CSB ELY NBP | `seam a[0:-2in] = … ; stuff body ; seam a[-2in:end] = …` |
| 📝 | Centre-out base that turns into a tube | "8 sts increased every other round until 200", then straight up | FMB | `cast_on 8 using pinhole`; the shape follows the stitches (no hint syntax) |

### Positions on the surface: attaching and decorating

| | Use case | Example phrase | Seen in | Proposed |
|---|---|---|---|---|
| 📝 | Pick up from the surface, not an edge | "pick up 2 horizontal sts midway down the side" | KKT | `pick_up 2 from body.row[12][5:7]`; `~` for the other direction |
| 📝 | Sew a part along a line or at a point | "sew the cast-on edge a few sts behind the eye"; "legs evenly spaced around body" | ELY SDL NBP ZOZ | `seam ear.bottom = head.row[40][10:18]`, `seam leg_1.bottom = body.row[3][6]` |
| 📝 | Pinch, tack or cinch | "pinch front of head and baste"; "close the gap between the legs" | ZOZ KKT NBP | `seam head.row[30][4] = head.row[33][4]`; `gather leg.col[0][1:4] to 50%` |
| 📝 | Embroidered features | "eyes: 2 small horizontal sts, 5 sts up, 4 apart" | KKT SDL ZOZ | `embroider straight at body.row[20][7:9] body.row[20][11:13] yarn K` |
| 📝 | Duplicate stitch from a chart | "add heart with duplicate stitch, 24 rows down" | BCB JAN NBP | `embroider heart at hat.row[24][10] yarn C` |
| 📝 | Safety eyes, pompoms, tassels, fringe | "two 9mm safety eyes"; "a pompom on each corner" | ELY NBP OMB BRI BEC DAS | `trim eye 9mm at head.row[30][12] head.row[30][20]`, `trim pompom 3in at hat.top[start] hat.top[mid]` |
| 📝 | Elastic, drawstrings, wire, ties | "insert elastic into casing"; "chenille stem in the arm"; straps tied at the neck | BLC GAM JAN ZOZ OPP | `trim elastic 0.5in at skirt.row[casing]`, `trim wire at arm_l`, `seam a = b using tie` |
| 📝 | Several copies of one part | "LEGS (make 4)"; second glove = 6 pieces | ZOZ ELY GLV WSM | `for i in 1..4 { piece leg_${i} like leg }`; `for h in l r { … }` round a set of pieces |

### Modular pieces, templates and sizing

| | Use case | Example phrase | Seen in | Proposed |
|---|---|---|---|---|
| 📝 | Many near-identical pieces from a loop | 25 squares in 5 strips | MIB | `for r in 1..5 { for c in 1..5 { piece sq_${r}_${c} … } }` with `if` round the start statement |
| 📝 | A piece started from two neighbours | "pick up 29 along top of next square, 28 along side of square just worked" | MIB | `join pick_up 29 from sq_${r - 1}_${c}.left + pick_up 28 from sq_${r}_${c - 1}.right` |
| 📝 | One template, different counts and lengths | "repeat as for middle finger using 5 (6) sts … to 2.25in" | GLV | `define finger(n, prev, len) { … }`, `finger(5/6/6, index, 2.75/3/3.25)` |
| 📝 | Loop over shrinking rows | "K33 w&t, K30 w&t … K3 w&t" | ELY NBP | `for i in 0..10 { row "k${33 - 3 * i} wt" }`, or `row "k ^-3 wt"` |
| 📝 | Two size axes | 5 sizes × 4 yarn weights; women's and men's lists | WSM GAM | `if weight == "dk" { let co = 28/34/38/44/48 }`, then `cast_on ${co}` |
| 📝 | Knit to fit a circumference | "increase until desired circumference" | PRN | `rows until width ${hand}in st every 2 inc each.start` |
| 📝 | Per-size repeat count in a written row | "[K8, k2tog] 9[10, 11, 12, 14] times" | GAM | `"(k8 k2tog)x9/10/11/12/14 k4/1/5/5/0"` |

### Stitches and colour techniques

| | Use case | Example phrase | Seen in | Proposed |
|---|---|---|---|---|
| 📝 | Two passes on one side (brioche) | "Row 1A (RS, MC) … do not turn; slide. Row 1B (RS, CC) … turn" | ALY | a row ending in `slide`; it and the next row count as one row |
| 📝 | Brioche stitches | "sl1yo", "brk1: knit the st together with its wrap" | ALY | `sl1yo brk brp brkyobrk`; a stitch and its wrap count as one |
| 📝 | Yarn changes inside a row | "K11, in yarn CD k1, kfb, …, in yarn CDE k11"; "(k1 CC, yo MC, k1 CC) into the st" | NBP STR ALY (WL TC) | `"k11 @CD k1 kfb k7 kfb k1 @CDE k11"`; `yarn CD = C+D` |
| 📝 | Slip-stitch (mosaic) colour | "sl1 purlwise wyib … wyif"; the slipped st keeps the colour below | GGS STR EFH | `sl1wyib`, `sl1wyif` with `stripes A:2 B:2`; or `chart NAME mosaic` |
| 📝 | Clusters into several stitches | "k4tog without dropping, yo, k same 4 tog again …" (4 → 5) | BLC | `(k1 yo k1 yo k1)in4` |
| 📝 | Named custom stitch | "Make Star", "Make Small Star" | BLC | top-level `key star = (k1 yo k1 yo k1)in5` |
| 📝 | Uneven and mixed-leg crosses | "1/2 RC"; "1/1 LPC: sl1 to cn front, p1, k1tbl from cn" | CHT GOA | `c1/2b`, `c1/1f(p1 k1tbl)`, `c1/1/1b(k1tbl p1 k1tbl)` |
| 📝 | Missing stitch words | sk2p, k1fbf, yo2, k1-below, p2tog tbl | MIB JAN DAS MNK RUG | `sk2p kfbf yo2 k1b p2togtbl` |
| 📝 | Different yarns held together | "Aran and DK worked together throughout" | BRI NBP | `yarn AD = A+D` |

### Measuring, finishing and placement

| | Use case | Example phrase | Seen in | Proposed |
|---|---|---|---|---|
| 📝 | Measure something that isn't a rectangle | "wingspan 68in, depth 29in" | DDS DAS GGS CRS | `expect length 68in of (shawl.left + shawl.right)`, `expect length 29in at spine.center` |
| 📝 | Shape that follows the shaping lines | spine triangle, mitre, bias, centre-out square | DDS MIB DAS GGS FMB | engine rule: layout from stitch topology; no syntax |
| 📝 | Felting | "before felting 8 × 11in, after 6 × 9in" | FMB ELY | `finish felt width 82% length 75%`; `expect width 11in unfinished` |
| 📝 | Hands, feet and lower body | mittens, socks, shorts, skirts, a diaper shape | all | `place sock at left_foot`, `at left_hand`, `at waist`, `at left_leg`, `at crotch` |
| 📝 | Objects with no wearer | free-standing toy, blanket, bag | toys MIB FMB | `place body at table` |
| 📝 | Fold direction | "fold the brim inwards" vs "folded up" | OMB BRI | `fold hat at brim out` |
| 📝 | Instructions with no effect on stitches | "weave in ends", "try on and adjust", "twist the two strands at the edge" | most | `note "…"` |

### Still not covered (corpus 2)

| | Use case | Example phrase | Seen in | Workaround |
|---|---|---|---|---|
| ❌ | Knit a second piece's live stitches into this row | "purl together 1 st from ruffle needle with 1 st from pants needle" | JAN | bind the ruffle off and `seam` it to `pants.row[M]`. (`fold` covers only a piece's own cast-on) |
| ❌ | A knitted-in casing left partly open | "k each st together with CO to last 10 sts" | BLC | `fold at turning` + `note`; the elastic is a `trim` |
| ❌ | Stop when a yarn runs out | "continue until you run out of yarn A" | DAS ALY | a length or count param |
| ❌ | A cable that crosses the round start | "use the 1st st of rnd 17 to cross your last cable" | GOA | `round_start at 1` before the round and `round_start at -1` after it |
| 📝 | Chart columns per size | "size M: start with the 3rd st and end with st 7" | GOA | `leaf shift 0/2/0` (revision 2) |
| ❌ | Two-layer (double-knit) fabric in the simulation | "*k1, sl1 wyif*" gives a double-thick band | EFH | a `stitch` with `sl1wyif` and its own `gauge`; drawn as one layer |
| ❌ | Curved attachment lines | "ears are sewn along a slight C-curve" | ELY | a straight `row` line |
| ❌ | A part pushed into the body or threaded through holes | "pull the tail partway in"; "pass the leg through two yo holes" | SDL | `seam` the cord to a point + `note` |
| ❌ | A length relative to another, less a row | "same length as back less one row" | JAN | `match`, then adjust by hand |
