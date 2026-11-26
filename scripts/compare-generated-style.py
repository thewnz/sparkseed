"""Compare the current generated figure against the 100-figure benchmark.

This is deliberately a coarse pixel audit, not an aesthetic oracle. It tells us
whether the rendered figure is structurally emptier than the reference corpus.
"""
from pathlib import Path
import sys
from PIL import Image, ImageFilter, ImageStat
import json, colorsys, math
from collections import Counter
from statistics import median

root = Path(__file__).resolve().parents[1] / "artifacts" / "style-benchmark"
bench = json.loads((root / "metrics.json").read_text(encoding="utf-8"))
targets = bench["summary"]["method"]
target_file = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parents[1] / "artifacts" / "desktop-live" / "flow-full-chain-final.png"


def measure(path):
    image = Image.open(path).convert("RGB")
    image.thumbnail((800, 800))
    pixels = list(image.getdata())
    ink = near = colorful = 0
    sats = []
    hue_bins = Counter()
    for r, g, b in pixels:
        value = max(r, g, b) / 255
        sat = (max(r, g, b) - min(r, g, b)) / max(1, max(r, g, b))
        if value > 0.96: near += 1
        if value >= 0.94 and sat <= 0.12: continue
        ink += 1
        sats.append(sat)
        if sat > 0.22 and value > 0.2:
            colorful += 1
            h, _, _ = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            hue_bins[int(h * 360) // 30 * 30] += 1
    quant = image.quantize(colors=16, method=Image.Quantize.MEDIANCUT).convert("RGB")
    counts = Counter(quant.getdata())
    total = sum(counts.values())
    palette2 = sum(1 for c in counts.values() if c / total >= 0.02)
    palette5 = sum(1 for c in counts.values() if c / total >= 0.05)
    gray = image.convert("L")
    edges = gray.filter(ImageFilter.FIND_EDGES)
    edge_density = sum(edges.histogram()[25:]) / max(1, sum(edges.histogram()))
    entropy = -sum((c / max(1, len(pixels))) * math.log2(c / max(1, len(pixels))) for c in gray.histogram() if c)
    return {
        "width": image.width, "height": image.height, "aspect": round(image.width / image.height, 2),
        "near_white": round(near / len(pixels), 3), "ink": round(ink / len(pixels), 3),
        "colorful_ink": round(colorful / max(1, ink), 3),
        "ink_saturation_median": round(median(sats) if sats else 0, 3),
        "edge_density": round(edge_density, 3), "edge_strength": round(ImageStat.Stat(edges).mean[0] / 255, 3),
        "gray_entropy": round(entropy, 3), "palette_2pct": palette2, "palette_5pct": palette5,
        "top_colors": ["#%02x%02x%02x" % c for c, _ in counts.most_common(5)],
    }


generated = measure(target_file)
comparison = {
    "source": str(target_file),
    "target_method_median": {k: targets[k] for k in ("near_white_median", "ink_median", "colorful_ink_median",
        "ink_saturation_median", "edge_density_median", "gray_entropy_median", "palette_2pct_median", "palette_5pct_median", "aspect_median")},
    "generated": generated,
    "gaps": {
        "edge_density": round(generated["edge_density"] - targets["edge_density_median"], 3),
        "palette_2pct": generated["palette_2pct"] - targets["palette_2pct_median"],
        "gray_entropy": round(generated["gray_entropy"] - targets["gray_entropy_median"], 3),
        "near_white": round(generated["near_white"] - targets["near_white_median"], 3),
        "aspect": round(generated["aspect"] - targets["aspect_median"], 2),
    },
}
(root / (target_file.stem + "-vs-benchmark.json")).write_text(json.dumps(comparison, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps(comparison, ensure_ascii=False, indent=2))
