"""
Génère public/polices/masque-etoile.woff : une police qui ne couvre que les
caractères de masquage des champs mot de passe (U+2022, U+25CF…) et les dessine
en étoile à six branches. Voir le commentaire de `@font-face` dans globals.css.

    pip install fonttools
    python src/scripts/police-masque.py
"""
import math

from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen

UPM = 1000
AVANCE = 720
CX, CY = AVANCE / 2, 330  # centre de l'étoile, à mi-hauteur des minuscules
R, DEMI = 270, 52  # longueur d'une branche, demi-épaisseur

# Caractères qu'emploient les moteurs pour masquer : Chrome et Safari U+2022,
# Firefox U+25CF ; les autres par prudence.
MASQUES = (0x2022, 0x25CF, 0x2219, 0x00B7, 0x25E6, 0x2027)


def branche(pen, angle):
    a = math.radians(angle)
    dx, dy = math.cos(a), math.sin(a)
    nx, ny = -dy, dx
    points = [
        (CX - dx * R + nx * DEMI, CY - dy * R + ny * DEMI),
        (CX - dx * R - nx * DEMI, CY - dy * R - ny * DEMI),
        (CX + dx * R - nx * DEMI, CY + dy * R - ny * DEMI),
        (CX + dx * R + nx * DEMI, CY + dy * R + ny * DEMI),
    ]
    points = [(round(x), round(y)) for x, y in points]
    pen.moveTo(points[0])
    for p in points[1:]:
        pen.lineTo(p)
    pen.closePath()


pen = TTGlyphPen(None)
for angle in (90, 30, 150):
    branche(pen, angle)

fb = FontBuilder(UPM, isTTF=True)
fb.setupGlyphOrder([".notdef", "etoile"])
fb.setupCharacterMap({c: "etoile" for c in MASQUES})
fb.setupGlyf({".notdef": TTGlyphPen(None).glyph(), "etoile": pen.glyph()})
fb.setupHorizontalMetrics({".notdef": (500, 0), "etoile": (AVANCE, 0)})
fb.setupHorizontalHeader(ascent=800, descent=-200)
fb.setupNameTable({"familyName": "Maria Masque", "styleName": "Regular"})
fb.setupOS2(sTypoAscender=800, sTypoDescender=-200, usWinAscent=800, usWinDescent=200)
fb.setupPost()
fb.font.flavor = "woff"
fb.save("public/polices/masque-etoile.woff")
