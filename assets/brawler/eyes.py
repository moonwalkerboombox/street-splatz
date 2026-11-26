"""Eyes, head-local coordinates (see PARTS.md): origin = ball centre, ball radius
100, +x toward the character's facing side (screen right), +y down.
Eye zone: x -48..90, y -36..36. Left eye centre about (-9, 10), right (57, 8).
The right eye is the far eye and is drawn about 10% smaller.

Five styles, all honest to the trait and all kept tough with slab brows:
  Round   big round whites, heavy lower lids, inward glare
  Googly  stuck-on plastic googly eyes, mismatched size, seeded wandering pupils
  Star    solid gold star eyes with a hot core and a sparkle
  Heart   solid hot pink heart eyes, cel shaded
  Shades  one-piece chunky street sunglasses with glare stripes and a glint
"""
import math

STYLES = ("Round", "Googly", "Star", "Heart", "Shades")

LID_SHADE = "#C9C0DC"      # brow shadow falling on an eye white (same as the tooth shade)

BROW_L = "M-48,-28 L22,2 L19,13 L-44,-13Z"            # the approved sample's brows
BROW_R = "M89,-33 L28,2 L31,13 L85,-17Z"
BROW_L_HI = "M-49,-32 L21,-5 L18,7 L-45,-17Z"         # a touch higher: shows more of the eye
BROW_R_HI = "M89,-36 L29,-5 L32,7 L86,-20Z"


# ------------------------------------------------------------------ shared bits
def _brows(ctx, l=BROW_L, r=BROW_R, scar=(-20, -22)):
    p = ctx.pal
    o = ctx.slab(l) + ctx.slab(r)
    if scar:
        x, y = scar
        # scar nicked through the left brow; clipped to the slab so it never pokes out as a stray line
        o += ctx.clipped(l, f'<path d="M{x + 2},{y - 6} l-10,30" stroke="{p.body}" stroke-width="3.6"/>')
    return o


def _creases(ctx, bags=True):
    """under eye creases + nose tick"""
    o = ctx.line("M25,22 q-4,7 3,11", 2.8)
    if bags:
        o += ctx.line("M-27,36 q13,7 28,4 M47,33 q13,2 22,-6", 2.8)
    return o


def _key(ctx, d, sw=4.6):
    """light keyline under an outlined shape, dark flavours only"""
    p = ctx.pal
    if not p.keyline:
        return ""
    return f'<path d="{d}" fill="none" stroke="{p.keyline}" stroke-width="{sw + 5}" stroke-linejoin="round"/>'


def _shape(ctx, d, fill, inner="", sw=4.6, key=True):
    """filled + ink outlined shape, inner svg clipped inside it"""
    return (_key(ctx, d, sw) if key else "") + ctx.outline(d, fill, sw, inner)


def _sticker(ctx, d, fill, shade, inner="", sw=4.6, lit=(4, -4)):
    """solid graphic eye (star, heart): white keyline, cel shadow on the lower
    left, ink outline. The keyline keeps it readable on any body colour."""
    p = ctx.pal
    body = (f'<path d="{d}" fill="{fill}" transform="translate({lit[0]} {lit[1]})"/>' + inner)
    return (f'<path d="{d}" fill="none" stroke="{p.white}" stroke-width="{sw + 6.5}" stroke-linejoin="round"/>'
            + ctx.outline(d, shade, sw, body))


def _pupil(ctx, x, y, r, glint=True):
    o = f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r:.1f}" fill="{ctx.pal.ink}"/>'
    if glint:
        o += (f'<circle cx="{x + r * .36:.1f}" cy="{y - r * .36:.1f}" r="{r * .34:.1f}" fill="#fff"/>'
              f'<circle cx="{x - r * .38:.1f}" cy="{y + r * .36:.1f}" r="{r * .15:.1f}" fill="#fff"/>')
    return o


