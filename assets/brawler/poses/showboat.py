"""Pose: Showboat. Victory flex for the crowd: far fist punched high overhead,
near arm cranked into a bicep flex, chin up, feet planted wide with toes out.

Both arms rise from behind the ball so the face stays completely clear.
Card space coordinates (520 x 760). See ../PARTS.md.
"""

HEAD = (268, 282)
R = 111


def draw(ctx):
    L = ctx.limb
    p = ctx.pal
    rng = ctx.rng("pose-showboat")
    hi = lambda x, y, rot: f'<ellipse cx="{x}" cy="{y}" rx="9" ry="4" transform="rotate({rot} {x} {y})" fill="{p.hi}"/>'

    # ---- back, far side: straight arm punched up and out, wrap, fist
    back = [
        ctx.shaded(L((332, 244), (374, 210), 27, 25, 4, 10), dx=6, dy=-8, rim=True),
        ctx.shaded(L((372, 212), (400, 184), 25, 24, 3, 9), dx=7, dy=-6, rim=True),
        ctx.line("M394,222 q8,-8 8,-20", 3),
        ctx.wrap((400, 186), 22, 58), ctx.fist((416, 146), 22, 1.0),
    ]

    # ---- back, near side: bicep flex. The shoulder is tucked behind the ball, the
    # upper arm runs straight out with the bicep peaked on top, forearm stacked up.
    back += [
        ctx.shaded(L((184, 238), (106, 254), 27, 27, 22, 2), dx=6, dy=-8, rim=True,
                   extra=hi(150, 216, -14)),
        ctx.line("M170,214 q-24,-12 -44,6", 3.2),          # bicep peak
        ctx.line("M162,266 q-22,10 -42,10", 3),            # tricep underside
        ctx.shaded(L((92, 262), (97, 208), 27, 24, 5, 3), dx=7, dy=-6, rim=True),
        ctx.line("M76,272 q10,8 22,4", 3),                 # elbow nub
        ctx.line("M112,236 q-8,6 -8,16", 3),               # inner elbow fold
    ]
    sticker = rng.choice(("plaster", "plaster", "scuffs", "none"))
    if sticker == "plaster":
        back.append(ctx.plaster((93, 250), rng.choice((0, 20, -15)), 0.95))
    elif sticker == "scuffs":
        back.append(ctx.scuffs((82, 242), 10))
    back += [ctx.wrap((98, 206), 2, 56), ctx.fist((97, 164), 2, 0.96, flip=True)]

    # ---- legs + shoes: wide planted stance, toes out. Tapered like the Boss legs,
    # knees pushed out, a hard shadow plane down the inner side.
    def leg(hip, ankle, b1, b2, inner):
        d = L(hip, ankle, 29, 23, b1, b2)
        return ctx.shaded(d, dx=7, dy=-4, rim=True,
                          extra=f'<path d="{inner}" fill="{p.shade}"/>')
    legs = [
        leg((214, 372), (180, 422), 5, 8, "M246,340 L214,372 L196,440 L260,440Z"),
        ctx.line("M176,396 q8,8 20,6", 3),                 # knee
        leg((322, 372), (356, 422), 8, 5, "M290,340 L318,372 L332,440 L270,440Z"),
        ctx.line("M348,392 q10,6 20,0", 3),
    ]
    shoes = [ctx.shoe((176, 428), flip=True), ctx.shoe((360, 428))]

    # ---- fx: impact burst behind the raised fist, flex ticks, speed lines
    burst = ctx.star(418, 146, 66, 46, 12, -8)
    fx = (f'<path d="{burst}" fill="#FFFFFF" opacity=".13"/>'
          f'<path d="{burst}" fill="none" stroke="#FFFFFF" stroke-width="3" stroke-linejoin="round" opacity=".5"/>'
          '<g stroke="#FFFFFF" stroke-linecap="round" opacity=".9">'
          '<path d="M360,114 l-14,-14" stroke-width="5"/><path d="M346,146 l-20,-6" stroke-width="4"/>'
          '<path d="M238,152 l-8,-22" stroke-width="5"/><path d="M272,146 l0,-26" stroke-width="4"/>'
          '<path d="M306,152 l8,-20" stroke-width="4"/>'
          '<path d="M58,292 l-10,8" stroke-width="4"/>'
          '</g>')

    return dict(
        head=HEAD, radius=R, tilt=-8, face=(-7, 0),
        back=back, legs=legs, shoes=shoes, front=[],
        fx=fx, shadows=[(152, 82), (384, 82)],
        keep_clear=[(40, 108, 160, 214), (360, 92, 480, 210)],   # both raised fists
    )
