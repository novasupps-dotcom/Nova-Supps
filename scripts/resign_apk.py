"""Refirma el APK de EAS con la llave privada LOCAL de Nova Negocio.

No sobrescribe APK existentes. Requiere JDK, Android Build Tools y signing/.
Uso: python scripts/resign_apk.py ruta/al/apk-de-eas.apk
"""
from pathlib import Path
import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
EXPECTED_CERT = "3b71f02d1463b877e7f20dd3141e150e10e5c60e40c2198ba98dadd10207ae94"


def certificate(output):
    values = re.findall(r"Signer #\d+ certificate SHA-256 digest:\s*([0-9a-fA-F:]+)", output)
    if len(values) != 1:
        raise ValueError("El APK debe tener exactamente un certificado de firma.")
    value = values[0].replace(":", "").lower()
    if len(value) != 64:
        raise ValueError("Certificado SHA-256 incompleto.")
    return value


def check_manifest(output, version, code):
    found = re.search(r"package: name='([^']+)' versionCode='(\d+)' versionName='([^']+)'", output)
    if not found or found.group(1) != "com.novasupps.negocio" or int(found.group(2)) != code or found.group(3) != version:
        raise ValueError("El APK no corresponde al paquete y versión configurados en app.json.")


def find_tool(name, explicit=None):
    if explicit:
        candidate = Path(explicit).resolve()
        if not candidate.is_file():
            raise ValueError("No existe la herramienta indicada: " + name)
        return str(candidate)
    found = shutil.which(name) or shutil.which(name + ".bat")
    if found:
        return found
    sdk = os.environ.get("ANDROID_HOME") or os.environ.get("ANDROID_SDK_ROOT")
    if not sdk and os.name == "nt" and os.environ.get("LOCALAPPDATA"):
        sdk = str(Path(os.environ["LOCALAPPDATA"]) / "Android/Sdk")
    tools = Path(sdk or "") / "build-tools"
    if tools.is_dir():
        versions = sorted(tools.iterdir(), key=lambda p: tuple(int(v) for v in re.findall(r"\d+", p.name)), reverse=True)
        for folder in versions:
            for extension in (".bat", ".exe", "") if os.name == "nt" else ("",):
                candidate = folder / (name + extension)
                if candidate.is_file():
                    return str(candidate.resolve())
    raise ValueError("Instala Android SDK Build Tools o indica la ruta con --" + name + ".")


def signer_command(tool, java=None):
    if Path(tool).suffix.lower() != ".bat":
        return [tool]
    jar = Path(tool).parent / "lib/apksigner.jar"
    executable = java or (str(Path(os.environ["JAVA_HOME"]) / "bin/java.exe") if os.environ.get("JAVA_HOME") else shutil.which("java"))
    if not executable or not jar.is_file():
        raise ValueError("Define JAVA_HOME con un JDK o indica --java para ejecutar apksigner.")
    return [executable, "-jar", str(jar)]


def run(command, env=None):
    result = subprocess.run(command, env=env, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if result.returncode:
        raise ValueError("Falló la herramienta Android: " + (result.stderr or result.stdout).strip())
    return result.stdout + result.stderr


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("apk", type=Path)
    parser.add_argument("--out", type=Path)
    parser.add_argument("--reference", type=Path, default=ROOT / "deliverables/Nova_Negocio_2.1_Android.apk")
    for tool in ("apksigner", "zipalign", "aapt", "java"):
        parser.add_argument("--" + tool)
    args = parser.parse_args(argv)
    config = json.loads((ROOT / "app.json").read_text(encoding="utf-8-sig"))["expo"]
    version, code = config["version"], config["android"]["versionCode"]
    source = args.apk.resolve()
    target = (args.out or ROOT / ("deliverables/Nova_Negocio_" + version.removesuffix(".0") + "_Android.apk")).resolve()
    if not source.is_file() or not args.reference.is_file():
        raise ValueError("Falta el APK de EAS o el APK 2.1 de referencia.")
    if target.exists() or source == target:
        raise ValueError("El destino ya existe. Elige otro nombre; ningún APK se sobrescribe.")
    signer = signer_command(find_tool("apksigner", args.apksigner), args.java)
    aligner, aapt = find_tool("zipalign", args.zipalign), find_tool("aapt", args.aapt)
    trusted = certificate(run(signer + ["verify", "--print-certs", str(args.reference.resolve())]))
    if trusted != EXPECTED_CERT:
        raise ValueError("El APK de referencia no tiene el certificado original de Nova Negocio.")
    check_manifest(run([aapt, "dump", "badging", str(source)]), version, code)
    credentials = json.loads((ROOT / "signing/credentials.json").read_text(encoding="utf-8-sig"))
    env = {**os.environ, "NOVA_STORE_PASSWORD": credentials["password"], "NOVA_KEY_PASSWORD": credentials.get("keyPassword", credentials["password"])}
    with tempfile.TemporaryDirectory(prefix="nova-resign-", dir=os.environ.get("NOVA_SIGN_SCRATCH")) as scratch:
        aligned, signed = Path(scratch) / "aligned.apk", Path(scratch) / "signed.apk"
        run([aligner, "-P", "16", "-f", "4", str(source), str(aligned)])
        run(signer + ["sign", "--ks", str(ROOT / "signing/nova-release.jks"), "--ks-key-alias", credentials["alias"],
                      "--ks-pass", "env:NOVA_STORE_PASSWORD", "--key-pass", "env:NOVA_KEY_PASSWORD",
                      "--v1-signing-enabled", "true", "--v2-signing-enabled", "true", "--v3-signing-enabled", "true", "--v4-signing-enabled", "false",
                      "--out", str(signed), str(aligned)], env)
        verified = run(signer + ["verify", "--verbose", "--print-certs", str(signed)])
        if certificate(verified) != EXPECTED_CERT:
            raise ValueError("El certificado final no coincide con el original. No se entrega el APK.")
        for scheme in (1, 2, 3):
            if not re.search(r"Verified using v" + str(scheme) + r" scheme[^\n]*:\s*true", verified):
                raise ValueError("Falta la firma v" + str(scheme) + ".")
        check_manifest(run([aapt, "dump", "badging", str(signed)]), version, code)
        run([aligner, "-c", "-P", "16", "4", str(signed)])
        target.parent.mkdir(parents=True, exist_ok=True)
        with signed.open("rb") as src, target.open("xb") as dst:
            shutil.copyfileobj(src, dst)
    print("APK verificado:", target)
    print("Versión:", version, "· versionCode:", code)
    print("Certificado SHA-256:", EXPECTED_CERT)
    with target.open("rb") as signed_file:
        print("APK SHA-256:", hashlib.file_digest(signed_file, "sha256").hexdigest())
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (ValueError, KeyError, OSError) as error:
        raise SystemExit(str(error))
