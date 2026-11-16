# Worked examples (v2)

Part of the [Knit DSL reference](../../SYNTAX.md). Sweaters first, then socks, gloves, toys and modular blankets.

## Top-down raglan

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

## Cardigan fronts

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

## Colourwork yoke

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

## Toe-up sock with a short-row heel

Short rows are in [written-rows.md](written-rows.md#short-rows).

```knit
param foot float 7..12 = 9.5 "Foot length (in)"
gauge 32 sts x 44 rows = 4 in

piece sock round
  cast_on 16 using judys                         # closed toe: nothing to sew
  sections sole:8 instep:8
  rows until 64 sts st every 2 from row 1 inc each.edges inset 1
  expect sole=32 instep=32
  rows until ${foot - 2}in st "*k2 p2*":instep   # ribbed instep, plain sole
  marker heel
  row "k31 turn" ; row "ds p29 turn"             # the heel is worked on the 32 sole sts only
  repeat 10 { row "ds k ^-1 turn" ; row "ds p ^-1 turn" }     # stop 1 st short of the last turn
  repeat 10 { row "ds k ^ k1 turn" ; row "ds p ^ p1 turn" }   # work 1 st past it
  row                                            # from the last turn to the end of the round; the next round closes the other gap
  expect 64 ; expect length ${foot}in at sole.center
  rows until 6in from heel at instep.center "*k2 p2*"
  bind_off using stretchy
end

assemble
  place sock at left_foot
end
```

## Glove fingers

The hand ends with every stitch on waste yarn. Each finger takes stitches from both ends of what is left.

```knit
param size enum S M L = M
gauge 28 sts x 38 rows = 4 in

piece hand round
  cast_on 44/48/52 ; rows 2.5in rib2x2 ; rows until 6in st      # thumb gusset left out
  hold all as palm                                              # not a row
end

define finger(n, prev, len) {
  join hand.palm[0:${n}] + cast_on gap:2 + hand.palm[end-${n}:end] + pick_up 2 from ${prev}.gap
  rows until ${len}in st
  row "*k2tog*" ; gather
}

piece index round
  join hand.palm[0:6/7/7] + cast_on gap:2 + hand.palm[end-6/7/7:end]
  expect 14/16/16 ; rows until 2.5/2.75/3in st ; row "*k2tog*" ; gather
end
piece middle round ; finger(5/6/6, index, 2.75/3/3.25) ; end
piece ring round ; finger(5/5/6, middle, 2.5/2.75/3) ; end
piece pinky round
  join hand.palm + pick_up 2 from ring.gap                      # whatever is left: 12/12/14
  expect 14/14/16 ; rows until 2/2.25/2.5in st ; row "*k2tog*" ; gather
end

assemble
  place hand at left_hand right_hand                            # a pair; the fingers follow their joins
end
```

## Toy: limbs, stuffing and a face

Surface lines and points (`body.row[R][P]`) are in [objects.md](objects.md#lines-and-points-on-the-fabric).

```knit
yarn fur #d9a066 ; yarn pants #3d6274 ; yarn K #222222
gauge 24 sts x 32 rows = 4 in

piece leg_l round
  cast_on 3 ; row "*kfb*" ; rows 4 st            # ends live
end
piece leg_r like leg_l

piece body round
  join leg_l.live + leg_r.live ; expect 12
  yarn pants ; row "*k1 kfb*" ; row "*k2 kfb*" ; rows 6 ; expect 24
  yarn fur ; rows 14
  stuff firm                                     # everything so far (the legs are other pieces: unstuffed)
  row "*k2 k2tog*" ; row "*k1 k2tog*" ; row "*k2tog*" ; expect 6
  stuff light ; gather
end

piece arm_l icord
  pick_up 2 from body.row[12][5:7]               # 2 sts of row 12, picked up on the surface
  rows 5 ; gather
end
piece arm_r like arm_l
  pick_up 2 from body.row[12][17:19]
end
piece tail icord
  cast_on 3 ; rows 1.5in ; gather
end

assemble
  place body at table
  seam body.row[start][0] = body.row[start][6]   # close the gap between the legs (a tack)
  seam tail.bottom = body.row[6][18]             # sew the cord end on at a point
  trim eye 6mm at body.row[18][9] body.row[18][14]
  embroider straight at body.row[16][11:13] yarn K
end
```

## Mitered-square blanket

Twenty-five garter squares in one colour, each started from its neighbours. The loop variables are used in names and
in `if`. Each square has 55 rows: a WS row, 27 decrease rows on the RS (57 → 3 stitches) and a last `sk2p` on the WS.
Edge names for mitred pieces are in [objects.md](objects.md#mitred-and-modular-pieces).

```knit
gauge 14 sts x 24 rows = 4 in                    # stocking stitch, as printed; garter is taken as square (28 rows)
yarn #3f7d4e

for r in 1..5 { for c in 1..5 {                  # r = strip, from the bottom; c = square, from the left
  piece sq_${r}_${c}
    if r == 1 && c == 1 { cast_on 57 ws }
    else if c == 1 { join pick_up 29 from sq_${r - 1}_1.left + cast_on 28 ws }
    else if r == 1 { join cast_on 28 + pick_up 29 from sq_1_${c - 1}.right ws }
    else { join pick_up 29 from sq_${r - 1}_${c}.left + pick_up 28 from sq_${r}_${c - 1}.right ws }
    row garter                                   # row 1 (WS)
    rows until 3 sts every 2 from row 1 dec 2 center using sk2p   # rows 2–54: sk2p on the centre stitch, every RS row
    expect 3
    row "sk2p" ; expect 1                        # row 55 (WS); a one-off row, the fabric is still garter
    bind_off                                     # fasten off
  end
} }

assemble
  place sq_1_1 at table                          # joined pieces follow
  expect length 8in of sq_5_5.left within 10%    # one side of a square: 55 garter rows
  expect length 40in from sq_5_1.left[start] to sq_5_5.left[end] within 10%   # the top edge of the blanket
end
```
