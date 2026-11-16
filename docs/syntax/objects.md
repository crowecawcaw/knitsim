# Socks, gloves, toys and other 3D objects (v2)

Part of the [Knit DSL reference](../../SYNTAX.md). Nothing on this page is implemented yet.

This page covers what closed and stuffed objects add to the core language: closed starts and ends, cords, positions on
the fabric surface, stuffing, trims, embroidery, finishing and new placements. Short rows are in
[written-rows.md](written-rows.md#short-rows). Worked examples are in [examples.md](examples.md).

## Closed starts and ends

| Statement | Meaning |
|---|---|
| `cast_on N using judys\|turkish\|figure8` | A closed line: the two halves of the round are joined at the cast-on (toe-up toes, fingertip-up mittens) |
| `cast_on N using pinhole` | A closed point: the cast-on is drawn shut (centre-out squares and discs, toy bodies) |
| `cast_on N using provisional` | The cast-on stays live as `piece.bottom`: it can be grafted, joined or folded later |
| `gather` | Piece end: thread the yarn through the live stitches and pull tight |
| `close [A B] [using graft\|3needle]` | Piece end: fold the live stitches in half and join the halves (default `graft`). The halves are sections A and B, or else the two halves of the row or round from its start. They must be equal. Wedge toes, mitten tops, square-top hats, hoods |
| `gather EDGE\|LINE [to LEN\|P%]` | In `assemble`: draw an edge or a surface line together. With no target it is pulled shut (a cast-on hole, the row-end poles of a short-row ball). With one it is cinched (`gather shorts.row[waist] to 27in`, `gather leg.col[0][1:4] to 50%`) |

Other `using` methods stay informational.

## I-cord

`icord` is a third mode beside `round` and `flat`: every row is an RS row and the yarn is carried across the back, so
2–6 stitches make a closed cord.

```knit
piece tail icord                 # a cord from scratch
  cast_on 3 ; rows 2in ; gather
end

row hold 4 start as strap        # in a piece: a cord that grows out of live stitches
piece strap_l icord
  join top.strap ; rows 7in ; bind_off
end
```

As a statement, `icord` switches mode in mid-piece, like `round` and `flat` ("work 1 row as an I-cord, then divide onto
3 needles" = `icord ; row ; round`). That first row is an ordinary row: it is worked, counted and measured. Cords merge into a round with an ordinary `join toe1.live + toe2.live + toe3.live`.

## Lines and points on the fabric

Anything that takes an edge also takes a line drawn on the surface of a piece. A range with a single position is a
point. Positions are those of [edge ranges](../../SYNTAX.md#edges).

| Reference | Meaning |
|---|---|
| `piece.row[R]` | The whole of row R: a marker name or a row number |
| `piece.row[R][a:b]` | Part of that row, between two stitch positions: `body.row[12][5:7]`, `body.row[ears][front]` |
| `piece.col[P][a:b]` | A vertical line along stitch column P, from row a to row b |
| `piece.row[R][P]` | A point. So is a one-position edge range: `front.right[9in]`, `hat.top[mid]` |
| `piece.NAME` | A point marker placed while knitting: `marker nose start`, `marker cb back.center` |
| `LINE.below`, `LINE.above` | The live stitches on either side of a row line once it is **opened** (waste yarn pulled out, or the fabric cut). Only as `join` parts |

Stitch positions on row R count along that row as it was worked, from the right edge (RS view) or the start of the round.

What lines and points are for:

- **Pick up on the surface.** `pick_up 2 from body.row[12][5:7]`, `pick_up 60 from pair.row[ridge]`. `~` reverses the
  direction, as for edges. The new piece stands out from the surface. Its RS faces the side that is on the left when
  you travel along the line: for a row line taken in the direction it was knitted, the RS faces the cast-on (the piece
  was held the right way up); with `~` it faces the top ("turn the body upside down", "with the back of the body
  toward you"). For a column line taken upwards the RS faces the piece's left (RS view). Along an edge there is no
  such choice: the new piece's RS is the source's RS.
- **Sew a part on.** `seam ear.bottom = head.row[40][10:18]`. A seam to a point sews a small closed edge (the end of a
  cord or tube) on there: `seam tail.bottom = body.row[6][18]`.
- **Tack.** A seam between two points pulls them together: `seam head.row[30][4] = head.row[33][4]` (a pinched mouth,
  the gap between two joined legs).
- **Afterthought openings.** Mark the row (`marker heel`) and knit on. The heel or thumb is a new piece:
  `join sock.row[heel][sole].below + sock.row[heel][sole].above`. To cut a whole piece in two, use
  [`cut`](#cutting-a-piece-apart-and-pairs).
- **Pick up "at the corner".** `pick_up 2 from hand.thumb[start]` picks up at the end of a held run.
- **Measure.** `expect length 13in of sleeve.row[underarm]`, `expect length 68in of shawl.bottom`. Between two points,
  across pieces: `expect length 7.25in from hand.bottom[mid] to middle.top[mid]` (in `assemble`).
- **Trims and embroidery**, below.

## Cutting a piece apart, and pairs

```knit
piece pair round                 # two socks as one tube: sock 1 toe-up, waste rounds, sock 2 cuff-down
  …
  marker top1 ; rows 2 st ; marker top2
  …
end
cut pair at top1 to top2 as sock1 sock2      # top level, after the piece: the 2 rounds are unravelled

assemble
  place sock1 at left_foot ; place sock2 at right_foot
end
```

- `cut PIECE at ROW as A B` opens one whole row; `at ROW to ROW` also discards the rows from the first to the second.
  A is the part below, B the part above. PIECE no longer exists after the line.
- The cut ends are live: `A.top` and `B.bottom`. Finish them like any live stitches (`piece cuff1 round ; join sock1.top ;
  bind_off using stretchy ; end`, or a graft). If a piece already picked up from the cut row (`pick_up 64 from
  pair.row[top1]`, a bind-off worked into the purl bumps before unravelling), the end is finished and it follows its part.
- Only whole rows can be cut. A steek (a cut up a column) is still a `note`.

A **pair** from one piece is a placement: `place mitten at left_hand right_hand mirrored` makes the piece and everything
joined to it twice. Leave `mirrored` out when the two are identical (plain socks, fingerless tubes). When left and right
differ in the knitting itself, write both with `for h in l r { … }`.

## Mitred and modular pieces

A mitred square is cast on along two of its sides and decreased at the centre until one stitch is left.

- `bottom` is the whole cast-on, both legs. Name the legs in the start statement (`cast_on a:28 corner:1 b:28`,
  `join pick_up a:29 from … + cast_on b:28`), or take `bottom[start:mid]` and `bottom[mid:end]`.
- `right` and `left` are the row-end edges. They are the other two sides of the square and meet at the last stitch
  (`left[end]` = `right[end]`). `right` starts where the first leg of the cast-on starts (the right edge, RS view) and
  `left` where the last leg ends. What a pattern calls the "top" and "side" of a finished square are these two.
- There is no `top` edge: the piece ends in a point.
- The overall size of a blanket is a distance between two outer corners:
  `expect length 40in from sq_5_1.left[start] to sq_5_5.left[end]`.
- Each `pick_up N` is compared with its edge, so "29 sts along a 55-row side" is reported as a ratio and a length.
- Garter squares need a garter row gauge. Without `gauge garter …`, garter is taken as square.

## Shaping by hand

Squeezing, pushing or sculpting a stuffed piece ("push the nose back into the muzzle a little") has no statement: write
a `note`. If the dent matters to the shape, a tack is the nearest thing: `seam head.nose = head.row[20][12]`. Positions
that the pattern gives only in a photo are the translator's estimate; say so in a comment.

## Stuffing

| Statement | Meaning |
|---|---|
| `stuff [firm\|light\|none]` | Piece statement: fill the part of this piece knitted since the previous `stuff` (or the start). Write it where the pattern says "stuff now", before the opening gets small. Bare `stuff` is the default: the piece is filled to its knitted shape without stretching the stitches. `firm` stretches the fabric a little (rounder, about 10% wider); `light` leaves it soft and partly flat; `none` leaves this part empty |
| `stuff PIECE [firm\|light]` | In `assemble`: fill a sewn piece. Seams run in order, so sew, stuff, then sew the gap |

```knit
assemble
  seam upper.left[0:-2in] = lower.right[0:-2in]
  stuff upper firm
  seam upper.left[-2in:end] = lower.right[-2in:end]      # close the stuffing gap
end
```

Pieces linked by `join` or `pick_up` are stuffed separately: stuffing a body leaves its legs empty.

## Trims, embroidery and notes

All three go in `assemble` and never change a stitch count.

| Statement | Meaning |
|---|---|
| `trim KIND [SIZE] at PLACE…` | Something that isn't knitted, fixed at each PLACE (a point, an edge, a line or a whole piece). KIND is any word. The simulator draws `pompom tassel fringe eye bead cord elastic wire`; the rest are listed as notions |
| `embroider KIND\|CHART at PLACE… [yarn NAME]` | Stitches sewn over the fabric. KIND is `straight` (one stitch along each line), `knot` (at each point), `duplicate` (over each stitch of a line), `daisy` (a lazy-daisy loop along each line, anchored at its end) or `path` (one thread through all the points in order). Any other KIND is drawn as `straight` and listed by name. A colour `chart` is duplicate-stitched with the first stitch of its row 1 at the point |
| `note "text"` | Anywhere: an instruction with no effect on the stitches ("weave in ends", "try on", "twist the yarns at the edge"). It is kept with the row or step it follows |

```knit
trim pompom 3in at hat.top[start] hat.top[mid]       # one on each corner of a square top
trim eye 9mm at head.row[30][12] head.row[30][20]
trim elastic 0.5in at skirt.row[casing]
trim fringe 4in at shawl.bottom
embroider heart at hat.row[brim][10] yarn C
embroider path at body.row[13][8] body.row[12][9] body.row[13][10] body.row[12][11] body.row[13][12] yarn fine   # a mouth: two Vs side by side
```

A `path` is the generic form: a V is three points, a whisker two, a curved smile several. Points may be given with
length offsets (`body.row[13][mid-0.25in]`). **Split yarn** ("use half the plies") is a yarn of its own in the header,
`yarn fine = CC1 x0.5`; it is drawn thinner and has no effect on gauge unless a `gauge` line names its needle.

Ties are seams that are knotted, not sewn: `seam strap_l.top = strap_r.top using tie`.

## Finishing: felting and blocking

```knit
finish felt width 82% length 75%      # header: finished size as a share of the knitted size
finish block length 125%
```

- Gauge, `rows until LEN` and other lengths in a piece stay **as knitted**.
- `expect width|length` and the simulation show the **finished** size. Add `unfinished` to check a size as knitted:
  `expect width 11in unfinished`.
- When the pattern gives a blocked gauge, use it as the gauge and leave `finish` out.

## Placement

| Spot | For |
|---|---|
| `left_hand`, `right_hand` | Mittens and gloves. Finger and thumb pieces follow their joins |
| `left_foot`, `right_foot` | Socks. The heel is found from the short rows or the heel piece; a toe-up sock is turned automatically |
| `waist` | Skirts and the body of shorts or trousers (a tube round the lower body) |
| `left_leg`, `right_leg` | Leg tubes |
| `crotch` | A flat piece folded between the legs (at its middle row, or at a `fold` marker) |
| `table` | Anything with no wearer: toys, blankets, bags. Its shape comes from the stitches and the stuffing |

A piece worked sideways (rows running up the body) needs no hint: it is placed through the piece that picks up from it.

`like OTHER mirrored` on a round piece reflects it across the start of the round: the order of sections reverses and
`at I` counts the other way, so a thumb gusset or a heel lands on the other side.
