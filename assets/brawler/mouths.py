"""Mouths, head-local coordinates (see PARTS.md): origin = ball centre, ball
radius 100, +x toward the facing side, +y down.
Mouth zone: x -35..88, y 36..88 (the ball edge is at radius 100, stay inside it).

Five styles:
  Grin   the approved sample's wall of gritted teeth with a chipped tooth
  Smirk  closed lip line that kicks up on one side and flashes teeth there
  Shout  wide open yelling maw: upper teeth, tongue, dark throat
  Flat   one hard straight slab of a line, clenched jaw knots at the corners
  Fang   narrow dark snarl with two long fangs hanging over the lower lip
"""

STYLES = ("Grin", "Smirk", "Shout", "Flat", "Fang")
GUM = "#B8243F"
MAW = "#3A0D1A"
THROAT = "#1D0510"
TONGUE = "#F0527A"
TONGUE_SHADE = "#B62A5C"
TONGUE_HI = "#FF9DB5"
TOOTH_SHADE = "#C9C0DC"


def _lip(ctx, d, sw=5.5, cap="round"):
    """mouth line drawn straight on the body: pal.feature keeps it visible on Licorice"""
    return (f'<path d="{d}" fill="none" stroke="{ctx.pal.feature}" stroke-width="{sw}" '
            f'stroke-linecap="{cap}" stroke-linejoin="round"/>')


def _under(ctx, d, sw=5):
    """cel shadow stroke under a lip"""
    p = ctx.pal
    return (f'<path d="{d}" fill="none" stroke="{p.deep if p.dark else p.shade}" stroke-width="{sw}" '
            f'stroke-linecap="round" stroke-linejoin="round"/>')


def _open(ctx, d, fill, inner, sw=5.5):
    """open mouth shape: keyline on dark flavours, fill, clipped insides, ink outline"""
    p = ctx.pal
    o = ""
    if p.keyline:
        o += f'<path d="{d}" fill="none" stroke="{p.keyline}" stroke-width="{sw + 4.5}" stroke-linejoin="round"/>'
    return o + ctx.outline(d, fill, sw, inner)


def _tooth(ctx, d, sw=3.6):
    return f'<path d="{d}" fill="#FFFFFF" stroke="{ctx.pal.ink}" stroke-width="{sw}" stroke-linejoin="round"/>'


# ------------------------------------------------------------------ Grin
def _grin(ctx):
    p = ctx.pal
    mp = "M-31,44 C-6,54 48,50 85,33 C90,52 80,72 52,78 C20,83 -15,76 -31,44Z"
    inner = [f'<path d="M-37,35 L11,44 L0,83 L-37,83Z" fill="{TOOTH_SHADE}"/>',
             f'<path d="{mp}" fill="none" stroke="{GUM}" stroke-width="10"/>',
             f'<path d="M-26,57 C2,67 48,65 85,50" fill="none" stroke="{p.ink}" stroke-width="3.3"/>']
    for x in (-9, 11, 32, 54, 72):
        inner.append(f'<path d="M{x},41 L{x + 3},83" stroke="{p.ink}" stroke-width="2.8"/>')
    inner.append(f'<path d="M36,65 L41,55 L45,59 L49,52 L53,64Z" fill="{MAW}" stroke="{p.ink}" '
                 f'stroke-width="2.4" stroke-linejoin="round"/>')            # chipped tooth
    o = _open(ctx, mp, "#FFFFFF", "".join(inner))
    return o + ctx.line("M89,24 q7,7 3,17 M-37,37 q-6,6 -3,13 M13,91 q13,5 26,-1", 3.1)


# ------------------------------------------------------------------ Smirk
def _smirk(ctx):
    p = ctx.pal
    lip = "M-30,53 C-12,63 12,67 34,63"
    # the kicked up corner opens into a wedge that flashes two teeth
    wedge = "M27,64 C45,59 60,48 71,31 C82,43 80,59 67,67 C55,74 37,72 27,64Z"
    inner = (f'<path d="M19,50 L45,57 L40,81 L19,81Z" fill="{TOOTH_SHADE}"/>'
             f'<path d="{wedge}" fill="none" stroke="{GUM}" stroke-width="7.5"/>'
             f'<path d="M45,55 L49,77 M60,44 L66,71" stroke="{p.ink}" stroke-width="2.8"/>')
    o = _under(ctx, "M-24,61 C-8,69 10,73 26,71")
    o += _lip(ctx, lip, 6.4)
    o += _lip(ctx, "M-30,53 q-7,2 -9,10", 4.8)                                  # low corner turned down
    o += _open(ctx, wedge, "#FFFFFF", inner, 5.2)
    o += ctx.line("M77,20 q10,8 7,21", 3.4)                                      # cheek pushed up by the smirk
    o += ctx.line("M40,49 q11,-4 19,-15", 3.1)                                   # curled upper lip
    o += ctx.line("M6,85 q14,5 28,-1", 3.1)
    return o


