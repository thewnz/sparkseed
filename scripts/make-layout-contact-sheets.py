#!/usr/bin/env python3
"""Build per-archetype contact sheets for visual review (local only)."""
from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
BENCH = ROOT / "artifacts" / "style-benchmark"
FIG = BENCH / "expanded-figures"


def path_for(item_id):
    if item_id.startswith("cvpr-"):
        return BENCH / "conference-figures" / f"{item_id}.png"
    if item_id.startswith("journal-"):
        return BENCH / "journal-figures" / f"{item_id}.png"
    return FIG / f"{item_id}.png"


def main():
    data = json.loads((BENCH / "layout-features.json").read_text(encoding="utf-8"))
    groups = {}
    for item in data["images"]:
        groups.setdefault(item["layout"]["archetype"], []).append(item)
    for archetype, items in groups.items():
        items = sorted(items, key=lambda x: -x["aspect"])[:16]
        cols, thumb_w, thumb_h, label_h = 4, 300, 210, 40
        rows = (len(items) + cols - 1) // cols
        sheet = Image.new("RGB", (cols * thumb_w, rows * (thumb_h + label_h)), "white")
        draw = ImageDraw.Draw(sheet)
        font = ImageFont.load_default()
        for i, item in enumerate(items):
            image = Image.open(path_for(item["id"])).convert("RGB")
            image.thumbnail((thumb_w - 10, thumb_h - 6), Image.LANCZOS)
            x = (i % cols) * thumb_w + 5
            y = (i // cols) * (thumb_h + label_h) + 3
            sheet.paste(image, (x, y))
            draw.text((x, y + thumb_h + 2), f'{item["id"]}  {item["aspect"]:.2f}  '
                      f'{item["layout"]["columns"]}x{item["layout"]["rows"]}', fill="black", font=font)
        out = BENCH / f"layout-{archetype}.jpg"
        sheet.save(out, quality=88)
        print(out, len(items))


if __name__ == "__main__":
    main()
