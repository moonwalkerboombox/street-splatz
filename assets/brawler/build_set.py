#!/usr/bin/env python3
"""Rebuild the whole card set from the traits in assets/metadata.

    python3 build_set.py            (or `npm run cards` at the repo root)

Writes:
    assets/png/NNN.png     the 100 cards, 1040 x 1520, lossless PNG. These are the token images
                           and the files the provenance fingerprint is made from.
    assets/web/NNN.webp    the same cards at the same size as WebP (quality 92), about a third
                           of the weight. The site shows these in The Peel.

Every step is deterministic: the same generator, Chromium and Pillow versions give the same
bytes. Needs Playwright's Chromium (NODE_PATH must reach `playwright`) and Pillow with WebP.
Run `npm run build:assets` afterwards to refresh the site files and the provenance fingerprint.
"""
import argparse, os, shutil, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import gen       # noqa: E402
import optimize  # noqa: E402
from PIL import Image  # noqa: E402

TOTAL = 100
SIZE = (1040, 1520)
WEBP = dict(quality=92, method=6)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--png", default=os.path.join(HERE, "..", "png"))
    ap.add_argument("--web", default=os.path.join(HERE, "..", "web"))
    ap.add_argument("--work", default=None, help="folder for the SVGs and raw renders (a temp folder by default)")
    a = ap.parse_args()
    png_dir, web_dir = os.path.abspath(a.png), os.path.abspath(a.web)
    work = os.path.abspath(a.work or tempfile.mkdtemp(prefix="brawler-set-"))
    svg_dir, raw_dir = os.path.join(work, "svg"), os.path.join(work, "png")
    for d in (svg_dir, raw_dir):
        shutil.rmtree(d, ignore_errors=True)
        os.makedirs(d)

    for n in range(1, TOTAL + 1):
        with open(os.path.join(svg_dir, "%03d.svg" % n), "w", encoding="utf-8") as fh:
            fh.write(gen.build(gen.load_card(n), strict=True))
    subprocess.run(["node", os.path.join(HERE, "render.mjs"), "--dir", svg_dir, "--out", raw_dir],
                   check=True, stdout=subprocess.DEVNULL)

    names = ["%03d" % n for n in range(1, TOTAL + 1)]
    for d, ext in ((png_dir, ".png"), (web_dir, ".webp")):
        os.makedirs(d, exist_ok=True)
        for f in os.listdir(d):                     # drop anything that is not part of the set
            if f.endswith(ext) and f[:-len(ext)] not in names:
                os.remove(os.path.join(d, f))
    png_bytes = web_bytes = 0
    for name in names:
        raw = os.path.join(raw_dir, name + ".png")
        optimize.optimise(raw)                       # lossless re-encode, pixels identical
        im = Image.open(raw)
        im.load()
        if im.size != SIZE or im.mode != "RGBA":
            sys.exit("card %s rendered as %s %s, expected RGBA %s" % (name, im.mode, im.size, SIZE))
        shutil.copyfile(raw, os.path.join(png_dir, name + ".png"))
        web = os.path.join(web_dir, name + ".webp")
        im.save(web, "WEBP", **WEBP)
        png_bytes += os.path.getsize(raw)
        web_bytes += os.path.getsize(web)
    if not a.work:
        shutil.rmtree(work, ignore_errors=True)
    print("%d cards: %s %.1f MB, %s %.1f MB" % (TOTAL, png_dir, png_bytes / 1e6, web_dir, web_bytes / 1e6))


if __name__ == "__main__":
    main()
