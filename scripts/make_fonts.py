"""2.4 · Tipografía Inter (licencia SIL OFL 1.1) embebida para actualizaciones solo-JS.

Uso: python3 scripts/make_fonts.py <carpeta package/ de inter-ui 4.1.1>
     (npm pack inter-ui@4.1.1; requiere fonttools y brotli)

- Recorta cada peso a letras latinas, números, monedas y signos (≈45 KB por archivo) y
  conserva el espaciado (kern), números tabulares (tnum) y ligaduras.
- Guarda los TTF en assets/fonts/ (para la próxima compilación nativa) y los incrusta en
  src/fontData.ts como base64: la app los escribe una vez en su carpeta y los registra con
  ExpoFontLoader, sin recursos nativos nuevos.
"""
from pathlib import Path
import base64, json, shutil, subprocess, sys
from fontTools.ttLib import TTFont

src = Path(sys.argv[1])
root = Path(__file__).resolve().parents[1]
fonts = root / "assets/fonts"
fonts.mkdir(parents=True, exist_ok=True)
UNICODES = ("U+0020-007E,U+00A0-00FF,U+0131,U+0152-0153,U+02C6,U+02DA,U+02DC,U+2010-2015,"
            "U+2018-201E,U+2022,U+2026,U+2030,U+2039-203A,U+20AC,U+2122,U+2190-2193,U+2197,"
            "U+2212,U+2713,U+2715,U+25CF,U+FF0B")
FEATURES = "kern,calt,tnum,case,locl,ccmp,mark,mkmk,liga"
FILES = {
    "Inter-Regular": src / "web/Inter-Regular.woff2",
    "Inter-Medium": src / "web/Inter-Medium.woff2",
    "Inter-SemiBold": src / "web/Inter-SemiBold.woff2",
    "Inter-Bold": src / "web/Inter-Bold.woff2",
    "InterDisplay-Bold": src / "display-latin/InterDisplay-Bold-subset.woff2",
}
out = ["// 2.4 · Inter 4.1 (SIL Open Font License 1.1, https://rsms.me/inter). Generado por",
       "// scripts/make_fonts.py: TTF recortados a letras latinas, en base64.",
       "export const FONT_DATA: Record<string, string> = {"]
for name, path in FILES.items():
    ttf = fonts / f"{name}.ttf"
    subprocess.run(["pyftsubset", str(path), f"--output-file={ttf}", f"--unicodes={UNICODES}",
                    f"--layout-features={FEATURES}", "--no-hinting", "--desubroutinize", "--name-IDs=*"], check=True)
    out.append(f'  "{name}": "{base64.b64encode(ttf.read_bytes()).decode()}",')
out.append("};")


def metrics(ttf: Path) -> dict:
    """Medidas para el PDF del catálogo: anchos (por 1000) de los códigos WinAnsi 32–255."""
    f = TTFont(str(ttf))
    upm = f["head"].unitsPerEm
    cmap = f.getBestCmap()
    hmtx = f["hmtx"]
    scale = 1000 / upm
    widths = []
    for code in range(32, 256):
        ch = bytes([code]).decode("cp1252", errors="ignore")
        glyph = cmap.get(ord(ch)) if ch else None
        widths.append(round(hmtx[glyph][0] * scale) if glyph else 0)
    head, os2 = f["head"], f["OS/2"]
    return {
        "widths": widths,
        "ascent": round(os2.sTypoAscender * scale),
        "descent": round(os2.sTypoDescender * scale),
        "capHeight": round(getattr(os2, "sCapHeight", 727) * scale),
        "bbox": [round(v * scale) for v in (head.xMin, head.yMin, head.xMax, head.yMax)],
    }


out.append("/** Medidas de cada letra (anchos WinAnsi 32–255 por 1000) para el PDF del catálogo. */")
out.append("export const FONT_METRICS: Record<string, { widths: number[]; ascent: number; descent: number; capHeight: number; bbox: number[] }> = " + json.dumps({name: metrics(fonts / f"{name}.ttf") for name in FILES}, separators=(",", ":")) + ";")
(root / "src/fontData.ts").write_text("\n".join(out) + "\n", encoding="utf8")
shutil.copy(src / "LICENSE.txt", fonts / "OFL.txt")
print({p.name: p.stat().st_size for p in fonts.glob("*.ttf")})
