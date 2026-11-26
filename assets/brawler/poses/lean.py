"""Pose: Lean ("coin toss"). Lounging with the back against the end of a brick
wall: one sneaker kicked up with its sole flat on the brick, the other planted
out in front, the near hand tucked behind the head with the elbow resting on the
wall, the far hand flipping a coin. No crossed arms, nothing in front of the face.

Silhouette, left to right: wall | elbow wedge over the headband tails | tipped
back ball | open hand with the coin in the air above it.

  prop   brick wall end (clipped to the art window)
  back   near arm behind the head (elbow, forearm, wrap, knuckles peeking over
         the ball), far arm, wrap, open palm, coin + motion marks
  legs   planted leg (seeded plaster / scuffs), kicked up thigh
  shoes  planted sneaker, kicked up shin, sneaker with its sole on the wall
  fx     glint ticks beside the coin (tiers above Pavement Card)

Card space coordinates (520 x 760). See ../PARTS.md.
"""
HEAD = (262, 226)
R = 110
TILT = -12

WALL_X = 150                      # the brick face the back and the sole rest on
# brick wall (a prop, not gear): dusty violet brick, purple shadow
BRICK, BRICK_ALT, BRICK_SHADE, BRICK_HI, MORTAR = "#46387F", "#544594", "#2A1F5C", "#8F7FD6", "#150E33"
# coin
GOLD, GOLD_SHADE, GOLD_HI = "#FFD23F", "#D9861F", "#FFF3B0"

# joints
F_SH, F_EL, F_WR = (344, 288), (376, 346), (406, 314)      # far arm: shoulder, elbow, wrist
PALM = (422, 280)
COIN = (424, 192)
N_SH, N_EL, N_WR = (190, 194), (96, 160), (170, 124)      # near arm: hand behind the head
N_FIST = (200, 136)
P_HIP, P_ANK = (310, 324), (356, 428)                      # planted leg
K_HIP, K_KNEE, K_ANK = (252, 326), (288, 400), (208, 404)  # kicked up leg


def _wall(ctx, rng):
    """End of a brick wall on the left of the art window, behind the character."""
    p = ctx.pal
    x0, x1, y0, y1 = 30, WALL_X, 78, 500
    body = f"M{x0},{y0} H{x1} V{y1} H{x0}Z"
    o = [f'<path d="{body}" fill="{BRICK}"/>']
    inner = []
    # courses: staggered bricks, a few seeded lighter ones and chipped corners
    ch = 30
    row = 0
    y = y0 + 6
    while y < y1:
        off = 0 if row % 2 else 28
        xs = [x1 - off - 56 * k for k in range(0, 4)]
        for bx in xs:
            if rng.random() < .22:
                inner.append(f'<rect x="{bx - 56}" y="{y}" width="56" height="{ch}" fill="{BRICK_ALT}"/>')
            if bx < x1:
                inner.append(f'<path d="M{bx},{y} v{ch}" stroke="{MORTAR}" stroke-width="3"/>')
        inner.append(f'<path d="M{x0},{y} H{x1}" stroke="{MORTAR}" stroke-width="3"/>')
        if rng.random() < .3:
            cx = rng.choice((62, 88, 112))
            inner.append(f'<path d="M{cx},{y + 9} l8,5 l-3,7" fill="none" stroke="{MORTAR}" stroke-width="2.6" '
                         f'stroke-linecap="round" stroke-linejoin="round"/>')
        y += ch
        row += 1
    # the ball's cast shadow on the brick (light from the upper right) and a floor shadow
    inner.append(f'<path d="{ctx.circle(HEAD[0] - 26, HEAD[1] + 20, R + 2)}" fill="{BRICK_SHADE}"/>')
    inner.append(f'<path d="M{x0},448 H{x1} V{y1} H{x0}Z" fill="{BRICK_SHADE}"/>')
    inner.append(f'<path d="M{x0},448 H{x1}" stroke="{ctx.halftone(BRICK_SHADE, 8, 2.2)}" stroke-width="18"/>')
    # lit corner strip on the light side
    inner.append(f'<path d="M{x1 - 5},{y0} V{y1}" stroke="{BRICK_HI}" stroke-width="4"/>')
    o.append(ctx.clipped(body, "".join(inner)))
    o.append(f'<path d="M{x1},{y0} V{y1}" stroke="{p.ink}" stroke-width="6" stroke-linecap="round"/>')
    # coping stone sticking out at the top of the wall end
    o.append(ctx.shaded(ctx.rrect(x0, 70, x1 - x0 + 16, 44, 5), BRICK_ALT, BRICK_SHADE, 0, -7, 5.5,
                        extra=f'<path d="M{x0},78 H{x1 + 16}" stroke="{BRICK_HI}" stroke-width="3"/>'))
    return ctx.clipped(ctx.rrect(37, 83, 446, 412, 14), "".join(o))


