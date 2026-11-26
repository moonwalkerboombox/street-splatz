# Brawler parts contract

The engine (`gen.py`) draws the card chrome, the alley backdrop, the gumball
body, the headband, and the palette. Parts plug in as separate files and are
never imported by name from `gen.py`, so you can add or replace them without
editing the engine.

| File | Must expose | Coordinates |
|---|---|---|
| `poses/<pose>.py` (`boss`, `lean`, `showboat`, `grump`: the trait value lower cased) | `draw(ctx) -> dict` | card space |
| `eyes.py` | `draw_eyes(style, ctx) -> str` | head-local |
| `mouths.py` | `draw_mouth(style, ctx) -> str` | head-local |

Rules for every part:

- Python 3 standard library only. Do **not** import `gen`. Everything is on `ctx`.
- Deterministic. No `random` module calls, no time. Use `ctx.rng("name")`.
- Return SVG fragment strings (no `<svg>`, no `<defs>`). Ids must come from `ctx.uid()`.
- A missing pose file, or a pose/eyes/mouth that raises, falls back (Boss / Round / Grin)
  with a warning on stderr. Run with `--strict` while developing so errors surface.

## Preview loop

```
python3 gen.py --cards 16,82 --out /tmp/x --strict            # traits from assets/metadata
python3 gen.py --cards 16 --out /tmp/x --set pose=Lean --set eyes=Shades --set flavor=Licorice
node render.mjs --out /tmp/x /tmp/x/016.svg                   # -> 016.png, 1040 x 1520
node render.mjs --sheet /tmp/x/sheet.png --cols 4 /tmp/x/*.png
python3 optimize.py /tmp/x                                    # lossless PNG re-encode (about 30% smaller)
python3 samples.py                                            # rebuild docs/art-direction/sample-sheet
```

`--set key=value` overrides `flavor`, `eyes`, `mouth`, `pose`, `rarity`, `name` for previews.
Always check Vanilla (light), Licorice (near black) and one saturated flavor.

## Card space (poses)

- User units 520 x 760, origin top left, +y down. Rendered at 2x.
- Art panel: x 34..486, y 80..498 (`ctx.PANEL = (34, 80, 452, 418)`), 16 radius corners.
- Pavement line `ctx.GROUND_Y = 430`. Sneaker soles rest at `ctx.SOLE_Y = 491`:
  `ctx.shoe((x, 428))` puts the sole bottom exactly there (ankle y + 63).
- The character is **not** clipped to the panel. Keep it inside x 40..480, y 86..494.
  Never cover the top plates (y < 76) or the name banner (y > 500).
- Light comes from the upper right. Rim light sits on the lower left.
- Boss reference: head centre (250, 264), radius 118.8. Keep the head radius between
  110 and 122 so the face stays the star and line weights match (Lean 110, Showboat 111,
  Grump 112).
- Keep fists and effect marks at least 15 units inside the art window edge.

### `draw(ctx)` return value

```python
dict(
    head=(cx, cy),        # required: ball centre, card space
    radius=118.8,         # required: ball radius in card units
    tilt=0,               # degrees, clockwise positive; rotates headband, cracks, face
    back=[...],           # limbs behind the body (far arm, far fist)
    legs=[...],           # legs, behind the body
    shoes=[...],          # sneakers, behind the body, in front of legs
    front=[...],          # limbs in front of body and face (near arm, near fist)
    # optional
    prop=[...],           # scenery the character touches (Lean's lamp post), drawn behind the
                          #   headband tails and every limb
    fx="...",             # backdrop effects (speed lines), drawn inside the panel clip,
                          #   behind the character, skipped on Pavement Card
    shadows=[(cx, rx)],   # contact shadow ellipses on the ground, default one under the head
    flip=False,           # True mirrors headband + face so the character faces screen left
    face=(0, 0),          # head-local shift applied to eyes and mouth together
)
```

Each layer is a string or a list of strings. Missing layers are empty.

### Layer order (back to front)

1. card frame
2. backdrop (wall, props, glow, rays, pipe, ground, steam, `fx`, sparkles, `shadows`)
3. panel border
4. pose `prop`, then headband tails (engine)
5. pose `back`
6. pose `legs`
7. pose `shoes`
8. body ball + cracks (engine)
9. headband band + knot (engine)
10. eyes
11. mouth
12. pose `front`
13. chrome (number, tier badge, name banner, stats)

The engine draws the body and headband. Poses never draw the ball.
Anything that must pass in front of the face goes in `front`.

## Head-local space (eyes, mouths)

The engine wraps your output in
`translate(cx cy) rotate(tilt) scale(radius/100) [scale(-1 1) if flip] translate(face)`.

- Origin = ball centre. Ball radius = **100**. +x = facing side (screen right), +y down.
- The face is a 3/4 view turned right and low, so it is **not** centred on x = 0.
- Scale is about 1.19 in Boss, so a local stroke of 4.6 renders about 5.5 card units.
- Eye zone: x -48..90, y -36..36. Left eye centre about (-9, 10), right eye (57, 8).
  The right eye is the far eye: draw it about 10% smaller.
