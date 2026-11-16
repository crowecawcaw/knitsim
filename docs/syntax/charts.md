# Stitch patterns and charts (v2)

Part of the [Knit DSL reference](../../SYNTAX.md). Nothing on this page is implemented yet.

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
- The lines are [written rows](written-rows.md), so they may use stops (`|`, `^`), `turn`, `slide` and `@YARN`. Quotes
  round a line are optional.

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
- A fabric part may take a row range too: `st leaf[25:32]:48 st` starts the panel at row 25 and cycles rows 25–32.
- **Across:** the `*…*` or `|…|` repeat is worked as many times as fits the part it fills; stitches outside it are worked
  once at each side. With no marks, the whole line is the repeat.
- **Up:** as a fabric, the rows cycle 1…n for as long as it stays in force. `rows NAME` works them exactly once.
- **Partial repeats:** leftover stitches are split between the two sides (in the round: left at the end) and worked as
  the next columns of the pattern, with a warning. A yarn-over, decrease or cable cut off from its partner is worked plain.
- **Under shaping** the pattern stays aligned stitch over stitch, so edge shaping grows or eats partial repeats.
- A pattern that differs per size group is declared once per group inside a top-level `if` (see
  [Flow control](../../SYNTAX.md#flow-control-v2)). The same goes for a chart that starts at a different column per size.

## Mosaic charts

`chart NAME mosaic` draws slip-stitch colourwork as it looks. Each drawn line is two worked rows (RS, then WS) in the
yarn in force, normally set by `stripes A:2 B:2`. A cell is a yarn name: cells in the working yarn are knitted, the
others are slipped (yarn at the back on the RS, in front on the WS) and keep the colour from below. The checker
reports a cell that can't have its colour.

```knit
chart steps mosaic            # 4-stitch repeat, 2 drawn lines = 4 rows
  A B A A                     # rows 3-4, worked in A: the B stitch is slipped
  B B B A                     # rows 1-2, worked in B: the A stitch is slipped
end
```