# ------------------------------------------------------------------ Shout
def _shout(ctx):
    p = ctx.pal
    mp = "M-23,51 C0,40 52,36 78,40 C86,55 76,77 46,84 C14,90 -22,78 -23,51Z"
    teeth = "M-30,63 C0,53 52,49 86,53 L90,20 L-30,20Z"
    inner = [
        f'<path d="M-14,62 C14,52 48,52 74,58 C66,78 16,84 -14,62Z" fill="{THROAT}"/>',
        # tongue: shadow side, lit top, centre groove, wet highlight
        f'<path d="M-8,92 C-10,74 10,65 32,66 C56,67 72,75 70,92Z" fill="{TONGUE_SHADE}"/>',
        f'<path d="M-2,92 C-4,77 14,69 34,70 C56,71 70,78 68,92Z" fill="{TONGUE}"/>',
        f'<path d="M34,73 q-3,8 -1,16" fill="none" stroke="{TONGUE_SHADE}" stroke-width="3" stroke-linecap="round"/>',
        f'<path d="M46,74 q8,1 12,6" fill="none" stroke="{TONGUE_HI}" stroke-width="3" stroke-linecap="round"/>',
        f'<path d="{mp}" fill="none" stroke="{GUM}" stroke-width="9"/>',
        # upper teeth
        f'<path d="{teeth}" fill="#FFFFFF" stroke="{p.ink}" stroke-width="3.3" stroke-linejoin="round"/>',
        f'<path d="M-30,63 C-16,58.5 -4,55.5 6,54 L6,20 L-30,20Z" fill="{TOOTH_SHADE}"/>',
        f'<path d="M-30,63 C0,53 52,49 86,53" fill="none" stroke="{p.ink}" stroke-width="3.3"/>',
    ]
    for x in (5, 26, 47, 66):
        inner.append(f'<path d="M{x},22 L{x + 2},60" stroke="{p.ink}" stroke-width="2.8"/>')
    # two lower teeth poking up at the back corner
    inner.append(f'<path d="M-16,84 L-13,66 L-3,69 L-1,84Z" fill="{TOOTH_SHADE}" stroke="{p.ink}" stroke-width="2.8" stroke-linejoin="round"/>')
    o = _open(ctx, mp, MAW, "".join(inner))
    o += ctx.line("M86,29 q8,8 4,19 M-31,40 q-7,7 -4,16", 3.1)
    o += ctx.line("M8,93 q14,4 28,0", 3.1)
    return o


# ------------------------------------------------------------------ Flat
def _flat(ctx):
    p = ctx.pal
    slab = "M-25,54 L71,45 L72,52.5 L-24,61.5Z"
    if p.plane:      # dark flavour: a lit lower lip under the line instead of a shadow that would vanish
        o = (f'<path d="M-17,68.5 L63,61" fill="none" stroke="{p.plane}" stroke-width="6" stroke-linecap="round"/>'
             f'<path d="M12,66.6 L56,62.4" fill="none" stroke="{p.hi}" stroke-width="2.6" stroke-linecap="round"/>')
    else:
        o = _under(ctx, "M-20,67 L66,59", 5)
    o += ctx.slab(slab, 2.2)
    # jaw clenched: hard down ticks and knotted muscle at both corners
    o += _lip(ctx, "M-25,57 l-7,7 M71.5,49 l7,6", 4.8)
    o += ctx.line("M-38,50 q-7,9 -2,20 M80,38 q8,8 5,19", 3.1)
    o += ctx.line("M-44,58 q-3,5 -1,10", 2.6)
    o += ctx.line("M6,78 q20,5 40,-4", 3.1)                                      # chin set
    return o


# ------------------------------------------------------------------ Fang
def _fang(ctx):
    p = ctx.pal
    mp = "M-29,47 C-6,56 42,53 76,37 C81,50 72,63 50,67 C22,71 -16,67 -29,47Z"
    inner = (f'<path d="{mp}" fill="none" stroke="{GUM}" stroke-width="9"/>'
             # row of small top teeth between the fangs
             f'<path d="M15,49 L45,48 L44,57 L39,53 L34,59 L29,54 L24,60 L19,55Z" fill="#FFFFFF" '
             f'stroke="{p.ink}" stroke-width="2.6" stroke-linejoin="round"/>'
             # one stubby lower tooth
             f'<path d="M26,74 L30,63 L37,66 L40,74Z" fill="{TOOTH_SHADE}" stroke="{p.ink}" stroke-width="2.6" stroke-linejoin="round"/>')
    o = _open(ctx, mp, MAW, inner)
    # two long fangs from the upper lip, hanging over the lower lip
    for d, sh in (("M-9,50 C-4,62 2,72 8,79 C13,70 16,60 17,51Z", "M-9,50 C-4,62 2,72 8,79 C6,68 4,59 1,50Z"),
                  ("M43,52 C47,61 52,68 58,73 C62,65 64,55 64,44Z", "M43,52 C47,61 52,68 58,73 C56,65 53,57 51,50Z")):
        if p.keyline:
            o += f'<path d="{d}" fill="none" stroke="{p.keyline}" stroke-width="8" stroke-linejoin="round"/>'
        o += _tooth(ctx, d, 3.8) + f'<path d="{sh}" fill="{TOOTH_SHADE}"/>'
        o += f'<path d="{d}" fill="none" stroke="{p.ink}" stroke-width="3.8" stroke-linejoin="round"/>'
    o += ctx.line("M81,27 q7,7 3,17 M-35,39 q-6,6 -3,13", 3.1)
    o += ctx.line("M22,88 q10,3 20,-1", 3.1)
    return o


_DRAW = {"grin": _grin, "smirk": _smirk, "shout": _shout, "flat": _flat, "fang": _fang}


def draw_mouth(style, ctx):
    return _DRAW.get(str(style).lower(), _grin)(ctx)
