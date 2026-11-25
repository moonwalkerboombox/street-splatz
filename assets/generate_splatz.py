#!/usr/bin/env python3
"""
STREET SPLATZ — Generative Card Engine
Produces unique round gumball character cards as SVG + OpenSea metadata.
Every card is assembled from a seed so the run is fully reproducible.
"""

import os, json, random, hashlib, colorsys

OUT_DIR = "/home/claude/output"
IMG_DIR = os.path.join(OUT_DIR, "images")
META_DIR = os.path.join(OUT_DIR, "metadata")
for d in (OUT_DIR, IMG_DIR, META_DIR):
    os.makedirs(d, exist_ok=True)

# ----------------------------------------------------------------------
# BRAND PALETTE — body colors (name, hex)
# ----------------------------------------------------------------------
BODY_COLORS = [
    ("Cherry",    "#E31E24"),
    ("Blueberry", "#1A56FF"),
    ("Vanilla",   "#F0EAD6"),
    ("Licorice",  "#262626"),
    ("Grape",     "#7B3FE4"),
    ("Lime",      "#5FD11A"),
    ("Orange",    "#FF8A1E"),
    ("Bubblegum", "#FF5CAD"),
]

# flavor-driven character name pieces
NAME_SUFFIX = ["Boss", "Cool", "Star", "Drop", "Goon", "King", "Punk",
               "Slick", "Brawler", "Menace", "Hustler", "Chomp"]

EYE_STYLES   = ["shades", "heart", "star", "round", "googly"]
MOUTH_STYLES = ["grin", "smirk", "shout", "flat", "fang"]
POSES        = ["boss", "lean", "showboat", "grump"]

STAT_NAMES = ["Jaw Smash", "Sugar Bomb", "Pucker Blast", "Flavor Drip", "Gutter Splat"]

RARITY_TIERS = [  # (label, badge gradient stops)
    ("Street Legend", ["#FFD200", "#FF7A00"]),
    ("Block Hitter",  ["#B14BFF", "#6A1FE0"]),
    ("Fresh Drop",    ["#33C2FF", "#1A56FF"]),
    ("Pavement Card", ["#9AA0A6", "#5F6368"]),
]

def darken(hex_color, factor=0.62):
    h = hex_color.lstrip("#")
    r, g, b = (int(h[i:i+2], 16) / 255 for i in (0, 2, 4))
    hh, ll, ss = colorsys.rgb_to_hls(r, g, b)
    ll = max(0, ll * factor)
    r, g, b = colorsys.hls_to_rgb(hh, ll, ss)
    return "#%02X%02X%02X" % (int(r*255), int(g*255), int(b*255))

def lighten(hex_color, factor=1.35):
    h = hex_color.lstrip("#")
    r, g, b = (int(h[i:i+2], 16) / 255 for i in (0, 2, 4))
    hh, ll, ss = colorsys.rgb_to_hls(r, g, b)
    ll = min(1, ll * factor)
    r, g, b = colorsys.hls_to_rgb(hh, ll, ss)
    return "#%02X%02X%02X" % (int(r*255), int(g*255), int(b*255))

def text_on(hex_color):
    """black or white text depending on bg luminance"""
    h = hex_color.lstrip("#")
    r, g, b = (int(h[i:i+2], 16) for i in (0, 2, 4))
    lum = 0.299*r + 0.587*g + 0.114*b
    return "#111111" if lum > 140 else "#FFFFFF"

