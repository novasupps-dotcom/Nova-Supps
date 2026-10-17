"""2.3 · Íconos de línea (Lucide, licencia ISC) como PNG embebidos para React Native.

Uso: python3 scripts/make_icons.py <carpeta icons/ de lucide-static 0.460.0>
     (npm pack lucide-static@0.460.0 y descomprimir; requiere cairosvg)

Cada ícono se dibuja en blanco sobre fondo transparente a 96 px (24 dp en 4x) y se guarda en
src/icons.ts como data URI. En la app se pinta del color que se quiera con `tintColor`, así
no hace falta agregar fuentes ni recursos nativos (sirve para actualizaciones solo-JS).
"""
from pathlib import Path
import base64, re, sys
import cairosvg

NAMES = """
shopping-bag shopping-cart store receipt receipt-text users user user-round circle-user user-plus
package boxes settings clipboard-list calculator search x plus minus chevron-right chevron-left
chevron-down scan-barcode flashlight calendar check trash-2 download upload refresh-cw share-2
image triangle-alert circle-check circle-alert lock credit-card banknote landmark tag chart-column
book-open hard-drive database layers wallet bell fingerprint sliders-horizontal camera wifi-off
cloud cloud-upload cloud-off arrow-left-right pencil phone message-circle file-spreadsheet history
rotate-ccw undo-2 send smartphone log-out info filter ellipsis percent printer link mail clock
key-round coins hand-coins file-text list-checks
""".split()
SIZE = 96
STROKE = 1.75

src = Path(sys.argv[1])
root = Path(__file__).resolve().parents[1]
out = ['// 2.3 · Íconos de línea Lucide 0.460.0 (licencia ISC, https://lucide.dev). Generado por',
       '// scripts/make_icons.py: PNG blancos de 96 px; se colorean con tintColor.',
       "export const ICONS = {"]
for name in NAMES:
    svg = (src / f"{name}.svg").read_text(encoding="utf8")
    svg = re.sub(r"<!--.*?-->", "", svg, flags=re.S)
    svg = svg.replace('stroke="currentColor"', 'stroke="#FFFFFF"').replace('stroke-width="2"', f'stroke-width="{STROKE}"')
    png = cairosvg.svg2png(bytestring=svg.encode(), output_width=SIZE, output_height=SIZE)
    out.append(f'  "{name}": "data:image/png;base64,{base64.b64encode(png).decode()}",')
out.append("} as const;")
out.append("export type IconName = keyof typeof ICONS;")
(root / "src/icons.ts").write_text("\n".join(out) + "\n", encoding="utf8")
print(len(NAMES), "íconos →", (root / "src/icons.ts").stat().st_size, "bytes")
