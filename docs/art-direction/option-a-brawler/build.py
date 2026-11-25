#!/usr/bin/env python3
"""Street Splatz card builder, "Mutant brawler" direction.
Emits one self contained SVG. Every trait is a function that returns one
commented <g> so the 100 card generator can swap them.
"""
import math, sys, os

# ------------------------------------------------------------------ card data
CARD = dict(
    num="016", name="VANILLA BRAWLER", rarity="STREET LEGEND",
    base="#F0EAD6",           # flavor color (1 of 8)
    gear="#FF3B2F",           # gear color slot (headband, wraps, sneakers)
    stats=[("JAW SMASH", 6), ("SUGAR BOMB", 8), ("PUCKER BLAST", 8),
           ("FLAVOR DRIP", 9), ("GUTTER SPLAT", 10)],
)
INK = "#0B0714"
FONT = "font-family=\"Impact, 'Arial Black', 'DejaVu Sans', sans-serif\" font-weight=\"900\""


def hx(c):
    c = c.lstrip("#"); return [int(c[i:i + 2], 16) for i in (0, 2, 4)]


def mix(a, b, t):
    a, b = hx(a), hx(b)
    return "#%02X%02X%02X" % tuple(round(a[i] * (1 - t) + b[i] * t) for i in range(3))


def tones(base):
    """shadow / deep shadow / highlight derived from any flavor color"""
    return dict(base=base, sh=mix(base, "#4B2E83", .46), deep=mix(base, "#241047", .70),
                hi=mix(base, "#FFFFFF", .70))


_n = [0]


def uid(p="c"):
    _n[0] += 1; return f"{p}{_n[0]}"


def dots(color):
    """inline halftone pattern in a given colour, returns (defs, fill)"""
    i = uid("d")
    return (f'<pattern id="{i}" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(30)">'
            f'<circle cx="4.5" cy="4.5" r="2.5" fill="{color}"/></pattern>', f"url(#{i})")


RIM = "#5CF2FF"


def shaded(d, base, shade, dx=7, dy=-7, sw=6, extra="", rim=False):
    """Cel shaded shape: shadow fill, lit copy shifted toward the light, ink line."""
    i = uid()
    return (f'<clipPath id="{i}"><path d="{d}"/></clipPath>'
            f'<path d="{d}" fill="{RIM if rim else shade}"/>'
            f'<g clip-path="url(#{i})">' + (f'<path d="{d}" fill="{shade}" transform="translate(3.5 -3)"/>' if rim else "") +
            f'<path d="{d}" fill="{base}" transform="translate({dx} {dy})"/>{extra}</g>'
            f'<path d="{d}" fill="none" stroke="{INK}" stroke-width="{sw}" stroke-linejoin="round" stroke-linecap="round"/>')


def limb(p0, p1, r0, r1, b1=0, b2=0):
    """Muscle segment between two joints. b1/b2 = bulge on each side."""
    dx, dy = p1[0] - p0[0], p1[1] - p0[1]
    L = math.hypot(dx, dy); ux, uy = dx / L, dy / L; nx, ny = -uy, ux
    P = lambda p, a, b: (p[0] + ux * a + nx * b, p[1] + uy * a + ny * b)
    A, B, C, D = P(p0, 0, r0), P(p1, 0, r1), P(p1, 0, -r1), P(p0, 0, -r0)
    pts = [A, P(p0, L * .3, r0 + b1), P(p1, -L * .3, r1 + b1), B,
           P(p1, r1 * 1.33, r1), P(p1, r1 * 1.33, -r1), C,
           P(p1, -L * .3, -r1 - b2), P(p0, L * .3, -r0 - b2), D,
           P(p0, -r0 * 1.33, -r0), P(p0, -r0 * 1.33, r0), A]
    f = lambda p: f"{p[0]:.1f},{p[1]:.1f}"
    return (f"M{f(pts[0])} C{f(pts[1])} {f(pts[2])} {f(pts[3])} C{f(pts[4])} {f(pts[5])} {f(pts[6])} "
            f"C{f(pts[7])} {f(pts[8])} {f(pts[9])} C{f(pts[10])} {f(pts[11])} {f(pts[12])}Z")


