"""Pose: Boss. Fists up fighter stance, ported from the approved sample
(docs/art-direction/option-a-brawler). Far arm raised behind the body, near arm
cocked across the front, feet planted wide.

Card space coordinates (520 x 760). See ../PARTS.md.
"""


def draw(ctx):
    L = ctx.limb
    rng = ctx.rng("pose")

    # ---- back: far arm (upper arm, forearm), wrap, raised fist
    back = [
        ctx.shaded(L((346, 296), (408, 322), 27, 25, 12, 3), dx=6, dy=-8, rim=True),
        ctx.shaded(L((408, 322), (421, 232), 25, 23, 5, 15), dx=8, dy=-5, rim=True),
        ctx.line("M392,326 q12,-10 8,-26", 3.2),
        ctx.line("M366,286 q16,-5 30,6", 3.2),
        ctx.line("M436,300 q6,-16 0,-34", 3),
    ]
    # seeded sticker on the forearm: plaster, scuffs, or clean
    sticker = rng.choice(("plaster", "plaster", "scuffs", "none"))
    if sticker == "plaster":
        back.append(ctx.plaster((418, 286), rng.choice((0, 0, 20))))
    elif sticker == "scuffs":
        back.append(ctx.scuffs((408, 280), 10))
    back += [ctx.wrap((420, 232), 8, 58), ctx.fist((426, 176), 8, 1.0)]

    # ---- legs + shoes
    legs = [
        ctx.shaded(L((208, 372), (192, 420), 28, 23, 4, 6), dx=7, dy=-4, rim=True),
        ctx.shaded(L((298, 372), (322, 420), 28, 23, 6, 4), dx=7, dy=-4, rim=True),
    ]
    shoes = [ctx.shoe((190, 428), flip=True), ctx.shoe((324, 428))]

    # ---- front: near arm cocked across the body, wrap, big fist
    front = [
        ctx.shaded(L((170, 322), (82, 322), 28, 25, 4, 15), dx=6, dy=-8, rim=True),
        ctx.line("M150,300 q-20,-10 -42,2", 3.2),
        ctx.line("M192,308 q9,14 -1,32", 3.4),
        ctx.shaded(L((80, 324), (96, 344), 25, 25, 4, 4), dx=6, dy=-8, rim=True),
        ctx.wrap((98, 342), -50, 60),
        ctx.fist((120, 362), -12, 1.1, flip=True),
        ctx.line("M150,338 l7,7 M157,334 l6,6 M92,352 l5,7", 2.6),      # knuckle scuffs
    ]

    # ---- fx: speed lines off the raised fist (drawn in the backdrop, tiers above Pavement)
    fx = ('<g stroke="#FFFFFF" stroke-linecap="round" opacity=".9">'
          '<path d="M378,112 l-14,-16" stroke-width="5"/><path d="M404,102 l-4,-14" stroke-width="4"/>'
          '<path d="M364,146 l-20,-8" stroke-width="4"/></g>')

    return dict(
        head=(250, 264), radius=118.8, tilt=0,
        back=back, legs=legs, shoes=shoes, front=front,
        fx=fx, shadows=[(160, 78), (352, 78)],
    )
