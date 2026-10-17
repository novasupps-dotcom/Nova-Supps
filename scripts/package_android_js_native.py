"""Empaqueta una actualización solo-JS sobre el APK nativo 2.2.x (con expo-updates).

Uso:
  python3 scripts/package_android_js_native.py <APK base 2.2.x firmado> <versionName> <versionCode>

Requisitos: bundle Hermes en build/index.android.bundle (ver README), `apksigner` en el PATH
y la llave de signing/ (credentials.json + nova-release.jks). Nada se sube a ningún servidor.

- Comprueba que el bundle sea Hermes de la misma versión que el del APK base.
- Comprueba que las imágenes del bundle existan idénticas en el APK base (sin recursos nativos nuevos).
- Cambia versionName/versionCode del manifiesto binario y de app.config.
- Genera un app.manifest de expo-updates NUEVO (id y fecha): así la app usa este bundle y no
  uno anterior guardado. El runtime nativo (EXPO_RUNTIME_VERSION) no cambia.
- 2.2.6: reemplaza ícono, pantalla de inicio e ícono de avisos según native/res_2.2/overrides.json
  (por nombre de recurso; misma imagen PNG y mismo tamaño) y el color de avisos dentro de
  resources.arsc (mismo largo, sin mover nada).
- Alinea: .so sin comprimir a 16 KiB (Android 15+), resto a 4 bytes. Firma v2/v3 con el
  certificado original para instalar encima sin perder datos.
"""
from pathlib import Path
import hashlib, json, os, struct, subprocess, sys, time, uuid, zipfile

root = Path(__file__).resolve().parents[1]
base = Path(sys.argv[1]).resolve()
version_name = sys.argv[2]
version_code = int(sys.argv[3])
build = root / "build"
bundle = build / "index.android.bundle"
out = root / "deliverables"
out.mkdir(exist_ok=True)
data = bundle.read_bytes()
HBC = b"\xc6\x1f\xbc\x03\xc1\x03\x19\x1f"
assert data[:8] == HBC and len(data) > 100000, "build/index.android.bundle debe ser bytecode Hermes"


def patch_manifest(raw: bytes) -> tuple[bytes, str]:
    """versionName y versionCode del AndroidManifest binario (la cadena nueva debe medir lo mismo)."""
    data = bytearray(raw)
    offset, strings, spans = 8, [], []
    name_index = code_ok = None
    while offset < len(data):
        kind, header, size = struct.unpack_from("<HHI", data, offset)
        if kind == 1:  # tabla de cadenas
            count, _styles, flags, start = struct.unpack_from("<IIII", data, offset + 8)
            for i in range(count):
                pos = offset + start + struct.unpack_from("<I", data, offset + header + 4 * i)[0]
                if flags & 256:
                    def length(p):
                        n = data[p]
                        return (((n & 127) << 8) | data[p + 1], p + 2) if n & 128 else (n, p + 1)
                    _, pos = length(pos)
                    n, pos = length(pos)
                    strings.append(bytes(data[pos:pos + n]).decode("utf8"))
                    spans.append((pos, n, "utf8"))
                else:
                    n = struct.unpack_from("<H", data, pos)[0]
                    pos += 2
                    strings.append(bytes(data[pos:pos + n * 2]).decode("utf-16le"))
                    spans.append((pos, n * 2, "utf-16le"))
        if kind == 0x102 and strings[struct.unpack_from("<I", data, offset + 20)[0]] == "manifest":
            astart, asize, acount = struct.unpack_from("<HHH", data, offset + 24)
            for i in range(acount):
                p = offset + 16 + astart + i * asize
                attr = strings[struct.unpack_from("<I", data, p + 4)[0]]
                if attr == "versionCode":
                    struct.pack_into("<I", data, p + 16, version_code)
                    code_ok = True
                elif attr == "versionName":
                    name_index = struct.unpack_from("<I", data, p + 8)[0]
        offset += size
    assert code_ok and name_index is not None, "No se encontró versionCode/versionName en el manifiesto"
    old = strings[name_index]
    pos, n, enc = spans[name_index]
    new = version_name.encode(enc)
    assert len(new) == n, f"versionName debe medir lo mismo que el del APK base ({old})"
    data[pos:pos + n] = new
    return bytes(data), old


def png_size(raw: bytes) -> tuple[int, int]:
    assert raw[:8] == b"\x89PNG\r\n\x1a\n", "Se esperaba una imagen PNG"
    return struct.unpack(">II", raw[16:24])


