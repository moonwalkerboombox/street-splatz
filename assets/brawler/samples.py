#!/usr/bin/env python3
"""Build the owner's Brawler sample sheet.

    python3 samples.py [--out ../../docs/art-direction/sample-sheet] [--work DIR]

Writes into --out:
    NNN.png      the 12 sample cards, 1040 x 1520, traits straight from assets/metadata
    sheet.png    4 x 3 contact sheet with number / pose / eyes / mouth captions
    traits.png   reference grid: 4 poses, 5 eyes, 5 mouths, all on one flavor

SVGs and the trait preview cards go to --work (a temp folder by default).
"""
import argparse, json, os, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import gen  # noqa: E402

# 12 real cards: all 8 flavors, 5 eyes, 5 mouths, 4 poses (3 each), 4 tiers.
PICKS = [16, 17, 6, 48, 36, 49, 11, 27, 3, 19, 93, 44]

POSES = ["Boss", "Lean", "Showboat", "Grump"]
EYES = ["Shades", "Heart", "Star", "Round", "Googly"]
MOUTHS = ["Grin", "Smirk", "Shout", "Flat", "Fang"]
TRAIT_FLAVOR = "Vanilla"
PANEL = [30, 76, 460, 426]          # art window incl. border, card units
FACE = [118, 134, 268, 268]         # Boss head, card units


def node(*args):
    subprocess.run(["node", os.path.join(HERE, "render.mjs"), *args], check=True, stdout=subprocess.DEVNULL)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.path.join(HERE, "..", "..", "docs", "art-direction", "sample-sheet"))
    ap.add_argument("--work", default=None)
    a = ap.parse_args()
    out = os.path.abspath(a.out)
    work = os.path.abspath(a.work or tempfile.mkdtemp(prefix="brawler-samples-"))
    os.makedirs(out, exist_ok=True)
    os.makedirs(work, exist_ok=True)

    # ---- the 12 cards
    svgs, cells = [], []
    for n in PICKS:
        c = gen.load_card(n)
        f = os.path.join(work, "%03d.svg" % n)
        open(f, "w", encoding="utf-8").write(gen.build(c, strict=True))
        svgs.append(f)
        cells.append(dict(png="%03d.png" % n,
                          caption="#%03d  %s" % (n, c["pose"].upper()),
                          sub="%s eyes · %s mouth · %s" % (c["eyes"], c["mouth"], c["rarity"])))
    node("--out", out, *svgs)
    layout = dict(out="sheet.png", thumb=400, title="STREET SPLATZ · BRAWLER SAMPLE SHEET",
                  subtitle="12 of the 100 cards, traits exactly as in assets/metadata. "
                           "All 8 flavors, 5 eyes, 5 mouths, 4 poses and 4 rarities appear.",
                  rows=[dict(cells=cells[i:i + 4]) for i in range(0, 12, 4)])
    lf = os.path.join(out, ".sheet-layout.json")
    json.dump(layout, open(lf, "w"))
    node("--layout", lf)
    os.remove(lf)

    # ---- trait reference grid, one flavor
    tdir = os.path.join(work, "traits")
    os.makedirs(tdir, exist_ok=True)
    base = gen.load_card(39)        # any card; every art trait is overridden below
    base.update(flavor=TRAIT_FLAVOR, rarity="Fresh Drop", name=TRAIT_FLAVOR + " Brawler")
    rows, tsvgs = [], []

    def variant(tag, **kw):
        c = dict(base, **kw)
        f = os.path.join(tdir, tag + ".svg")
        open(f, "w", encoding="utf-8").write(gen.build(c, strict=True))
        tsvgs.append(f)
        return os.path.join(tdir, tag + ".png")

    rows.append(dict(label="POSE  (4)", thumb=440, cells=[
        dict(png=variant("pose_" + p, pose=p, eyes="Round", mouth="Grin"), caption=p.upper(), crop=PANEL) for p in POSES]))
    rows.append(dict(label="EYES  (5)", thumb=348, cells=[
        dict(png=variant("eyes_" + e, pose="Boss", eyes=e, mouth="Grin"), caption=e.upper(), crop=FACE) for e in EYES]))
    rows.append(dict(label="MOUTH  (5)", thumb=348, cells=[
        dict(png=variant("mouth_" + m, pose="Boss", eyes="Round", mouth=m), caption=m.upper(), crop=FACE) for m in MOUTHS]))
    node("--out", tdir, *tsvgs)
    lf = os.path.join(tdir, "layout.json")
    json.dump(dict(out=os.path.join(out, "traits.png"), title="STREET SPLATZ · BRAWLER TRAIT REFERENCE",
                   subtitle="Every pose, eye style and mouth on one flavor (%s). Eyes are shown with the Grin mouth, "
                            "mouths with Round eyes, both in the Boss pose." % TRAIT_FLAVOR, rows=rows), open(lf, "w"))
    node("--layout", lf)
    # lossless re-encode of everything in the sample folder (pixels unchanged)
    subprocess.run([sys.executable, os.path.join(HERE, "optimize.py"), out], check=True)
    print(out)


if __name__ == "__main__":
    main()
