# Written rows (v2)

Part of the [Knit DSL reference](../../SYNTAX.md). Nothing on this page is implemented yet.

A quoted row is read as worked, the way the pattern prints it. Commas are ignored, so text can be pasted. It can be used
as a fabric (`rows 2in "k3 *p2 k2* p2 k3"`), as one row (`row "*k6 k2tog*"`) or as a line of a
[`stitch`](charts.md) body.

## Stitches

| Kind | Words |
|---|---|
| Plain | `k p k1tbl p1tbl k1b` (knit into the stitch below). `k3` = knit 3 |
| Slipped | `sl1` (yarn on the WS), `sl1wyif`, `sl1wyib` (yarn in front or in back, as worked) |
| Increases | `yo yo2 m1 m1l m1r m1p m1pl m1pr lli rli kfb kfbf` (`yo2` and `kfbf` add 2) |
| Decreases | `k2tog ssk k2togtbl p2tog ssp p2togtbl k3tog sssk p3tog cdd sk2p` (`cdd` = s2kp) |
| Several into several | `(…)in1`, `(…)inN`: work the group into the next N stitches together. `(p1 k1 p1)in1` makes 3 from 1; `(k1 yo k1 yo k1)in4` makes 5 from 4 |
| Crosses | `lt rt` (2 stitches); `cNf cNb` (N even, halves cross); `cA/Bf cA/Bb` (uneven); `cA/B/Cf cA/B/Cb` (the outer groups swap round a centre) |
| Cast on, bind off | `coN` casts on N at this point; `bo`, `boN` bind off the next N stitches (after `m1` or `yo`: the stitch just made) |
| Brioche | `sl1yo` (slip with a yarn-over wrap), `brk brp` (work the stitch with its wrap), `brkyobrk` (+2) |
| Short rows | `turn`, `wt`, `ds`; see [Short rows](#short-rows) |

- A written row is always **as worked**: on a WS row `k` is a knit as you face it, so it shows as a purl on the RS.
- **Crosses.** `cA/Bb` is "A/B RC": hold B stitches at the back, work A, then the B. `cA/Bf` is "A/B LC": hold A in
  front, work B, then the A. All legs are knit unless you list them as worked, in parentheses:
  `c1/1f(p1 k1tbl)` = "sl 1 to cn in front, p1, k1 tbl from cn"; `c1/1/1b(k1tbl p1 k1tbl)`. No cross changes the count.
- **Brioche counts.** A stitch and its yarn-over wrap count as one stitch, in `sl1yo` and in `brk`/`brp`.
- **`bo` and `co`.** `boN` removes exactly N stitches and the words after it are new stitches, so "BO 25, k25
  (including the stitch on the needle)" is `bo25 k24`. A bound-off or cast-on run inside a row can be named by putting
  it in its own section.
- **Custom words.** A top-level `key NAME = STITCHES` adds a word for written rows and `stitch` bodies:
  `key star = (k1 yo k1 yo k1)in5`, then `"k1 star k star k1"`. It can be used as a `chart` symbol too.

## Fills and repeats

- A bare `k` or `p` **fills**: `"k3 k2tog k ssk k3"` = "k3, k2tog, knit to last 5, ssk, k3".
- `*…*` repeats to fill, and `(…)xN` repeats N times (N may be a per-size list): `"k19 (m1l k39)x5 m1l k20"`.
- `*…*` may be followed by one bare fill, which takes whatever is left over, with no warning:
  `"sl1 kfbf *yo k2tog* k"` = "*yo, k2tog* to last 1 or 2 sts, knit to end".
- The checker verifies that the row uses exactly the live stitches, and computes the new count.
- When a written row stays in force for later rows, they are worked as the stitches present themselves (knit the knits).

`row "*k6 k2tog*"` is the v2 spelling of crown shaping; `dec every 8` remains as an alias.

## Stops: markers and gaps

A fill runs to the next **stop**. Stitches written before the fill count from where the segment begins; stitches
written between the fill and the stop count back from the stop. Each segment may have one fill.

| Stop | Meaning |
|---|---|
| end of the row | implicit |
| `\|` | the next section boundary ("slip marker"). The end of the row also satisfies a final `\|` |
| `^` | the nearest short-row gap ahead (see below); with no gap ahead, the end of the row |
| `^-N` | N stitches before that point |

```knit
row "k3 m1l *k1 yo k2tog* m1r | k1 | m1l *k1 yo k2tog* m1r k3"   # triangle shawl: a fill in each wing
row "*k1 m1l k m1r k1 |*"            # "*k1, m1l, k to 1 before m, m1r, k1, sm*": once per section
row "*k k2tog |*"                    # swirl crown: "*k to 2 before m, k2tog*"
row "(k ssk | k1 k2tog)x2 k"         # "k to 2 before m, ssk, sm, k1, k2tog" at the first two markers
```

A `*…*` or `(…)xN` group that contains `|` is worked once per section. The checker verifies each segment against its
section count.

## Short rows

A row may end before the end of the needle.

- **`turn`** ends the row there. The stitches not yet worked stay live and in place. The next row starts at the turn and
  goes back the other way (its side flips, also in a `round` piece). It runs to the far end, or to its own `turn`.
- **`wt`** is `turn` with a wrap ("w&t"). **`ds`** is the first stitch of a row after a German turn: it works one
  stitch (the double stitch). Both only record the method. Counts and shape don't depend on it, and wraps and double
  stitches are closed without further notation when a later row works them (write them as plain `k` or `p`).
- A turn leaves a **gap** between the last stitch worked and the next one. `^` is the nearest gap ahead in the
  direction of work. A gap closes when a row is worked across it.
- Any stitch may be used in a short row, including shaping, `coN` and `boN`.
- **In the round**, a row after a turn may run back across the start of the round. The first row that doesn't end in
  `turn` must be an RS row; it runs to the start of the round and rounds go on from there.
- Stitches a row doesn't reach keep their fabric, their place in a pattern repeat and their length; see
  [Semantics](../../SYNTAX.md#rows-and-columns).

```knit
row "k17 ssk k1 turn" ; row "sl1 p5 p2tog p1 turn"       # heel turn over 32 sts
repeat until 18 sts { row "sl1 k ^-1 ssk k1 turn" ; row "sl1 p ^-1 p2tog p1 turn" }

repeat 3 { row "k ^-4 wt" ; row "k" }                    # garter shoulder: "k to last 4, w&t", then 8, then 12
row "k44 wt" ; row "p88 wt"                              # seat rise centred on the round start
repeat 9 { row "k ^-2 wt" ; row "p ^-2 wt" }             # "to 2 sts before the previous wrapped st"
```

A `stitch` whose lines end in `turn` is a short-row wedge: `repeat 10 { rows wedge }`.

## Two passes on one side

**`slide`** ends a row without turning: the next row starts at the same end and is on the same side ("do not turn;
slide sts to other end"). A row ending in `slide` and the row after it count as **one row** for row numbers, lengths
and gauge.

```knit
stitch brioche2c
  "@A sl1 *brk sl1yo* brk p1 slide"         # 1A (RS, yarn A)
  "@B sl1 *sl1yo brp* sl1yo sl1"            # 1B (RS, yarn B)
  "@A sl1 *brp sl1yo* brp k1 slide"         # 2A (WS)
  "@B sl1 *sl1yo brk* sl1yo sl1"            # 2B (WS)
end
```

## Colour in a row

- `@YARN` switches yarn for the rest of the row: `"*@M k1 @C k1*"`, `"k11 @CD k1 kfb k7 kfb k1 @CDE k11"`. The next row
  starts in the piece's current yarn again.
- A slipped stitch keeps the yarn of the row that made it. Slip-stitch (mosaic) colourwork is therefore `stripes A:2 B:2`
  plus written rows with `sl1wyib` (RS) and `sl1wyif` (WS), or a [`chart … mosaic`](charts.md#mosaic-charts).
- Yarns held together are a named yarn: `yarn CD = C+D` (see the header table).
