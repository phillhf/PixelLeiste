"""Prints the pip requirements of Home Assistant core components (for the test environment).

Usage: pip install $(python tests_ha/component_requirements.py bluetooth usb)
"""

import json
import sys
from pathlib import Path

import homeassistant.components as components

base = Path(components.__file__).parent
reqs: set[str] = set()
for name in sys.argv[1:]:
    reqs.update(json.loads((base / name / "manifest.json").read_text(encoding="utf-8")).get("requirements", []))
print(" ".join(sorted(reqs)))