- The headband's lower edge runs from (-104, -9) through (0, -41) to (104, -26). Stay below it.
- Mouth zone: x -35..88, y 36..88. Stay inside the ball (x*x + y*y < 96*96).
- Nose tick lives at about (25, 22)..(28, 33) and belongs to the eyes part.
- Eyes are drawn before the mouth.

Trait honesty: Heart eyes must read as hearts, Star as stars, Shades as sunglasses,
Googly as mismatched bulging eyes, Round as round eyes; Fang shows fangs, Shout is
open, Flat is a straight line, Smirk is lopsided, Grin shows teeth. Keep the attitude
with angry slab brows (`ctx.slab`) over the trait eyes.

## ctx

Card traits: `ctx.card` (dict), `ctx.number` (int), `ctx.flavor`, `ctx.eyes`, `ctx.mouth`,
`ctx.pose`, `ctx.rarity`, `ctx.level` (0 Pavement Card, 1 Fresh Drop, 2 Block Hitter,
3 Street Legend).

`ctx.head` (eyes and mouths only, set after the pose ran): `.cx .cy .r .tilt .flip .k` (k = r/100).

### Palette `ctx.pal`

| Field | Meaning |
|---|---|
| `base` | the flavor colour exactly as in the trait table |
| `body` | fill actually used for body coloured shapes (= base; on Licorice a lifted violet charcoal `#4E475E`, because `#262626` cannot carry ink outlines) |
| `shade` | cel shadow |
| `deep` | deep shadow / occlusion |
| `hi` | soft highlight |
| `spec` | hard specular (white) |
| `rim` | cyan rim light `#5CF2FF` |
| `ink` | outline `#0B0714` |
| `line` | detail lines drawn on body fills (ink on every flavor) |
| `feature` | bold face lines drawn straight on the body, e.g. a closed mouth (ink on every flavor) |
| `plane` | `None`, or on Licorice the lighter lit plane colour (ball sheen, lit lower lip) |
| `keyline` | `None` on every flavor today. If set, slabs and outlined face shapes get a keyline in this colour |
| `edge` | `None` (unused today): light edge colour `shaded()` would add |
| `accent`, `accent_shade`, `accent_hi` | gear colour (headband, wraps, sneakers) and its tones |
| `white`, `white_shade` | off white `#FBF7EE` and its shadow `#B9AFCB` (soles, teeth backing, plasters) |
| `dark` | True for Licorice |
| `rim_w` | rim width multiplier (1, 1.5 on Licorice) |
| `glow` | backdrop glow colours, engine use |

Never hard code a body colour. Draw detail on body fills with `ctx.line()` / `pal.line` /
`pal.feature`. Outlines are true ink on every flavor, Licorice included: no light keylines.
A cel shadow under a feature vanishes on Licorice; use a lit `pal.plane` stroke there instead.
Outlined white shapes (eye whites, teeth) are fine on every flavor.

### Helpers

Geometry (return path `d` strings):

- `ctx.limb(p0, p1, r0, r1, b1=0, b2=0)` muscle segment between two joints; `r0`/`r1`
  radius at each joint, `b1`/`b2` extra bulge on the left/right when walking p0 to p1.
  Chain two for an arm: shoulder to elbow, elbow to wrist.
- `ctx.rrect(x, y, w, h, r)`, `ctx.circle(cx, cy, r)`,
  `ctx.star(cx, cy, R, r=None, n=5, rot=-90)`, `ctx.sparkle(cx, cy, s)`.

Drawing (return SVG strings):

- `ctx.shaded(d, base=None, shade=None, dx=7, dy=-7, sw=6, extra="", rim=False, edge=None)`
  the cel shaded outlined shape, used for every limb. Fills `d` with shade, draws the lit
  copy shifted by (dx, dy) toward the light, clips to the shape, inks the outline.
  `rim=True` adds the cyan rim on the lower left. `base`/`shade` default to the body
  tones; pass `pal.accent, pal.accent_shade` for gear. `extra` is SVG drawn inside the clip.
  `d` must be one closed subpath.
- `ctx.outline(d, fill, sw=5, extra="")` flat fill + ink outline, `extra` clipped inside.
- `ctx.line(d, sw=3, color=None)` round capped detail line in `pal.line`.
- `ctx.slab(d, sw=4)` solid ink slab on the body (brows).
- `ctx.clipped(d, inner)` wraps `inner` in a clip to `d`.
- `ctx.halftone(color, cell=9, r=2.5, angle=30)` registers a dot pattern, returns the
  paint string `url(#id)` to use as a `fill`.
- `ctx.uid(prefix)` unique id. `ctx.mix(a, b, t)` hex colour mix.
- `ctx.rng(name)` a fresh `random.Random` seeded from card number + name. Same card and
  name gives the same stream regardless of call order. Use a name unique to your part.

Gear:

