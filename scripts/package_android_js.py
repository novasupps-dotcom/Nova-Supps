"""Empaqueta una actualización solo-JS sobre el runtime nativo firmado de la 0.6.

Uso:
  python3 scripts/package_android_js.py <APK base 0.6> <versionName> <versionCode>

Requisitos: bundle Hermes en build/index.android.bundle (ver README), `apksigner`
en el PATH (Ubuntu: apt install apksigner) y la llave de signing/.
- Comprueba que las imágenes del bundle existan idénticas en el APK base
  (los IDs de recursos nativos no cambian).
- Cambia versionName/versionCode del manifiesto binario y de app.config.
- Alinea en Python: .so sin comprimir a 16 KiB (Android 15+), resto a 4 bytes.
- Reemplaza ícono y splash según native/res_overrides.json (mismo nombre y formato).
- Firma v2/v3 con el certificado original para actualizar sin perder datos.
"""
from pathlib import Path
import hashlib, json, os, struct, subprocess, sys, zipfile

root = Path(__file__).resolve().parents[1]
base = Path(sys.argv[1]).resolve()
version_name = sys.argv[2]
version_code = int(sys.argv[3])
build = root / "build"
bundle = build / "index.android.bundle"
out = root / "deliverables"
out.mkdir(exist_ok=True)
data = bundle.read_bytes()
assert len(data) > 100000 and struct.unpack_from("<I", data, 8)[0] == 96, "Bundle Hermes v96 requerido"


def patch_manifest(raw: bytes) -> bytes:
    data = bytearray(raw)
    offset, strings, patched_code, patched_name = 8, [], False, False
    while offset < len(data):
        kind, header, size = struct.unpack_from("<HHI", data, offset)
        if kind == 1:
            count, _styles, flags, start = struct.unpack_from("<IIII", data, offset + 8)
            for i in range(count):
                pos = offset + start + struct.unpack_from("<I", data, offset + header + 4 * i)[0]
                if flags & 256:
                    def length(p):
                        n = data[p]
                        return (((n & 127) << 8) | data[p + 1], p + 2) if n & 128 else (n, p + 1)
                    _, pos = length(pos)
                    n, pos = length(pos)
                    text, enc = bytes(data[pos:pos + n]).decode("utf8"), "utf8"
                else:
                    n = struct.unpack_from("<H", data, pos)[0]
                    pos += 2
                    text, enc = bytes(data[pos:pos + n * 2]).decode("utf-16le"), "utf-16le"
                strings.append(text)
                if text == "0.6.0":
                    new = version_name.encode(enc)
                    assert len(new) == len(text.encode(enc)), "versionName debe tener 5 caracteres (x.y.z)"
                    data[pos:pos + len(new)] = new
                    patched_name = True
        if kind == 0x102:
            name = struct.unpack_from("<I", data, offset + 20)[0]
            astart, asize, acount = struct.unpack_from("<HHH", data, offset + 24)
            if strings[name] == "manifest":
                for i in range(acount):
                    p = offset + 16 + astart + i * asize
                    if strings[struct.unpack_from("<I", data, p + 4)[0]] == "versionCode":
                        assert struct.unpack_from("<I", data, p + 16)[0] == 6
                        struct.pack_into("<I", data, p + 16, version_code)
                        patched_code = True
        offset += size
    assert patched_code and patched_name
    return bytes(data)


def aligned_write(dst: zipfile.ZipFile, info: zipfile.ZipInfo, raw: bytes):
    original = info.compress_type
    info = zipfile.ZipInfo(info.filename, date_time=info.date_time)
    stored = original == zipfile.ZIP_STORED
    info.compress_type = original
    info.external_attr = 0o644 << 16
    if stored:
        align = 16384 if info.filename.endswith(".so") else 4
        header_start = dst.fp.tell()
        name_len = len(info.filename.encode("utf8"))
        data_start = header_start + 30 + name_len
        pad = (-data_start) % align
        if pad and pad < 4:
            pad += align
        if pad:
            info.extra = struct.pack("<HH", 0xD935, pad - 4) + b"\0" * (pad - 4)
    dst.writestr(info, raw)


# Recursos nativos que se reemplazan con el MISMO nombre y formato (ícono y splash):
# no cambian IDs ni resources.arsc, solo la imagen.
overrides_file = root / "native/res_overrides.json"
overrides = json.loads(overrides_file.read_text()) if overrides_file.exists() else {}
with zipfile.ZipFile(base) as src:
    for name in overrides:
        assert name in src.namelist(), f"Recurso a reemplazar no existe en el APK base: {name}"
    hashes = {hashlib.sha256(src.read(n)).hexdigest() for n in src.namelist() if n.startswith("res/")}
    for asset in (build / "res").rglob("*"):
        if asset.is_file():
            assert hashlib.sha256(asset.read_bytes()).hexdigest() in hashes, f"Recurso nuevo requiere compilación nativa: {asset}"
    unsigned = build / "unsigned.apk"
    with zipfile.ZipFile(unsigned, "w") as dst:
        for info in src.infolist():
            name = info.filename
            if name.startswith("META-INF/") and name.upper().endswith((".RSA", ".SF", ".MF", ".DSA", ".EC")):
                continue
            raw = src.read(name)
            if name == "AndroidManifest.xml":
                raw = patch_manifest(raw)
            elif name == "assets/index.android.bundle":
                raw = data
            elif name in overrides:
                raw = (root / overrides[name]).read_bytes()
            elif name == "assets/app.config":
                config = json.loads(raw)
                config["version"] = version_name
                config["android"]["versionCode"] = version_code
                raw = json.dumps(config).encode()
            aligned_write(dst, info, raw)

credentials = json.loads((root / "signing/credentials.json").read_text())
env = {**os.environ, "NOVA_SIGN_PASSWORD": credentials["password"]}
target = out / f"Nova_Negocio_{version_name.removesuffix('.0')}_Android.apk"
subprocess.run(["apksigner", "sign", "--ks", str(root / "signing/nova-release.jks"), "--ks-key-alias", credentials["alias"],
                "--ks-pass", "env:NOVA_SIGN_PASSWORD", "--key-pass", "env:NOVA_SIGN_PASSWORD", "--min-sdk-version", "24",
                "--out", str(target), str(unsigned)], check=True, env=env)
subprocess.run(["apksigner", "verify", "--verbose", "--print-certs", str(target)], check=True)
print(target)
print("SHA256", hashlib.sha256(target.read_bytes()).hexdigest())
