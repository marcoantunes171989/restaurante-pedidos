#!/usr/bin/env python3
"""Inventário de literais de cor no Pedido Prime.

Uso:
  python3 scripts/audit_palette.py <raiz-do-projeto>
  python3 scripts/audit_palette.py <raiz> --format json

Marca como DIVERGENTE qualquer azul/laranja que não seja o oficial:
  petróleo #012E46  |  laranja #F38525
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

OFFICIAL_BLUE = "012E46"
OFFICIAL_ORANGE = "F38525"

# Extensões e pastas ignoradas
SKIP_DIRS = {
    ".git", "node_modules", "dist", "build", ".next", "coverage",
    ".turbo", ".vercel", "__pycache__", ".claude",
}
SKIP_FILES = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".woff", ".woff2", ".ttf", ".eot", ".pdf", ".zip"}
SCAN_EXT = {
    ".css", ".scss", ".sass", ".less",
    ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs",
    ".html", ".vue", ".svelte",
    ".json", ".svg", ".mdx",
}

HEX_RE = re.compile(r"#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b")
RGB_RE = re.compile(
    r"\b(rgba?|hsla?)\(\s*([^)]+)\)",
    re.IGNORECASE,
)

# Heurística: matiz azul vs laranja no HSV aproximado a partir de RGB 0-255
def _hex_to_rgb(h: str) -> tuple[int, int, int] | None:
    h = h.strip().lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    if len(h) == 8:
        h = h[:6]
    if len(h) != 6:
        return None
    try:
        return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
    except ValueError:
        return None


def _norm_hex(h: str) -> str:
    rgb = _hex_to_rgb(h)
    if not rgb:
        return h.upper().lstrip("#")
    return f"{rgb[0]:02X}{rgb[1]:02X}{rgb[2]:02X}"


def _classify_rgb(r: int, g: int, b: int) -> str | None:
    """Retorna 'blue', 'orange' ou None (neutro/outro).

    Cinzas/slates funcionais (bordas, muted) NÃO são classificados como azul —
    a skill manda normalizá-los pelo papel semântico, não substituir às cegas.
    """
    mx = max(r, g, b)
    mn = min(r, g, b)
    if mx < 40 and mn < 40:
        return None  # quase preto
    if mn > 220:
        return None  # quase branco
    # saturação baixa → cinza / slate funcional
    if mx - mn < 40:
        return None
    # Slate Tailwind-like: canais próximos e R não muito abaixo de B
    if abs(r - g) < 25 and abs(g - b) < 35 and abs(r - b) < 45 and mn >= 50:
        return None
    # Laranja de marca / âmbar quente: R alto, G médio, B baixo
    if r >= 180 and 40 <= g <= 200 and b <= 100 and r > g >= b:
        return "orange"
    if r >= 200 and g >= 90 and b <= 80 and r > b:
        return "orange"
    # Azul / petróleo de marca: B claramente dominante, R baixo (não slate)
    if b >= r + 25 and b >= g and r <= 100 and (b - mn) >= 35:
        return "blue"
    if b > r and b > g and (b - r) >= 40 and r <= 90:
        return "blue"
    return None


def _parse_rgb_args(args: str) -> tuple[int, int, int] | None:
    parts = [p.strip() for p in args.split(",")]
    if len(parts) < 3:
        # espaço-separado (css moderno)
        parts = args.replace("/", " ").split()
    if len(parts) < 3:
        return None
    try:
        def chan(x: str) -> int:
            x = x.strip()
            if x.endswith("%"):
                return int(round(float(x[:-1]) * 2.55))
            return int(round(float(x)))
        return chan(parts[0]), chan(parts[1]), chan(parts[2])
    except ValueError:
        return None


def iter_files(root: Path):
    for p in root.rglob("*"):
        if not p.is_file():
            continue
        if any(part in SKIP_DIRS for part in p.parts):
            continue
        if p.suffix.lower() in SKIP_FILES:
            continue
        if p.suffix.lower() not in SCAN_EXT:
            continue
        yield p


def audit(root: Path) -> dict:
    by_color: dict[str, list[dict]] = defaultdict(list)
    divergent_blue: list[dict] = []
    divergent_orange: list[dict] = []
    official_hits = {"blue": 0, "orange": 0}

    for path in iter_files(root):
        try:
            text = path.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        rel = str(path.relative_to(root))

        for i, line in enumerate(text.splitlines(), 1):
            for m in HEX_RE.finditer(line):
                raw = m.group(0)
                norm = _norm_hex(raw)
                rgb = _hex_to_rgb(norm)
                if not rgb:
                    continue
                kind = _classify_rgb(*rgb)
                entry = {
                    "file": rel,
                    "line": i,
                    "literal": raw,
                    "normalized": f"#{norm}",
                    "kind": kind,
                    "snippet": line.strip()[:160],
                }
                by_color[f"#{norm}"].append(entry)
                if kind == "blue":
                    if norm == OFFICIAL_BLUE:
                        official_hits["blue"] += 1
                    else:
                        divergent_blue.append(entry)
                elif kind == "orange":
                    if norm == OFFICIAL_ORANGE:
                        official_hits["orange"] += 1
                    else:
                        divergent_orange.append(entry)

            for m in RGB_RE.finditer(line):
                fn, args = m.group(1), m.group(2)
                rgb = _parse_rgb_args(args)
                if not rgb:
                    continue
                kind = _classify_rgb(*rgb)
                if kind is None:
                    continue
                norm = f"{rgb[0]:02X}{rgb[1]:02X}{rgb[2]:02X}"
                entry = {
                    "file": rel,
                    "line": i,
                    "literal": m.group(0),
                    "normalized": f"#{norm}",
                    "kind": kind,
                    "snippet": line.strip()[:160],
                }
                by_color[f"#{norm}"].append(entry)
                if kind == "blue":
                    if norm == OFFICIAL_BLUE:
                        official_hits["blue"] += 1
                    else:
                        divergent_blue.append(entry)
                elif kind == "orange":
                    if norm == OFFICIAL_ORANGE:
                        official_hits["orange"] += 1
                    else:
                        divergent_orange.append(entry)

    return {
        "root": str(root.resolve()),
        "official": {"blue": f"#{OFFICIAL_BLUE}", "orange": f"#{OFFICIAL_ORANGE}"},
        "official_hits": official_hits,
        "divergent_blue_count": len(divergent_blue),
        "divergent_orange_count": len(divergent_orange),
        "divergent_blue": divergent_blue,
        "divergent_orange": divergent_orange,
        "unique_colors": {
            k: len(v) for k, v in sorted(by_color.items(), key=lambda kv: -len(kv[1]))
        },
    }


def print_human(report: dict) -> None:
    print(f"Raiz: {report['root']}")
    print(f"Oficial: petróleo {report['official']['blue']} | laranja {report['official']['orange']}")
    print(f"Hits oficiais: blue={report['official_hits']['blue']} orange={report['official_hits']['orange']}")
    print(f"Divergentes: blue={report['divergent_blue_count']} orange={report['divergent_orange_count']}")
    print()
    print("Top literais (por ocorrência):")
    for color, n in list(report["unique_colors"].items())[:25]:
        flag = ""
        hx = color.lstrip("#").upper()
        if hx == OFFICIAL_BLUE:
            flag = " ✓ petróleo"
        elif hx == OFFICIAL_ORANGE:
            flag = " ✓ laranja"
        else:
            rgb = _hex_to_rgb(hx)
            if rgb:
                k = _classify_rgb(*rgb)
                if k == "blue":
                    flag = " ✗ azul divergente → #012E46"
                elif k == "orange":
                    flag = " ✗ laranja divergente → #F38525"
        print(f"  {n:5d}  {color}{flag}")

    def sample(title: str, items: list[dict], limit: int = 30):
        if not items:
            return
        print()
        print(f"{title} (até {limit}):")
        for e in items[:limit]:
            print(f"  {e['file']}:{e['line']}  {e['literal']}  →  {e['normalized']}")
            print(f"    {e['snippet']}")

    sample("Azuis divergentes", report["divergent_blue"])
    sample("Laranjas divergentes", report["divergent_orange"])

    ok = report["divergent_blue_count"] == 0 and report["divergent_orange_count"] == 0
    print()
    print("STATUS:", "OK — sem azuis/laranjas divergentes" if ok else "PENDENTE — há divergências")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Auditoria de paleta Pedido Prime")
    ap.add_argument("root", nargs="?", default=".", help="Raiz do projeto")
    ap.add_argument("--format", choices=("text", "json"), default="text")
    args = ap.parse_args(argv)

    root = Path(args.root).resolve()
    if not root.is_dir():
        print(f"Erro: pasta inexistente: {root}", file=sys.stderr)
        return 2

    report = audit(root)
    if args.format == "json":
        json.dump(report, sys.stdout, ensure_ascii=False, indent=2)
        print()
    else:
        print_human(report)

    return 0 if report["divergent_blue_count"] == 0 and report["divergent_orange_count"] == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