# ----------------------------------------------------------------------
# CHARACTER DRAWING — returns SVG fragment, centered around (cx, cy)
# ----------------------------------------------------------------------
def draw_eyes(style, cx, cy, body):
    s = []
    spread, ey = 34, cy - 18
    if style == "shades":
        s.append(f'<rect x="{cx-spread-22}" y="{ey-16}" width="44" height="30" rx="8" fill="#111"/>')
        s.append(f'<rect x="{cx+spread-22}" y="{ey-16}" width="44" height="30" rx="8" fill="#111"/>')
        s.append(f'<rect x="{cx-12}" y="{ey-4}" width="24" height="6" fill="#111"/>')
        s.append(f'<rect x="{cx-spread-16}" y="{ey-11}" width="14" height="7" rx="3" fill="#fff" opacity=".5"/>')
        s.append(f'<rect x="{cx+spread-16}" y="{ey-11}" width="14" height="7" rx="3" fill="#fff" opacity=".5"/>')
    elif style == "heart":
        for ox in (-spread, spread):
            x = cx + ox
            s.append(f'<path d="M{x} {ey+10} C{x-16} {ey-8} {x-2} {ey-18} {x} {ey-6} C{x+2} {ey-18} {x+16} {ey-8} {x} {ey+10} Z" fill="#FF2D6F" stroke="#111" stroke-width="2"/>')
    elif style == "star":
        for ox in (-spread, spread):
            x = cx + ox
            pts = star_points(x, ey, 16, 7, 5)
            s.append(f'<polygon points="{pts}" fill="#FFD200" stroke="#111" stroke-width="2"/>')
    elif style == "round":
        for ox in (-spread, spread):
            x = cx + ox
            s.append(f'<circle cx="{x}" cy="{ey}" r="16" fill="#fff" stroke="#111" stroke-width="3"/>')
            s.append(f'<circle cx="{x+3}" cy="{ey+2}" r="7" fill="#111"/>')
            s.append(f'<circle cx="{x+6}" cy="{ey-2}" r="2.5" fill="#fff"/>')
        s.append(f'<line x1="{cx-spread+14}" y1="{ey}" x2="{cx+spread-14}" y2="{ey}" stroke="#111" stroke-width="3"/>')
    elif style == "googly":
        offs = [(-spread, -3), (spread, 4)]
        for ox, oy in offs:
            x = cx + ox
            s.append(f'<circle cx="{x}" cy="{ey}" r="18" fill="#fff" stroke="#111" stroke-width="3"/>')
            s.append(f'<circle cx="{x+oy}" cy="{ey+oy}" r="8" fill="#111"/>')
    return "".join(s)

def star_points(cx, cy, ro, ri, n=5):
    import math
    pts = []
    for i in range(n*2):
        r = ro if i % 2 == 0 else ri
        a = math.pi/2 + i*math.pi/n
        pts.append(f"{cx + r*math.cos(a):.1f},{cy - r*math.sin(a):.1f}")
    return " ".join(pts)

def draw_mouth(style, cx, cy):
    my = cy + 34
    if style == "grin":
        return (f'<path d="M{cx-40} {my-4} Q{cx} {my+40} {cx+40} {my-4} Z" fill="#fff" stroke="#111" stroke-width="3"/>'
                f'<path d="M{cx-40} {my-4} Q{cx} {my+40} {cx+40} {my-4}" fill="none" stroke="#111" stroke-width="3"/>')
    elif style == "smirk":
        return f'<path d="M{cx-30} {my+6} Q{cx+10} {my+24} {cx+38} {my-6}" fill="none" stroke="#111" stroke-width="5" stroke-linecap="round"/>'
    elif style == "shout":
        return (f'<ellipse cx="{cx}" cy="{my+8}" rx="26" ry="30" fill="#7a0d0d" stroke="#111" stroke-width="3"/>'
                f'<ellipse cx="{cx}" cy="{my+22}" rx="14" ry="10" fill="#FF4d6d"/>')
    elif style == "flat":
        return f'<line x1="{cx-28}" y1="{my+6}" x2="{cx+28}" y2="{my+6}" stroke="#111" stroke-width="5" stroke-linecap="round"/>'
    elif style == "fang":
        return (f'<path d="M{cx-34} {my} Q{cx} {my+30} {cx+34} {my}" fill="#fff" stroke="#111" stroke-width="3"/>'
                f'<polygon points="{cx-18},{my+4} {cx-10},{my+4} {cx-14},{my+18}" fill="#fff" stroke="#111" stroke-width="2"/>'
                f'<polygon points="{cx+10},{my+4} {cx+18},{my+4} {cx+14},{my+18}" fill="#fff" stroke="#111" stroke-width="2"/>')
    return ""