- `ctx.fist(c, rot=0, s=1.0, flip=False)` (alias `ctx.glove`) chunky body coloured fist,
  thumb + three fingers. `c` = centre of the palm block. Local box about x -48..56,
  y -50..44 before scale. At `rot=0` knuckles point up and the wrist is below at about
  (0, +44). `flip=True` mirrors the thumb side. Boss uses s 1.0 (far) and 1.1 (near).
- `ctx.wrap(c, rot=0, w=58)` accent wrist wrap with a torn end. `c` = wrist centre; at
  `rot=0` the band is horizontal. Draw it after the forearm, before the fist.
- `ctx.shoe(c, flip=False, rot=0, s=1.0)` (alias `ctx.sneaker`) accent high top. `c` =
  ankle. Local box x -40..94, y -36..63, toe toward +x; `flip=True` points the toe left.
- `ctx.plaster(c, rot=0, s=1.0)` crossed sticking plaster. `ctx.scuffs(c, rot=0, n=3)` scratches.

## Style rules

- Ink `#0B0714`, round joins and caps everywhere.
- Stroke widths in card units: body ball 8.3; limbs and big shapes 6; fingers, gear,
  eye and mouth outlines 5 to 5.5; creases and wrinkles 3 to 3.4; scuffs and hairlines 2.6.
  In head-local units divide by 1.19: feature outlines 4.6, mouth outline 5.5, creases 2.8 to 3.1.
- Shadow recipe (already in `pal`): `shade = mix(base, #4B2E83, .46)`,
  `deep = mix(base, #241047, .70)`, `hi = mix(base, #FFFFFF, .70)`. Lime, Orange,
  Licorice and Vanilla have hand tuned overrides. Gear: `accent_shade = mix(accent, #3A0A3A, .5)`.
  Shadows are purple toned, never grey or black.
- Cel shading is hard edged: no gradients, no blur, no opacity fades on the character.
  The lit area is the shape shifted up right by 4 to 8 units; shadow shows lower left.
- Rim light: cyan, lower left edge only, on body coloured shapes (`rim=True`). Not on gear.
- Highlights: one small `pal.hi` ellipse or streak per rounded form on its upper right;
  `pal.spec` white only for the hardest glints (ball gloss, eye glints, shades glare).
- Halftone only inside shadow transitions or flat graphic areas, in the shade colour.
- Battle damage (plasters, scuffs, cracks) is welcome, seeded from `ctx.rng`.
- Proportions: fists about as wide as 40% of the head, forearms thicker than upper
  arms, short thick legs, big sneakers (do not scale shoes below 0.9).

## Minimal worked example

A pose file that runs as is (arms hanging). It shows the interface only and is not
finished art: downward fists need their own drawing, see `poses/boss.py` for the
finished reference.

```python
def draw(ctx):
    L = ctx.limb
    back = [                                                  # far arm hangs behind the body
        ctx.shaded(L((350, 300), (402, 352), 26, 24, 8, 3), dx=6, dy=-8, rim=True),
        ctx.wrap((408, 372), 40, 56),
        ctx.fist((418, 396), 200, 0.95),
    ]
    legs = [
        ctx.shaded(L((214, 372), (200, 420), 28, 23, 4, 6), dx=7, dy=-4, rim=True),
        ctx.shaded(L((300, 372), (318, 420), 28, 23, 6, 4), dx=7, dy=-4, rim=True),
    ]
    shoes = [ctx.shoe((198, 428), flip=True), ctx.shoe((320, 428))]
    front = [                                                 # near arm in front
        ctx.shaded(L((166, 316), (112, 372), 27, 25, 4, 12), dx=6, dy=-8, rim=True),
        ctx.line("M150,322 q-14,8 -20,24", 3.2),              # bicep crease, visible on Licorice
        ctx.wrap((106, 384), -40, 58),
        ctx.fist((94, 410), 160, 1.05, flip=True),
    ]
    return dict(head=(256, 262), radius=116, tilt=-6,
                back=back, legs=legs, shoes=shoes, front=front,
                shadows=[(168, 78), (348, 78)])
```

An eye style in `eyes.py` (head-local, radius 100):

```python
def _round(ctx):
    ink = ctx.pal.ink
    white = lambda d: f'<path d="{d}" fill="#FFFFFF" stroke="{ink}" stroke-width="4.6" stroke-linejoin="round"/>'
    return (white(ctx.circle(-10, 10, 22)) + white(ctx.circle(56, 8, 20))
            + f'<circle cx="-2" cy="15" r="7.5" fill="{ink}"/><circle cx="48" cy="14" r="6.8" fill="{ink}"/>'
            + ctx.slab("M-48,-28 L22,2 L19,13 L-44,-13Z")      # angry brows over the eyes
            + ctx.slab("M89,-33 L28,2 L31,13 L85,-17Z")
            + ctx.line("M25,22 q-4,7 3,11", 2.8))              # nose tick
```

`draw_eyes(style, ctx)` and `draw_mouth(style, ctx)` receive the trait value as written
in the metadata (`"Heart"`, `"Fang"`) and must return a default for unknown styles.
