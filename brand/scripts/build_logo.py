#!/usr/bin/env python3
"""
STYLO — builds every logo / icon / splash SVG from one definition (brand/logo, brand/icons, brand/splash).

The reference (owner-approved brand boards) is reproduced with real font outlines, so the SVGs need
no installed font:
  · the «S» monogram: Playfair Display Bold «S», crossed by two parallel diagonal blades (≈47°) that
    pass behind the letter — visible ends staggered, a thin gap where they meet the letter;
  · «STYLO»: Cinzel Medium, wide tracking;
  · «MORE THAN FASHION»: Montserrat, wide tracking;
  · «كل ستايل في مكان واحد»: IBM Plex Sans Arabic SemiBold (shaped with HarfBuzz, right-to-left).

Requires: pip install fonttools uharfbuzz   ·   PNGs: node brand/scripts/render.mjs
"""
from __future__ import annotations

import math
from pathlib import Path

import uharfbuzz as hb
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[1]
FONTS = ROOT / "fonts"

NAVY = "#0B1F2E"
TEAL = "#355E5A"
IVORY = "#F8F6F1"
SILVER = "#C9C9C9"
WHITE = "#FFFFFF"

TAGLINE_AR = "كل ستايل في مكان واحد"
DESCRIPTOR = "MORE THAN FASHION"


# ----------------------------------------------------------------------------- text → outlines
class Face:
    def __init__(self, file: str):
        path = FONTS / file
        self.tt = TTFont(path)
        self.glyphs = self.tt.getGlyphSet()
        self.order = self.tt.getGlyphOrder()
        self.upem = self.tt["head"].unitsPerEm
        blob = hb.Blob.from_file_path(str(path))
        self.hb = hb.Font(hb.Face(blob))
        os2 = self.tt["OS/2"]
        self.cap = getattr(os2, "sCapHeight", 0) or self.upem * 0.7


def text_path(face: Face, text: str, size: float, x: float, baseline: float, tracking: float = 0.0,
              rtl: bool = False) -> tuple[str, float]:
    """SVG path data for `text` (size = font size in px, tracking in em). Returns (d, width)."""
    buf = hb.Buffer()
    buf.add_str(text)
    buf.guess_segment_properties()
    if rtl:
        buf.direction = "rtl"
    hb.shape(face.hb, buf, {"kern": True, "liga": True})
    s = size / face.upem
    track = tracking * size
    pen = SVGPathPen(face.glyphs)
    cursor = 0.0
    n = len(buf.glyph_infos)
    for i, (info, pos) in enumerate(zip(buf.glyph_infos, buf.glyph_positions)):
        name = face.order[info.codepoint]
        gx = x + cursor + pos.x_offset * s
        gy = baseline - pos.y_offset * s
        face.glyphs[name].draw(TransformPen(pen, (s, 0, 0, -s, gx, gy)))
        cursor += pos.x_advance * s
        if not rtl and i < n - 1:
            cursor += track
    return pen.getCommands(), cursor


def text_width(face: Face, text: str, size: float, tracking: float = 0.0, rtl: bool = False) -> float:
    return text_path(face, text, size, 0, 0, tracking, rtl)[1]


PLAYFAIR = Face("PlayfairDisplay_700Bold.ttf")
CINZEL = Face("Cinzel_500Medium.ttf")
MONTSERRAT = Face("Montserrat_400Regular.ttf")
PLEX = Face("IBMPlexSansArabic_600SemiBold.ttf")


# ----------------------------------------------------------------------------- the S monogram
ANGLE = math.radians(47)       # blades rise to the right
THICK = 0.026                  # blade thickness, × S height
GAP = 0.022                    # gap between a blade and the letter, × S height
# (offset across the blade direction, start, end) — × S height, from the letter's centre; measured
# on the reference: two parallel lines, each hidden behind the letter, ends staggered.
# Terminal cuts (× S height, across the blades): the letter ends on these lines.
CUT_UP, CUT_LO = -0.15, 0.11   # past these lines lie Playfair's vertical beak serifs (absent in the reference)
PAIR = 0.131                   # spacing between the two lines of a pair (measured on the reference)
_INNER_UP = CUT_UP + GAP + THICK / 2   # inner blades sit right against the cut terminals
_INNER_LO = CUT_LO - GAP - THICK / 2
# (offset across, start, end along the blade) — lengths/stagger measured on the reference.
BLADES = [
    (_INNER_UP - PAIR, 0.577, 0.98),    # top, outer (long)
    (_INNER_UP, 0.189, 0.706),          # top, inner (against the upper terminal)
    (_INNER_LO, -0.651, -0.189),        # bottom, inner (against the lower terminal)
    (_INNER_LO + PAIR, -0.78, -0.611),  # bottom, outer
]