def rrect(x, y, w, h, r):
    return (f"M{x + r},{y} H{x + w - r} Q{x + w},{y} {x + w},{y + r} V{y + h - r} Q{x + w},{y + h} {x + w - r},{y + h} "
            f"H{x + r} Q{x},{y + h} {x},{y + h - r} V{y + r} Q{x},{y} {x + r},{y}Z")


# ------------------------------------------------------------------ parts
def fist(c, rot, s, T, flip=False):
    """Oversized cartoon fist (thumb + three fingers), local box about 90x88."""
    b, sh, hi = T["base"], T["sh"], T["hi"]
    fl = " scale(-1 1)" if flip else ""
    o = [f'<g transform="translate({c[0]} {c[1]}) rotate({rot}) scale({s}){fl}">']
    o.append(shaded(rrect(-41, -18, 82, 60, 20), b, sh, 8, -8, rim=True))         # palm block
    for x, y, h in ((-46, -42, 50), (-16, -47, 55), (14, -43, 51)):               # fingers
        o.append(shaded(rrect(x, y, 32, h, 14), b, sh, 6, -6, 5.5, rim=True, extra=
                        f'<ellipse cx="{x + 21}" cy="{y + 10}" rx="6" ry="3.5" fill="{hi}"/>'))
        o.append(f'<path d="M{x + 8},{y + 27} q8,6 17,0" fill="none" stroke="{INK}" stroke-width="3.2" stroke-linecap="round"/>')
    o.append(shaded(limb((40, 12), (-12, 24), 15, 14, 2, 3), b, sh, 5, -6, 5.5))   # thumb
    o.append(f'<path d="M-17,16 q4,7 1,14" fill="none" stroke="{INK}" stroke-width="3" stroke-linecap="round"/>')
    o.append(f'<path d="M-30,36 q12,6 26,3" fill="none" stroke="{INK}" stroke-width="3" stroke-linecap="round"/>')
    o.append('</g>')
    return "".join(o)


def wrap(c, rot, w, gear):
    """GEAR: wrist wrap. Swap for spiked cuff, sweatband, watch, chain."""
    g2 = mix(gear, "#3A0A3A", .5)
    return (f'<g transform="translate({c[0]} {c[1]}) rotate({rot})">'
            + shaded(rrect(-w / 2, -15, w, 30, 7), gear, g2, 6, -5, 5.5)
            + f'<path d="M{-w / 2 + 4},-3 L{w / 2 - 4},-9 M{-w / 2 + 4},8 L{w / 2 - 4},2" stroke="{INK}" stroke-width="3" stroke-linecap="round"/>'
            + f'<path d="M{-w / 2 + 2},6 l-14,10 l5,3 l-7,7 l12,-3 l8,-10z" fill="{gear}" stroke="{INK}" stroke-width="4" stroke-linejoin="round"/>'
            + '</g>')


def shoe(c, flip, gear, rot=0):
    """GEAR: chunky high top sneaker. Local: ankle at 0,0, toe toward +x."""
    g2 = mix(gear, "#3A0A3A", .5); wht = "#FBF7EE"; wsh = "#B9AFCB"
    fl = "scale(-1 1)" if flip else ""
    o = [f'<g transform="translate({c[0]} {c[1]}) rotate({rot}) {fl}">']
    o.append(f'<path d="M10,-14 L16,-36 L36,-30 L30,-6Z" fill="{wht}" stroke="{INK}" stroke-width="5" stroke-linejoin="round"/>')  # tongue
    o.append(shaded("M-27,-12 L24,-14 L28,10 C52,10 78,22 86,38 L88,50 L-34,50 L-31,6Z", gear, g2, 7, -6, 6))
    o.append(shaded("M50,50 C46,34 52,22 60,15 C74,20 84,29 87,40 L88,50Z", wht, wsh, 4, -4, 5))       # toe cap
    o.append(shaded(rrect(-31, -24, 60, 17, 8), wht, wsh, 4, -3, 5))                                       # collar
    o.append(shaded(rrect(-40, 44, 134, 19, 8), wht, wsh, 0, -6, 6))                                       # sole
    for x in (-20, -2, 16, 34, 52, 70):
        o.append(f'<path d="M{x},56 v7" stroke="{INK}" stroke-width="3"/>')
    for i, (x, y) in enumerate(((16, 0), (24, 9), (34, 16))):                                               # laces
        o.append(f'<path d="M{x - 9},{y + 5} L{x + 10},{y - 3}" stroke="{INK}" stroke-width="8" stroke-linecap="round"/>'
                 f'<path d="M{x - 9},{y + 5} L{x + 10},{y - 3}" stroke="{wht}" stroke-width="3.5" stroke-linecap="round"/>')
    o.append(f'<circle cx="-8" cy="14" r="10" fill="{wht}" stroke="{INK}" stroke-width="4"/>'
             f'<path d="M-8,7 l2.5,5 5.5,.6 -4,3.8 1,5.4 -5,-2.7 -5,2.7 1,-5.4 -4,-3.8 5.5,-.6z" fill="{gear}"/>')
    o.append(f'<path d="M-30,36 C0,30 30,34 50,40" fill="none" stroke="{INK}" stroke-width="3"/>')
    o.append('</g>')
    return "".join(o)