def resource_overrides(apk: Path) -> tuple[dict[str, bytes], list[tuple[bytes, bytes]]]:
    """Archivos de res/ a reemplazar y cambios de color en resources.arsc (native/res_2.2)."""
    config_file = root / "native/res_2.2/overrides.json"
    if not config_file.exists():
        return {}, []
    config = json.loads(config_file.read_text(encoding="utf8"))
    dump = subprocess.run(["aapt2", "dump", "resources", str(apk)], check=True, capture_output=True, text=True).stdout
    entries: dict[str, list[str]] = {}
    current = None
    for line in dump.splitlines():
        words = line.split()
        if len(words) >= 3 and words[0] == "resource":
            current = words[2]
            entries[current] = []
        elif current and words:
            entries[current].append(line.strip())
    files: dict[str, bytes] = {}
    for name, pattern in config.get("files", {}).items():
        assert name in entries, f"El APK base no tiene {name}"
        found = 0
        for value in entries[name]:
            # "(xhdpi) (file) res/qs.webp" o "(xhdpi-v4) (file) res/qs.webp"
            parts = value.split()
            if len(parts) < 3 or parts[1] != "(file)":
                continue
            density = parts[0].strip("()").split("-")[0]
            source = root / "native/res_2.2" / pattern.format(d=density)
            assert source.exists(), f"Falta {source.name} para {name} ({density})"
            files[parts[2]] = source.read_bytes()
            found += 1
        assert found, f"{name} no tiene imágenes en el APK base"
    colors = []
    for name, new in config.get("colors", {}).items():
        values = [v.split()[-1] for v in entries.get(name, []) if v.startswith("() #")]
        assert len(values) == 1, f"{name} debe tener un solo valor en el APK base"
        old_argb = int(values[0][1:], 16)
        new_argb = int("ff" + new.lstrip("#"), 16)
        prefix = bytes.fromhex("0800001d")  # Res_value: tamaño 8, tipo color ARGB8
        colors.append((prefix + struct.pack("<I", old_argb), prefix + struct.pack("<I", new_argb)))
    return files, colors


def aligned_write(dst: zipfile.ZipFile, info: zipfile.ZipInfo, raw: bytes):
    original = info.compress_type
    info = zipfile.ZipInfo(info.filename, date_time=info.date_time)
    info.compress_type = original
    info.external_attr = 0o644 << 16
    if original == zipfile.ZIP_STORED:
        align = 16384 if info.filename.endswith(".so") else 4
        data_start = dst.fp.tell() + 30 + len(info.filename.encode("utf8"))
        pad = (-data_start) % align
        if pad and pad < 4:
            pad += align
        if pad:
            info.extra = struct.pack("<HH", 0xD935, pad - 4) + b"\0" * (pad - 4)
    dst.writestr(info, raw)


with zipfile.ZipFile(base) as src:
    names = src.namelist()
    base_bundle = src.read("assets/index.android.bundle")
    assert base_bundle[:12] == data[:12], "El bundle no es de la misma versión de Hermes que el APK base"
    hashes = {hashlib.sha256(src.read(n)).hexdigest() for n in names if n.startswith("res/")}
    # raw/keep.xml solo le indica a Gradle qué imágenes conservar; no va dentro del APK.
    images = [a for a in (build / "res").rglob("*") if a.is_file() and a.name != "keep.xml"]
    for asset in images:
        assert hashlib.sha256(asset.read_bytes()).hexdigest() in hashes, f"Recurso nuevo requiere compilación nativa: {asset}"
    manifest = json.loads(src.read("assets/app.manifest"))
    listed = {a.get("resourcesFilename") for a in manifest.get("assets", [])}
    for asset in images:
        assert asset.stem in listed, f"La imagen {asset.name} no está en el app.manifest del APK base"
    res_files, res_colors = resource_overrides(base)
    for name, raw in res_files.items():
        assert png_size(src.read(name)) == png_size(raw), f"{name}: la imagen nueva debe medir lo mismo que la original"
    manifest["id"] = str(uuid.uuid4())
    manifest["commitTime"] = int(time.time() * 1000)
    unsigned = build / "unsigned.apk"
    with zipfile.ZipFile(unsigned, "w") as dst:
        for info in src.infolist():
            name = info.filename
            if name.startswith("META-INF/") and name.upper().endswith((".RSA", ".SF", ".MF", ".DSA", ".EC")):
                continue
            raw = src.read(name)
            if name == "AndroidManifest.xml":
                raw, previous = patch_manifest(raw)
            elif name == "assets/index.android.bundle":
                raw = data
            elif name == "assets/app.manifest":
                raw = json.dumps(manifest, separators=(",", ":")).encode()
            elif name in res_files:
                raw = res_files[name]
            elif name == "resources.arsc" and res_colors:
                for old, new in res_colors:
                    assert raw.count(old) == 1, "El color a cambiar no es único en resources.arsc"
                    raw = raw.replace(old, new)
            elif name == "assets/app.config":
                config = json.loads(raw)
                config["version"] = version_name
                config["android"]["versionCode"] = version_code
                raw = json.dumps(config, ensure_ascii=False).encode()
            aligned_write(dst, info, raw)

credentials = json.loads((root / "signing/credentials.json").read_text())
env = {**os.environ, "NOVA_SIGN_PASSWORD": credentials["password"]}
target = out / f"Nova_Negocio_{version_name}_Android.apk"
assert not target.exists(), f"Ya existe {target.name}: no se sobrescribe un APK entregado"
subprocess.run(["apksigner", "sign", "--ks", str(root / "signing/nova-release.jks"), "--ks-key-alias", credentials["alias"],
                "--ks-pass", "env:NOVA_SIGN_PASSWORD", "--key-pass", "env:NOVA_SIGN_PASSWORD", "--min-sdk-version", "24",
                "--v1-signing-enabled", "false", "--v2-signing-enabled", "true", "--v3-signing-enabled", "true",
                "--out", str(target), str(unsigned)], check=True, env=env)
subprocess.run(["apksigner", "verify", "--print-certs", str(target)], check=True)
print(f"base {previous} → {version_name} ({version_code}) · app.manifest {manifest['id']} · {len(res_files)} imágenes y {len(res_colors)} color(es) de marca")
print(target)
print("SHA256", hashlib.sha256(target.read_bytes()).hexdigest())