def s_glyph(height: float, cx: float, cy: float) -> str:
    """Playfair «S» scaled to `height` (its own bounding box), centred on (cx, cy)."""
    g = PLAYFAIR.glyphs[PLAYFAIR.tt.getBestCmap()[ord("S")]]
    from fontTools.pens.boundsPen import BoundsPen

    bp = BoundsPen(PLAYFAIR.glyphs)
    g.draw(bp)
    x0, y0, x1, y1 = bp.bounds
    s = height / (y1 - y0)
    pen = SVGPathPen(PLAYFAIR.glyphs)
    # font units are y-up: flip, then centre the bounding box
    tx = cx - (x0 + x1) / 2 * s
    ty = cy + (y0 + y1) / 2 * s
    g.draw(TransformPen(pen, (s, 0, 0, -s, tx, ty)))
    return pen.getCommands()


def band(cx: float, cy: float, h: float, v0: float, v1: float, u0: float, u1: float) -> str:
    """Quadrilateral in blade coordinates (u along, v across; × S height)."""
    d = (math.cos(ANGLE), -math.sin(ANGLE))
    n = (math.sin(ANGLE), math.cos(ANGLE))
    pts = [(u0, v0), (u1, v0), (u1, v1), (u0, v1)]
    xy = [(cx + d[0] * u * h + n[0] * v * h, cy + d[1] * u * h + n[1] * v * h) for u, v in pts]
    return "M" + " L".join(f"{x:.2f},{y:.2f}" for x, y in xy) + " Z"


# The terminals are sliced clean along the inner blades (no serif fragments beyond them):
# everything of the letter past the inner top blade (upper half) / inner bottom blade (lower half).
TRIM = [
    # (v from, v to, u from, u to): the terminals end on a clean diagonal parallel to the blades, as
    # in the reference (Playfair's own beak serifs are removed).
    (CUT_UP, 2.0, 0.12, 2.0),    # upper terminal
    (-2.0, CUT_LO, -2.0, -0.12), # lower terminal
]


def blade_poly(cx: float, cy: float, h: float, v: float, u0: float, u1: float, t: float, grow: float = 0) -> str:
    d = (math.cos(ANGLE), -math.sin(ANGLE))   # along the blade (screen coords, y down)
    n = (math.sin(ANGLE), math.cos(ANGLE))    # across it
    pts = []
    for u, w in ((u0 * h - grow, -1), (u1 * h + grow, -1), (u1 * h + grow, 1), (u0 * h - grow, 1)):
        off = v * h + w * (t / 2 + grow)
        pts.append((cx + d[0] * u + n[0] * off, cy + d[1] * u + n[1] * off))
    return "M" + " L".join(f"{x:.2f},{y:.2f}" for x, y in pts) + " Z"


_uid = 0


def mark(cx: float, cy: float, h: float, letter: str, blades: str | None = None) -> tuple[str, str]:
    """(defs, body) of the monogram. `letter`/`blades` are fills (colour or url(#…))."""
    global _uid
    _uid += 1
    mid = f"m{_uid}"
    blades = blades or letter
    t = THICK * h
    cut = "".join(f'<path d="{blade_poly(cx, cy, h, v, a, b, t, GAP * h)}" fill="#000"/>' for v, a, b in BLADES)
    cut += "".join(f'<path d="{band(cx, cy, h, v0, v1, u0, u1)}" fill="#000"/>' for v0, v1, u0, u1 in TRIM)
    defs = (
        f'<mask id="{mid}" maskUnits="userSpaceOnUse" x="0" y="0" width="100000" height="100000">'
        f'<rect x="-50000" y="-50000" width="100000" height="100000" fill="#fff"/>{cut}</mask>'
    )
    body = (
        f'<path d="{s_glyph(h, cx, cy)}" fill="{letter}" mask="url(#{mid})"/>'
        + "".join(f'<path d="{blade_poly(cx, cy, h, v, a, b, t)}" fill="{blades}"/>' for v, a, b in BLADES)
    )
    return defs, body


S_WIDTH = 0.664                # Playfair «S» width / height


def mark_points(h: float) -> list[tuple[float, float]]:
    """Outline points of the whole monogram (letter box + blade corners), relative to the letter centre."""
    pts = [(sx * S_WIDTH * h / 2, sy * h / 2) for sx in (-1, 1) for sy in (-1, 1)]
    d = (math.cos(ANGLE), -math.sin(ANGLE))
    n = (math.sin(ANGLE), math.cos(ANGLE))
    for v, a, b in BLADES:
        for u in (a, b):
            for w in (-1, 1):
                off = v * h + w * THICK * h / 2
                pts.append((d[0] * u * h + n[0] * off, d[1] * u * h + n[1] * off))
    return pts