# ------------------------------------------------------------------ character
BX, BY, BR = 250, 282, 108          # gumball centre and radius


def character(C):
    T = tones(C["base"]); b, sh, deep, hi = T["base"], T["sh"], T["deep"], T["hi"]
    gear = C["gear"]; g2 = mix(gear, "#3A0A3A", .5); ghi = mix(gear, "#FFFFFF", .45)
    RIM = "#5CF2FF"
    body = f"M{BX - BR},{BY} a{BR},{BR} 0 1,0 {2 * BR},0 a{BR},{BR} 0 1,0 {-2 * BR},0Z"
    big = "M0,0H520V760H0Z"
    circ = lambda x, y, r: f"M{x - r},{y} a{r},{r} 0 1,0 {2 * r},0 a{r},{r} 0 1,0 {-2 * r},0Z"
    cres = big + circ(BX + 20, BY - 17, 99)            # shadow crescent, lower left
    half = circ(BX + 20, BY - 17, 99)                  # halftone band lives inside lit circle
    o = []
    o.append('<!-- ================= CHARACTER ================= -->')
    o.append('<g id="character">')

    HEAD = '<g transform="translate(250 264) scale(1.1) translate(-250 -282)">'   # body+face scale/offset
    # ---- GEAR SLOT A (back layer): headband tails ----------------------------
    o.append('<!-- TRAIT gear:headband (back layer: torn flapping tails) -->')
    o.append('<g id="gear-headband-tails">' + HEAD)
    o.append(shaded("M150,246 C128,226 104,236 84,206 L72,214 L80,222 L62,226 L74,236 L60,246 C92,262 122,246 148,268Z",
                    gear, g2, 4, -7, 6))
    o.append(shaded("M150,256 C126,268 112,262 92,286 L80,280 L84,292 L68,292 L80,304 L72,314 C104,310 118,290 150,276Z",
                    gear, g2, 4, -7, 6))
    o.append(f'<path d="M132,244 q-16,-4 -30,-14 M130,274 q-14,4 -26,16" fill="none" stroke="{INK}" stroke-width="2.6" stroke-linecap="round"/>')
    o.append('</g></g>')

    # ---- POSE: far arm (raised fist), sits behind the body --------------------
    o.append('<!-- TRAIT pose:brawler (far arm, raised fist) -->')
    o.append('<g id="pose-far-arm">')
    o.append(shaded(limb((346, 296), (408, 322), 27, 25, 12, 3), b, sh, 6, -8, rim=True))
    o.append(shaded(limb((408, 322), (421, 232), 25, 23, 5, 15), b, sh, 8, -5, rim=True))
    o.append(f'<path d="M392,326 q12,-10 8,-26" fill="none" stroke="{INK}" stroke-width="3.2" stroke-linecap="round"/>')
    o.append(f'<path d="M366,286 q16,-5 30,6" fill="none" stroke="{INK}" stroke-width="3.2" stroke-linecap="round"/>')
    o.append(f'<path d="M436,300 q6,-16 0,-34" fill="none" stroke="{INK}" stroke-width="3" stroke-linecap="round"/>')
    # battle scuff: crossed plaster on the forearm
    o.append(f'<g transform="translate(418 286)"><rect x="-13" y="-5" width="26" height="10" rx="3" transform="rotate(35)" fill="#FBF7EE" stroke="{INK}" stroke-width="3"/>'
             f'<rect x="-13" y="-5" width="26" height="10" rx="3" transform="rotate(-35)" fill="#FBF7EE" stroke="{INK}" stroke-width="3"/></g>')
    o.append(wrap((420, 232), 8, 58, gear))
    o.append(fist((426, 176), 8, 1.0, T))
    o.append('</g>')

    # ---- LEGS + GEAR SLOT B: sneakers ----------------------------------------
    o.append('<!-- legs (flavor color) + TRAIT gear:sneakers -->')
    o.append('<g id="legs">')
    o.append(shaded(limb((208, 372), (192, 420), 28, 23, 4, 6), b, sh, 7, -4, rim=True))
    o.append(shaded(limb((298, 372), (322, 420), 28, 23, 6, 4), b, sh, 7, -4, rim=True))
    o.append(shoe((190, 428), True, gear))
    o.append(shoe((324, 428), False, gear))
    o.append('</g>')

    # ---- BODY ----------------------------------------------------------------
    o.append('<!-- TRAIT body: flavor base + derived shadow / deep / highlight tones -->')
    o.append('<g id="body">' + HEAD)
    o.append(f'<clipPath id="bodyclip"><path d="{body}"/></clipPath>')
    o.append(f'<path d="{body}" fill="{b}"/>')
    o.append('<g clip-path="url(#bodyclip)">')
    dp, df = dots(sh)
    o.append(dp + f'<path d="{half}{circ(BX + 38, BY - 32, 96)}" fill="{df}" fill-rule="evenodd"/>')
    o.append(f'<path d="{cres}" fill="{sh}" fill-rule="evenodd"/>')
    o.append(f'<path d="{big}{circ(BX + 9, BY - 8, 107)}" fill="{deep}" fill-rule="evenodd" opacity=".55"/>')
    o.append(f'<path d="{big}{circ(BX + 5, BY - 4, 107)}" fill="{RIM}" fill-rule="evenodd"/>')          # rim light
    # glossy candy highlights
    o.append(f'<path d="M256,188 C276,182 300,186 318,200 C298,194 276,190 256,188Z" fill="#FFFFFF"/>')
    o.append(f'<ellipse cx="333" cy="222" rx="5" ry="8" transform="rotate(-38 333 222)" fill="#FFFFFF"/>')
    o.append(f'<path d="M196,214 C204,202 216,194 228,190 C218,198 208,206 196,214Z" fill="{hi}"/>')
    o.append('</g>')
    o.append(f'<path d="{body}" fill="none" stroke="{INK}" stroke-width="7.5"/>')
    # battle damage: shell crack + chip + scuffs
    o.append(f'<path d="M226,177 L236,188 L228,194 L242,204 L236,212" fill="none" stroke="{INK}" stroke-width="3.4" stroke-linejoin="round" stroke-linecap="round"/>')
    o.append(f'<path d="M236,188 L246,186 M228,194 L218,196" fill="none" stroke="{INK}" stroke-width="2.6" stroke-linecap="round"/>')
    o.append(f'<path d="M300,376 L310,366 L306,358 L320,352 L318,342" fill="none" stroke="{INK}" stroke-width="3.4" stroke-linejoin="round" stroke-linecap="round"/>')
    o.append(f'<path d="M310,366 L320,370 M306,358 L296,356" fill="none" stroke="{INK}" stroke-width="2.6" stroke-linecap="round"/>')
    o.append(f'<path d="M234,374 l10,10 M244,370 l10,10 M254,368 l8,8" stroke="{INK}" stroke-width="2.6" stroke-linecap="round"/>')
    o.append('</g></g>')

    # ---- GEAR SLOT A (front layer): headband ---------------------------------
    o.append('<!-- TRAIT gear:headband (front band + knot). Options: bandana, backwards cap, visor shades, mohawk spikes, bare -->')
    band = "M138,272 Q250,214 362,254 L358,220 Q250,180 144,240Z"
    o.append('<g id="gear-headband">' + HEAD)
    o.append('<g clip-path="url(#bodyclip)">')
    o.append(f'<path d="M138,280 Q250,222 362,262" fill="none" stroke="{sh}" stroke-width="12"/>')        # cast shadow
    o.append(f'<path d="{band}" fill="{gear}"/>')
    o.append(f'<clipPath id="bandclip"><path d="{band}"/></clipPath>')
    o.append(f'<g clip-path="url(#bandclip)"><path d="{cres}" fill="{g2}" fill-rule="evenodd"/>'
             f'<path d="M138,276 Q250,218 362,258" fill="none" stroke="{g2}" stroke-width="9"/>'
             f'<path d="M250,203 Q300,206 340,220" fill="none" stroke="{ghi}" stroke-width="5" stroke-linecap="round"/></g>')
    o.append(f'<path d="{band}" fill="none" stroke="{INK}" stroke-width="5.5" stroke-linejoin="round"/>')
    o.append(f'<path d="M190,236 q6,8 2,18 M300,206 q6,10 2,22" fill="none" stroke="{INK}" stroke-width="2.6" stroke-linecap="round"/>')
    o.append('</g>')
    o.append(shaded("M136,244 L156,238 C166,246 168,262 160,276 L140,282 C130,272 128,254 136,244Z", gear, g2, 4, -5, 5.5))
    o.append(f'<path d="M146,246 q6,14 0,30" fill="none" stroke="{INK}" stroke-width="2.6" stroke-linecap="round"/>')
    o.append('</g></g>')

    # ---- EYES ----------------------------------------------------------------
    o.append('<!-- TRAIT eyes:angry-squint. Options: angry-squint, wide-crazed, one-eye-scar-shut, visor-glare, heavy-lid-smug -->')
    o.append('<g id="eyes">' + HEAD)
    o.append(f'<path d="M212,266 L268,290 C268,306 254,315 238,312 C220,308 212,290 212,266Z" fill="#FFFFFF" stroke="{INK}" stroke-width="5" stroke-linejoin="round"/>')
    o.append(f'<path d="M338,260 L286,290 C286,305 298,313 312,310 C327,306 338,286 338,260Z" fill="#FFFFFF" stroke="{INK}" stroke-width="5" stroke-linejoin="round"/>')
    o.append(f'<circle cx="251" cy="299" r="7.5" fill="{INK}"/><circle cx="300" cy="299" r="6.5" fill="{INK}"/>')
    o.append(f'<circle cx="253.5" cy="296.5" r="2.4" fill="#fff"/><circle cx="302" cy="296.5" r="2.2" fill="#fff"/>')
    # heavy brows
    o.append(f'<path d="M198,252 L274,284 L271,296 L203,268Z" fill="{INK}" stroke="{INK}" stroke-width="4" stroke-linejoin="round"/>')
    o.append(f'<path d="M346,246 L280,284 L283,296 L342,264Z" fill="{INK}" stroke="{INK}" stroke-width="4" stroke-linejoin="round"/>')
    o.append(f'<path d="M228,258 l-7,20" stroke="{b}" stroke-width="4" stroke-linecap="round"/>')         # brow scar
    o.append(f'<path d="M222,319 q14,8 30,4 M302,317 q14,2 24,-7" fill="none" stroke="{INK}" stroke-width="3" stroke-linecap="round"/>')
    o.append(f'<path d="M277,306 q-4,8 3,12" fill="none" stroke="{INK}" stroke-width="3" stroke-linecap="round"/>')
    o.append('</g></g>')

    # ---- MOUTH ---------------------------------------------------------------
    o.append('<!-- TRAIT mouth:gritted-grin-chipped. Options: gritted-grin-chipped, roaring-open, smirk-toothpick, bubble-blow, tongue-out-snarl -->')
    mp = "M216,330 C244,340 302,336 342,318 C347,338 336,360 306,366 C272,372 234,364 216,330Z"
    o.append('<g id="mouth">' + HEAD)
    o.append(f'<clipPath id="mouthclip"><path d="{mp}"/></clipPath>')
    o.append(f'<path d="{mp}" fill="#FFFFFF"/>')
    o.append('<g clip-path="url(#mouthclip)">')
    o.append(f'<path d="M210,320 L262,330 L250,372 L210,372Z" fill="#C9C0DC"/>')
    o.append(f'<path d="{mp}" fill="none" stroke="#B8243F" stroke-width="11"/>')
    o.append(f'<path d="M222,344 C252,354 302,352 342,336" fill="none" stroke="{INK}" stroke-width="3.6"/>')
    for x in (240, 262, 285, 308, 328):
        o.append(f'<path d="M{x},326 L{x + 3},372" stroke="{INK}" stroke-width="3"/>')
    o.append(f'<path d="M289,352 L294,341 L299,346 L303,338 L307,351Z" fill="#3A0D1A" stroke="{INK}" stroke-width="2.6" stroke-linejoin="round"/>')  # chipped tooth
    o.append('</g>')
    o.append(f'<path d="{mp}" fill="none" stroke="{INK}" stroke-width="6" stroke-linejoin="round"/>')
    o.append(f'<path d="M346,308 q8,8 3,18 M210,322 q-7,6 -3,14 M264,380 q14,5 28,-1" fill="none" stroke="{INK}" stroke-width="3.4" stroke-linecap="round"/>')
    o.append('</g></g>')

    # ---- POSE: near arm (cocked fist), in front of the body --------------------
    o.append('<!-- TRAIT pose:brawler (near arm, cocked fist). Pose options: brawler (one up, one cocked), double-flex, crossed-arms, pointing-taunt -->')
    o.append('<g id="pose-near-arm">')
    o.append(shaded(limb((170, 322), (82, 322), 28, 25, 4, 15), b, sh, 6, -8, rim=True))
    o.append(f'<path d="M150,300 q-20,-10 -42,2" fill="none" stroke="{INK}" stroke-width="3.2" stroke-linecap="round"/>')
    o.append(f'<path d="M192,308 q9,14 -1,32" fill="none" stroke="{INK}" stroke-width="3.4" stroke-linecap="round"/>')
    o.append(shaded(limb((80, 324), (96, 344), 25, 25, 4, 4), b, sh, 6, -8, rim=True))
    o.append(wrap((98, 342), -50, 60, gear))
    o.append(fist((120, 362), -12, 1.1, T, flip=True))
    o.append(f'<path d="M150,338 l7,7 M157,334 l6,6 M92,352 l5,7" stroke="{INK}" stroke-width="2.6" stroke-linecap="round"/>')   # knuckle scuffs
    o.append('</g>')
    o.append('</g>')
    return "\n".join(o)


