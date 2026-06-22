#!/usr/bin/env python3
"""
verify_prod_write_boundary.py

Fail-fast guard for PROD write boundaries.

Rules:
1) Scan files importing '@/lib/supabase/prod-server'.
2) Forbid direct PROD mutations (.insert/.update/.upsert/.delete) in those files,
   EXCEPT routes declared in ALLOWED_WRITE_ROUTES with their specific allowed tokens.
3) Restrict prod.rpc calls to allowlist:
   - read-only: sales_cleanup_list
   - write: sales_cleanup_resolve (only in its route file, with explicit lock checks)
4) For sales_cleanup_resolve route, require safety lock markers:
   - FACU_EMAIL constant
   - ENABLE_PROD_SALES_CLEANUP_RESOLVE env gate
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

ALLOW_RPC = {
    "sales_cleanup_list",
    "sales_cleanup_resolve",
}
RESOLVE_ROUTE = Path("app/api/admin/sales-cleanup/[id]/resolve/route.ts")

# Routes that may write to specific PROD infrastructure tables (agent routing only,
# never business data). Each entry: (relative_path, allowed_tokens, required_marker).
# The marker must appear in the file to confirm the write is intentional.
ALLOWED_WRITE_ROUTES: list[tuple[Path, set[str], str]] = [
    (
        Path("app/api/admin/samples/create-box/route.ts"),
        # .insert( = PROD meta.agent_inbox routing (to Atlas_Actuator)
        # .update( = BACKUP sample_review_loop (getBackupServiceClient — not a PROD write)
        {".insert(", ".update("},
        "meta.agent_inbox",  # must appear to confirm the PROD insert is inbox routing
    ),
]

IMPORT_TOKEN = "from '@/lib/supabase/prod-server'"
MUTATION_TOKENS = (".insert(", ".update(", ".upsert(", ".delete(")
RPC_PATTERN = re.compile(r"\.rpc\(\s*['\"]([a-zA-Z0-9_]+)['\"]")


def iter_source_files() -> list[Path]:
    out: list[Path] = []
    for base in (ROOT / "app", ROOT / "lib"):
        if not base.exists():
            continue
        out.extend(base.rglob("*.ts"))
        out.extend(base.rglob("*.tsx"))
    return out


def main() -> int:
    files = []
    for p in iter_source_files():
        txt = p.read_text(encoding="utf-8", errors="ignore")
        if IMPORT_TOKEN in txt:
            files.append((p, txt))

    violations: list[str] = []

    for p, txt in files:
        rel = p.relative_to(ROOT)

        # Check if this file is an explicitly allowed write route
        allowed_tokens: set[str] = set()
        for route_path, tokens, marker in ALLOWED_WRITE_ROUTES:
            if rel == route_path:
                if marker not in txt:
                    violations.append(
                        f"Allowed write route {rel} missing required marker '{marker}'"
                    )
                else:
                    allowed_tokens = tokens
                break

        for tok in MUTATION_TOKENS:
            if tok in txt and tok not in allowed_tokens:
                violations.append(
                    f"FORBIDDEN PROD mutation token {tok} in {rel}"
                )

        for m in RPC_PATTERN.finditer(txt):
            fn = m.group(1)
            if fn not in ALLOW_RPC:
                violations.append(
                    f"FORBIDDEN prod.rpc('{fn}') in {rel}"
                )
            if fn == "sales_cleanup_resolve" and rel != RESOLVE_ROUTE:
                violations.append(
                    f"sales_cleanup_resolve must only exist in {RESOLVE_ROUTE}, found in {rel}"
                )

    # Guard checks for the only allowed write surface
    resolve_abs = ROOT / RESOLVE_ROUTE
    if resolve_abs.exists():
        route_txt = resolve_abs.read_text(encoding="utf-8", errors="ignore")
        if "FACU_EMAIL" not in route_txt:
            violations.append("resolve route missing FACU_EMAIL guard")
        if "ENABLE_PROD_SALES_CLEANUP_RESOLVE" not in route_txt:
            violations.append("resolve route missing ENABLE_PROD_SALES_CLEANUP_RESOLVE guard")
    else:
        violations.append(f"resolve route not found: {RESOLVE_ROUTE}")

    if violations:
        print("PROD_WRITE_BOUNDARY: FAIL")
        for v in violations:
            print(f"- {v}")
        return 1

    print("PROD_WRITE_BOUNDARY: PASS")
    print(f"scanned_files={len(files)}")
    print("allowed_rpc=sales_cleanup_list,sales_cleanup_resolve")
    print(f"resolve_route={RESOLVE_ROUTE}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
