"""Ports a mockup's stylesheet into the app under a scope class, keeping only the rules the base stylesheet does not already have.

Usage, from the CricAtlas repo root:
  python3 tools/port_mockup_css.py mockups/match-page/match-page.html .mgx web/src/styles/player.css web/src/styles/match.css
  PORT_RENAME="mc=mmt,mr=mmr" python3 tools/port_mockup_css.py ...   (renames classes the app already uses)

Every selector of the mockup gets the scope in front of it (:root and html/body/* rules become the scope itself). A rule whose selector, once scoped, and declarations
equal a rule in the base file (which is scoped under .pgx) is dropped, so the output holds only what is different for this page. The base stylesheet is loaded first and the
output after it, so a rule with the same specificity wins here.
"""
import os, re, sys
from pathlib import Path


def strip_comments(s: str) -> str:
    return re.sub(r"/\*.*?\*/", "", s, flags=re.S)


def parse(css: str):
    """Returns a list of (prelude, body) at the top level. A body is declarations, or a list of nested rules for an at-rule that holds rules."""
    css = strip_comments(css)
    out, i, n = [], 0, len(css)
    while i < n:
        j = css.find("{", i)
        if j < 0:
            break
        prelude = css[i:j].strip()
        depth, k = 1, j + 1
        while k < n and depth:
            depth += (css[k] == "{") - (css[k] == "}")
            k += 1
        body = css[j + 1:k - 1]
        if prelude.startswith("@") and not prelude.startswith(("@keyframes", "@font-face")) and "{" in body:
            out.append((prelude, parse(body)))
        else:
            out.append((prelude, body.strip()))
        i = k
    return out


def norm(decl: str) -> str:
    return re.sub(r"\s+", "", decl).rstrip(";")


def scope_sel(sel: str, scope: str) -> str:
    parts = []
    for one in (p.strip() for p in sel.split(",")):
        if not one:
            continue
        if one in ("html", "body"):
            continue  # the page shell (globals.css) owns the document, so a mockup's html and body rules are not ported
        if one in (":root", "*"):
            parts.append(scope if one == ":root" else f"{scope} *")
        elif one.startswith(("html ", "body ")):
            parts.append(f"{scope} {one.split(' ', 1)[1]}")
        else:
            parts.append(f"{scope} {one}")
    return ", ".join(parts)


def flatten(rules, scope, into, ctx=""):
    """Fills `into` with (context, selector) -> declarations. A scope of None leaves the selectors as written (the base file is already scoped)."""
    for prelude, body in rules:
        if isinstance(body, list):
            flatten(body, scope, into, ctx + prelude + "|")
        elif prelude.startswith(("@keyframes", "@font-face")):
            into[(ctx, prelude)] = norm(body)
        else:
            sel = ", ".join(p.strip() for p in prelude.split(",")) if scope is None else scope_sel(prelude, scope)
            into[(ctx, sel)] = norm(body)


def emit(rules, scope, base, depth=0):
    lines = []
    for prelude, body in rules:
        if isinstance(body, list):
            inner = emit(body, scope, base, depth + 1)
            if inner:
                lines.append(f"{prelude}{{\n{inner}\n}}")
        elif prelude.startswith(("@keyframes", "@font-face")):
            lines.append(f"{prelude}{{{body}}}")
        else:
            sel = scope_sel(prelude, scope)
            if sel:
                lines.append(f"{sel}{{{body}}}")
    return "\n".join(lines)


def main() -> None:
    html, scope, base_css, out = sys.argv[1:5]
    m = re.search(r"<style>(.*?)</style>", Path(html).read_text(), re.S)
    assert m, "no style block"
    rules = parse(m.group(1))
    base_rules = parse(Path(base_css).read_text())
    base = {}
    flatten(base_rules, None, base)
    # Compare a mockup rule scoped under .pgx with the base, then write it under the new scope.
    mock_p = {}
    flatten(rules, ".pgx", mock_p)
    keep_keys = {k for k, v in mock_p.items() if base.get(k) != v}

    def filt(rs, ctx=""):
        res = []
        for prelude, body in rs:
            if isinstance(body, list):
                inner = filt(body, ctx + prelude + "|")
                if inner:
                    res.append((prelude, inner))
            elif prelude.startswith(("@keyframes", "@font-face")):
                if (ctx, prelude) in keep_keys:
                    res.append((prelude, body))
            elif scope_sel(prelude, ".pgx") and (ctx, scope_sel(prelude, ".pgx")) in keep_keys:
                res.append((prelude, body))
        return res

    kept = filt(rules)
    text = f"/* Ported from {html}. Only the rules that differ from the player stylesheet, every selector under {scope}. Written by tools/port_mockup_css.py: change the mockup and run it again, never edit this file by hand. */\n"
    text += emit(kept, scope, base) + "\n"
    # A class of the mockup that the app already uses for something else is renamed in the output (and in the page's markup): PORT_RENAME="mc=mmt,mr=mmr".
    for pair in filter(None, os.environ.get("PORT_RENAME", "").split(",")):
        old, new = pair.split("=")
        text = re.sub(r"\." + re.escape(old) + r"(?![\w-])", "." + new, text)
    Path(out).write_text(text)
    total = sum(1 for _ in mock_p)
    print(f"{len(keep_keys)} of {total} rules kept, {len(text)} bytes")


main()
