"""Pose: Lean. Shoulder against an alley lamp post, arms crossed, legs crossed
at the shin with the free foot resting on its toe, head tipped back.
Relaxed menace, not a fighting stance.

Layering of the crossed arms (back to front):
  forearm A   left elbow -> right, its hand tucked away under the right bicep
  upper arms  both come out from behind the ball (clipped to outside the ball)
  forearm B   right elbow -> left, over forearm A, its hand gripping the left bicep

Card space coordinates (520 x 760). See ../PARTS.md.
"""
import math

HEAD = (272, 202)
R = 110
TILT = -10

# lamp post steel (a prop, not gear: cool violet steel, purple shadow)
POST, POST_SHADE, POST_HI = "#5A4FA6", "#2A2260", "#A79CF5"

# everything outside the ball (plus its outline): clip for a limb that starts behind the body
BEHIND_BALL = ("M0,0 H520 V760 H0Z M%d,%d a%d,%d 0 1,0 %d,0 a%d,%d 0 1,0 %d,0Z"
               % (HEAD[0] - R - 3, HEAD[1], R + 3, R + 3, 2 * R + 6, R + 3, R + 3, -2 * R - 6))

# joints
SH_L, EL_L = (190, 258), (164, 326)        # left (near post) shoulder, elbow
SH_R, EL_R = (354, 258), (382, 326)        # right shoulder, elbow
A0, A1 = (166, 338), (340, 300)            # forearm A
B0, B1 = (380, 340), (226, 302)            # forearm B (in front)


def _post(ctx, rng):
    """Lamp post behind the character. Runs out of the top of the art window,
    so it is clipped to the inside of the panel border."""
    p = ctx.pal
    ink = p.ink
    sh = lambda d, dx=7, dy=0, sw=5: ctx.shaded(d, POST, POST_SHADE, dx, dy, sw)
    o = []
    # plinth + flange on the pavement (behind the feet)
    o.append(sh(ctx.rrect(118, 440, 60, 13, 5), 5, -4))
    o.append(sh("M134,398 L162,398 L170,441 L126,441Z", 8, 0))
    o.append(f'<path d="M141,406 L138,434 M155,406 L158,434" stroke="{ink}" stroke-width="2.6" stroke-linecap="round"/>')
    o.append(f'<circle cx="128" cy="446.5" r="2.4" fill="{ink}"/><circle cx="168" cy="446.5" r="2.4" fill="{ink}"/>')
    # shaft with a lit streak on the light side
    o.append(ctx.shaded(ctx.rrect(137, 40, 22, 366, 4), POST, POST_SHADE, 8, 0, 5.5,
                        extra=f'<path d="M153.5,40 V402" stroke="{POST_HI}" stroke-width="3.2"/>'))
    for y in (100, 388):                                    # collars
        o.append(sh(ctx.rrect(131, y, 34, 13, 5), 6, -3))
    # seeded wear: scratches low on the shaft, clear of the head and headband knot
    y0 = rng.choice((352, 362, 372))
    o.append(f'<path d="M142,{y0} l4,7 M143,{y0 - 22} l5,9 M150,416 l-3,10" stroke="{POST_SHADE}" stroke-width="2.6" stroke-linecap="round"/>')
    return ctx.clipped(ctx.rrect(37, 83, 446, 412, 14), "".join(o))


def _grip(ctx):
    """Forearm B's hand hooked over the left bicep: back of the hand plus three
    fat fingers that stop at the middle of the arm, so the arm still reads."""
    p = ctx.pal
    L = ctx.limb
    dx, dy = EL_L[0] - SH_L[0], EL_L[1] - SH_L[1]
    n = math.hypot(dx, dy)
    ax, ay = dx / n, dy / n            # along the left upper arm (shoulder -> elbow)
    qx, qy = ay, -ax                   # across it, toward the palm (screen right)
    mx, my = SH_L[0] + dx * .56, SH_L[1] + dy * .56
    o = [ctx.shaded(L((mx + qx * 58, my + qy * 58 + 4), (mx + qx * 34, my + qy * 34 + 1), 19, 21, 2, 2),
                    dx=6, dy=-7, rim=True)]
    for k, r in ((-1, 10.5), (0, 11), (1, 10.5)):
        cx, cy = mx + ax * 19.5 * k, my + ay * 19.5 * k
        a = (cx + qx * 37, cy + qy * 37)
        b = (cx + qx * 2, cy + qy * 2)
        hi = f'<ellipse cx="{b[0] + 8:.1f}" cy="{b[1] - 4:.1f}" rx="5.5" ry="3" fill="{p.hi}"/>'
        o.append(ctx.shaded(L(a, b, r, r), dx=5, dy=-6, sw=5.5, rim=True, extra=hi))
        o.append(ctx.line(f"M{a[0] - 6:.1f},{a[1] - 7:.1f} q-5,7 -1,13", 3))
    return "".join(o)


