"""Build the signed standalone Android APK using the project's private key.

Run with a full JDK 17 in JAVA_HOME and Android SDK in ANDROID_HOME.
"""
import json
import os
import pathlib
import subprocess
import urllib.parse

root = pathlib.Path(__file__).resolve().parents[1]
sdk = os.environ.get("ANDROID_HOME") or os.environ.get("ANDROID_SDK_ROOT")
jdk = os.environ.get("JAVA_HOME")
if not sdk or not jdk:
    raise SystemExit("Define ANDROID_HOME y JAVA_HOME (JDK 17 completo).")

credentials = json.loads((root / "signing/credentials.json").read_text())
env = dict(
    os.environ,
    NODE_ENV="production",
    NOVA_KEYSTORE=str(root / "signing/nova-release.jks"),
    NOVA_STORE_PASSWORD=credentials["password"],
    NOVA_KEY_PASSWORD=credentials["password"],
    NOVA_KEY_ALIAS=credentials["alias"],
)
(root / "android/local.properties").write_text("sdk.dir=" + sdk.replace("\\", "/") + "\n")
gradle_home = root.parent / "android-tools/gradle-home"
gradle_home.mkdir(parents=True, exist_ok=True)
env["GRADLE_USER_HOME"] = str(gradle_home)
properties = (
    "org.gradle.java.installations.paths=" + jdk + "\n"
    "org.gradle.java.installations.auto-download=false\n"
    "org.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=1024m\n"
    "org.gradle.workers.max=3\n"
    "org.gradle.parallel=false\n"
    "systemProp.javax.net.ssl.trustStore=/etc/ssl/certs/java/cacerts\n"
)
proxy = urllib.parse.urlparse(os.environ.get("HTTPS_PROXY") or os.environ.get("https_proxy") or "")
if proxy.hostname:
    for scheme in ("http", "https"):
        properties += f"systemProp.{scheme}.proxyHost={proxy.hostname}\n"
        properties += f"systemProp.{scheme}.proxyPort={proxy.port}\n"
(gradle_home / "gradle.properties").write_text(properties)
command = [
    "gradlew.bat" if os.name == "nt" else "./gradlew",
    "assembleRelease",
    "-PreactNativeArchitectures=arm64-v8a",
    "--console=plain",
    "--no-daemon",
]
raise SystemExit(subprocess.call(command, cwd=root / "android", env=env))
