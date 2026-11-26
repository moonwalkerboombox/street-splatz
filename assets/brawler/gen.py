#!/usr/bin/env python3
"""Street Splatz "Brawler" card generator.

    gen.py --cards 16,3,27 --out DIR     writes DIR/016.svg, 003.svg, 027.svg
    gen.py --all --out DIR               writes 001.svg .. 100.svg

Traits are read from assets/metadata/NNN.json. Output is fully deterministic:
the only randomness is ctx.rng(name), seeded from the card number.

This file is the engine: card chrome, backdrop, palettes, the gumball body,
the headband, and the Ctx helper object handed to the plug-in parts:

    poses/<pose>.py   draw(ctx)              -> dict (see PARTS.md)
    eyes.py           draw_eyes(style, ctx)  -> svg string, head-local coords
    mouths.py         draw_mouth(style, ctx) -> svg string, head-local coords

Parts must not import this module. Everything they need is on ctx.
Python 3 standard library only.
"""
import argparse, base64, importlib.util, json, math, os, random, sys, traceback
from types import SimpleNamespace

HERE = os.path.dirname(os.path.abspath(__file__))
META = os.path.normpath(os.path.join(HERE, "..", "metadata"))

W, H = 520, 760                       # card user units (rendered at 2x = 1040x1520)
PANEL = (34, 80, 452, 418)            # art panel x, y, w, h
GROUND_Y = 430                        # wall / pavement line
SOLE_Y = 491                          # y where sneaker soles rest
INK = "#0B0714"
RIM = "#5CF2FF"
WHITE = "#FBF7EE"
WHITE_SHADE = "#B9AFCB"
BIG = "M-3000,-3000H3000V3000H-3000Z"
STAT_KEYS = ["Jaw Smash", "Sugar Bomb", "Pucker Blast", "Flavor Drip", "Gutter Splat"]


# ------------------------------------------------------------------ colour
def hx(c):
    c = c.lstrip("#")
    return [int(c[i:i + 2], 16) for i in (0, 2, 4)]


def mix(a, b, t):
    a, b = hx(a), hx(b)
    return "#%02X%02X%02X" % tuple(round(a[i] * (1 - t) + b[i] * t) for i in range(3))


def lum(c):
    r, g, b = [(v / 255) ** 2.2 for v in hx(c)]
    return .2126 * r + .7152 * g + .0722 * b


FLAVORS = {
    # body colour (fixed by the set), accent = gear colour (headband, wrist wraps, sneakers)
    "Cherry":    dict(base="#E31E24", accent="#FFD21E"),
    "Blueberry": dict(base="#1A56FF", accent="#FF7A1A"),
    "Vanilla":   dict(base="#F0EAD6", accent="#FF3B2F"),
    "Licorice":  dict(base="#262626", accent="#FF3D8B"),
    "Grape":     dict(base="#7B3FE4", accent="#A6F02A"),
    "Lime":      dict(base="#5FD11A", accent="#9A4DFF"),
    "Orange":    dict(base="#FF8A1E", accent="#2F6BFF"),
    "Bubblegum": dict(base="#FF5CAD", accent="#16CFC4"),
}
# backdrop glow behind the character: halftone ring, mid disc, hot core, rays
GLOW_DEFAULT = dict(dots="#5A3CC0", mid="#4B31A8", core="#6B46D6", rays="#8E6BFF")
GLOWS = {
    "Blueberry": dict(dots="#A33A9E", mid="#8A2F93", core="#C64BB0", rays="#FF8AD8"),
    "Grape":     dict(dots="#1E8F9A", mid="#17788A", core="#27A9AE", rays="#7DF0E6"),
    "Licorice":  dict(dots="#8F7BEA", mid="#7B66E2", core="#B7A5FF", rays="#D9CEFF"),
    "Bubblegum": dict(dots="#2F55C8", mid="#2646B0", core="#3F6BE0", rays="#8FB4FF"),
}
OVERRIDES = {
    # Lime: the plain purple mix goes muddy, keep the shadow green but cool
    "Lime": dict(shade="#2F9A4E", deep="#1B5548"),
    "Orange": dict(shade="#C2503F"),
    # Licorice: the #262626 trait colour sits too close to the ink to carry ink
    # outlines, so the body is drawn as a lifted violet charcoal. Everything is
    # still outlined and detailed in true ink like the other flavours.
    "Licorice": dict(body="#4E475E", shade="#2F2939", deep="#1A1424", hi="#8F88AB",
                     plane="#655E7B", rim_w=1.5, spec="#EFEAFF"),
    "Vanilla": dict(spec="#FFFFFF", hi="#FFFDF4"),
}


def palette(flavor):
    f = FLAVORS.get(flavor, FLAVORS["Vanilla"])
    base, accent = f["base"], f["accent"]
    p = dict(
        flavor=flavor, base=base, body=base,
        shade=mix(base, "#4B2E83", .46), deep=mix(base, "#241047", .70),
        hi=mix(base, "#FFFFFF", .70), spec="#FFFFFF",
        rim=RIM, rim_w=1.0, ink=INK, line=INK, feature=INK, edge=None, keyline=None, plane=None,
        accent=accent, accent_shade=mix(accent, "#3A0A3A", .5), accent_hi=mix(accent, "#FFFFFF", .45),
        white=WHITE, white_shade=WHITE_SHADE,
        glow=dict(GLOW_DEFAULT, **GLOWS.get(flavor, {})),
    )
    p.update(OVERRIDES.get(flavor, {}))
    p["dark"] = lum(p["base"]) < .05
    return SimpleNamespace(**p)


RARITY = {
    "Street Legend": dict(level=3, g0="#FFE000", g1="#FF6A00", dim="#3A2A10"),
    "Block Hitter":  dict(level=2, g0="#E7A6FF", g1="#8E3DFF", dim="#2A1B4E"),
    "Fresh Drop":    dict(level=1, g0="#74E3FF", g1="#2F7BFF", dim="#1B2550"),
    "Pavement Card": dict(level=0, g0="#CFCBDA", g1="#8E899F", dim="#24212F"),
}

# ------------------------------------------------------------------ font
_FONT_FILE = os.path.join(HERE, "fonts", "bangers-latin.woff2")
_METRICS = json.load(open(os.path.join(HERE, "fonts", "bangers-metrics.json"), encoding="utf-8"))
FONT = 'font-family="SplatzBangers" font-kerning="none"'


def font_css():
    b = base64.b64encode(open(_FONT_FILE, "rb").read()).decode()
    return ('<style>@font-face{font-family:"SplatzBangers";'
            f'src:url(data:font/woff2;base64,{b}) format("woff2");}}'
            'text{font-kerning:none;font-variant-ligatures:none}</style>')


