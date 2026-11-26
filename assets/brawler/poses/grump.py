"""Pose: Grump. Hunched sulk: ball sunk low on short legs and tipped forward,
both arms hanging stiff and held out from the body with fists clenched at knee
height, feet turned in (pigeon toed). A scribbled storm cloud grumbles overhead.

The hanging fists are drawn here (knuckles down) because ctx.fist is lit for a
knuckles up fist and reads wrong when rotated past 90 degrees.

Card space coordinates (520 x 760). See ../PARTS.md.
"""

HEAD = (256, 288)
ARM_IN, ARM_UP = 12, 30     # both arms sit this far in from the window edge / up with the head
R = 112


def _mx(m, x, w=0):
    """Mirror a local x (left edge of a box of width w) when m == -1."""
    return x if m == 1 else -(x + w)


def _fist_down(ctx, c, rot=0, s=1.0, m=1):
    """Clenched fist hanging from the wrist: wrist at the top (0,-44), knuckles
    and curled fingers at the bottom. m = -1 mirrors the thumb side. Geometry is
    mirrored by hand (not with scale(-1 1)) so the light stays upper right."""
    p = ctx.pal
    o = [f'<g transform="translate({c[0]} {c[1]}) rotate({rot}) scale({s})">']
    # back of the hand: one chunky block
    o.append(ctx.shaded(ctx.rrect(-42, -44, 84, 68, 24), dx=8, dy=-8, rim=True,
                        extra=f'<ellipse cx="22" cy="-30" rx="10" ry="4.5" fill="{p.hi}"/>'))
    # three stubby curled fingers tucked under it
    for x, h in ((-46, 34), (-16, 38), (14, 35)):
        fx = _mx(m, x, 32)
        o.append(ctx.shaded(ctx.rrect(fx, 10, 32, h, 14), dx=6, dy=-6, sw=5.5, rim=True))
        o.append(ctx.line(f"M{fx + 8},{h - 3} q8,5 17,0", 3))
    # thumb clamped across the front of the fingers
    a, b = (40 * m, -4), (-10 * m, 12)
    b1, b2 = (3, 2) if m == 1 else (2, 3)
    o.append(ctx.shaded(ctx.limb(a, b, 15, 14, b1, b2), dx=5, dy=-6, sw=5.5,
                        extra=f'<ellipse cx="{14 * m}" cy="-5" rx="9" ry="3.2" fill="{p.hi}"/>'))
    o.append(ctx.line(f"M{-14 * m},8 q{-5 * m},6 {-1 * m},13", 3))
    o.append(ctx.line(f"M{-26 * m},-30 q{10 * m},-7 {24 * m},-4", 3))      # wrist crease
    o.append('</g>')
    return "".join(o)


def draw(ctx):
    L = ctx.limb
    p = ctx.pal
    rng = ctx.rng("pose-grump")

    # ---- back: far arm, shoulder hunched up, locked straight down
    back = [
        ctx.shaded(L((350, 290), (414, 328), 27, 25, 10, 2), dx=6, dy=-8, rim=True),
        ctx.shaded(L((416, 326), (426, 376), 26, 24, 6, 8), dx=7, dy=-6, rim=True),
        ctx.line("M378,284 q20,2 34,18", 3.2),             # hunched shoulder
        ctx.line("M398,342 q10,6 22,2", 3),                # elbow
        ctx.wrap((426, 374), 6, 58),
        _fist_down(ctx, (427, 420), -5, 0.95, m=-1),
    ]

    # ---- legs + shoes: short legs, knees out, toes turned in
    legs = [
        ctx.shaded(L((212, 374), (160, 424), 30, 24, 4, 7), dx=7, dy=-4, rim=True),
        ctx.line("M158,396 q8,9 22,8", 3),                 # knee
        ctx.shaded(L((300, 374), (352, 424), 30, 24, 7, 4), dx=7, dy=-4, rim=True),
        ctx.line("M344,392 q12,6 22,0", 3),
    ]
    # toes turned in, with a clear gap between the two toe caps
    shoes = [ctx.shoe((156, 433), s=0.92), ctx.shoe((356, 433), flip=True, s=0.92)]

    # ---- front: near arm, same stiff hang, fist clenched
    front = [
        ctx.shaded(L((166, 342), (102, 348), 26, 26, 3, 12), dx=6, dy=-8, rim=True),
        ctx.line("M148,321 q-22,-5 -40,8", 3.2),           # hunched shoulder
        ctx.line("M187,331 q8,13 0,26", 3.4),              # armpit crease on the ball
        ctx.shaded(L((98, 348), (92, 382), 26, 25, 8, 6), dx=7, dy=-6, rim=True),
        ctx.line("M80,354 q10,8 24,4", 3),                 # elbow
    ]
    sticker = rng.choice(("plaster", "plaster", "scuffs", "none"))
    if sticker == "plaster":
        front.append(ctx.plaster((132, 346), rng.choice((0, 20, -15)), 0.9))
    elif sticker == "scuffs":
        front.append(ctx.scuffs((108, 346), 10))
    front += [
        ctx.wrap((92, 380), -4, 60),
        _fist_down(ctx, (92, 427), 4, 0.98, m=1),
        ctx.line("M62,404 l6,7 M70,399 l6,7", 2.6),             # knuckle scuffs
    ]

    # ---- fx: scribbled storm cloud + bolt over the head, grumble ticks
    fx = ('<g fill="none" stroke="#FFFFFF" stroke-linecap="round" stroke-linejoin="round" opacity=".9">'
          '<path d="M300,146 c-16,2 -22,-18 -6,-24 c-2,-18 24,-24 32,-10 c12,-14 36,-4 30,12 '
          'c16,2 14,24 -4,22 c-10,10 -24,6 -28,0 c-8,8 -20,6 -24,0z" stroke-width="5"/>'
          '<path d="M312,132 c6,-8 14,4 20,-4 c6,-8 12,6 20,-2" stroke-width="3.5"/>'
          '<path d="M336,156 l-10,16 l12,-2 l-8,16" stroke-width="4.5"/>'
          '<path d="M300,160 l-4,10 M366,158 l5,10" stroke-width="4"/>'
          '<path d="M54,430 q-6,-9 -2,-20 M62,454 q-8,-4 -9,-13" stroke-width="4"/>'      # fists shaking
          '<path d="M465,422 q6,-9 2,-20 M458,446 q8,-4 9,-13" stroke-width="4"/>'
          '</g>')

    back = [f'<g transform="translate({-ARM_IN} {-ARM_UP})">'] + back + ['</g>']
    front = [f'<g transform="translate({ARM_IN} {-ARM_UP})">'] + front + ['</g>']

    return dict(
        head=HEAD, radius=R, tilt=5, face=(2, 4),
        back=back, legs=legs, shoes=shoes, front=front,
        fx=fx, shadows=[(150, 100), (362, 100)],
    )
