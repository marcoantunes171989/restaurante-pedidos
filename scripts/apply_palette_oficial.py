#!/usr/bin/env python3
"""Aplica a paleta oficial Pedido Prime (#012E46 / #F38525) em massa.

Substitui azuis/laranjas de marca divergentes e rgba equivalentes.
Não toca em node_modules/dist/.git. Não altera verdes/vermelhos semânticos
de status (exceção normativa documentada).
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

SKIP_DIRS = {
    ".git", "node_modules", "dist", "build", ".next", "coverage",
    ".turbo", ".vercel", "__pycache__",
}
# Skills de botão/identidade são atualizadas junto; restante de .claude docs ok
SCAN_EXT = {
    ".css", ".scss", ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs",
    ".html", ".svg", ".json", ".md", ".mdx",
}

# Hex legados → oficiais (sem #, upper). Ordem: mais específicos primeiro.
HEX_MAP = {
    # Azuis / petróleo legados
    "0F4C5C": "012E46",
    "0C3D4A": "012E46",
    "0B3A46": "012E46",
    "093039": "012E46",
    "17667A": "012E46",
    "2E5FA8": "012E46",
    "2E7A8C": "012E46",
    "061A2E": "012E46",
    "0B2A3D": "012E46",
    "0A333E": "012E46",
    "082A33": "012E46",
    "061F26": "012E46",
    "04151A": "012E46",
    "315A7D": "012E46",
    "7CA1BF": "012E46",
    "6FA0AB": "012E46",
    "A7C4CB": "012E46",
    "CFE0E4": "E8EDF0",  # soft → tint do novo petróleo
    "E5EDEF": "E8EDF0",
    "E6EEF1": "E8EDF0",
    "B0C9D0": "9BB4C0",
    "58B7CD": "F38525",  # seleção nav → laranja (ativo)
    "070B16": "012E46",
    "0B1B33": "012E46",
    "111827": "012E46",
    "172033": "012E46",
    "263248": "012E46",
    "253149": "012E46",
    # Laranjas / âmbar de marca
    "E67E22": "F38525",
    "D06E1A": "F38525",
    "B25E15": "F38525",  # hover/fill legado → laranja oficial (texto sobre ele = petróleo)
    "964E11": "F38525",
    "A6540E": "012E46",  # --pp-primary-text → petróleo sobre claro / sobre laranja
    "EC8B3E": "F38525",
    "EC8636": "F38525",
    "F49A48": "F38525",
    "F2994A": "F38525",
    "F4A45E": "F38525",
    "C6551A": "F38525",
    "D66528": "F38525",
    "A8480F": "F38525",
    "EC9A5A": "F38525",
    "F0B589": "F5C48A",
    "FAE3CC": "FCEFE1",
    "C99A2E": "F38525",
    "E7C873": "F38525",
    "A97923": "F38525",
    "B8872A": "F38525",
    "96701F": "012E46",
    "C28135": "F38525",
    "F59E0B": "F38525",  # warning âmbar → laranja oficial
    "B45309": "012E46",
    "D97706": "F38525",
    "8D6708": "012E46",
    # 2ª passagem — remanescentes da auditoria
    "B4611A": "F38525",
    "C2410C": "F38525",
    "D9A441": "F38525",
    "D4A017": "F38525",
    "E0B135": "F38525",
    "F0B429": "F38525",
    "E9C75F": "F38525",
    "C7922F": "F38525",
    "F0A55E": "F38525",
    "E6A817": "F38525",
    "B96A00": "F38525",
    "E8734A": "F38525",
    "D0A548": "F38525",
    "F0994A": "F38525",
    "DE7420": "F38525",
    "E8873A": "F38525",
    "F6A961": "F38525",
    "FAB672": "F38525",
    "F7B274": "F38525",
    "D77B2C": "F38525",
    "F4A62A": "F38525",
    "D9542E": "F38525",
    "3B82F6": "012E46",
    "2563EB": "012E46",
    "1E3A8A": "012E46",
    "1E40AF": "012E46",
    "2B61AE": "012E46",
    "0F4A5A": "012E46",
    "0A3A47": "012E46",
    "06B6D4": "012E46",
    "3E7C8C": "012E46",
    "00C2FF": "012E46",
    "00D8FF": "012E46",
    "1B7C93": "012E46",
    "12596B": "012E46",
    "0B3D4A": "012E46",
    "14606F": "012E46",
    "1A6E80": "012E46",
    "12586A": "012E46",
    "112244": "012E46",
    "111188": "012E46",
    "111199": "012E46",
    "35B779": "012E46",  # chart green → série petróleo
    "F28C82": "F38525",  # chart coral → série laranja
    "8B7CF6": "012E46",  # chart purple → série petróleo
    "2FBF9A": "F38525",  # chart teal → série laranja
    # Fundos off-white de tela → branco
    "F8F6F2": "FFFFFF",
    "FBF7F2": "FFFFFF",
    "F8F5F1": "FFFFFF",
    "FCFAF8": "FFFFFF",
    "FAF9F5": "FFFFFF",
    "FFFDF8": "FFFFFF",
    "F8F6F0": "FFFFFF",
    "FAFAF8": "FFFFFF",
}

# rgba/rgb channel swaps (legacy → official)
RGB_SWAPS = [
    # petróleo 15,76,92 → 1,46,70
    (re.compile(r"\b15\s*,\s*76\s*,\s*92\b"), "1, 46, 70"),
    (re.compile(r"\b15\s+76\s+92\b"), "1 46 70"),
    # laranja 230,126,34 → 243,133,37
    (re.compile(r"\b230\s*,\s*126\s*,\s*34\b"), "243, 133, 37"),
    (re.compile(r"\b230\s+126\s+34\b"), "243 133 37"),
    # laranja soft antigo 242,153,74 → 243,133,37
    (re.compile(r"\b242\s*,\s*153\s*,\s*74\b"), "243, 133, 37"),
    # azul-marinho legado 6,26,46 → 1,46,70
    (re.compile(r"\b6\s*,\s*26\s*,\s*46\b"), "1, 46, 70"),
    # ciano nav 88,183,205 → laranja oficial (ativo)
    (re.compile(r"\b88\s*,\s*183\s*,\s*205\b"), "243, 133, 37"),
]


def norm_hex_match(m: re.Match) -> str:
    raw = m.group(0)
    body = raw[1:]
    if len(body) == 3:
        body = "".join(c * 2 for c in body)
    alpha = ""
    if len(body) == 8:
        alpha = body[6:]
        body = body[:6]
    up = body.upper()
    if up not in HEX_MAP:
        return raw
    new = HEX_MAP[up]
    # preservar casing do prefixo (# vs mixed) — sempre # + upper oficial
    if alpha:
        return f"#{new}{alpha.upper()}"
    # se original era lowercase, manter lowercase no output p/ diffs menores em alguns arquivos
    if body.islower():
        return f"#{new.lower()}"
    return f"#{new}"


HEX_RE = re.compile(r"#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b")


def transform(text: str) -> str:
    out = HEX_RE.sub(norm_hex_match, text)
    for rx, repl in RGB_SWAPS:
        out = rx.sub(repl, out)
    return out


def should_scan(path: Path) -> bool:
    if any(p in SKIP_DIRS for p in path.parts):
        return False
    if path.suffix.lower() not in SCAN_EXT:
        return False
    # lockfiles / gerados
    if path.name.endswith(".map"):
        return False
    return True


def main() -> int:
    changed = 0
    files = 0
    for path in ROOT.rglob("*"):
        if not path.is_file() or not should_scan(path):
            continue
        # skip this script and audit baselines
        if path.name == "apply_palette_oficial.py":
            continue
        try:
            original = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        updated = transform(original)
        if updated != original:
            path.write_text(updated, encoding="utf-8")
            changed += 1
            print(f"updated: {path.relative_to(ROOT)}")
        files += 1
    print(f"done: {changed} files changed / {files} scanned")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