def text_w(s, size, spacing=0.0):
    """Width of s in Bangers at font-size `size` (kerning off) with letter-spacing."""
    return sum(_METRICS.get(ch, 450) for ch in s) * size / 1000 + spacing * len(s)


def fit(s, width, max_size, spacing=0.0):
    """Largest font size <= max_size at which s fits in width."""
    w1 = sum(_METRICS.get(ch, 450) for ch in s) / 1000
    return round(min(max_size, (width - spacing * len(s)) / w1), 2)


def text(x, y, s, size, fill, anchor="start", spacing=0.0, extra=""):
    ls = f' letter-spacing="{spacing}"' if spacing else ""
    if anchor == "middle" and spacing:
        x += spacing / 2          # letter-spacing trails the last glyph
    s = s.replace("&", "&amp;").replace("<", "&lt;")
    return f'<text x="{x:.1f}" y="{y:.1f}" {FONT} font-size="{size}" fill="{fill}" text-anchor="{anchor}"{ls} {extra}>{s}</text>'


# ------------------------------------------------------------------ geometry
def f1(v):
    return f"{v:.1f}".rstrip("0").rstrip(".") if "." in f"{v:.1f}" else f"{v:.1f}"


def rrect(x, y, w, h, r):
    return (f"M{x + r},{y} H{x + w - r} Q{x + w},{y} {x + w},{y + r} V{y + h - r} Q{x + w},{y + h} {x + w - r},{y + h} "
            f"H{x + r} Q{x},{y + h} {x},{y + h - r} V{y + r} Q{x},{y} {x + r},{y}Z")


def circle(x, y, r):
    return f"M{f1(x - r)},{f1(y)} a{r},{r} 0 1,0 {2 * r},0 a{r},{r} 0 1,0 {-2 * r},0Z"


def limb(p0, p1, r0, r1, b1=0, b2=0):
    """Muscle segment between two joints (closed path d). r0/r1 = radius at each
    joint, b1/b2 = extra bulge on the left/right side when walking p0 -> p1."""
    dx, dy = p1[0] - p0[0], p1[1] - p0[1]
    L = math.hypot(dx, dy) or 1
    ux, uy = dx / L, dy / L
    nx, ny = -uy, ux
    P = lambda p, a, b: (p[0] + ux * a + nx * b, p[1] + uy * a + ny * b)
    A, B, C, D = P(p0, 0, r0), P(p1, 0, r1), P(p1, 0, -r1), P(p0, 0, -r0)
    pts = [A, P(p0, L * .3, r0 + b1), P(p1, -L * .3, r1 + b1), B,
           P(p1, r1 * 1.33, r1), P(p1, r1 * 1.33, -r1), C,
           P(p1, -L * .3, -r1 - b2), P(p0, L * .3, -r0 - b2), D,
           P(p0, -r0 * 1.33, -r0), P(p0, -r0 * 1.33, r0), A]
    f = lambda p: f"{p[0]:.1f},{p[1]:.1f}"
    return (f"M{f(pts[0])} C{f(pts[1])} {f(pts[2])} {f(pts[3])} C{f(pts[4])} {f(pts[5])} {f(pts[6])} "
            f"C{f(pts[7])} {f(pts[8])} {f(pts[9])} C{f(pts[10])} {f(pts[11])} {f(pts[12])}Z")


def star(cx, cy, R, r=None, n=5, rot=-90):
    r = R * .42 if r is None else r
    pts = []
    for i in range(n * 2):
        a = math.radians(rot + i * 180 / n)
        q = R if i % 2 == 0 else r
        pts.append(f"{cx + math.cos(a) * q:.1f},{cy + math.sin(a) * q:.1f}")
    return "M" + " L".join(pts) + "Z"


def sparkle(cx, cy, s):
    """Four point comic sparkle, s = half height."""
    k = s * .3
    return (f"M{cx},{cy - s} L{cx + k},{cy - k} L{cx + s},{cy} L{cx + k},{cy + k} L{cx},{cy + s} "
            f"L{cx - k},{cy + k} L{cx - s},{cy} L{cx - k},{cy - k}Z")