def _palm(ctx, c):
    """Open hand, palm up, cupped to catch: three fingers fanned up on the far
    side, thumb up on the near side, wrist below. Drawn unrotated so the light
    stays upper right."""
    p = ctx.pal
    L = ctx.limb
    x, y = c
    o = []
    for (bx, by, tx, ty) in ((10, -10, 40, -26), (12, -1, 44, -13), (10, 9, 40, 1)):
        a, b = (x + bx, y + by), (x + tx, y + ty)
        o.append(ctx.shaded(L(a, b, 11.5, 11, 0, 0), dx=5, dy=-6, sw=5.5, rim=True,
                            extra=f'<ellipse cx="{b[0] + 4}" cy="{b[1] - 4}" rx="5" ry="3" fill="{p.hi}"/>'))
    o.append(ctx.shaded(ctx.rrect(x - 36, y - 10, 70, 44, 19), dx=7, dy=-7, rim=True))
    o.append(ctx.line(f"M{x - 12},{y + 4} q14,9 30,2", 3))                   # palm crease
    o.append(ctx.shaded(L((x - 22, y + 4), (x - 27, y - 24), 13, 12, 0, 0), dx=5, dy=-6, sw=5.5, rim=True))
    return "".join(o)


def _coin(ctx, c, rng):
    """Spinning coin in the air plus the arc of motion marks down to the palm."""
    p = ctx.pal
    x, y = c
    rot = rng.choice((-24, -16, 18))
    o = []
    # motion marks: two arcs hugging the flight path, drawn with an ink underlay
    marks = (f"M{x - 26},{y + 26} q-9,20 -3,40", f"M{x + 26},{y + 30} q8,16 3,32", f"M{x - 2},{y + 36} v17")
    for d, w in zip(marks, (4.5, 4, 3.5)):
        o.append(f'<path d="{d}" fill="none" stroke="{p.ink}" stroke-width="{w + 4}" stroke-linecap="round"/>'
                 f'<path d="{d}" fill="none" stroke="#FFFFFF" stroke-width="{w}" stroke-linecap="round"/>')
    o.append(f'<g transform="translate({x} {y}) rotate({rot})">')
    o.append(f'<ellipse cx="-3" cy="4" rx="21" ry="17" fill="{GOLD_SHADE}" stroke="{p.ink}" stroke-width="5"/>')
    o.append(f'<ellipse cx="0" cy="0" rx="21" ry="17" fill="{GOLD}" stroke="{p.ink}" stroke-width="5"/>')
    o.append(f'<path d="{ctx.star(0, 0, 10, 4.4)}" fill="{GOLD_SHADE}" transform="scale(1 .8)"/>')
    o.append(f'<path d="M-13,-7 q6,-6 14,-6" fill="none" stroke="{GOLD_HI}" stroke-width="3.2" stroke-linecap="round"/>')
    o.append('</g>')
    o.append(f'<path d="{ctx.sparkle(x + 30, y - 18, 9)}" fill="#FFFFFF" stroke="{p.ink}" stroke-width="2.6" stroke-linejoin="round"/>')
    return "".join(o)


