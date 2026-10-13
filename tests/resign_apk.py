import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("resign", Path(__file__).resolve().parents[1] / "scripts/resign_apk.py")
resign = importlib.util.module_from_spec(spec)
spec.loader.exec_module(resign)
BADGING = "package: name='com.novasupps.negocio' versionCode='38' versionName='2.2.0'"
CERT = "Signer #1 certificate SHA-256 digest: " + resign.EXPECTED_CERT
VERIFIED = CERT + "\n" + "\n".join("Verified using v" + str(v) + " scheme (synthetic test): true" for v in (1, 2, 3))


class ResignTests(unittest.TestCase):
    def test_certificate(self):
        self.assertEqual(resign.certificate(CERT), resign.EXPECTED_CERT)
        with self.assertRaises(ValueError):
            resign.certificate(CERT + "\nSigner #2 certificate SHA-256 digest: " + "a" * 64)

    def test_manifest(self):
        resign.check_manifest(BADGING, "2.2.0", 38)
        with self.assertRaises(ValueError):
            resign.check_manifest(BADGING.replace("38", "37"), "2.2.0", 38)
        with self.assertRaises(ValueError):
            resign.check_manifest(BADGING.replace("com.novasupps.negocio", "com.other.app"), "2.2.0", 38)

    def test_workflow_and_no_overwrite(self):
        # Solo archivos sintéticos; no se abre la llave privada real.
        with tempfile.TemporaryDirectory(prefix="nova-sign-test-", dir=os.environ.get("NOVA_TEST_SCRATCH")) as directory:
            root = Path(directory)
            (root / "signing").mkdir()
            (root / "app.json").write_text(json.dumps({"expo": {"version": "2.2.0", "android": {"versionCode": 38}}}))
            (root / "signing/credentials.json").write_text(json.dumps({"password": "synthetic-password", "alias": "synthetic-alias"}))
            source, reference = root / "eas.apk", root / "reference.apk"
            source.write_bytes(b"synthetic apk"); reference.write_bytes(b"synthetic reference")
            commands = []

            def fake_run(command, env=None):
                commands.append(command)
                if command[0] == "zipalign" and "-c" not in command:
                    shutil.copyfile(command[-2], command[-1])
                if command[0] == "apksigner" and command[1] == "sign":
                    self.assertIn("--v1-signing-enabled", command)
                    self.assertIn("--v2-signing-enabled", command)
                    self.assertIn("--v3-signing-enabled", command)
                    self.assertEqual(env["NOVA_STORE_PASSWORD"], "synthetic-password")
                    Path(command[command.index("--out") + 1]).write_bytes(b"synthetic signed apk")
                return BADGING if command[0] == "aapt" else VERIFIED

            output = io.StringIO()
            with patch.object(resign, "ROOT", root), patch.object(resign, "find_tool", side_effect=lambda name, explicit: name), patch.object(resign, "signer_command", return_value=["apksigner"]), patch.object(resign, "run", side_effect=fake_run), contextlib.redirect_stdout(output):
                self.assertEqual(resign.main([str(source), "--reference", str(reference)]), 0)
                target = root / "deliverables/Nova_Negocio_2.2_Android.apk"
                self.assertEqual(target.read_bytes(), b"synthetic signed apk")
                self.assertEqual(source.read_bytes(), b"synthetic apk")
                self.assertNotIn("synthetic-password", output.getvalue())
                with self.assertRaisesRegex(ValueError, "ya existe"):
                    resign.main([str(source), "--reference", str(reference)])
                self.assertEqual(target.read_bytes(), b"synthetic signed apk")
                self.assertTrue(any(command[0] == "zipalign" and "-c" in command for command in commands))


if __name__ == "__main__":
    unittest.main()