def _heart(cx, cy, s, rot=0):
    d = (f"M0,{s:.1f} C{-s * .62:.1f},{s * .55:.1f} {-s * 1.28:.1f},{s * .1:.1f} {-s * 1.2:.1f},{-s * .48:.1f} "
         f"C{-s * 1.12:.1f},{-s * 1.12:.1f} {-s * .3:.1f},{-s * 1.2:.1f} 0,{-s * .5:.1f} "
         f"C{s * .3:.1f},{-s * 1.2:.1f} {s * 1.12:.1f},{-s * 1.12:.1f} {s * 1.2:.1f},{-s * .48:.1f} "
         f"C{s * 1.28:.1f},{s * .1:.1f} {s * .62:.1f},{s * .55:.1f} 0,{s:.1f}Z")
    return _xf(d, cx, cy, rot)


def _xf(d, cx, cy, rot=0):
    """translate + rotate an absolute M/C/L/Z path given as 'x,y' pairs"""
    a = math.radians(rot)
    ca, sa = math.cos(a), math.sin(a)
    out = []
    for tok in d.replace("Z", " Z").split():
        cmd = ""
        if tok[0] in "MCLZ":
            cmd, tok = tok[0], tok[1:]
        if not tok:
            out.append(cmd)
            continue
        x, y = (float(v) for v in tok.split(","))
        out.append(f"{cmd}{cx + x * ca - y * sa:.1f},{cy + x * sa + y * ca:.1f}")
    return " ".join(out)


# ------------------------------------------------------------------ Round
def _round_eye(ctx, cx, cy, r, px, py, pr, brow_shadow):
    p = ctx.pal
    d = ctx.circle(cx, cy, r)
    lid_y = cy + r * .74
    inner = (
        # shadow the brow throws on the eye white
        f'<path d="{brow_shadow}" fill="{LID_SHADE}" stroke="{LID_SHADE}" stroke-width="5" '
        f'stroke-linejoin="round" transform="translate(-1 8)"/>'
        + _pupil(ctx, px, py, pr)
        # heavy lower lid, body coloured, pushing up into the eye
        + f'<path d="M{cx - r - 4:.1f},{lid_y + 5:.1f} Q{cx:.1f},{lid_y - 9:.1f} {cx + r + 4:.1f},{lid_y + 3:.1f} '
          f'V{cy + r + 6:.1f} H{cx - r - 4:.1f}Z" fill="{ctx.mix(p.body, p.shade, .45)}" stroke="{p.ink}" stroke-width="3.4" stroke-linejoin="round"/>'
    )
    return _shape(ctx, d, "#FFFFFF", inner)


def _round(ctx):
    return (_round_eye(ctx, -10, 11, 25.5, 0.5, 12, 10.8, BROW_L_HI)
            + _round_eye(ctx, 57, 9, 22.5, 47.5, 10.5, 9.6, BROW_R_HI)
            + _brows(ctx, BROW_L_HI, BROW_R_HI, scar=(-21, -25))
            + _creases(ctx, bags=False)
            + ctx.line("M-30,41 q14,7 30,3 M46,37 q14,2 24,-7", 2.8))


# ------------------------------------------------------------------ Googly
def _googly_eye(ctx, cx, cy, r, ang, pr):
    """plastic stick-on eye: domed disc, loose pupil resting against the rim"""
    a = math.radians(ang)
    reach = r - pr - 4.2
    px, py = cx + math.cos(a) * reach, cy + math.sin(a) * reach
    d = ctx.circle(cx, cy, r)
    inner = (
        f'<path d="{ctx.circle(cx + 4, cy - 4, r)}" fill="#FFFFFF"/>'                       # lit dome
        f'<circle cx="{px:.1f}" cy="{py:.1f}" r="{pr:.1f}" fill="{ctx.pal.ink}"/>'
        f'<circle cx="{px + pr * .34:.1f}" cy="{py - pr * .36:.1f}" r="{pr * .3:.1f}" fill="#fff"/>'
        # dome glare arc, upper right
        f'<path d="M{cx + r * .12:.1f},{cy - r * .74:.1f} A{r * .75:.1f},{r * .75:.1f} 0 0 1 {cx + r * .72:.1f},{cy - r * .2:.1f}" '
        f'fill="none" stroke="#FFFFFF" stroke-width="{max(2.2, r * .13):.1f}" stroke-linecap="round"/>'
    )
    o = _key(ctx, d) + ctx.outline(d, LID_SHADE, 4.6, inner)
    # the glare has to show over the pupil too when they overlap
    return o


