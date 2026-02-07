import subprocess
import sys
from pathlib import Path
import unittest


REPO_ROOT = Path(__file__).resolve().parents[1]


class TestBundleContract(unittest.TestCase):
    def test_validate_bundle_static(self) -> None:
        proc = subprocess.run(
            [sys.executable, str(REPO_ROOT / "scripts" / "validate_bundle.py")],
            cwd=str(REPO_ROOT),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        if proc.returncode != 0:
            self.fail(f"validate_bundle.py failed (exit={proc.returncode})\\nSTDOUT:\\n{proc.stdout}\\nSTDERR:\\n{proc.stderr}")


if __name__ == "__main__":
    unittest.main()