# ------------------------------------------------------------------ background
def background():
    o = ['<!-- ================= BACKGROUND: night alley (swappable scene slot) ================= -->',
         '<g id="scene" clip-path="url(#panelclip)">',
         '<rect x="34" y="80" width="452" height="418" fill="url(#wall)"/>',
         '<rect x="34" y="80" width="452" height="350" fill="url(#brick)"/>']
    for x, y in ((62, 108), (398, 136), (118, 164), (426, 248), (90, 318), (370, 360), (146, 388), (230, 94), (314, 122)):
        o.append(f'<rect x="{x}" y="{y}" width="56" height="14" fill="#3A2A78" opacity=".55"/>')
    # street lamp glow + halftone ring
    dp, df = dots("#5A3CC0")
    o.append(dp + f'<circle cx="262" cy="270" r="196" fill="{df}" opacity=".8"/>')
    o.append('<circle cx="262" cy="270" r="160" fill="#4B31A8" opacity=".75"/>')
    o.append('<circle cx="262" cy="270" r="128" fill="#6B46D6" opacity=".55"/>')
    # action rays
    for k in range(16):
        a = k * math.tau / 16 + .2
        x1, y1 = 262 + math.cos(a - .035) * 420, 270 + math.sin(a - .035) * 420
        x2, y2 = 262 + math.cos(a + .035) * 420, 270 + math.sin(a + .035) * 420
        x0, y0 = 262 + math.cos(a) * 150, 270 + math.sin(a) * 150
        o.append(f'<path d="M{x0:.0f},{y0:.0f} L{x1:.0f},{y1:.0f} L{x2:.0f},{y2:.0f}Z" fill="#8E6BFF" opacity=".16"/>')
    # drain pipe
    o.append(f'<rect x="48" y="80" width="18" height="352" fill="#1A1438" stroke="{INK}" stroke-width="4"/>'
             f'<rect x="44" y="180" width="26" height="12" fill="#2A2158" stroke="{INK}" stroke-width="3"/>'
             f'<rect x="44" y="330" width="26" height="12" fill="#2A2158" stroke="{INK}" stroke-width="3"/>'
             f'<rect x="52" y="80" width="4" height="352" fill="#3A2D78"/>')
    # ground
    o.append(f'<rect x="34" y="430" width="452" height="70" fill="#120D2B"/>'
             f'<path d="M34,430 H486" stroke="#4A3A94" stroke-width="4"/>'
             f'<path d="M34,442 H486" stroke="{INK}" stroke-width="3"/>')
    # manhole + steam
    o.append(f'<ellipse cx="256" cy="472" rx="176" ry="20" fill="#2C2260" stroke="{INK}" stroke-width="4"/>'
             f'<ellipse cx="256" cy="472" rx="160" ry="15" fill="none" stroke="#6652C4" stroke-width="2.5"/>'
             f'<path d="M108,472 h22 M240,478 h34 M240,468 h34 M384,472 h22" stroke="#6652C4" stroke-width="3" stroke-linecap="round"/>')
    steam = ("M{0},{1} c-18,-6 -22,-30 -6,-40 c-14,-18 0,-40 18,-36 c-4,-22 16,-36 32,-24 c14,-14 38,-2 32,18 "
             "c18,4 20,30 4,38 c10,18 -6,38 -24,32 c-8,14 -44,22 -56,12Z")
    o.append(f'<path d="{steam.format(74, 452)}" fill="#B7A6FF" opacity=".42"/>')
    o.append(f'<path d="{steam.format(96, 392)}" fill="#B7A6FF" opacity=".18" transform="translate(-10 -40) scale(.8) translate(26 100)"/>')
    o.append(f'<path d="{steam.format(396, 470)}" fill="#B7A6FF" opacity=".30"/>')
    o.append(f'<path d="{steam.format(420, 400)}" fill="#B7A6FF" opacity=".16"/>')
    # speed lines around the raised fist
    o.append('<g stroke="#FFFFFF" stroke-linecap="round" opacity=".9">'
             '<path d="M378,112 l-14,-16" stroke-width="5"/><path d="M404,102 l-4,-14" stroke-width="4"/>'
             '<path d="M364,146 l-20,-8" stroke-width="4"/></g>')
    o.append('<path d="M468,98 l5,11 11,5 -11,5 -5,11 -5,-11 -11,-5 11,-5z" fill="#FFE14A" stroke="#0B0714" stroke-width="3" stroke-linejoin="round"/>')
    o.append('<path d="M92,150 l4,9 9,4 -9,4 -4,9 -4,-9 -9,-4 9,-4z" fill="#FFE14A" stroke="#0B0714" stroke-width="3" stroke-linejoin="round"/>')
    # contact shadow
    o.append(f'<ellipse cx="160" cy="490" rx="78" ry="7" fill="{INK}" opacity=".8"/><ellipse cx="352" cy="490" rx="78" ry="7" fill="{INK}" opacity=".8"/>')
    o.append('</g>')
    return "\n".join(o)