def fit_mark(cx: float, cy: float, box_w: float, box_h: float, letter: str, blades=None, radius: float | None = None):
    """Monogram scaled so letter + blades fit the box (or a circle of `radius`), centred on (cx, cy).
    Returns (defs, body, half_width, half_height)."""
    pts = mark_points(1.0)
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    mx, my = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2          # visual centre offset
    if radius is not None:
        h = radius / max(math.hypot(x - mx, y - my) for x, y in pts)
    else:
        h = min(box_w / (max(xs) - min(xs)), box_h / (max(ys) - min(ys)))
    d, b = mark(cx - mx * h, cy - my * h, h, letter, blades)
    return d, b, (max(xs) - min(xs)) * h / 2, (max(ys) - min(ys)) * h / 2


def silver_gradient(gid: str) -> str:
    # Brushed silver: dark edges, a soft highlight band along the diagonal (as in the reference).
    return (
        f'<linearGradient id="{gid}" x1="0" y1="0" x2="1" y2="1">'
        '<stop offset="0" stop-color="#9DA2A6"/><stop offset=".32" stop-color="#E4E4E2"/>'
        '<stop offset=".48" stop-color="#C9C9C9"/><stop offset=".6" stop-color="#F6F6F4"/>'
        '<stop offset="1" stop-color="#A7ABAE"/></linearGradient>'
    )


def navy_gradient(gid: str) -> str:
    # Navy with a steel sheen (the primary logo on ivory).
    return (
        f'<linearGradient id="{gid}" x1="0" y1="0" x2="1" y2="1">'
        f'<stop offset="0" stop-color="{NAVY}"/><stop offset=".4" stop-color="#22394A"/>'
        '<stop offset=".52" stop-color="#5E6C77"/><stop offset=".64" stop-color="#22394A"/>'
        f'<stop offset="1" stop-color="{NAVY}"/></linearGradient>'
    )


# ----------------------------------------------------------------------------- compositions
def svg(w: float, h: float, inner: str, defs: str = "", bg: str | None = None, rx: float = 0) -> str:
    back = f'<rect width="{w}" height="{h}" rx="{rx}" fill="{bg}"/>' if bg else ""
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:g} {h:g}" width="{w:g}" height="{h:g}">'
        f"<defs>{defs}</defs>{back}{inner}</svg>\n"
    )


def centered(face: Face, text: str, size: float, cx: float, baseline: float, fill: str, tracking=0.0, rtl=False):
    w = text_width(face, text, size, tracking, rtl)
    d, _ = text_path(face, text, size, cx - w / 2, baseline, tracking, rtl)
    return f'<path d="{d}" fill="{fill}"/>', w


def stacked(letter: str, words: str, sub: str, bg: str | None, arabic: str | None = None, blades=None,
            defs_extra="") -> str:
    """Primary logo: monogram, STYLO, (Arabic tagline), MORE THAN FASHION — as in the reference."""
    W, pad = 1000, 70
    d1, m, _, hh = fit_mark(W / 2, 0, 760, 700, letter, blades)
    cy = pad + hh
    d1, m, _, hh = fit_mark(W / 2, cy, 760, 700, letter, blades)
    cap = 168 * 0.70                          # Cinzel cap height ≈ 0.70 em
    y = cy + hh + 95 + cap                    # STYLO baseline
    word, _ = centered(CINZEL, "STYLO", 168, W / 2, y, words, 0.30)
    parts = [m, word]
    if arabic:
        y += 130
        ar, _ = centered(PLEX, TAGLINE_AR, 66, W / 2, y, arabic, rtl=True)
        parts.append(ar)
    y += 95
    tag, _ = centered(MONTSERRAT, DESCRIPTOR, 40, W / 2, y, sub, 0.34)
    parts.append(tag)
    H = y + pad
    return svg(W, H, "".join(parts), defs_extra + d1, bg)


def horizontal(letter: str, words: str, sub: str, bg: str | None, blades=None, defs_extra="", rule=None) -> str:
    H = 400
    d1, m, hw, _ = fit_mark(0, H / 2, 300, 320, letter, blades)
    d1, m, hw, _ = fit_mark(50 + hw, H / 2, 300, 320, letter, blades)
    x = 50 + 2 * hw + 50                      # divider
    word_w = text_width(CINZEL, "STYLO", 132, 0.30)
    wd, _ = text_path(CINZEL, "STYLO", 132, x + 50, H / 2 + 22, 0.30)
    td, tw = text_path(MONTSERRAT, DESCRIPTOR, 33, x + 54, H / 2 + 92, 0.33)
    W = x + 50 + max(word_w, tw) + 60
    line = f'<rect x="{x}" y="{H / 2 - 110}" width="3" height="220" fill="{rule or words}"/>'
    inner = m + line + f'<path d="{wd}" fill="{words}"/><path d="{td}" fill="{sub}"/>'
    return svg(W, H, inner, defs_extra + d1, bg)


