"""Build fonts.css from Latin Modern OpenType fonts (requires fontTools)."""
import base64
import io
import string
import sys
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

FONT_DIRECTORY = Path(sys.argv[1])
MATH_FONT = Path(sys.argv[2])


def encode(font):
    output = io.BytesIO()
    font.save(output)
    return base64.b64encode(output.getvalue()).decode("ascii")


def fraktur():
    font = TTFont(MATH_FONT)
    original = font.getBestCmap()
    # Remap the mathematical bold Fraktur alphabet to ordinary Latin letters.
    remapped = {ord(c): original[0x1D56C + i] for i, c in enumerate(string.ascii_letters[26:] + string.ascii_letters[:26])}
    for c in " 0123456789.,:’!?-":
        remapped[ord(c)] = original[ord(c)]
    for table in font["cmap"].tables:
        if table.isUnicode():
            table.cmap = remapped.copy()

    settings = subset.Options()
    settings.drop_tables += ["MATH", "GSUB", "GPOS"]
    settings.name_IDs = ["*"]
    subs = subset.Subsetter(options=settings)
    subs.populate(unicodes=remapped)
    subs.subset(font)

    family = "Journal Fraktur"
    names = {1: family, 2: "Regular", 3: "JournalFraktur-Regular", 4: family,
             6: "JournalFraktur-Regular", 16: family, 17: "Regular"}
    for record in font["name"].names:
        if record.nameID in names:
            record.string = names[record.nameID].encode(record.getEncoding())
    cff = font["CFF "].cff
    cff.fontNames[0] = names[6]
    cff.topDictIndex[0].FullName = family
    cff.topDictIndex[0].FamilyName = family
    cff.topDictIndex[0].Weight = "Regular"
    return font


def face(name, weight, font):
    return (f'@font-face {{ font-family: "{name}"; font-weight: {weight}; font-display: swap; '
            f'src: url("data:font/otf;base64,{encode(font)}") format("opentype"); }}')


css = [
    '/* Font notices and upstream references are in this directory. */',
    '@font-face { font-family: "Heavycrest Local"; src: local("Heavycrest"), local("Heavycrest Regular"), local("Heavycrest-Regular"); font-display: swap; }',
    face("Journal Fraktur", 400, fraktur()),
    face("Journal Roman", 400, TTFont(FONT_DIRECTORY / "lmroman10-regular.otf")),
    face("Journal Roman", 700, TTFont(FONT_DIRECTORY / "lmroman10-bold.otf")),
]
Path(__file__).with_name("fonts.css").write_text("\n".join(css) + "\n", encoding="utf-8")