def draw_character(cx, cy, r, body_hex, eyes, mouth, pose):
    limb = darken(body_hex, 0.6)
    out = []
    # arms by pose (drawn behind body)
    if pose == "boss":
        out.append(f'<circle cx="{cx-r+6}" cy="{cy+18}" r="16" fill="{limb}"/>')           # arm down
        out.append(f'<circle cx="{cx+r-2}" cy="{cy-r+6}" r="16" fill="{limb}"/>')          # arm raised
    elif pose == "lean":
        out.append(f'<circle cx="{cx-r+2}" cy="{cy+24}" r="16" fill="{limb}"/>')
        out.append(f'<circle cx="{cx+r-2}" cy="{cy+24}" r="16" fill="{limb}"/>')
    elif pose == "showboat":
        out.append(f'<circle cx="{cx-r-4}" cy="{cy-r+18}" r="16" fill="{limb}"/>')
        out.append(f'<circle cx="{cx+r+4}" cy="{cy-r+18}" r="16" fill="{limb}"/>')
    elif pose == "grump":
        out.append(f'<circle cx="{cx-r+10}" cy="{cy+10}" r="15" fill="{limb}"/>')
        out.append(f'<circle cx="{cx+r-10}" cy="{cy+10}" r="15" fill="{limb}"/>')
    # legs
    out.append(f'<circle cx="{cx-26}" cy="{cy+r-2}" r="15" fill="{limb}"/>')
    out.append(f'<circle cx="{cx+26}" cy="{cy+r-2}" r="15" fill="{limb}"/>')
    # body
    out.append(f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{body_hex}" stroke="#111" stroke-width="4"/>')
    # glossy highlight upper-left
    out.append(f'<ellipse cx="{cx-r*0.4:.0f}" cy="{cy-r*0.45:.0f}" rx="{r*0.34:.0f}" ry="{r*0.22:.0f}" fill="#fff" opacity="0.28" transform="rotate(-25 {cx-r*0.4:.0f} {cy-r*0.45:.0f})"/>')
    # face
    out.append(draw_eyes(eyes, cx, cy, body_hex))
    out.append(draw_mouth(mouth, cx, cy))
    return "".join(out)

# ----------------------------------------------------------------------
# CARD ASSEMBLY
# ----------------------------------------------------------------------
W, H = 520, 760

def build_card(idx, traits, stats, rarity_label, rarity_grad, name):
    body_name, body_hex = traits["body"]
    bg = darken(body_hex, 0.42)
    bg2 = darken(body_hex, 0.30)
    border = rarity_grad[0]
    panel_txt = text_on(bg)

    svg = []
    svg.append(f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">')
    svg.append(f'''<defs>
      <linearGradient id="bgg{idx}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="{bg2}"/><stop offset="1" stop-color="{bg}"/>
      </linearGradient>
      <linearGradient id="rar{idx}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="{rarity_grad[0]}"/><stop offset="1" stop-color="{rarity_grad[1]}"/>
      </linearGradient>
    </defs>''')
    # card frame
    svg.append(f'<rect x="6" y="6" width="{W-12}" height="{H-12}" rx="28" fill="#0A0A0A"/>')
    svg.append(f'<rect x="14" y="14" width="{W-28}" height="{H-28}" rx="22" fill="none" stroke="url(#rar{idx})" stroke-width="6"/>')
    # art panel
    svg.append(f'<rect x="34" y="92" width="{W-68}" height="380" rx="16" fill="url(#bgg{idx})"/>')
    # subtle pavement lines
    svg.append(f'<line x1="34" y1="380" x2="{W-34}" y2="380" stroke="#000" stroke-opacity="0.15" stroke-width="2"/>')
    # character
    svg.append(draw_character(W//2, 268, 118, body_hex, traits["eyes"], traits["mouth"], traits["pose"]))
    # number badge (top-left)
    svg.append(f'<rect x="30" y="30" width="92" height="40" rx="20" fill="#111" stroke="#333" stroke-width="2"/>')
    svg.append(f'<text x="76" y="57" font-family="Arial Black, Arial" font-size="22" fill="#fff" text-anchor="middle" font-weight="900">#{idx:03d}</text>')
    # rarity badge (top-right)
    svg.append(f'<rect x="{W-30-176}" y="30" width="176" height="40" rx="20" fill="url(#rar{idx})"/>')
    svg.append(f'<text x="{W-30-88}" y="57" font-family="Arial Black, Arial" font-size="16" fill="#111" text-anchor="middle" font-weight="900" letter-spacing="1">{rarity_label.upper()}</text>')
    # name banner
    svg.append(f'<rect x="34" y="486" width="{W-68}" height="52" rx="12" fill="{body_hex}" stroke="#111" stroke-width="3"/>')
    svg.append(f'<text x="{W//2}" y="521" font-family="Arial Black, Arial" font-size="26" fill="{text_on(body_hex)}" text-anchor="middle" font-weight="900" letter-spacing="1">{name.upper()}</text>')
    # stats
    sy = 560
    for i, (sn, sv) in enumerate(zip(STAT_NAMES, stats)):
        y = sy + i*32
        svg.append(f'<text x="40" y="{y+13}" font-family="Arial" font-size="13" fill="#cfcfcf" font-weight="700">{sn.upper()}</text>')
        # bar track
        bx, bw = 200, 250
        svg.append(f'<rect x="{bx}" y="{y+2}" width="{bw}" height="13" rx="6" fill="#1c1c1c"/>')
        fillw = int(bw * sv/10)
        svg.append(f'<rect x="{bx}" y="{y+2}" width="{fillw}" height="13" rx="6" fill="url(#rar{idx})"/>')
        svg.append(f'<text x="{bx+bw+16}" y="{y+13}" font-family="Arial Black, Arial" font-size="13" fill="#fff" text-anchor="end" font-weight="900">{sv}</text>')
        svg.append(f'<text x="{bx+bw+20}" y="{y+13}" font-family="Arial" font-size="11" fill="#666" font-weight="700">/10</text>')
    # footer
    svg.append(f'<text x="{W//2}" y="{H-22}" font-family="Arial" font-size="11" fill="#555" text-anchor="middle" letter-spacing="2">STREET SPLATZ · BASE NETWORK</text>')
    svg.append('</svg>')
    return "\n".join(svg)

# ----------------------------------------------------------------------
# GENERATION LOOP
# ----------------------------------------------------------------------
def assign_rarity(total, mx):
    pct = total / mx
    if pct >= 0.82: return 0   # legend
    if pct >= 0.68: return 1   # epic
    if pct >= 0.52: return 2   # rare
    return 3                   # common

def main(n=100, seed="street-splatz-genesis"):
    rng = random.Random(seed)
    seen = set()
    cards = []
    attempts = 0
    while len(cards) < n and attempts < n*50:
        attempts += 1
        body = rng.choice(BODY_COLORS)
        eyes = rng.choice(EYE_STYLES)
        mouth = rng.choice(MOUTH_STYLES)
        pose = rng.choice(POSES)
        combo = (body[0], eyes, mouth, pose)
        if combo in seen:
            continue
        seen.add(combo)
        idx = len(cards) + 1
        # stats — weight toward variety, occasional monster card
        stats = [rng.randint(2, 10) for _ in range(5)]
        if rng.random() < 0.12:  # boost some to create legends
            for _ in range(rng.randint(2, 3)):
                stats[rng.randrange(5)] = rng.randint(8, 10)
        total = sum(stats)
        rar_i = assign_rarity(total, 50)
        rar_label, rar_grad = RARITY_TIERS[rar_i]
        name = f"{body[0]} {rng.choice(NAME_SUFFIX)}"
        traits = {"body": body, "eyes": eyes, "mouth": mouth, "pose": pose}
        svg = build_card(idx, traits, stats, rar_label, rar_grad, name)
        with open(os.path.join(IMG_DIR, f"{idx:03d}.svg"), "w") as f:
            f.write(svg)
        meta = {
            "name": f"{name} #{idx:03d}",
            "description": "A one-of-a-kind Street Splatz pulled fresh from The Machine. Wild flavor drops.",
            "image": f"ipfs://REPLACE_CID/{idx:03d}.png",
            "attributes": [
                {"trait_type": "Flavor", "value": body[0]},
                {"trait_type": "Eyes", "value": eyes.title()},
                {"trait_type": "Mouth", "value": mouth.title()},
                {"trait_type": "Pose", "value": pose.title()},
                {"trait_type": "Rarity", "value": rar_label},
                {"trait_type": "Jaw Smash", "value": stats[0]},
                {"trait_type": "Sugar Bomb", "value": stats[1]},
                {"trait_type": "Pucker Blast", "value": stats[2]},
                {"trait_type": "Flavor Drip", "value": stats[3]},
                {"trait_type": "Gutter Splat", "value": stats[4]},
                {"trait_type": "Total Juice", "value": total},
            ],
        }
        with open(os.path.join(META_DIR, f"{idx:03d}.json"), "w") as f:
            json.dump(meta, f, indent=2)
        cards.append((idx, name, rar_label, total, traits, stats))

    # summary
    from collections import Counter
    rc = Counter(c[2] for c in cards)
    print(f"Generated {len(cards)} unique Splatz")
    for label, _ in RARITY_TIERS:
        print(f"  {label}: {rc.get(label,0)}")
    return cards

if __name__ == "__main__":
    main(100)
