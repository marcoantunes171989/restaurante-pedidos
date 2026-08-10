#!/usr/bin/env python3
"""Auditoria/correção de contraste em botões do Pedido Prime.

Uso:
  python3 scripts/audit_button_contrast.py <raiz>
  python3 scripts/audit_button_contrast.py <raiz> --fix
  python3 scripts/audit_button_contrast.py <raiz> --format json
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

PETROLEO = "012E46"
LARANJA = "F38525"

SKIP_DIRS = {
    ".git", "node_modules", "dist", "build", ".next", "coverage",
    ".turbo", ".vercel", "__pycache__",
}
SCAN_EXT = {".js", ".jsx", ".ts", ".tsx", ".css", ".scss", ".html", ".vue", ".svelte", ".mdx"}

# Padrões de alta confiança (className / CSS na mesma linha ou trecho curto)
PATTERNS = [
    # btn-laranja + text-white
    {
        "id": "btn-laranja-text-white",
        "rx": re.compile(r"(btn-laranja(?:-claro)?[^\n\"']{0,120})text-white\b"),
        "fix": lambda m: m.group(1) + "text-[#012E46]",
        "msg": "btn-laranja com text-white (laranja exige texto petróleo)",
    },
    # bg laranja sólido + text-white
    {
        "id": "bg-laranja-text-white",
        "rx": re.compile(
            r"(bg-\[#F38525\](?!/)[^\n\"']{0,160}?)text-white\b"
            r"|(text-white\b)([^\n\"']{0,160}?bg-\[#F38525\](?!/))"
        ),
        "fix": lambda m: (
            (m.group(1) + "text-[#012E46]") if m.group(1) is not None
            else ("text-[#012E46]" + m.group(2))
        ),
        "msg": "bg-[#F38525] com text-white",
    },
    # var(--pp-primary) / --pp-laranja / --client-primary como fill + text-white
    {
        "id": "var-primary-text-white",
        "rx": re.compile(
            r"(bg-\[var\(--(?:pp-primary(?:-hover)?|pp-laranja|client-primary(?:-hover)?|filter-chip-selected)\)\][^\n\"']{0,160}?)text-white\b"
        ),
        "fix": lambda m: m.group(1) + "text-[#012E46]",
        "msg": "fill laranja via var() com text-white",
    },
    # bg petróleo + text petróleo (invisível)
    {
        "id": "bg-petroleo-text-petroleo",
        "rx": re.compile(
            r"(bg-\[#012E46\](?!/)[^\n\"']{0,160}?)text-\[#012E46\]"
            r"|(text-\[#012E46\])([^\n\"']{0,160}?bg-\[#012E46\](?!/))"
        ),
        "fix": lambda m: (
            (m.group(1) + "text-white") if m.group(1) is not None
            else ("text-white" + m.group(2))
        ),
        "msg": "bg/#012E46 com text-[#012E46]",
    },
    # bg laranja + text laranja
    {
        "id": "bg-laranja-text-laranja",
        "rx": re.compile(
            r"(bg-\[#F38525\](?!/)[^\n\"']{0,160}?)text-\[#F38525\]"
            r"|(text-\[#F38525\])([^\n\"']{0,160}?bg-\[#F38525\](?!/))"
        ),
        "fix": lambda m: (
            (m.group(1) + "text-[#012E46]") if m.group(1) is not None
            else ("text-[#012E46]" + m.group(2))
        ),
        "msg": "bg/#F38525 com text-[#F38525]",
    },
    # CSS: .btn-laranja { ... color: #fff/white }
    # Ignora blocos .pp-admin-module (lá o fill vira petróleo → branco correto).
    {
        "id": "css-btn-laranja-white",
        "rx": re.compile(
            r"(?<!pp-admin-module )(?<!pp-admin-module\n)"
            r"((?:^|[^\-])\.btn-laranja(?:-claro)?[^{]{0,80}\{[^}]{0,400}?)"
            r"color:\s*(?:#fff(?:fff)?|white)\b",
            re.I | re.M,
        ),
        "fix": lambda m: m.group(1) + "color: #012E46",
        "msg": "CSS .btn-laranja com color branco (fora do admin)",
        "skip_if": lambda s: "pp-admin-module" in s,
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
        # não reescrever o próprio script/docs da skill de forma agressiva? ok scan
        yield p


def audit_file(path: Path, fix: bool) -> list[dict]:
    try:
        text = path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return []
    findings = []
    original = text
    for pat in PATTERNS:
        skip_if = pat.get("skip_if")
        matches = list(pat["rx"].finditer(text))
        for m in matches:
            snippet = text[m.start():m.end()]
            # Contexto ampliado: admin remapeia .btn-laranja → fill petróleo
            # (texto branco correto). Não reportar esses blocos.
            ctx = text[max(0, m.start() - 280): m.end() + 80]
            if skip_if and skip_if(ctx):
                continue
            if "pp-admin-module" in ctx and (
                pat["id"].startswith("css-") or "btn-laranja" in pat["id"]
            ):
                continue
            line = text.count("\n", 0, m.start()) + 1
            findings.append({
                "file": str(path),
                "line": line,
                "id": pat["id"],
                "msg": pat["msg"],
                "snippet": snippet[:180].replace("\n", " "),
            })
        if fix:
            def _sub(m, _pat=pat, _skip=skip_if, _src=text):
                ctx = _src[max(0, m.start() - 280): m.end() + 80]
                if _skip and _skip(ctx):
                    return m.group(0)
                if "pp-admin-module" in ctx and _pat["id"].startswith("css-"):
                    return m.group(0)
                return _pat["fix"](m)
            text = pat["rx"].sub(_sub, text)
    if fix and text != original:
        path.write_text(text, encoding="utf-8")
    return findings


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("root", nargs="?", default=".")
    ap.add_argument("--fix", action="store_true")
    ap.add_argument("--format", choices=("text", "json"), default="text")
    args = ap.parse_args(argv)

    root = Path(args.root).resolve()
    # Preferir scripts relativos à skill quando invocados daqui
    all_findings = []
    changed_files = set()
    for path in iter_files(root):
        before = path.read_text(encoding="utf-8", errors="ignore") if args.fix else None
        fs = audit_file(path, fix=args.fix)
        if fs:
            all_findings.extend({
                **f,
                "file": str(Path(f["file"]).relative_to(root)),
            } for f in fs)
        if args.fix and before is not None:
            try:
                after = path.read_text(encoding="utf-8")
            except OSError:
                after = before
            if after != before:
                changed_files.add(str(path.relative_to(root)))

    report = {
        "root": str(root),
        "fix": args.fix,
        "conflicts": len(all_findings),
        "files_with_conflicts": len({f["file"] for f in all_findings}),
        "files_changed": sorted(changed_files),
        "findings": all_findings,
    }

    if args.format == "json":
        json.dump(report, sys.stdout, ensure_ascii=False, indent=2)
        print()
    else:
        print(f"Raiz: {report['root']}")
        print(f"Modo: {'FIX' if args.fix else 'AUDIT'}")
        print(f"Conflitos: {report['conflicts']} em {report['files_with_conflicts']} arquivo(s)")
        if args.fix:
            print(f"Arquivos alterados: {len(report['files_changed'])}")
            for f in report["files_changed"][:40]:
                print(f"  ~ {f}")
        print()
        by_id: dict[str, int] = {}
        for f in all_findings:
            by_id[f["id"]] = by_id.get(f["id"], 0) + 1
        for k, n in sorted(by_id.items(), key=lambda kv: -kv[1]):
            print(f"  {n:4d}  {k}")
        print()
        for f in all_findings[:40]:
            print(f"{f['file']}:{f['line']}  [{f['id']}] {f['msg']}")
            print(f"    {f['snippet']}")
        if len(all_findings) > 40:
            print(f"... +{len(all_findings)-40} ocorrências")
        print()
        print("STATUS:", "OK" if report["conflicts"] == 0 else "PENDENTE — há conflitos")

    # Em modo fix, exit 0 (alterou); em audit, 1 se ainda há conflitos
    if args.fix:
        return 0
    return 0 if report["conflicts"] == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
