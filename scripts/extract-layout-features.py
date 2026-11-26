#!/usr/bin/env python3
"""Extract layout, density and palette archetypes from the 100-figure benchmark.

Pure Pillow + stdlib so it runs on the same machine as the desktop app without
adding a runtime dependency.  The output is analysis-only; images never enter Git.
"""
from __future__ import annotations

import json
import math
import statistics
from pathlib import Path

from PIL import Image, ImageFilter, ImageStat

ROOT = Path(__file__).resolve().parents[1]
BENCH = ROOT / "artifacts" / "style-benchmark"
FIGURES = {
    "conference": BENCH / "conference-figures",
    "journal": BENCH / "journal-figures",
    "expanded": BENCH / "expanded-figures",
}


def figure_path(item):
    return FIGURES[item["dataset"]] / (item["id"] + ".png")


def runs_above(values, threshold, min_len):
    out, start = [], None
    for i, value in enumerate(values + [0.0]):
        if value >= threshold and start is None:
            start = i
        elif value < threshold and start is not None:
            if i - start >= min_len:
                out.append((start, i))
            start = None
    return out


def projection_bands(projection, min_gap_ratio=0.035, min_content_ratio=0.05, quiet_ratio=0.10):
    """Split a 1-D occupancy profile into content bands separated by quiet gutters."""
    if not projection:
        return []
    peak = max(projection) or 1.0
    quiet = peak * quiet_ratio
    gaps = runs_above([1.0 if v <= quiet else 0.0 for v in projection], 0.5,
                      max(2, int(len(projection) * min_gap_ratio)))
    bands, cursor = [], 0
    for start, end in gaps:
        if start - cursor >= len(projection) * min_content_ratio:
            bands.append((cursor, start))
        cursor = end
    if len(projection) - cursor >= len(projection) * min_content_ratio:
        bands.append((cursor, len(projection)))
    # A gutter touching the edge is a margin, not an internal panel split.
    return [band for band in bands if band[1] - band[0] >= len(projection) * min_content_ratio][:8]