def _on(a, b, t, off=0.0):
    """point at fraction t of a -> b, pushed off sideways"""
    dx, dy = b[0] - a[0], b[1] - a[1]
    n = math.hypot(dx, dy)
    return (a[0] + dx * t - dy / n * off, a[1] + dy * t + dx / n * off)


def _ang(a, b):
    return math.degrees(math.atan2(b[1] - a[1], b[0] - a[0]))


def draw(ctx):
    L = ctx.limb
    p = ctx.pal
    rng = ctx.rng("pose-lean")
    hi = lambda x, y, rot: f'<ellipse cx="{x}" cy="{y}" rx="9" ry="4" transform="rotate({rot} {x} {y})" fill="{p.hi}"/>'

    prop = [_post(ctx, rng)]

    # ---- legs + shoes: crossed at the shin. The planted leg comes from the right
    # hip and stands flat; the free leg crosses in front and rests on its toe.
    # cast shadow of the crossed arms on the top of both legs: separates the two masses
    cast = f'<path d="M150,330 L400,330 L400,378 L272,362 L150,384Z" fill="{p.shade}"/>'
    legs = [ctx.shaded(L((314, 336), (252, 420), 27, 23, 6, 4), dx=7, dy=-4, rim=True, extra=cast)]
    shoes = [
        ctx.shoe((250, 428), flip=True),
        ctx.shaded(L((226, 342), (338, 388), 27, 23, 4, 6), dx=6, dy=-6, rim=True,
                   extra=cast + hi(318, 376, 22)),
        ctx.shoe((352, 395), rot=24),
    ]

    # ---- front: crossed arms
    wb = _on(B0, B1, .80)
    front = [
        # forearm A and its wrist wrap
        ctx.shaded(L(A0, A1, 23, 21, 3, 5), dx=5, dy=-8, rim=True),
        ctx.line("M206,344 q22,6 44,2", 3.2),
        # upper arms: shoulders come out from behind the ball
        ctx.clipped(BEHIND_BALL,
                    ctx.shaded(L(SH_R, EL_R, 23, 25, 3, 10), dx=6, dy=-7, rim=True, extra=hi(390, 288, 70))
                    + ctx.line("M366,312 q12,7 26,2", 3.2)
                    + ctx.shaded(L(SH_L, EL_L, 23, 25, 10, 3), dx=6, dy=-7, rim=True, extra=hi(178, 278, -70))),
        ctx.line("M150,314 q2,12 14,18", 3.2),                   # left elbow fold over forearm A
        # forearm B, in front of A; drop shadow on A first so the overlap reads
        ctx.shaded(L(B0, B1, 24, 21, 5, 3), dx=5, dy=-8, rim=True),
        ctx.line("M300,340 q24,4 46,-2", 3.2),
    ]
    sticker = rng.choice(("plaster", "plaster", "scuffs", "none"))
    c = _on(B0, B1, .42, 2)
    if sticker == "plaster":
        front.append(ctx.plaster(c, rng.choice((0, 15, -15))))
    elif sticker == "scuffs":
        front.append(ctx.scuffs((c[0] - 8, c[1] - 2), 8))
    front += [ctx.wrap(wb, _ang(B0, B1) + 90, 50), _grip(ctx)]

    return dict(
        head=HEAD, radius=R, tilt=TILT, face=(0, -4),
        prop=prop, back=[], legs=legs, shoes=shoes, front=front,
        shadows=[(226, 84), (372, 62)],
    )