# ------------------------------------------------------------------ card chrome
def chrome(C):
    T = tones(C["base"])
    o = ['<!-- ================= CARD CHROME ================= -->']
    o.append(f'<path d="M34,28 H134 L122,68 H22Z" fill="{INK}" stroke="url(#rar)" stroke-width="3.5" stroke-linejoin="round"/>')
    o.append(f'<text x="78" y="58" {FONT} font-size="27" fill="#FFFFFF" text-anchor="middle" textLength="62" lengthAdjust="spacingAndGlyphs">#{C["num"]}</text>')
    o.append(f'<path d="M306,33 H503 L491,73 H294Z" fill="{INK}"/>')
    o.append(f'<path d="M302,28 H498 L486,68 H290Z" fill="url(#rar)" stroke="{INK}" stroke-width="3" stroke-linejoin="round"/>')
    o.append(f'<text x="394" y="56" {FONT} font-size="21" fill="{INK}" text-anchor="middle" textLength="158" lengthAdjust="spacingAndGlyphs">{C["rarity"]}</text>')
    # name banner
    o.append('<path d="M48,514 H498 L486,564 H36Z" fill="url(#rar)"/>')
    o.append(f'<clipPath id="nameclip"><path d="M42,508 H492 L480,558 H30Z"/></clipPath>')
    o.append(f'<path d="M42,508 H492 L480,558 H30Z" fill="{T["base"]}"/>')
    dp, df = dots(T["sh"])
    o.append(dp + f'<g clip-path="url(#nameclip)"><path d="M440,500 H500 V564 H424Z" fill="{df}"/>'
             f'<path d="M20,500 H98 L82,564 H20Z" fill="{df}"/></g>')
    o.append(f'<path d="M42,508 H492 L480,558 H30Z" fill="none" stroke="{INK}" stroke-width="4" stroke-linejoin="round"/>')
    o.append(f'<text x="261" y="546" {FONT} font-size="36" fill="{INK}" text-anchor="middle" textLength="340" lengthAdjust="spacingAndGlyphs" transform="skewX(-8) translate(76 0)">{C["name"]}</text>')
    # stats
    y = 584
    for label, v in C["stats"]:
        o.append(f'<text x="40" y="{y + 11}" {FONT} font-size="15" fill="#EDE7FF" textLength="{len(label) * 9.6:.0f}" lengthAdjust="spacingAndGlyphs">{label}</text>')
        for i in range(10):
            x = 180 + i * 25
            fill = "url(#rar)" if i < v else "#2A2148"
            o.append(f'<path d="M{x + 5},{y} h20 l-5,14 h-20z" fill="{fill}" stroke="{INK}" stroke-width="1.5"/>')
        o.append(f'<text x="470" y="{y + 13}" {FONT} font-size="19" fill="#FFFFFF" text-anchor="end">{v}</text>')
        o.append(f'<text x="473" y="{y + 13}" font-family="\'DejaVu Sans\', Arial, sans-serif" font-weight="700" font-size="10" fill="#8C84B5">/10</text>')
        y += 27
    o.append('<text x="260" y="737" font-family="\'DejaVu Sans\', Arial, sans-serif" font-weight="700" font-size="10" fill="#8C84B5" '
             'text-anchor="middle" textLength="250" lengthAdjust="spacing">STREET SPLATZ · BASE NETWORK</text>')
    return "\n".join(o)