# ------------------------------------------------------------------ ctx
class Ctx:
    """Everything a part needs. See PARTS.md for the contract."""
    INK, RIM, WHITE, WHITE_SHADE = INK, RIM, WHITE, WHITE_SHADE
    PANEL, GROUND_Y, SOLE_Y = PANEL, GROUND_Y, SOLE_Y
    # static geometry helpers
    rrect = staticmethod(rrect)
    circle = staticmethod(circle)
    limb = staticmethod(limb)
    star = staticmethod(star)
    sparkle = staticmethod(sparkle)
    mix = staticmethod(mix)

    def __init__(self, card):
        self.card = card
        self.number = int(card["number"])
        self.flavor, self.eyes, self.mouth = card["flavor"], card["eyes"], card["mouth"]
        self.pose, self.rarity = card["pose"], card["rarity"]
        self.pal = palette(card["flavor"])
        self.tier = RARITY.get(card["rarity"], RARITY["Fresh Drop"])
        self.level = self.tier["level"]
        self.defs = []
        self._n = 0
        self.head = None            # set by the engine after the pose ran: SimpleNamespace(cx, cy, r, tilt, flip, k)

    # ---- ids, rng, defs
    def uid(self, p="u"):
        self._n += 1
        return f"{p}{self._n}"

    def rng(self, name=""):
        """Fresh deterministic random.Random for this card + name. Same card and
        name always gives the same stream, whatever else has been drawn."""
        return random.Random(f"splatz:{self.number}:{name}")

    def halftone(self, color, cell=9, r=2.5, angle=30):
        """Register a halftone dot pattern, return the paint string url(#id)."""
        i = self.uid("ht")
        self.defs.append(
            f'<pattern id="{i}" width="{cell}" height="{cell}" patternUnits="userSpaceOnUse" patternTransform="rotate({angle})">'
            f'<circle cx="{cell / 2}" cy="{cell / 2}" r="{r}" fill="{color}"/></pattern>')
        return f"url(#{i})"

    def clipped(self, d, inner):
        """inner svg clipped to path d (same coordinate space as where it is used)."""
        i = self.uid("cp")
        return f'<clipPath id="{i}"><path d="{d}"/></clipPath><g clip-path="url(#{i})">{inner}</g>'

    # ---- core drawing
    def shaded(self, d, base=None, shade=None, dx=7, dy=-7, sw=6, extra="", rim=False, edge=None):
        """Cel shaded outlined shape. Shadow fill, lit copy shifted toward the
        light (up right) by dx,dy, optional cyan rim on the lower left, ink line.
        base/shade default to the body tones. extra = svg drawn inside the clip."""
        p = self.pal
        body_col = base is None
        base = p.body if base is None else base
        shade = p.shade if shade is None else shade
        if edge is None:
            edge = p.edge if body_col else None
        i = self.uid("c")
        o = [f'<clipPath id="{i}"><path d="{d}"/></clipPath>',
             f'<path d="{d}" fill="{p.rim if rim else shade}"/>',
             f'<g clip-path="url(#{i})">']
        if rim:
            o.append(f'<path d="{d}" fill="{shade}" transform="translate({3.5 * p.rim_w:.1f} {-3 * p.rim_w:.1f})"/>')
        o.append(f'<path d="{d}" fill="{base}" transform="translate({dx} {dy})"/>')
        if edge:   # dark flavours: light edge on the lit side so black shapes separate
            o.append(f'<path d="{BIG}{d}" fill="{edge}" fill-rule="evenodd" transform="translate(-6.5 6.5)"/>')
        o.append(extra + '</g>')
        o.append(f'<path d="{d}" fill="none" stroke="{p.ink}" stroke-width="{sw}" stroke-linejoin="round" stroke-linecap="round"/>')
        return "".join(o)

    def outline(self, d, fill, sw=5, extra=""):
        """Flat filled shape with an ink outline (optionally extra svg clipped inside)."""
        inner = self.clipped(d, extra) if extra else ""
        return (f'<path d="{d}" fill="{fill}"/>{inner}'
                f'<path d="{d}" fill="none" stroke="{self.pal.ink}" stroke-width="{sw}" stroke-linejoin="round" stroke-linecap="round"/>')

    def line(self, d, sw=3, color=None):
        """Detail line drawn ON a body coloured fill (crease, scuff, wrinkle).
        Uses pal.line so it stays visible on Licorice."""
        return (f'<path d="{d}" fill="none" stroke="{color or self.pal.line}" stroke-width="{sw}" '
                f'stroke-linecap="round" stroke-linejoin="round"/>')

    def slab(self, d, sw=4):
        """Solid ink slab sitting on the body (angry brow). Gets a light keyline on dark flavours."""
        p = self.pal
        under = (f'<path d="{d}" fill="none" stroke="{p.keyline}" stroke-width="{sw + 4.5}" stroke-linejoin="round"/>'
                 if p.keyline else "")
        return under + f'<path d="{d}" fill="{p.ink}" stroke="{p.ink}" stroke-width="{sw}" stroke-linejoin="round"/>'

    # ---- ready made gear
    def fist(self, c, rot=0, s=1.0, flip=False):
        """Oversized cartoon fist in body colour: thumb + three fingers.
        c = centre of the palm block, local box about 96 x 92 before scale.
        rot 0 = knuckles up, wrist at the bottom (0,+42). flip mirrors the thumb side."""
        p = self.pal
        fl = " scale(-1 1)" if flip else ""
        o = [f'<g transform="translate({c[0]} {c[1]}) rotate({rot}) scale({s}){fl}">']
        o.append(self.shaded(rrect(-41, -18, 82, 60, 20), dx=8, dy=-8, rim=True))
        for x, y, h in ((-46, -42, 50), (-16, -47, 55), (14, -43, 51)):
            o.append(self.shaded(rrect(x, y, 32, h, 14), dx=6, dy=-6, sw=5.5, rim=True,
                                 extra=f'<ellipse cx="{x + 21}" cy="{y + 10}" rx="6" ry="3.5" fill="{p.hi}"/>'))
            o.append(self.line(f"M{x + 8},{y + 27} q8,6 17,0", 3.2))
        o.append(self.shaded(limb((40, 12), (-12, 24), 15, 14, 2, 3), dx=5, dy=-6, sw=5.5))
        o.append(self.line("M-17,16 q4,7 1,14", 3))
        o.append(self.line("M-30,36 q12,6 26,3", 3))
        o.append('</g>')
        return "".join(o)

    glove = fist

    def wrap(self, c, rot=0, w=58):
        """Accent coloured wrist wrap with a torn loose end. c = wrist centre,
        rot 0 = band lies horizontal (forearm runs vertically through it)."""
        p = self.pal
        return (f'<g transform="translate({c[0]} {c[1]}) rotate({rot})">'
                + self.shaded(rrect(-w / 2, -15, w, 30, 7), p.accent, p.accent_shade, 6, -5, 5.5)
                + f'<path d="M{-w / 2 + 4},-3 L{w / 2 - 4},-9 M{-w / 2 + 4},8 L{w / 2 - 4},2" stroke="{p.ink}" stroke-width="3" stroke-linecap="round"/>'
                + f'<path d="M{-w / 2 + 2},6 l-14,10 l5,3 l-7,7 l12,-3 l8,-10z" fill="{p.accent}" stroke="{p.ink}" stroke-width="4" stroke-linejoin="round"/>'
                + '</g>')

    def shoe(self, c, flip=False, rot=0, s=1.0):
        """Chunky high top sneaker in the accent colour. c = ankle; local box
        x -40..94, y -36..63 (sole bottom at ankle y + 63), toe toward +x.
        flip=True points the toe toward -x."""
        p = self.pal
        g, g2, wht, wsh = p.accent, p.accent_shade, p.white, p.white_shade
        fl = " scale(-1 1)" if flip else ""
        sc = f" scale({s})" if s != 1 else ""
        o = [f'<g transform="translate({c[0]} {c[1]}) rotate({rot}){sc}{fl}">']
        o.append(f'<path d="M10,-14 L16,-36 L36,-30 L30,-6Z" fill="{wht}" stroke="{p.ink}" stroke-width="5" stroke-linejoin="round"/>')
        o.append(self.shaded("M-27,-12 L24,-14 L28,10 C52,10 78,22 86,38 L88,50 L-34,50 L-31,6Z", g, g2, 7, -6, 6))
        o.append(self.shaded("M50,50 C46,34 52,22 60,15 C74,20 84,29 87,40 L88,50Z", wht, wsh, 4, -4, 5))
        o.append(self.shaded(rrect(-31, -24, 60, 17, 8), wht, wsh, 4, -3, 5))
        o.append(self.shaded(rrect(-40, 44, 134, 19, 8), wht, wsh, 0, -6, 6))
        for x in (-20, -2, 16, 34, 52, 70):
            o.append(f'<path d="M{x},56 v7" stroke="{p.ink}" stroke-width="3"/>')
        for x, y in ((16, 0), (24, 9), (34, 16)):
            o.append(f'<path d="M{x - 9},{y + 5} L{x + 10},{y - 3}" stroke="{p.ink}" stroke-width="8" stroke-linecap="round"/>'
                     f'<path d="M{x - 9},{y + 5} L{x + 10},{y - 3}" stroke="{wht}" stroke-width="3.5" stroke-linecap="round"/>')
        o.append(f'<circle cx="-8" cy="14" r="10" fill="{wht}" stroke="{p.ink}" stroke-width="4"/>'
                 f'<path d="M-8,7 l2.5,5 5.5,.6 -4,3.8 1,5.4 -5,-2.7 -5,2.7 1,-5.4 -4,-3.8 5.5,-.6z" fill="{g}"/>')
        o.append(f'<path d="M-30,36 C0,30 30,34 50,40" fill="none" stroke="{p.ink}" stroke-width="3"/>')
        o.append('</g>')
        return "".join(o)

    sneaker = shoe

    def plaster(self, c, rot=0, s=1.0):
        """Crossed sticking plaster (battle damage sticker)."""
        p = self.pal
        r = (f'<rect x="-13" y="-5" width="26" height="10" rx="3" transform="rotate({{}})" fill="{p.white}" '
             f'stroke="{p.ink}" stroke-width="3"/>')
        return f'<g transform="translate({c[0]} {c[1]}) rotate({rot}) scale({s})">' + r.format(35) + r.format(-35) + '</g>'

    def scuffs(self, c, rot=0, n=3):
        """n short parallel scratch marks."""
        d = " ".join(f"M{i * 9},{-i * 3} l8,8" for i in range(n))
        return f'<g transform="translate({c[0]} {c[1]}) rotate({rot})">' + self.line(d, 2.6) + '</g>'


