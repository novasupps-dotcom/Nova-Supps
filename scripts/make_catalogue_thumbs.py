"""Genera src/catalogueThumbs.ts: miniaturas JPG (base64) de las fotos de catálogo
para el PDF de clientes (rápido y sin leer archivos del APK en el teléfono).
Uso: python3 scripts/make_catalogue_thumbs.py"""
import base64, io, re, sys
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parent.parent
src = (root / "src/catalogueImages.ts").read_text()
pairs = re.findall(r'"([^"]+)": \[require\("\.\./assets/catalogue/([^"]+)"\)', src)
out = ["// Generado por scripts/make_catalogue_thumbs.py: no editar a mano.", "// Miniaturas JPG (lado mayor 280 px) de la primera foto de cada producto del catálogo.", "export const catalogueThumbs: Record<string, string> = {"]
total = 0
for key, name in pairs:
    im = Image.open(root / "assets/catalogue" / name).convert("RGB")
    im.thumbnail((280, 280), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=70, optimize=True, progressive=False)
    b = base64.b64encode(buf.getvalue()).decode()
    total += len(buf.getvalue())
    out.append(f'  "{key}": "{b}",')
out.append("};")
(root / "src/catalogueThumbs.ts").write_text("\n".join(out) + "\n")
print(len(pairs), "miniaturas,", total // 1024, "KB")