def build(C):
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="520" height="760" viewBox="0 0 520 760">
<!-- Street Splatz #{C["num"]} {C["name"]} | parametric layers: scene, gear(back), pose(far arm), legs+sneakers, body, gear(headband), eyes, mouth, pose(near arm) -->
<defs>
  <linearGradient id="rar" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="520" y2="760">
    <stop offset="0" stop-color="#FFE000"/><stop offset="1" stop-color="#FF6A00"/></linearGradient>
  <linearGradient id="wall" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#150F36"/><stop offset="1" stop-color="#2B1C5E"/></linearGradient>
  <pattern id="brick" width="56" height="28" patternUnits="userSpaceOnUse">
    <path d="M0,0H56 M0,14H56 M0,0V14 M28,14V28" stroke="#0E0926" stroke-width="2.5" fill="none"/></pattern>
  <clipPath id="panelclip"><rect x="34" y="80" width="452" height="418" rx="16"/></clipPath>
</defs>
<rect x="6" y="6" width="508" height="748" rx="28" fill="#0A0814"/>
<rect x="14" y="14" width="492" height="732" rx="22" fill="none" stroke="url(#rar)" stroke-width="6"/>
{background()}
<rect x="34" y="80" width="452" height="418" rx="16" fill="none" stroke="{INK}" stroke-width="5"/>
<rect x="34" y="80" width="452" height="418" rx="16" fill="none" stroke="url(#rar)" stroke-width="2"/>
{character(C)}
{chrome(C)}
</svg>
'''


if __name__ == "__main__":
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "card.svg")
    open(out, "w").write(build(CARD))
    print("wrote", out)