# ------------------------------------------------------------------ parts loading
_mods = {}


def _load(path):
    if path not in _mods:
        name = "brawler_part_" + os.path.splitext(os.path.basename(path))[0]
        spec = importlib.util.spec_from_file_location(name, path)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        _mods[path] = mod
    return _mods[path]


_warned = set()


def _warn(msg, once=None):
    if once is not None:
        if once in _warned:
            return
        _warned.add(once)
    print("gen.py: " + msg, file=sys.stderr)


def _join(v):
    if v is None:
        return ""
    return v if isinstance(v, str) else "\n".join(v)


def run_pose(ctx, strict=False):
    slug = ctx.pose.lower().replace(" ", "_")
    path = os.path.join(HERE, "poses", slug + ".py")
    if os.path.exists(path):
        try:
            n0, d0 = ctx._n, len(ctx.defs)
            res = _load(path).draw(ctx)
            res["head"], res["radius"]          # required keys
            return res
        except Exception:
            if strict:
                raise
            _warn(f"card {ctx.number}: pose {ctx.pose!r} failed, falling back to Boss\n" + traceback.format_exc())
            ctx._n = n0
            del ctx.defs[d0:]
    elif slug != "boss":
        _warn(f"no poses/{slug}.py yet, pose {ctx.pose!r} falls back to Boss", once=slug)
    return _load(os.path.join(HERE, "poses", "boss.py")).draw(ctx)


def run_face(ctx, strict=False):
    out = []
    for fname, fn, style, default in (("eyes.py", "draw_eyes", ctx.eyes, "Round"),
                                      ("mouths.py", "draw_mouth", ctx.mouth, "Grin")):
        mod = _load(os.path.join(HERE, fname))
        try:
            out.append(getattr(mod, fn)(style, ctx))
        except Exception:
            if strict:
                raise
            _warn(f"card {ctx.number}: {fn}({style!r}) failed, using {default}\n" + traceback.format_exc())
            out.append(getattr(mod, fn)(default, ctx))
    return out


# ------------------------------------------------------------------ head (body ball + headband)
# Fragments below marked LEG are in the approved sample's coordinates
# (ball centre 250,282 radius 108) and mapped into head-local space (radius 100).
LEG = '<g transform="scale(.92593) translate(-250 -282)">'


def head_tf(h, rotate=True):
    t = f'translate({f1(h.cx)} {f1(h.cy)})'
    if rotate and h.tilt:
        t += f' rotate({f1(h.tilt)})'
    t += f' scale({h.k:.4f})'
    if rotate and h.flip:
        t += ' scale(-1 1)'
    return t


def headband_tails(ctx):
    p = ctx.pal
    g, g2 = p.accent, p.accent_shade
    o = ['<g id="gear-headband-tails" transform="%s">' % head_tf(ctx.head), LEG]
    o.append(ctx.shaded("M150,246 C128,226 104,236 84,206 L72,214 L80,222 L62,226 L74,236 L60,246 C92,262 122,246 148,268Z",
                        g, g2, 4, -7, 6))
    o.append(ctx.shaded("M150,256 C126,268 112,262 92,286 L80,280 L84,292 L68,292 L80,304 L72,314 C104,310 118,290 150,276Z",
                        g, g2, 4, -7, 6))
    o.append(f'<path d="M132,244 q-16,-4 -30,-14 M130,274 q-14,4 -26,16" fill="none" stroke="{p.ink}" stroke-width="2.6" stroke-linecap="round"/>')
    o.append('</g></g>')
    return "".join(o)


def crack(rng, ang, length=30):
    """Jagged crack starting on the rim at angle ang (deg), running inward. Head-local."""
    a = math.radians(ang)
    x, y = math.cos(a) * 97, math.sin(a) * 97
    ix, iy = -math.cos(a), -math.sin(a)
    tx, ty = -iy, ix
    pts, twigs = [(x, y)], []
    side = rng.choice((-1, 1))
    steps = rng.randint(3, 4)
    for i in range(steps):
        step = length / steps * rng.uniform(.8, 1.25)
        j = side * rng.uniform(5, 9)
        x, y = x + ix * step + tx * j, y + iy * step + ty * j
        pts.append((x, y))
        if i < steps - 1 and rng.random() < .7:
            twigs.append(f"M{x:.1f},{y:.1f} l{tx * j * 1.2 + ix * 3:.1f},{ty * j * 1.2 + iy * 3:.1f}")
        side = -side
    main = "M" + " L".join(f"{px:.1f},{py:.1f}" for px, py in pts)
    return main, " ".join(twigs)


