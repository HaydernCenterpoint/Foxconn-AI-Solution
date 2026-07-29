"""Fail unless the newest MKZ export timestamp is retrievable from Chroma."""

from __future__ import annotations

import re
from pathlib import Path

from sync_mkz_to_odysseus import Config
from src.rag_vector import VectorRAG


def main() -> None:
    exports = sorted(Path(Config.RAG_EXPORT_DIR).glob("*.md"))
    if not exports:
        raise SystemExit("No MKZ RAG exports exist")

    newest_export = max(exports, key=lambda export: export.stat().st_mtime)
    text = newest_export.read_text(encoding="utf-8")
    match = re.search(r"^Generated: (.+)$", text, re.MULTILINE)
    if match is None:
        raise SystemExit("The MKZ export has no generated timestamp")

    generated_at = match.group(1).strip()
    results = VectorRAG().search(generated_at, k=20)
    if not any(generated_at in str(result.get("document", "")) for result in results):
        raise SystemExit("The newest MKZ export is not queryable from Chroma")

    print("Newest MKZ export is queryable from Chroma.")


if __name__ == "__main__":
    main()
