#!/usr/bin/env python3
"""Shrink rendered card PNGs (Chromium screenshots are written unoptimised).

    python3 optimize.py FILE_OR_DIR ...             lossless re-encode, pixels identical (about 30% smaller)
    python3 optimize.py --colors 256 FILE_OR_DIR    palette PNG, about 80% smaller, NOT pixel identical

Lossless is the default and is what the sample sheet uses. --colors is a
median cut + k-means palette with no dither: flat cel colours and halftone
dots survive, but anti-aliased edges and rare tints drift slightly, and the
card's rounded corners become hard edged (1 bit transparency). Look at the
result before adopting it for the real set.

Deterministic: same input bytes give the same output bytes. Needs Pillow.
"""
import argparse, io, os, sys

from PIL import Image


def optimise(path, colors=0):
    before = os.path.getsize(path)
    im = Image.open(path)
    im.load()
    if colors:
        rgba = im.convert("RGBA")
        alpha = rgba.getchannel("A")
        flat = Image.new("RGB", rgba.size, (10, 8, 20))          # card frame colour under the soft corners
        flat.paste(rgba, mask=alpha)
        q = flat.quantize(min(colors, 256) - 1, method=Image.Quantize.MEDIANCUT, kmeans=4, dither=Image.Dither.NONE)
        clear = len(q.getpalette()) // 3                          # next free palette slot = transparent
        q.paste(clear, mask=alpha.point(lambda a: 255 if a < 128 else 0))
        q.info["transparency"] = clear
        out = q
        kw = dict(transparency=clear)
    else:
        out, kw = im, {}
    buf = io.BytesIO()
    out.save(buf, "PNG", optimize=True, **kw)
    data = buf.getvalue()
    if len(data) < before:
        with open(path, "wb") as fh:
            fh.write(data)
    return before, min(before, len(data))


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("paths", nargs="+")
    ap.add_argument("--colors", type=int, default=0, help="quantise to this many colours (2..256); default lossless")
    a = ap.parse_args(argv)
    files = []
    for p in a.paths:
        if os.path.isdir(p):
            files += [os.path.join(p, f) for f in sorted(os.listdir(p)) if f.lower().endswith(".png")]
        else:
            files.append(p)
    tb = ta = 0
    for f in files:
        b, c = optimise(f, a.colors)
        tb += b
        ta += c
    print("%d files: %.1f MB -> %.1f MB" % (len(files), tb / 1e6, ta / 1e6))


if __name__ == "__main__":
    main()