def body(ctx):
    """The gumball: flat base, halftone band, shadow crescent, deep shadow, rim light, gloss."""
    p, h = ctx.pal, ctx.head
    ball = circle(0, 0, 100)
    ht = ctx.halftone(p.shade, 8.3, 2.3)
    rw = p.rim_w
    inner = [
        f'<path d="{circle(18.5, -15.7, 91.7)}{circle(35.2, -29.6, 88.9)}" fill="{ht}" fill-rule="evenodd"/>',
        f'<path d="{BIG}{circle(18.5, -15.7, 91.7)}" fill="{p.shade}" fill-rule="evenodd"/>',
        f'<path d="{BIG}{circle(8.3, -7.4, 99.1)}" fill="{p.deep}" fill-rule="evenodd" opacity=".55"/>',
        f'<path d="{BIG}{circle(4.6 * rw, -3.7 * rw, 99.1)}" fill="{p.rim}" fill-rule="evenodd"/>',
    ]
    if p.plane:  # dark flavour: a hard edged lighter plane on the lit side so the ball reads as a glossy sphere
        inner.insert(0, f'<path d="{BIG}{circle(-16, 14, 97)}" fill="{p.plane}" fill-rule="evenodd"/>')
        inner.append(f'<path d="M-66,-50 C-42,-84 6,-98 48,-84 C10,-80 -30,-70 -66,-50Z" fill="{p.hi}"/>')
    inner += [
        f'<path d="M5.6,-87 C24,-92.6 46.3,-88.9 63,-75.9 C44.4,-81.5 24,-85.2 5.6,-87Z" fill="{p.spec}"/>',
        f'<ellipse cx="76.9" cy="-55.6" rx="4.6" ry="7.4" transform="rotate(-38 76.9 -55.6)" fill="{p.spec}"/>',
        f'<path d="M-50,-63 C-42.6,-74 -31.5,-81.5 -20.4,-85.2 C-29.6,-77.8 -38.9,-70.4 -50,-63Z" fill="{p.hi}"/>',
    ]
    o = [f'<g id="body" transform="{head_tf(h, rotate=False)}">',
         f'<path d="{ball}" fill="{p.body}"/>', ctx.clipped(ball, "".join(inner)),
         f'<path d="{ball}" fill="none" stroke="{p.ink}" stroke-width="7"/>', '</g>']
    # battle damage: seeded shell cracks + scuffs, rotate with the head
    rng = ctx.rng("cracks")
    zones = [(-125, -62), (118, 140), (150, 172), (180, 202)]   # top (above band), then lower back: clear of the face
    picks = [zones[0]] + rng.sample(zones[1:], rng.choice((1, 1, 2)))
    o.append(f'<g id="damage" transform="{head_tf(h)}">')
    for a0, a1 in picks:
        main, twigs = crack(rng, rng.uniform(a0, a1), rng.uniform(24, 34))
        if p.dark:   # thin light lip on one side so the ink crack reads on charcoal
            o.append(f'<g transform="translate(2 1.6)">{ctx.line(main, 2, p.hi)}</g>')
        o.append(ctx.line(main, 3.2))
        if twigs:
            o.append(ctx.line(twigs, 2.4))
    sa = math.radians(rng.uniform(128, 146))
    o.append(ctx.scuffs((math.cos(sa) * 76, math.sin(sa) * 76), rng.uniform(-15, 15)))
    o.append('</g>')
    return "".join(o)


def headband(ctx):
    p, h = ctx.pal, ctx.head
    g, g2, ghi = p.accent, p.accent_shade, p.accent_hi
    band = "M138,272 Q250,214 362,254 L358,220 Q250,180 144,240Z"
    sball = circle(250, 282, 108)
    cres = BIG + circle(270, 265, 99)
    band_in = (f'<path d="{cres}" fill="{g2}" fill-rule="evenodd"/>'
               f'<path d="M138,276 Q250,218 362,258" fill="none" stroke="{g2}" stroke-width="9"/>'
               f'<path d="M250,203 Q300,206 340,220" fill="none" stroke="{ghi}" stroke-width="5" stroke-linecap="round"/>')
    on_ball = (f'<path d="M138,280 Q250,222 362,262" fill="none" stroke="{p.deep if p.dark else p.shade}" stroke-width="12"/>'
               f'<path d="{band}" fill="{g}"/>' + ctx.clipped(band, band_in)
               + f'<path d="{band}" fill="none" stroke="{p.ink}" stroke-width="5.5" stroke-linejoin="round"/>'
               + f'<path d="M190,236 q6,8 2,18 M300,206 q6,10 2,22" fill="none" stroke="{p.ink}" stroke-width="2.6" stroke-linecap="round"/>')
    o = [f'<g id="gear-headband" transform="{head_tf(h)}">', LEG, ctx.clipped(sball, on_ball)]
    o.append(ctx.shaded("M136,244 L156,238 C166,246 168,262 160,276 L140,282 C130,272 128,254 136,244Z", g, g2, 4, -5, 5.5))
    o.append(f'<path d="M146,246 q6,14 0,30" fill="none" stroke="{p.ink}" stroke-width="2.6" stroke-linecap="round"/>')
    o.append('</g></g>')
    return "".join(o)


# ------------------------------------------------------------------ backdrop
def _prop(kind, x, y, rng):
    """Small wall prop, top left corner at x,y, about 64 x 52."""
    if kind == "window":
        lit = rng.random() < .6
        pane = "#FFD86B" if lit else "#241A52"
        return (f'<rect x="{x}" y="{y}" width="62" height="48" fill="#0E0926" stroke="{INK}" stroke-width="4"/>'
                f'<rect x="{x + 5}" y="{y + 5}" width="52" height="38" fill="{pane}" opacity="{.75 if lit else 1}"/>'
                f'<path d="M{x + 22},{y + 3} v42 M{x + 40},{y + 3} v42" stroke="{INK}" stroke-width="4"/>'
                f'<rect x="{x - 5}" y="{y + 46}" width="72" height="7" fill="#2A2158" stroke="{INK}" stroke-width="3"/>')
    if kind == "poster":
        r = rng.uniform(-7, 7)
        return (f'<g transform="rotate({r:.1f} {x + 28} {y + 30})">'
                f'<path d="M{x + 4},{y} h48 v58 l-10,-5 l-8,7 l-10,-6 l-9,5 l-11,-4z" fill="#8C7AD8" stroke="{INK}" stroke-width="3.5" stroke-linejoin="round"/>'
                f'<circle cx="{x + 28}" cy="{y + 20}" r="10" fill="#2A2158"/>'
                f'<path d="M{x + 12},{y + 38} h32 M{x + 16},{y + 46} h24" stroke="#2A2158" stroke-width="4" stroke-linecap="round"/>'
                f'<circle cx="{x + 28}" cy="{y + 5}" r="2.5" fill="{INK}"/></g>')
    if kind == "vent":
        s = "".join(f'<path d="M{x + 7},{y + 9 + i * 8} h46" stroke="{INK}" stroke-width="3.5"/>' for i in range(4))
        return (f'<rect x="{x}" y="{y}" width="60" height="42" rx="4" fill="#2A2158" stroke="{INK}" stroke-width="4"/>{s}'
                f'<path d="M{x + 14},{y + 44} v20 M{x + 40},{y + 44} v12" stroke="#120D2B" stroke-width="5" stroke-linecap="round" opacity=".7"/>')
    # tag: spray painted crown
    return (f'<path d="M{x + 4},{y + 44} L{x},{y + 10} L{x + 18},{y + 26} L{x + 31},{y + 2} L{x + 44},{y + 26} L{x + 62},{y + 10} L{x + 58},{y + 44}Z" '
            f'fill="none" stroke="#B48CFF" stroke-width="5" stroke-linejoin="round" opacity=".8"/>'
            f'<path d="M{x + 12},{y + 46} v14 M{x + 50},{y + 46} v9" stroke="#B48CFF" stroke-width="4" stroke-linecap="round" opacity=".6"/>')


