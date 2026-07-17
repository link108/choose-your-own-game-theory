"""Write the OpenAPI schema to the committed contract file (repo-root openapi.json).

The snapshot is what client code is generated from (swift-openapi-generator,
openapi-typescript); tests/test_openapi.py fails when it drifts from the app.
Run via `just openapi`.
"""

import json
import sys
from pathlib import Path

from app.main import app

DEFAULT_PATH = Path(__file__).resolve().parents[2] / "openapi.json"


def render() -> str:
    return json.dumps(app.openapi(), indent=2, sort_keys=True) + "\n"


def main() -> None:
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_PATH
    out.write_text(render())
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