def monogram(size: float, letter: str, bg: str | None, scale: float, rx: float = 0, blades=None, defs_extra="",
             circle: bool = False) -> str:
    """Monogram alone. `scale` = share of the canvas the mark (letter + blades) may use; `circle` fits it
    inside a circle of that diameter (Android adaptive icons are cut to a circle or squircle)."""
    if circle:
        d1, m, _, _ = fit_mark(size / 2, size / 2, 0, 0, letter, blades, radius=size * scale / 2)
    else:
        d1, m, _, _ = fit_mark(size / 2, size / 2, size * scale, size * scale, letter, blades)
    return svg(size, size, m, defs_extra + d1, bg, rx)


def write(rel: str, content: str) -> None:
    p = ROOT / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(content, encoding="utf-8")
    print("wrote", rel)


def main() -> None:
    ng, sg = navy_gradient("navy"), silver_gradient("silver")
    # 1. primary (navy with sheen, transparent) · on ivory
    write("logo/stylo-logo-primary.svg", stacked("url(#navy)", NAVY, NAVY, None, blades=NAVY, defs_extra=ng))
    write("logo/stylo-logo-primary-ivory.svg", stacked("url(#navy)", NAVY, NAVY, IVORY, blades=NAVY, defs_extra=ng))
    # 2. reversed: brushed silver + white on navy · transparent
    write("logo/stylo-logo-reversed.svg", stacked("url(#silver)", WHITE, SILVER, NAVY, blades=SILVER, defs_extra=sg))
    write("logo/stylo-logo-reversed-transparent.svg",
          stacked("url(#silver)", WHITE, SILVER, None, blades=SILVER, defs_extra=sg))
    # 3. dark on light (flat navy)
    write("logo/stylo-logo-dark.svg", stacked(NAVY, NAVY, NAVY, IVORY))
    # 4. horizontal lockups
    write("logo/stylo-logo-horizontal.svg", horizontal(NAVY, NAVY, NAVY, None))
    write("logo/stylo-logo-horizontal-reversed.svg",
          horizontal("url(#silver)", WHITE, SILVER, NAVY, blades=SILVER, defs_extra=sg, rule=SILVER))
    # 5. monogram
    write("logo/stylo-mark-navy.svg", monogram(1000, NAVY, None, 0.86))
    write("logo/stylo-mark-silver.svg", monogram(1000, "url(#silver)", None, 0.86, blades=SILVER, defs_extra=sg))
    write("logo/stylo-mark-white.svg", monogram(1000, WHITE, None, 0.86))
    # 6. monochrome (one flat colour, any background)
    write("logo/stylo-logo-mono-navy.svg", stacked(NAVY, NAVY, NAVY, None))
    write("logo/stylo-logo-mono-white.svg", stacked(WHITE, WHITE, WHITE, None))
    # 7. Arabic lockup: STYLO · كل ستايل في مكان واحد · MORE THAN FASHION (navy card and transparent)
    write("logo/stylo-lockup-ar-navy.svg",
          stacked("url(#silver)", WHITE, SILVER, NAVY, arabic=WHITE, blades=SILVER, defs_extra=sg))
    write("logo/stylo-lockup-ar.svg", stacked("url(#navy)", NAVY, NAVY, None, arabic=NAVY, blades=NAVY, defs_extra=ng))

    # ------------------------------------------------------------------ app icons
    # iOS / stores: full-bleed navy (the system rounds the corners), brushed-silver monogram.
    write("icons/app-icon.svg", monogram(1024, "url(#silver)", NAVY, 0.90, blades=SILVER, defs_extra=sg))
    write("icons/app-icon-light.svg", monogram(1024, "url(#navy)", IVORY, 0.90, blades=NAVY, defs_extra=ng))
    # Android adaptive: monogram inside the 66 % safe circle, colour comes from the background layer.
    write("icons/android-foreground.svg",
          monogram(1024, "url(#silver)", None, 0.62, blades=SILVER, defs_extra=sg, circle=True))
    write("icons/android-background.svg", svg(1024, 1024, "", bg=NAVY))
    write("icons/android-monochrome.svg", monogram(1024, WHITE, None, 0.62, circle=True))
    # Favicon (browser tab, admin): rounded navy tile, flat silver for crispness at 16–32 px.
    write("icons/favicon.svg", monogram(64, "#E4E4E2", NAVY, 0.84, rx=14))

    # ------------------------------------------------------------------ splash (centred image on navy)
    write("splash/splash.svg",
          stacked("url(#silver)", WHITE, SILVER, None, arabic=WHITE, blades=SILVER, defs_extra=sg))


if __name__ == "__main__":
    main()
