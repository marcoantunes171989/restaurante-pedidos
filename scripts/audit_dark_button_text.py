#!/usr/bin/env python3
"""Auditoria: fill escuro (#012E46) com texto escuro / sem texto claro.

Uso:
  python3 scripts/audit_dark_button_text.py [raiz]
  python3 scripts/audit_dark_button_text.py [raiz] --format json
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

SKIP_DIRS = {".git", "node_modules", "dist", "build", ".next", "coverage", ".turbo", ".vercel", "__pycache__"}
SCAN_EXT = {".js", ".jsx", ".ts", ".tsx", ".css", ".scss", ".html"}

# Conflitos de alta confiança na mesma linha / trecho curto
PATTERNS = [
    {
        "id": "bg-petroleo-text-petroleo",
        "rx": re.compile(
            r"(bg-\[#012E46\](?!/)[^\n\"']{0,220}?)text-\[#012E46\]"
            r"|(text-\[#012E46\])([^\n\"']{0,220}?bg-\[#012E46\](?!/))"
        ),
        "msg": "bg #012E46 com text #012E46 (rótulo invisível)",
    },
    {
        "id": "bg-petroleo-text-graphite",
        "rx": re.compile(
            r"bg-\[#012E46\](?!/)[^\n\"']{0,220}?text-\[var\(--pp-graphite\)\]"
            r"|bg-\[#012E46\](?!/)[^\n\"']{0,220}?text-\[var\(--pp-text(?:-body)?\)\]"
        ),
        "msg": "bg #012E46 com texto grafite/body (baixo contraste)",
    },
    {
        "id": "filter-panel-mismatch",
        "rx": re.compile(
            r"\.pp-filter-panel\s*\{[^}]{0,400}?--filter-chip-selected:\s*var\(--pp-primary\)[^}]{0,200}?--filter-chip-text-selected:\s*#012E46",
            re.S,
        ),
        "msg": "pp-filter-panel amarra primary+texto petróleo (quebra no admin)",
    },
    {
        "id": "filter-panel-text-petroleo",
        "rx": re.compile(
            r"\.pp-filter-panel\s*\{[^}]{0,500}?--filter-chip-text-selected:\s*#012E46",
            re.S,
        ),
        "msg": "pp-filter-panel com text-selected petróleo (filtros ativos exigem branco)",
    },
]


def iter_files(root: Path):
    for p in root.rglob("*"):
        if not p.is_file():
            continue
        if any(part in SKIP_DIRS for part in p.parts):
            continue
        if p.suffix.lower() not in SCAN_EXT:
            continue
        yield p


def audit_file(path: Path) -> list[dict]:
    try:
        text = path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return []
    out = []
    for pat in PATTERNS:
        for m in pat["rx"].finditer(text):
            line = text.count("\n", 0, m.start()) + 1
            out.append({
                "file": str(path),
                "line": line,
                "id": pat["id"],
                "msg": pat["msg"],
                "snippet": m.group(0)[:160].replace("\n", " "),
            })
    return out


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("root", nargs="?", default=".")
    ap.add_argument("--format", choices=("text", "json"), default="text")
    args = ap.parse_args(argv)
    root = Path(args.root).resolve()
    findings = []
    for path in iter_files(root):
        for f in audit_file(path):
            f["file"] = str(Path(f["file"]).relative_to(root))
            findings.append(f)
    report = {
        "root": str(root),
        "conflicts": len(findings),
        "files": sorted({f["file"] for f in findings}),
        "findings": findings,
    }
    if args.format == "json":
        json.dump(report, sys.stdout, ensure_ascii=False, indent=2)
        print()
    else:
        print(f"Raiz: {report['root']}")
        print(f"Conflitos: {report['conflicts']} em {len(report['files'])} arquivo(s)\n")
        for f in findings[:50]:
            print(f"{f['file']}:{f['line']}  [{f['id']}] {f['msg']}")
            print(f"    {f['snippet']}")
        print()
        print("STATUS:", "OK" if not findings else "PENDENTE — há conflitos")
    return 0 if not findings else 1


if __name__ == "__main__":
    raise SystemExit(main())
