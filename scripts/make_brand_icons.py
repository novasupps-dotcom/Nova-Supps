"""2.2.6 · Ícono, pantalla de inicio e ícono de avisos con el logo oficial GGG · Nova Supps.

Uso: python3 scripts/make_brand_icons.py   (requiere Pillow)

Fuente: assets/logo/ggg_novasupps.png (logo completo con fondo transparente).
Genera:
- native/res_2.2/*.png: imágenes con el MISMO tamaño que las del APK nativo 2.2.x, para
  reemplazarlas sin compilar (ver native/res_2.2/overrides.json y package_android_js_native.py).
- assets/logo/icono_app.png, assets/logo/icono_ios.png, assets/logo/notificacion.png y
  native/splash.png: las que usa app.json en la próxima compilación nativa (EAS).
- src/brandPdf.ts (2.5): el logo completo en JPG sobre blanco para el PDF del catálogo.
"""
from pathlib import Path
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parents[1]
out = root / "native/res_2.2"
out.mkdir(parents=True, exist_ok=True)
logo = Image.open(root / "assets/logo/ggg_novasupps.png").convert("RGBA")
alpha = logo.getchannel("A").point(lambda v: 255 if v > 40 else 0)


def parts():
    """Separa el logo en franjas: marca (GGG NovaSupps), SUPLEMENTOS y la mancuerna."""
    rows = [any(alpha.getpixel((x, y)) for x in range(0, logo.width, 2)) for y in range(logo.height)]
    bands, start = [], None
    for y, on in enumerate(rows + [False]):
        if on and start is None:
            start = y
        elif not on and start is not None:
            bands.append((start, y))
            start = None
    assert len(bands) == 3, f"Se esperaban 3 franjas en el logo y hay {len(bands)}"
    crops = []
    for top, bottom in bands:
        box = alpha.crop((0, top, logo.width, bottom)).getbbox()
        crops.append(logo.crop((box[0], top, box[2], bottom)))
    return crops


MARK, WORD, BELL = parts()
INK = (20, 20, 22, 255)
GOLD = (212, 166, 58, 255)
S = 1024


def emblem(width: int) -> Image.Image:
    """Marca con la mancuerna debajo (sin SUPLEMENTOS, que no se lee en un ícono)."""
    mh = round(width * MARK.height / MARK.width)
    bw = round(width * 0.36)
    bh = round(bw * BELL.height / BELL.width)
    gap = round(width * 0.05)
    img = Image.new("RGBA", (width, mh + gap + bh), (0, 0, 0, 0))
    img.alpha_composite(MARK.resize((width, mh), Image.LANCZOS), (0, 0))
    img.alpha_composite(BELL.resize((bw, bh), Image.LANCZOS), ((width - bw) // 2, mh + gap))
    return img


def centered(canvas: Image.Image, art: Image.Image) -> Image.Image:
    canvas.alpha_composite(art, ((canvas.width - art.width) // 2, (canvas.height - art.height) // 2))
    return canvas


def launcher(rounded=True) -> Image.Image:
    """Ícono: fondo negro de la marca, marco dorado y el emblema."""
    c = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    if rounded:
        mask = Image.new("L", (S, S), 0)
        ImageDraw.Draw(mask).rounded_rectangle((0, 0, S - 1, S - 1), radius=round(S * 0.22), fill=255)
        c.paste(Image.new("RGBA", (S, S), INK), (0, 0), mask)
        ImageDraw.Draw(c).rounded_rectangle((18, 18, S - 19, S - 19), radius=round(S * 0.20), outline=GOLD, width=10)
    else:  # iOS recorta las esquinas por su cuenta y no acepta transparencia.
        c = Image.new("RGBA", (S, S), INK)
    return centered(c, emblem(round(S * 0.80)))


def foreground() -> Image.Image:
    """Capa frontal de ícono adaptable (108 dp): el emblema dentro de la zona segura de 66 dp."""
    return centered(Image.new("RGBA", (S, S), (0, 0, 0, 0)), emblem(round(S * 0.58)))


def splash() -> Image.Image:
    """Pantalla de inicio: logo completo al centro (fondo blanco lo pone Android)."""
    w = round(S * 0.62)
    return centered(Image.new("RGBA", (S, S), (0, 0, 0, 0)), logo.resize((w, round(w * logo.height / logo.width)), Image.LANCZOS))


def notification() -> Image.Image:
    """Ícono de avisos: silueta blanca de la mancuerna en diagonal (Android pinta el color)."""
    bell = BELL.getchannel("A").point(lambda v: 255 if v > 90 else 0)
    w = round(S * 1.02)
    bell = bell.resize((w, round(w * bell.height / bell.width)), Image.LANCZOS)
    rotated = bell.rotate(35, resample=Image.BICUBIC, expand=True)
    sil = Image.new("L", (S, S), 0)
    scale = 0.9 * S / max(rotated.size)
    rotated = rotated.resize((round(rotated.width * scale), round(rotated.height * scale)), Image.LANCZOS)
    sil.paste(rotated, ((S - rotated.width) // 2, (S - rotated.height) // 2))
    return Image.merge("LA", (Image.new("L", (S, S), 255), sil))


DENSITIES = ["mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi"]
FACTORS = [1, 1.5, 2, 3, 4]
icon, fg, sp, nt = launcher(), foreground(), splash(), notification()
for d, f in zip(DENSITIES, FACTORS):
    icon.resize((round(48 * f),) * 2, Image.LANCZOS).save(out / f"ic_launcher_{d}.png", optimize=True)
    fg.resize((round(108 * f),) * 2, Image.LANCZOS).save(out / f"ic_launcher_foreground_{d}.png", optimize=True)
    sp.resize((round(288 * f),) * 2, Image.LANCZOS).save(out / f"splash_{d}.png", optimize=True)
    nt.resize((round(24 * f),) * 2, Image.LANCZOS).save(out / f"notification_{d}.png", optimize=True)

icon.save(root / "assets/logo/icono_app.png", optimize=True)
launcher(rounded=False).convert("RGB").save(root / "assets/logo/icono_ios.png", optimize=True)
nt.resize((96, 96), Image.LANCZOS).convert("RGBA").save(root / "assets/logo/notificacion.png", optimize=True)
sp.save(root / "native/splash.png", optimize=True)
# Logo para el PDF del catálogo (JPG sobre blanco: el PDF no necesita transparencia).
import base64, io
pdf_logo = Image.new("RGB", logo.size, (255, 255, 255))
pdf_logo.paste(logo, (0, 0), logo)
buf = io.BytesIO()
pdf_logo.save(buf, "JPEG", quality=90, optimize=True)
(root / "src/brandPdf.ts").write_text(
    "// 2.5 · Logo GGG · Nova Supps en JPG sobre blanco para el PDF del catálogo (scripts/make_brand_icons.py).\n"
    f"export const LOGO_JPEG = \"{base64.b64encode(buf.getvalue()).decode()}\";\n"
    f"export const LOGO_JPEG_SIZE = {{ width: {logo.width}, height: {logo.height} }};\n",
    encoding="utf8",
)
print("Listo:", sorted(p.name for p in out.glob("*.png")))