def draw(ctx):
    L = ctx.limb
    p = ctx.pal
    rng = ctx.rng("pose-lean")
    hi = lambda x, y, rot: f'<ellipse cx="{x}" cy="{y}" rx="9" ry="4" transform="rotate({rot} {x} {y})" fill="{p.hi}"/>'

    prop = [_wall(ctx, ctx.rng("pose-lean-wall"))]

    # ---- back: far arm out to the side, open palm, coin in the air
    back = [
        ctx.shaded(L(F_SH, F_EL, 25, 24, 10, 3), dx=6, dy=-8, rim=True),
        ctx.shaded(L(F_EL, F_WR, 24, 22, 4, 12), dx=7, dy=-6, rim=True, extra=hi(402, 330, -45)),
        ctx.line("M360,344 q12,-2 16,-16", 3.2),                             # elbow fold
    ]
    back += [ctx.wrap((402, 319), 47, 50), _palm(ctx, PALM), _coin(ctx, COIN, rng)]

    # ---- legs: planted leg out in front; kicked up leg bends back to the wall
    legs = [
        ctx.shaded(L(P_HIP, P_ANK, 28, 23, 6, 4), dx=7, dy=-4, rim=True),
    ]
    # seeded sticker on the planted shin: plaster, scuffs, or clean
    sticker = rng.choice(("plaster", "plaster", "scuffs", "none"))
    if sticker == "plaster":
        legs.append(ctx.plaster((338, 386), rng.choice((0, 20, -20))))
    elif sticker == "scuffs":
        legs.append(ctx.scuffs((330, 380), -10))
    legs.append(ctx.shaded(L(K_HIP, K_KNEE, 27, 25, 4, 6), dx=7, dy=-4, rim=True))
    shoes = [
        ctx.shoe((P_ANK[0], 428)),
        ctx.shaded(L(K_KNEE, K_ANK, 25, 22, 5, 3), dx=5, dy=-7, rim=True, extra=hi(262, 392, 4)),
        ctx.line("M301,388 q6,10 -3,21", 3.2),                               # knee cap
        ctx.shoe(K_ANK, rot=90, s=0.9),
    ]

    # ---- near arm: hand behind the head, elbow up over the wall (drawn behind the ball)
    near = [
        ctx.fist(N_FIST, 62, 0.8),
        ctx.shaded(L(N_SH, N_EL, 25, 25, 3, 8), dx=6, dy=-8, rim=True),
        ctx.shaded(L(N_EL, N_WR, 26, 23, 6, 3), dx=6, dy=-8, rim=True, extra=hi(140, 128, -26)),
        ctx.line("M116,172 Q142,172 172,156", 3.4),                             # elbow fold
        ctx.line("M108,140 l7,6 M118,134 l6,6", 2.6),                        # elbow scuffs
        ctx.wrap(N_WR, 244, 46),
    ]
    back = near + back
    front = []

    # ---- fx: glint ticks off the coin (backdrop layer, tiers above Pavement)
    cx, cy = COIN
    fx = ('<g stroke="#FFFFFF" stroke-linecap="round" opacity=".9">'
          f'<path d="M{cx - 34},{cy - 14} l-15,-7" stroke-width="4.5"/><path d="M{cx - 38},{cy + 6} l-16,2" stroke-width="4"/>'
          f'<path d="M{cx - 30},{cy + 24} l-11,8" stroke-width="3.5"/></g>')

    return dict(
        head=HEAD, radius=R, tilt=TILT, face=(0, -3),
        prop=prop, back=back, legs=legs, shoes=shoes, front=front, fx=fx,
        shadows=[(382, 80), (196, 46)],
    )