def background(ctx, pose):
    p, lvl = ctx.pal, ctx.level
    gl = p.glow
    rng = ctx.rng("backdrop")
    px, py, pw, ph = PANEL
    hx_, hy_ = pose["head"]
    gx, gy = hx_ + 12, hy_ + 6                      # glow centre follows the head
    o = ['<!-- BACKDROP: night alley, details seeded from the card number -->',
         '<g id="scene" clip-path="url(#panelclip)">',
         f'<rect x="{px}" y="{py}" width="{pw}" height="{ph}" fill="url(#wall)"/>',
         f'<rect x="{px}" y="{py}" width="{pw}" height="350" fill="url(#brick)" transform="translate({rng.choice((0, 14, 28, 42))} 0)"/>']
    # lit bricks on a seeded grid
    cells = [(c, r) for r in range(0, 24) for c in range(0, 9)]
    for c, r in rng.sample(cells, 9):
        bx = 34 + c * 56 + (28 if r % 2 else 0) - 28
        by = 80 + r * 14
        if by < 420:
            o.append(f'<rect x="{bx}" y="{by}" width="56" height="14" fill="#3A2A78" opacity=".55"/>')
    pipe_left = rng.random() < .5
    kind = rng.choice(("window", "poster", "vent", "tag"))
    wall_prop = _prop(kind, (404 if pipe_left else 52) + rng.randint(-6, 6), 98 + rng.randint(0, 22), rng)
    # street lamp glow + halftone ring
    ht = ctx.halftone(gl["dots"])
    k = .86 if lvl == 0 else 1
    o.append(f'<circle cx="{gx:.0f}" cy="{gy:.0f}" r="196" fill="{ht}" opacity=".8"/>')
    o.append(f'<circle cx="{gx:.0f}" cy="{gy:.0f}" r="160" fill="{gl["mid"]}" opacity="{.75 * k:.2f}"/>')
    o.append(f'<circle cx="{gx:.0f}" cy="{gy:.0f}" r="128" fill="{gl["core"]}" opacity="{.55 * k:.2f}"/>')
    if lvl >= 1:                                     # action rays
        n = 16 if lvl >= 2 else 12
        a0 = rng.uniform(0, math.tau / n)
        for i in range(n):
            a = i * math.tau / n + a0
            x1, y1 = gx + math.cos(a - .035) * 420, gy + math.sin(a - .035) * 420
            x2, y2 = gx + math.cos(a + .035) * 420, gy + math.sin(a + .035) * 420
            x0, y0 = gx + math.cos(a) * 150, gy + math.sin(a) * 150
            o.append(f'<path d="M{x0:.0f},{y0:.0f} L{x1:.0f},{y1:.0f} L{x2:.0f},{y2:.0f}Z" fill="{gl["rays"]}" opacity=".16"/>')
    o.append(wall_prop)                              # over the halo dots, so they never speckle it
    # drain pipe
    x = 48 if pipe_left else 454
    c1, c2 = sorted(rng.sample(range(150, 360, 30), 2))
    o.append(f'<rect x="{x}" y="80" width="18" height="352" fill="#1A1438" stroke="{INK}" stroke-width="4"/>'
             f'<rect x="{x - 4}" y="{c1}" width="26" height="12" fill="#2A2158" stroke="{INK}" stroke-width="3"/>'
             f'<rect x="{x - 4}" y="{c2}" width="26" height="12" fill="#2A2158" stroke="{INK}" stroke-width="3"/>'
             f'<rect x="{x + 4}" y="80" width="4" height="352" fill="#3A2D78"/>')
    # ground
    o.append(f'<rect x="34" y="{GROUND_Y}" width="452" height="70" fill="#120D2B"/>'
             f'<path d="M34,{GROUND_Y} H486" stroke="#4A3A94" stroke-width="4"/>'
             f'<path d="M34,{GROUND_Y + 12} H486" stroke="{INK}" stroke-width="3"/>')
    mx = 256 + rng.randint(-10, 10)
    o.append(f'<ellipse cx="{mx}" cy="472" rx="176" ry="20" fill="#2C2260" stroke="{INK}" stroke-width="4"/>'
             f'<ellipse cx="{mx}" cy="472" rx="160" ry="15" fill="none" stroke="#6652C4" stroke-width="2.5"/>'
             f'<path d="M{mx - 148},472 h22 M{mx - 16},478 h34 M{mx - 16},468 h34 M{mx + 128},472 h22" stroke="#6652C4" stroke-width="3" stroke-linecap="round"/>')
    steam = ("M{0},{1} c-18,-6 -22,-30 -6,-40 c-14,-18 0,-40 18,-36 c-4,-22 16,-36 32,-24 c14,-14 38,-2 32,18 "
             "c18,4 20,30 4,38 c10,18 -6,38 -24,32 c-8,14 -44,22 -56,12Z")
    j = lambda v, a=12: v + rng.randint(-a, a)
    o.append(f'<path d="{steam.format(j(74), j(452, 6))}" fill="#B7A6FF" opacity=".42"/>')
    o.append(f'<path d="{steam.format(j(70), j(372, 8))}" fill="#B7A6FF" opacity=".18" transform="scale(.8) translate(26 100)"/>')
    o.append(f'<path d="{steam.format(j(396), j(470, 6))}" fill="#B7A6FF" opacity=".30"/>')
    o.append(f'<path d="{steam.format(j(420), j(400, 8))}" fill="#B7A6FF" opacity=".16"/>')
    # pose effects (speed lines etc.), richer tiers only
    if lvl >= 1:
        o.append(_join(pose.get("fx")))
    # sparkles: 0 / 1 / 2 / 3 by tier
    spots = ([(150, 104, 14), (88, 172, 11), (470, 400, 10)] if pipe_left
             else [(152, 106, 14), (56, 196, 11), (60, 404, 10)])
    for sx, sy, ss in spots[:lvl]:
        o.append(f'<path d="{sparkle(sx + rng.randint(-5, 5), sy + rng.randint(-6, 6), ss)}" fill="#FFE14A" stroke="{INK}" stroke-width="3" stroke-linejoin="round"/>')
    # contact shadows
    for sx, srx in pose.get("shadows") or [(hx_, 150)]:
        o.append(f'<ellipse cx="{sx}" cy="{SOLE_Y - 1}" rx="{srx}" ry="7" fill="{INK}" opacity=".8"/>')
    o.append('</g>')
    return "\n".join(o)


