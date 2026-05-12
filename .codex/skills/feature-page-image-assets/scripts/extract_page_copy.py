#!/usr/bin/env python3
"""Extract readable feature-page copy and a slug from a URL or local HTML file."""

from __future__ import annotations

import argparse
import html
import json
import re
import sys
import urllib.parse
import urllib.request
from html.parser import HTMLParser
from pathlib import Path


NOISE_PATTERNS = (
    "className",
    "_next/static",
    "data-slot",
    "xmlns",
    "strokeWidth",
    "aria-hidden",
    "children",
    "props",
    "chunk",
    "script",
    "hrefLang",
    "localeCookie",
)

NAV_LINES = {
    "Home",
    "Features",
    "Start for Free",
    "Expand Your Images for Free",
    "Loading...",
    "FAQs",
}


class TextCollector(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.parts: list[str] = []

    def handle_data(self, data: str) -> None:
        if data and data.strip():
            self.parts.append(data)


def read_source(source: str) -> str:
    parsed = urllib.parse.urlparse(source)
    if parsed.scheme in {"http", "https"}:
        req = urllib.request.Request(
            source,
            headers={
                "User-Agent": (
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X) "
                    "AppleWebKit/537.36 Chrome Safari"
                ),
                "Accept": "text/html,application/xhtml+xml",
            },
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            charset = resp.headers.get_content_charset() or "utf-8"
            return resp.read().decode(charset, errors="replace")
    return Path(source).read_text(encoding="utf-8", errors="replace")


def slug_from_source(source: str) -> str:
    parsed = urllib.parse.urlparse(source)
    path = parsed.path if parsed.scheme else source
    parts = [p for p in path.split("/") if p]
    return parts[-1] if parts else "feature-page"


def unescape_text(value: str) -> str:
    value = html.unescape(value)
    value = re.sub(
        r"\\u([0-9a-fA-F]{4})",
        lambda m: chr(int(m.group(1), 16)),
        value,
    )
    replacements = {
        r"\\n": "\n",
        r"\\t": " ",
        r"\\r": " ",
        r"\/": "/",
        r"\\\"": '"',
        r"\\'": "'",
        r"\u0026": "&",
    }
    for old, new in replacements.items():
        value = value.replace(old, new)
    return value


def visible_text(raw_html: str) -> str:
    parser = TextCollector()
    parser.feed(raw_html)
    return "\n".join(parser.parts)


def field_strings(raw_text: str) -> list[str]:
    strings: list[str] = []
    pattern = re.compile(
        r'"(?:title|description|children|text|name|reviewBody|question)"\s*:\s*"([^"]{3,900})"'
    )
    for match in pattern.finditer(raw_text):
        strings.append(match.group(1))
    return strings


def clean_line(line: str) -> str:
    line = unescape_text(line)
    line = re.sub(r"\s+", " ", line).strip()
    line = line.strip("[]{}(),;:")
    return line


def should_keep(line: str) -> bool:
    if len(line) < 4 or line in NAV_LINES:
        return False
    if any(noise in line for noise in NOISE_PATTERNS):
        return False
    if line.startswith("$RS(") or line.startswith("self.__next_f"):
        return False
    if re.search(r"/_next/|https?://|^\d+:|^[A-Za-z]:\\", line):
        return False
    if line.count("{") + line.count("}") > 2:
        return False
    if len(line) > 900:
        return False
    return True


def extract_lines(raw_html: str) -> list[str]:
    decoded = unescape_text(raw_html)
    text = unescape_text(visible_text(decoded))
    candidates = text.splitlines() + field_strings(decoded)
    lines: list[str] = []
    seen: set[str] = set()
    for candidate in candidates:
        for part in re.split(r"(?<=[.!?])\s+(?=[A-Z])|\n+", candidate):
            line = clean_line(part)
            if should_keep(line) and line not in seen:
                seen.add(line)
                lines.append(line)
    return lines


def find_index(
    lines: list[str], needles: tuple[str, ...], start: int = 0, *, reverse: bool = False
) -> int | None:
    indexes = range(len(lines) - 1, start - 1, -1) if reverse else range(start, len(lines))
    for idx in indexes:
        lowered = lines[idx].lower()
        if any(needle.lower() in lowered for needle in needles):
            return idx
    return None


def slice_section(lines: list[str], start: int | None, end: int | None) -> list[str]:
    if start is None:
        return []
    return lines[start : end if end is not None else len(lines)]


def detected_sections(lines: list[str]) -> dict[str, list[str]]:
    # Next.js pages often include the same copy in early flight-data scripts and
    # again as visible streamed HTML. The later occurrence is usually cleaner.
    feature_start = find_index(lines, ("What Makes", "So Powerful"), reverse=True)
    use_start = find_index(lines, ("Ideal Use Cases",), feature_start or 0)
    how_start = find_index(lines, ("How to Create",), use_start or 0)
    love_start = find_index(lines, ("Why Creators Love",), how_start or 0)

    feature_end_candidates = [idx for idx in (use_start, how_start, love_start) if idx is not None]
    feature_end = min(feature_end_candidates) if feature_end_candidates else None
    use_end_candidates = [idx for idx in (how_start, love_start) if idx is not None and (use_start is None or idx > use_start)]
    use_end = min(use_end_candidates) if use_end_candidates else None

    return {
        "feature_copy": slice_section(lines, feature_start, feature_end),
        "use_cases": slice_section(lines, use_start, use_end),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", help="Feature page URL or local HTML file")
    parser.add_argument("--json", action="store_true", help="Emit JSON instead of Markdown")
    args = parser.parse_args()

    raw = read_source(args.source)
    lines = extract_lines(raw)
    payload = {
        "source": args.source,
        "slug": slug_from_source(args.source),
        "sections": detected_sections(lines),
        "all_lines": lines,
    }

    if args.json:
        json.dump(payload, sys.stdout, ensure_ascii=False, indent=2)
        sys.stdout.write("\n")
        return 0

    print(f"# {payload['slug']}")
    print(f"Source: {payload['source']}")
    for name, section_lines in payload["sections"].items():
        print(f"\n## {name}")
        if not section_lines:
            print("(not detected)")
            continue
        for line in section_lines:
            print(f"- {line}")
    print("\n## all_lines")
    for line in lines:
        print(f"- {line}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
