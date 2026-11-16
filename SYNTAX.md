# Knit DSL

A plain-text language for knitting patterns. The app parses it, builds every stitch,
checks counts and seams, and simulates the result in 3D.

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
- `#` starts a comment, except `#rrggbb` colours.
- `"…"` quotes a value containing spaces.
- `{ … }` blocks (for `repeat`) may span lines.
- Lengths are a number followed by `in` or `cm`: `2.5in`, `6cm`.

## Header

| Statement | Meaning |
|---|---|
| `pattern "Name"` | Pattern title |
| `source URL` | Link to the original pattern |
| `gauge S sts x R rows = N in\|cm` | Stitches and rows per N inches or cm |
| `yarn #rrggbb` | Default yarn colour. Inside a piece it changes the colour from that point on |

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
- **Per-size lists:** `a/b/c` picks the value for the current size. The size comes from the `size` param, or from the
  first `enum` if there is no `size`. The list must have one value per option: `cast_on 50/54/58`, `rows until 2.5/2.5/3in rib2x2`, `garter:4/6/6 st garter:4/6/6`.

## Pieces

```knit
piece NAME [round]        # round = worked in the round (every row is RS)
  …
end
piece NAME like OTHER     # identical copy of OTHER (e.g. second sleeve)
```

Rows alternate RS/WS starting with row 1 = RS, unless the piece is `round`.

| Statement | Meaning |
|---|---|
| `cast_on N` | First line of a piece |
| `pick_up N from EDGE` | First line of a piece. Picks up from an earlier piece's edge, and the piece is placed automatically |
| `row FABRIC [SHAPING…]` | Work one row |
| `rows N FABRIC [SHAPING…]` | Work N rows, applying the shaping on every row |
| `rows 2in FABRIC` | Work enough rows to add that length |
| `rows until 18in FABRIC` | Work until the piece measures 18in (rounds up) |
| `rows until 9in from MARKER FABRIC` | Measure from a marker |
| `rows until match PIECE FABRIC` | Work until it has the same row count as another piece |
| `repeat N { … }` | Repeat a block |
| `marker NAME` | Name the current row so edges can refer to it |
| `expect N [N …]` | Assert the live stitch count. After a split, give one number per section |
| `bind_off` | Bind off all live stitches, forming the top edge |
| `gather` | Thread yarn through the live stitches and pull tight (hat crowns) |

### Fabrics

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

Combine fabrics across a row with `name:count`, for example `garter:6 st garter:6`. One part may leave out its count and
fills the remaining stitches.

### Shaping

| Shaping | Meaning |
|---|---|
| `inc edges [n]` | Increase n (default 1) at each edge |
| `dec edges [n]` | Decrease n at each edge |
| `dec neck [n]` | Decrease n at each neck edge of a split piece |
| `dec every N` | `*k N-2, k2tog*` across (crown shaping). `dec every 2` = k2tog all |
| `bind_off center N` | Bind off the centre N stitches, which splits the piece for a neckline |

## Assembly

```knit
assemble
  place PIECE at front|back|left_arm|right_arm|neck|head|scarf|table
  seam EDGE = EDGE
end
```

Each `seam` statement is sewn in the order it is written.

### Edges

```
piece.left[a:b]   piece.right[a:b]   piece.bottom
piece.top         piece.top.1        piece.neck
```

- `a`, `b` can be `start`, `end`, a marker name or a row number. A reversed range runs backwards.
- `~EDGE` reverses an edge, and `+` joins edges: `back.neck + front.neck`.
- `left`/`right` are as seen from the right side, so the front's left edge meets the back's right edge.
- `top.N` is the Nth section of a split top. For example, after a neckline the shoulders are `top.1` and `top.2`.

The checker compares seam lengths: within 5% passes, 5–15% is reported as ease, and more than that is a mismatch.

## Tips

- See [docs/USE_CASES.md](docs/USE_CASES.md) for what real patterns need that the language can't express yet.

- Add an `expect` line wherever the written pattern states a stitch count, so the checker can verify the translation.
- Translate every size the pattern gives, and make the gauge a param when the pattern says "check your gauge".