def _googly(ctx):
    rng = ctx.rng("eyes-googly")
    big_left = rng.random() < .62
    if big_left:
        (lx, ly, lr), (rx, ry, rr) = (-15, 5, 30), (58, 14, 17)
        lp, rp = 6.5, 8.5
        bl = "M-50,-36 L10,-27 L9,-16 L-49,-23Z"          # raised, flat: the wild eye
        br = "M88,-24 L34,-4 L37,7 L86,-9Z"               # hard down: the mean eye
        scar = None
    else:
        (lx, ly, lr), (rx, ry, rr) = (-12, 13, 19), (56, 4, 27)
        lp, rp = 9.5, 6
        bl = "M-46,-24 L16,-4 L13,7 L-43,-9Z"
        br = "M86,-37 L36,-29 L37,-18 L87,-25Z"
        scar = (-22, -18)
    lx += rng.uniform(-2, 2); ly += rng.uniform(-2.5, 2.5)
    rx += rng.uniform(-2, 2); ry += rng.uniform(-2.5, 2.5)
    # pupils wander independently, but never both the same way
    la = rng.uniform(0, 360)
    ra = (la + rng.uniform(110, 250)) % 360
    o = _googly_eye(ctx, lx, ly, lr, la, lp) + _googly_eye(ctx, rx, ry, rr, ra, rp)
    o += _brows(ctx, bl, br, scar=scar)
    return o + _creases(ctx, bags=False) + ctx.line(
        f"M{lx - lr * .7:.1f},{ly + lr + 6:.1f} q{lr * .6:.1f},6 {lr * 1.2:.1f},2 "
        f"M{rx - rr * .5:.1f},{ry + rr + 6:.1f} q{rr * .6:.1f},3 {rr * 1.1:.1f},-5", 2.8)


# ------------------------------------------------------------------ Star
STAR, STAR_SHADE, STAR_HOT = "#FFD21E", "#F2861A", "#FFF6B0"


def _star_eye(ctx, cx, cy, R, rot):
    d = ctx.star(cx, cy, R, R * .47, rot=rot)
    inner = (f'<path d="{ctx.star(cx + 2, cy - 2, R * .5, R * .235, rot=rot)}" fill="{STAR_HOT}"/>'
             f'<circle cx="{cx + R * .2:.1f}" cy="{cy - R * .22:.1f}" r="{R * .13:.1f}" fill="#fff"/>')
    return _sticker(ctx, d, STAR, STAR_SHADE, inner)


def _twinkle(ctx, x, y, s):
    return (f'<path d="{ctx.sparkle(x, y, s)}" fill="#FFFFFF" stroke="{ctx.pal.ink}" '
            f'stroke-width="2.6" stroke-linejoin="round"/>')


def _star(ctx):
    o = _star_eye(ctx, -11, 13, 30.5, -84) + _star_eye(ctx, 59, 11, 26.5, -98)
    o += _brows(ctx, BROW_L_HI, BROW_R_HI, scar=(-21, -25))
    o += _twinkle(ctx, -37, 33, 10) + _twinkle(ctx, 84, 29, 7.5)
    return o + _creases(ctx, bags=False)


# ------------------------------------------------------------------ Heart
HEART, HEART_SHADE, HEART_HI = "#FF2E63", "#B01245", "#FF9DB8"


def _heart_eye(ctx, cx, cy, s, rot):
    d = _heart(cx, cy, s, rot)
    a = math.radians(rot)
    # highlight streak on the upper right lobe + a dot
    hx, hy = cx + (s * .55) * math.cos(a) + (s * .5) * math.sin(a), cy + (s * .55) * math.sin(a) - (s * .5) * math.cos(a)
    inner = (f'<ellipse cx="{hx:.1f}" cy="{hy:.1f}" rx="{s * .3:.1f}" ry="{s * .16:.1f}" '
             f'transform="rotate({rot + 35:.0f} {hx:.1f} {hy:.1f})" fill="#fff"/>'
             f'<circle cx="{hx + s * .2:.1f}" cy="{hy + s * .42:.1f}" r="{s * .09:.1f}" fill="#fff"/>')
    return _sticker(ctx, d, HEART, HEART_SHADE, inner)


