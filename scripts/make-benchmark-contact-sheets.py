"""Build contact sheets for the 100-figure benchmark (20 original + 80 expanded)."""
from __future__ import annotations

import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1] / "artifacts" / "style-benchmark"
OLD = []
for name in ("conference-metadata.json", "journal-metadata.json"):
    OLD.extend(json.loads((ROOT / name).read_text(encoding="utf-8")))
EXPANDED = json.loads((ROOT / "expanded-metadata.json").read_text(encoding="utf-8"))


def review_sheet(records, target, columns=5, thumb=(340, 240)):
    rows = (len(records) + columns - 1) // columns
    cell_w, cell_h = thumb[0] + 18, thumb[1] + 62
    canvas = Image.new("RGB", (columns * cell_w, rows * cell_h), "#e9ecef")
    draw = ImageDraw.Draw(canvas)
    font = ImageFont.load_default()
    for index, record in enumerate(records):
        x = (index % columns) * cell_w + 9
        y = (index // columns) * cell_h + 9
        image = Image.open(record["image"]).convert("RGB")
        image.thumbnail(thumb)
        frame = Image.new("RGB", thumb, "white")
        frame.paste(image, ((thumb[0] - image.width) // 2, (thumb[1] - image.height) // 2))
        canvas.paste(frame, (x, y))
        label = f"{record['id']} · {record.get('field', record.get('venue'))} · {record['figure_label']}"
        draw.text((x, y + thumb[1] + 5), label[:58], fill="#1a1a1a", font=font)
        caption = record.get("title", "")[:64]
        draw.text((x, y + thumb[1] + 24), caption, fill="#4f555b", font=font)
    canvas.save(target, "JPEG", quality=82)
    return len(records)


groups = [EXPANDED[i:i + 20] for i in range(0, len(EXPANDED), 20)]
for number, group in enumerate(groups, 1):
    review_sheet(group, ROOT / f"expanded-review-{number}.jpg")
all_records = OLD + EXPANDED
review_sheet([r for r in all_records if r["id"].startswith("cvpr")], ROOT / "review-conference-20.jpg", columns=5)
review_sheet([r for r in all_records if r["id"].startswith("journal")], ROOT / "review-journal-10.jpg", columns=5)
print(f"expanded sheets: {len(groups)}, total records: {len(all_records)}")