def ink_ratio_for_box(mask, width, height, box):
    x0, y0, x1, y1 = box
    x0, y0 = max(0, int(x0)), max(0, int(y0))
    x1, y1 = min(width, int(x1)), min(height, int(y1))
    if x1 <= x0 or y1 <= y0:
        return 0.0
    total = (x1 - x0) * (y1 - y0)
    ink = sum(mask.getpixel((x, y)) for y in range(y0, y1, max(1, (y1 - y0) // 80))
              for x in range(x0, x1, max(1, (x1 - x0) // 80)))
    sampled = len(range(x0, x1, max(1, (x1 - x0) // 80))) * len(range(y0, y1, max(1, (y1 - y0) // 80)))
    return (ink / sampled) / 255 if sampled else 0.0


def analyze(item):
    path = figure_path(item)
    image = Image.open(path).convert("RGB")
    original = image.size
    scale = min(1.0, 480 / max(image.size))
    if scale < 1.0:
        image = image.resize((max(1, int(image.width * scale)), max(1, int(image.height * scale))), Image.LANCZOS)
    width, height = image.size
    gray = image.convert("L")
    # A conservative ink mask: paper tint and anti-aliasing halos stay out.
    ink = gray.point(lambda p: 255 if p < 238 else 0)
    edges = gray.filter(ImageFilter.FIND_EDGES).point(lambda p: 255 if p > 26 else 0)
    combined = Image.composite(ink, edges, edges)
    combined = Image.eval(combined, lambda p: 255 if p else 0)

    columns_proj = [sum(1 for y in range(0, height, max(1, height // 120))
                        if combined.getpixel((x, y))) for x in range(width)]
    rows_proj = [sum(1 for x in range(0, width, max(1, width // 160))
                      if combined.getpixel((x, y))) for y in range(height)]
    col_bands = projection_bands(columns_proj, 0.025, 0.05, 0.12)
    row_bands = projection_bands(rows_proj, 0.025, 0.05, 0.12)

    # Long text lines can create false horizontal gutters; a column band must
    # carry at least 3% of the height to count as a real panel column.
    col_bands = [b for b in col_bands if b[1] - b[0] >= width * 0.035]
    row_bands = [b for b in row_bands if b[1] - b[0] >= height * 0.035]
    columns = len(col_bands)
    rows = len(row_bands)
    # A single wide band often means one illustration; cap the visual grid.
    cells = columns * rows

    bbox = combined.getbbox() or (0, 0, width, height)
    margins = {
        "left": round(bbox[0] / width, 3),
        "top": round(bbox[1] / height, 3),
        "right": round((width - bbox[2]) / width, 3),
        "bottom": round((height - bbox[3]) / height, 3),
    }
    left_ink = ink_ratio_for_box(combined, width, height, (0, 0, width / 2, height))
    right_ink = ink_ratio_for_box(combined, width, height, (width / 2, 0, width, height))
    top_ink = ink_ratio_for_box(combined, width, height, (0, 0, width, height * 0.18))
    middle_ink = ink_ratio_for_box(combined, width, height, (0, height * 0.30, width, height * 0.70))
    bottom_ink = ink_ratio_for_box(combined, width, height, (0, height * 0.82, width, height))
    center_ink = ink_ratio_for_box(combined, width, height,
                                   (width * 0.25, height * 0.25, width * 0.75, height * 0.75))
    symmetry = 1 - abs(left_ink - right_ink) / max(left_ink, right_ink, 1e-6)

    aspect = original[0] / original[1]
    if cells >= 4 and columns >= 2 and rows >= 2:
        archetype = "grid_collage"
    elif columns >= 3 and rows <= 2:
        archetype = "horizontal_flow"
    elif rows >= 3 and columns <= 2:
        archetype = "vertical_stack"
    elif cells <= 2:
        archetype = "single_mechanism"
    else:
        archetype = "mixed_panel"

    palette = item.get("palette", [])
    neutral_share = sum(p["share"] for p in palette if p["share"] >= 0.02 and
                        (max(int(p["rgb"][1:3], 16), int(p["rgb"][3:5], 16), int(p["rgb"][5:7], 16)) -
                         min(int(p["rgb"][1:3], 16), int(p["rgb"][3:5], 16), int(p["rgb"][5:7], 16)) < 24))
    hue_families = [{**h, "share": round(h["share"], 3)} for h in item.get("hue_families", []) if h["share"] >= 0.05]
    return {
        "id": item["id"],
        "dataset": item["dataset"],
        "field": item.get("field", ""),
        "role": item.get("figure_role", ""),
        "width": original[0],
        "height": original[1],
        "aspect": round(aspect, 3),
        "layout": {
            "archetype": archetype,
            "columns": columns,
            "rows": rows,
            "cells": cells,
            "column_bands": col_bands,
            "row_bands": row_bands,
            "margins": margins,
            "top_band_ink": round(top_ink, 3),
            "middle_ink": round(middle_ink, 3),
            "bottom_ink": round(bottom_ink, 3),
            "center_ink": round(center_ink, 3),
            "left_right_symmetry": round(symmetry, 3),
        },
        "color": {
            "neutral_share": round(neutral_share, 3),
            "palette_2pct": item.get("palette_2pct", 0),
            "palette_5pct": item.get("palette_5pct", 0),
            "accent_hues": hue_families,
        },
        "density": {
            "near_white": item.get("near_white"),
            "ink": item.get("ink"),
            "edge_density": item.get("edge_density"),
            "gray_entropy": item.get("gray_entropy"),
        },
    }


def median(values):
    return round(statistics.median(values), 3) if values else None


def summarize(items):
    groups = {}
    for name, subset in [
        ("all", items),
        ("method", [i for i in items if i["role"] == "method"]),
        ("conference", [i for i in items if i["dataset"] == "conference"]),
        ("journal", [i for i in items if i["dataset"] == "journal"]),
    ]:
        groups[name] = {
            "count": len(subset),
            "aspect_median": median([i["aspect"] for i in subset]),
            "columns_median": median([i["layout"]["columns"] for i in subset]),
            "rows_median": median([i["layout"]["rows"] for i in subset]),
            "cells_median": median([i["layout"]["cells"] for i in subset]),
            "center_ink_median": median([i["layout"]["center_ink"] for i in subset]),
            "top_band_ink_median": median([i["layout"]["top_band_ink"] for i in subset]),
            "bottom_ink_median": median([i["layout"]["bottom_ink"] for i in subset]),
            "margin_left_median": median([i["layout"]["margins"]["left"] for i in subset]),
            "margin_top_median": median([i["layout"]["margins"]["top"] for i in subset]),
            "neutral_share_median": median([i["color"]["neutral_share"] for i in subset]),
            "accent_hue_count_median": median([len(i["color"]["accent_hues"]) for i in subset]),
        }
    archetypes = {}
    for key in ["horizontal_flow", "vertical_stack", "grid_collage", "single_mechanism", "mixed_panel"]:
        subset = [i for i in items if i["layout"]["archetype"] == key]
        archetypes[key] = {
            "count": len(subset),
            "aspect_median": median([i["aspect"] for i in subset]),
            "columns_median": median([i["layout"]["columns"] for i in subset]),
            "rows_median": median([i["layout"]["rows"] for i in subset]),
            "cells_median": median([i["layout"]["cells"] for i in subset]),
            "center_ink_median": median([i["layout"]["center_ink"] for i in subset]),
            "top_band_ink_median": median([i["layout"]["top_band_ink"] for i in subset]),
            "neutral_share_median": median([i["color"]["neutral_share"] for i in subset]),
            "accent_hue_count_median": median([len(i["color"]["accent_hues"]) for i in subset]),
            "examples": [i["id"] for i in subset[:5]],
        }
    return {"groups": groups, "archetypes": archetypes}


def main():
    metrics = json.loads((BENCH / "metrics.json").read_text(encoding="utf-8"))["images"]
    items, missing = [], []
    for item in metrics:
        try:
            items.append(analyze(item))
        except FileNotFoundError:
            missing.append(item["id"])
    result = {"source": "metrics.json + 100 benchmark PNGs", "count": len(items),
              "missing": missing, "summary": summarize(items), "images": items}
    (BENCH / "layout-features.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(result["summary"], ensure_ascii=False, indent=2))
    print(f"wrote {len(items)} items -> artifacts/style-benchmark/layout-features.json")


if __name__ == "__main__":
    main()