def _heart_eyes(ctx):
    o = _heart_eye(ctx, -11, 14, 23, -8) + _heart_eye(ctx, 58, 12, 20.5, 8)
    o += _brows(ctx, BROW_L_HI, BROW_R_HI, scar=(-21, -25))
    return o + _creases(ctx, bags=False) + ctx.line("M-30,44 q10,5 20,3 M56,40 q10,0 17,-6", 2.8)


# ------------------------------------------------------------------ Shades
LENS, LENS_LO, FRAME_HI = "#1A1338", "#4B2FA6", "#7A6FB5"


def _shades(ctx):
    p = ctx.pal
    frame = ("M-55,-23 L21,-10 L29,-10 L92,-26 L91,6 C88,27 65,37 45,31 C35,27 31,17 29,9 L21,9 "
             "C19,21 11,36 -9,37 C-34,38 -52,16 -55,-23Z")
    lens_l = "M-47,-12 L17,-1 C16,13 8,29 -9,30 C-29,31 -43,13 -47,-12Z"
    lens_r = "M34,-2 L86,-15 L85,5 C82,21 63,29 47,24 C39,21 35,10 34,-2Z"
    arm = "M-52,-20 L-97,-9 L-97,1 L-51,-8Z"
    o = ""
    if p.keyline:
        o += f'<path d="{frame} {arm}" fill="none" stroke="{p.keyline}" stroke-width="9.5" stroke-linejoin="round"/>'
    # shadow the glasses throw on the cheeks
    o += f'<path d="{frame}" fill="{p.deep if p.dark else p.shade}" transform="translate(-4 6)"/>'
    o += f'<path d="{arm}" fill="{p.ink}" stroke="{p.ink}" stroke-width="4" stroke-linejoin="round"/>'
    o += f'<path d="M-60,-15 L-92,-7" stroke="{FRAME_HI}" stroke-width="2.4" stroke-linecap="round"/>'
    o += f'<path d="{frame}" fill="{p.ink}" stroke="{p.ink}" stroke-width="4.6" stroke-linejoin="round"/>'

    def lens(d, stripes):
        inner = (f'<path d="M-60,14 L95,2 V45 H-60Z" fill="{LENS_LO}"/>'            # street glow in the lower half
                 f'<path d="M-60,22 L95,10 V45 H-60Z" fill="{ctx.halftone("#7C5CE6", 6, 1.7, 20)}"/>'
                 f'<path d="{stripes}" fill="{p.rim}"/>')
        return f'<path d="{d}" fill="{LENS}"/>' + ctx.clipped(d, inner)

    o += lens(lens_l, "M-30,-20 h13 l-21,60 h-13z M-9,-20 h5 l-21,60 h-5z")
    o += lens(lens_r, "M48,-24 h11 l-19,60 h-11z M66,-24 h4.5 l-19,60 h-4.5z")
    # chunky frame: top bar highlight, rivets
    o += (f'<path d="M-48,-18.5 L19,-7 M33,-7.5 L86,-21" fill="none" stroke="{FRAME_HI}" stroke-width="2.6" stroke-linecap="round"/>'
          f'<circle cx="87.5" cy="-18.5" r="2.1" fill="{p.white}"/><circle cx="-50" cy="-17.5" r="2.3" fill="{p.white}"/>')
    # hard glint on the far lens corner
    o += (f'<path d="{ctx.sparkle(78, -8, 11)}" fill="#FFFFFF" stroke="{p.ink}" stroke-width="2.4" stroke-linejoin="round"/>'
          f'<circle cx="-36" cy="-2" r="2.6" fill="#fff"/>')
    return o + ctx.line("M25,25 q-4,6 3,10", 2.8) + ctx.line("M-30,45 q12,6 24,3 M52,40 q12,0 20,-7", 2.8)


_DRAW = {"round": _round, "googly": _googly, "star": _star, "heart": _heart_eyes, "shades": _shades}


def draw_eyes(style, ctx):
    return _DRAW.get(str(style).lower(), _round)(ctx)