# ------------------------------------------------------------------ card chrome
def frame(ctx):
    lvl = ctx.level
    rng = ctx.rng("frame")
    o = [f'<rect x="6" y="6" width="508" height="748" rx="28" fill="#0A0814"/>']
    if lvl == 0:
        o.append('<rect x="14" y="14" width="492" height="732" rx="22" fill="none" stroke="url(#rar)" stroke-width="5"/>')
        # worn: nicks cut through the frame line and a few scratches
        for _ in range(9):
            side = rng.choice("TBLR")
            t = rng.uniform(.08, .92)
            if side in "TB":
                x, y = 14 + 492 * t, 14 if side == "T" else 746
                o.append(f'<path d="M{x:.0f},{y - 5} l{rng.randint(4, 12)},10" stroke="#0A0814" stroke-width="{rng.choice((2.5, 3.5, 5))}"/>')
            else:
                x, y = 14 if side == "L" else 506, 14 + 732 * t
                o.append(f'<path d="M{x - 5},{y:.0f} l10,{rng.randint(4, 12)}" stroke="#0A0814" stroke-width="{rng.choice((2.5, 3.5, 5))}"/>')
    else:
        o.append('<rect x="14" y="14" width="492" height="732" rx="22" fill="none" stroke="url(#rar)" stroke-width="6"/>')
    if lvl >= 2:
        o.append('<rect x="22" y="22" width="476" height="716" rx="15" fill="none" stroke="url(#rar)" stroke-width="1.5" opacity=".7"/>')
    if lvl >= 3:   # foil: halftone sheen between the two frame lines + a glint on each corner
        ht = ctx.halftone(ctx.tier["g0"], 7, 1.5, 30)
        o.append(f'<path d="{rrect(17, 17, 486, 726, 19)}{rrect(21.5, 21.5, 477, 717, 15)}" fill="{ht}" fill-rule="evenodd" opacity=".55"/>')
        for gx, gy in ((20.5, 20.5), (499.5, 20.5), (20.5, 739.5), (499.5, 739.5)):
            o.append(f'<path d="{sparkle(gx, gy, 8)}" fill="#FFFBE0" stroke="{INK}" stroke-width="2" stroke-linejoin="round"/>')
    return "\n".join(o)


def chrome(ctx):
    p, lvl, t = ctx.pal, ctx.level, ctx.tier
    c = ctx.card
    o = ['<!-- CARD CHROME -->']
    # number plate
    o.append(f'<path d="M34,28 H134 L122,68 H22Z" fill="{INK}" stroke="url(#rar)" stroke-width="3.5" stroke-linejoin="round"/>')
    o.append(text(78, 59.5, "#%03d" % ctx.number, 31, "#FFFFFF", "middle", .5))
    # tier badge
    label = c["rarity"].upper()
    bw = 208 if lvl < 3 else 222
    x0 = 498 - bw + 12
    plate = f"M{x0},28 H498 L486,68 H{x0 - 12}Z"
    room = bw - (86 if lvl >= 3 else 44)
    fs = fit(label, room, 27, 1.2)
    tx = 498 - bw / 2
    if lvl == 0:
        o.append(f'<path d="{plate}" fill="{INK}" stroke="url(#rar)" stroke-width="2.5" stroke-linejoin="round"/>')
        o.append(text(tx, 48 + fs * .375, label, fs, t["g0"], "middle", 1.2))
    else:
        if lvl >= 2:
            o.append(f'<path d="{plate}" fill="{INK}" transform="translate(4 5)"/>')
        o.append(f'<path d="{plate}" fill="url(#rar)" stroke="{INK}" stroke-width="3" stroke-linejoin="round"/>')
        if lvl >= 3:
            o.append(f'<path d="M{x0 + 4},32 H{x0 + 60} L{x0 + 30},64 H{x0 - 6}Z" fill="#FFFFFF" opacity=".28"/>')
            for sx in (x0 + 18, 498 - 30):
                o.append(f'<path d="{star(sx, 48, 9)}" fill="{INK}"/>')
        o.append(text(tx, 48 + fs * .375, label, fs, INK, "middle", 1.2))
    # name banner
    plate = "M42,508 H492 L480,558 H30Z"
    o.append(f'<path d="M48,514 H498 L486,564 H36Z" fill="url(#rar)"/>')
    ban = p.body if p.dark else p.base
    dark_text = lum(ban) > .30
    o.append(f'<path d="{plate}" fill="{ban}"/>')
    if lvl >= 1:
        ht = ctx.halftone(p.hi if p.dark else p.shade)
        o.append(ctx.clipped(plate, f'<path d="M440,500 H500 V564 H424Z" fill="{ht}"/><path d="M20,500 H98 L82,564 H20Z" fill="{ht}"/>'
                             + (f'<path d="M150,500 h26 l-16,66 h-26z M186,500 h9 l-16,66 h-9z" fill="#FFFFFF" opacity=".3"/>' if lvl >= 3 else "")))
    o.append(f'<path d="{plate}" fill="none" stroke="{INK}" stroke-width="4" stroke-linejoin="round"/>')
    name = c["name"].upper()
    fs = fit(name, 318, 46, 1.5)
    # short names: open the tracking so they carry more of the banner (capped, never past 300 wide)
    sp = round(max(1.5, min(5.0, (300 - text_w(name, fs)) / len(name))), 2)
    if dark_text:
        o.append(text(261, 533 + fs * .375, name, fs, INK, "middle", sp))
    else:
        o.append(text(261, 533 + fs * .375, name, fs, "#FFFFFF", "middle", sp,
                      f'stroke="{INK}" stroke-width="5" paint-order="stroke" stroke-linejoin="round"'))
    # stats
    y = 584
    for label, v in c["stats"]:
        v = max(0, min(10, int(v)))
        o.append(text(40, y + 14.5, label.upper(), 21, "#EDE7FF", "start", 1.1))
        for i in range(10):
            x = 180 + i * 25
            fill = "url(#rar)" if i < v else "#2A2148"
            o.append(f'<path d="M{x + 5},{y} h20 l-5,14 h-20z" fill="{fill}" stroke="{INK}" stroke-width="1.5"/>')
        if lvl >= 2:   # gloss line across the lit bars
            o.append(f'<path d="M187,{y + 3.5} h{v * 25 - 9}" stroke="#FFFFFF" stroke-width="1.6" opacity=".5" stroke-dasharray="16 9"/>' if v else "")
        o.append(text(461, y + 15.5, str(v), 24, "#FFFFFF", "end"))
        o.append(text(464, y + 15.5, "/10", 13.5, "#A29AC8", "start", .5))
        y += 27
    foot = "STREET SPLATZ · BASE NETWORK"
    o.append(text(260, 731, foot, 12, "#8C84B5", "middle", 3.4))   # clear of the y 738 inner hairline
    if lvl >= 3:
        w = text_w(foot, 12, 3.4) / 2 + 14
        for sx in (260 - w, 260 + w):
            o.append(f'<path d="{star(sx, 726.5, 5)}" fill="url(#rar)"/>')
    return "\n".join(o)


# ------------------------------------------------------------------ build
def build(card, strict=False):
    """card: dict(number, name, flavor, eyes, mouth, pose, rarity, stats=[(label, value) x5])
    -> complete card SVG as a string (520 x 760 user units)."""
    ctx = Ctx(card)
    t = ctx.tier
    pose = run_pose(ctx, strict)
    hcx, hcy = pose["head"]
    r = float(pose["radius"])
    ctx.head = SimpleNamespace(cx=hcx, cy=hcy, r=r, tilt=float(pose.get("tilt", 0)),
                               flip=bool(pose.get("flip", False)), k=r / 100)
    fdx, fdy = pose.get("face", (0, 0))
    eyes, mouth = run_face(ctx, strict)
    px, py, pw, ph = PANEL
    parts = [
        frame(ctx),
        background(ctx, pose),
        f'<rect x="{px}" y="{py}" width="{pw}" height="{ph}" rx="16" fill="none" stroke="{INK}" stroke-width="5"/>',
        f'<rect x="{px}" y="{py}" width="{pw}" height="{ph}" rx="16" fill="none" stroke="url(#rar)" stroke-width="{3 if ctx.level >= 3 else 2}"/>',
        (f'<rect x="{px - 5.5}" y="{py - 5.5}" width="{pw + 11}" height="{ph + 11}" rx="20" fill="none" stroke="url(#rar)" stroke-width="1.5"/>'
         if ctx.level >= 3 else ""),
        '<!-- CHARACTER -->', '<g id="character">',
        '<!-- pose prop (behind the whole character) -->', '<g id="pose-prop">' + _join(pose.get("prop")) + '</g>',
        '<!-- gear: headband tails -->', headband_tails(ctx),
        f'<!-- pose:{ctx.pose} back limbs -->', '<g id="pose-back">' + _join(pose.get("back")) + '</g>',
        '<!-- legs -->', '<g id="pose-legs">' + _join(pose.get("legs")) + '</g>',
        '<!-- shoes -->', '<g id="pose-shoes">' + _join(pose.get("shoes")) + '</g>',
        f'<!-- body: {ctx.flavor} -->', body(ctx),
        '<!-- gear: headband -->', headband(ctx),
        f'<!-- eyes:{ctx.eyes} mouth:{ctx.mouth} -->',
        f'<g id="face" transform="{head_tf(ctx.head)} translate({fdx} {fdy})">',
        f'<g id="eyes">{eyes}</g>', f'<g id="mouth">{mouth}</g>', '</g>',
        f'<!-- pose:{ctx.pose} front limbs -->', '<g id="pose-front">' + _join(pose.get("front")) + '</g>',
        '</g>',
        chrome(ctx),
    ]
    defs = f'''<defs>
{font_css()}
<linearGradient id="rar" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="{W}" y2="{H}">
<stop offset="0" stop-color="{t["g0"]}"/><stop offset="1" stop-color="{t["g1"]}"/></linearGradient>
<linearGradient id="wall" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="#150F36"/><stop offset="1" stop-color="#2B1C5E"/></linearGradient>
<pattern id="brick" width="56" height="28" patternUnits="userSpaceOnUse">
<path d="M0,0H56 M0,14H56 M0,0V14 M28,14V28" stroke="#0E0926" stroke-width="2.5" fill="none"/></pattern>
<clipPath id="panelclip"><rect x="{px}" y="{py}" width="{pw}" height="{ph}" rx="16"/></clipPath>
{"".join(ctx.defs)}
</defs>'''
    head = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">\n'
            f'<!-- Street Splatz #{ctx.number:03d} {card["name"]} | {ctx.flavor} / {ctx.eyes} / {ctx.mouth} / {ctx.pose} / {ctx.rarity} -->\n')
    return head + defs + "\n" + "\n".join(parts) + "\n</svg>\n"


def load_card(n, meta_dir=META):
    d = json.load(open(os.path.join(meta_dir, "%03d.json" % n), encoding="utf-8"))
    a = {x["trait_type"]: x["value"] for x in d["attributes"]}
    return dict(number=n, name=d["name"].rsplit(" #", 1)[0], flavor=a["Flavor"], eyes=a["Eyes"],
                mouth=a["Mouth"], pose=a["Pose"], rarity=a["Rarity"],
                stats=[(k, a[k]) for k in STAT_KEYS])


def main(argv=None):
    ap = argparse.ArgumentParser(description="Street Splatz Brawler card generator")
    ap.add_argument("--cards", help="comma separated card numbers, e.g. 16,3,27")
    ap.add_argument("--all", action="store_true", help="cards 1 to 100")
    ap.add_argument("--out", required=True, help="output directory for NNN.svg")
    ap.add_argument("--meta", default=META, help="metadata directory (default assets/metadata)")
    ap.add_argument("--strict", action="store_true", help="raise on part errors instead of falling back")
    ap.add_argument("--set", action="append", default=[], metavar="KEY=VALUE",
                    help="override a trait for previews, e.g. --set pose=Boss --set flavor=Grape")
    a = ap.parse_args(argv)
    nums = list(range(1, 101)) if a.all else [int(x) for x in (a.cards or "").split(",") if x.strip()]
    if not nums:
        ap.error("give --cards or --all")
    os.makedirs(a.out, exist_ok=True)
    for n in nums:
        card = load_card(n, a.meta)
        for kv in a.set:
            k, v = kv.split("=", 1)
            card[k] = v
        path = os.path.join(a.out, "%03d.svg" % n)
        with open(path, "w", encoding="utf-8", newline="\n") as fh:
            fh.write(build(card, a.strict))
        print(path)


if __name__ == "__main__":
    main()
