"""Collect open-access method figures from top venues for the expanded style benchmark.

The collector queries Europe PMC, inspects JATS figure captions, selects figures
whose captions describe a method / architecture / workflow / mechanism, downloads
the image from the publisher or PMC CDN, and writes candidate metadata. Final
selection still requires manual review of the generated contact sheet.
"""
from __future__ import annotations

import argparse
import html
import io
import json
import re
import subprocess
import sys
import time
import urllib.parse
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1] / "artifacts" / "style-benchmark"
OUT_DIR = ROOT / "expanded-candidates"
IMG_DIR = OUT_DIR / "figures"
META_PATH = OUT_DIR / "candidates.json"
UA = "Mozilla/5.0 (compatible; SparkseedBenchmark/1.0; style research)"
NS = {"x": "http://www.w3.org/1999/xlink"}

CATEGORIES = [
    {
        "key": "physics", "name": "物理/量子",
        "journals": ["Nature Physics", "Physical Review X", "Science Advances", "Nature Communications"],
        "terms": ["quantum simulation", "quantum device", "topological photonic", "superconducting qubit"],
    },
    {
        "key": "chemistry", "name": "化学/催化",
        "journals": ["Nature Chemistry", "Nature Catalysis", "Nature Communications", "Science Advances"],
        "terms": ["catalysis mechanism", "electrocatalytic interface", "reaction pathway", "photocatalysis"],
    },
    {
        "key": "materials", "name": "材料/纳米",
        "journals": ["Nature Materials", "Nature Nanotechnology", "Communications Materials", "Science Advances"],
        "terms": ["metamaterial", "battery cathode", "nanostructure", "thin film design"],
    },
    {
        "key": "genetics", "name": "遗传/基因组",
        "journals": ["Nature Genetics", "Nature Communications", "Science Advances", "Genome Biology"],
        "terms": ["genome assembly", "regulatory network", "population genetics", "single-cell atlas"],
    },
    {
        "key": "cell", "name": "细胞/发育",
        "journals": ["Nature Cell Biology", "Developmental Cell", "Cell Reports", "Nature Communications"],
        "terms": ["organoid", "cell differentiation", "developmental patterning", "stem cell"],
    },
    {
        "key": "neuro", "name": "神经科学",
        "journals": ["Nature Neuroscience", "Neuron", "Nature Communications", "Science Advances"],
        "terms": ["neural circuit", "brain imaging", "neuroimaging pipeline", "synaptic"],
    },
    {
        "key": "medicine", "name": "医学/临床",
        "journals": ["Nature Medicine", "Science Translational Medicine", "Cell Reports Medicine", "Nature Communications"],
        "terms": ["clinical trial", "diagnostic pathway", "cohort study", "treatment response"],
    },
    {
        "key": "ecology", "name": "生态/演化",
        "journals": ["Nature Ecology & Evolution", "Nature Communications", "Science Advances", "Ecology Letters"],
        "terms": ["ecosystem model", "food web", "biodiversity", "evolutionary"],
    },
    {
        "key": "earth", "name": "地球/气候",
        "journals": ["Nature Climate Change", "Nature Geoscience", "Science Advances", "Nature Communications"],
        "terms": ["climate model", "carbon cycle", "Earth system", "hydrological"],
    },
    {
        "key": "engineering", "name": "工程/机器人",
        "journals": ["Communications Engineering", "Science Robotics", "Nature Communications", "Science Advances"],
        "terms": ["robotic system", "microfluidic device", "soft actuator", "wearable sensor"],
    },
    {
        "key": "social", "name": "社会/行为",
        "journals": ["Nature Human Behaviour", "Communications Psychology", "PNAS", "Scientific Reports"],
        "terms": ["behavioral experiment", "social network", "decision making", "collective behavior"],
    },
    {
        "key": "compbio", "name": "计算生物/组学",
        "journals": ["Nature Methods", "Nature Biotechnology", "Bioinformatics", "Genome Biology"],
        "terms": ["multi-omics pipeline", "computational workflow", "sequence analysis", "machine learning"],
    },
    {
        "key": "immunology", "name": "免疫/疫苗",
        "journals": ["Nature Immunology", "Immunity", "Science Immunology", "Nature Communications"],
        "terms": ["immune cell", "vaccine design", "antibody", "tumor immunity"],
    },
    {
        "key": "plant", "name": "植物/农业",
        "journals": ["Nature Plants", "Molecular Plant", "The Plant Cell", "Nature Communications"],
        "terms": ["photosynthesis", "crop improvement", "plant development", "root system"],
    },
    {
        "key": "cancer", "name": "肿瘤生物学",
        "journals": ["Nature Cancer", "Cancer Cell", "Cell Reports Medicine", "Nature Communications"],
        "terms": ["tumor microenvironment", "metastasis", "cancer therapy", "single-cell"],
    },
    {
        "key": "synthetic", "name": "合成生物/微生物",
        "journals": ["Nature Biotechnology", "Nature Microbiology", "Cell Systems", "Nature Communications"],
        "terms": ["synthetic biology", "microbial community", "genetic circuit", "metabolic engineering"],
    },
]

METHOD_CUES = [
    ("overview", 8), ("overall", 6), ("framework", 8), ("architecture", 8),
    ("pipeline", 8), ("workflow", 8), ("schematic", 6), ("schematics", 6),
    ("study design", 7), ("experimental design", 6), ("design of", 4),
    ("mechanism", 5), ("principle", 5), ("concept", 4), ("system", 2),
    ("structure", 2), ("construction", 3), ("approach", 3),
]
RESULT_CUES = ["volcano", "survival curve", "forest plot", "histological", "phylogenetic tree"]


def fetch(url: str, attempts: int = 3) -> bytes:
    error = None
    for attempt in range(attempts):
        completed = subprocess.run(
            ["curl.exe", "-L", "--silent", "--show-error", "--max-time", "60",
             "-A", UA, url],
            capture_output=True, timeout=75,
        )
        if completed.returncode == 0 and completed.stdout:
            return completed.stdout
        error = completed.stderr.decode("utf-8", "replace") or f"curl exit {completed.returncode}"
        time.sleep(0.6 + attempt * 1.4)
    raise RuntimeError(f"{url}: {error}")


def text(node: ET.Element | None) -> str:
    return "" if node is None else " ".join("".join(node.itertext()).split())


def europepmc_query(query: str, page_size: int = 10, sort: str = "CITED desc") -> list[dict]:
    params = {"query": query, "format": "json", "pageSize": str(page_size), "sort": sort}
    payload = json.loads(fetch("https://www.ebi.ac.uk/europepmc/webservices/rest/search?" + urllib.parse.urlencode(params)))
    return payload.get("resultList", {}).get("result", [])


def figure_score(caption: str) -> int:
    low = caption.lower()
    score = sum(weight for cue, weight in METHOD_CUES if cue in low)
    score -= sum(4 for cue in RESULT_CUES if cue in low)
    if len(caption) > 260:
        score += 2
    return score


def figure_number(fig: ET.Element, href: str) -> int | None:
    for key in ("id", "label"):
        raw = fig.get(key) or text(fig.find(key))
        found = re.search(r"(?:fig(?:ure)?\.?\s*)(\d+)", raw, re.I)
        if found:
            return int(found.group(1))
    found = re.search(r"_Fig(\d+)_", href, re.I) or re.search(r"fig(?:ure)?[-_]?(\d+)", href, re.I)
    return int(found.group(1)) if found else None


def pick_figure(xml_bytes: bytes, pmcid: str) -> dict | None:
    root = ET.fromstring(xml_bytes)
    figures = root.findall(".//fig")
    candidates = []
    for fig in figures[:8]:
        href = ""
        for graphic in fig.findall(".//graphic"):
            href = graphic.get(f"{{{NS['x']}}}href") or graphic.get("href") or ""
            if href:
                break
        caption = text(fig.find("caption"))
        if not href or len(caption) < 80:
            continue
        number = figure_number(fig, href)
        if number is None or number > 6:
            continue
        score = figure_score(caption)
        if score <= 0:
            continue
        candidates.append({"href": href, "caption": caption, "label": f"Fig. {number}", "number": number, "score": score})
    if not candidates:
        return None
    candidates.sort(key=lambda item: (-item["score"], item["number"]))
    return candidates[0]


def nature_image(doi: str, href: str) -> str:
    encoded = urllib.parse.quote(doi, safe="")
    base = re.sub(r"\.(?:webp|jpg|jpeg|tif|tiff)$", "", href, flags=re.I) + ".png"
    return f"https://media.springernature.com/full/springer-static/image/art%3A{encoded}/MediaObjects/{base}"


def pmc_image(pmcid: str, href: str) -> str:
    page_url = f"https://pmc.ncbi.nlm.nih.gov/articles/{pmcid}/"
    page = fetch(page_url).decode("utf-8", "replace")
    urls = re.findall(r'https://cdn\.ncbi\.nlm\.nih\.gov/pmc/blobs/[^"\']+', page)
    stem = re.sub(r"\.(?:webp|jpg|jpeg|png|tif|tiff)$", "", Path(href).name, flags=re.I)
    exact = [u for u in urls if stem.lower() in u.lower()]
    if exact:
        return html.unescape(exact[0])
    # Some PMC pages do not preserve JATS basenames; fall back to the first content image.
    images = [u for u in urls if re.search(r"\.(?:jpg|jpeg|png|webp)$", u, re.I)]
    if images:
        return html.unescape(images[0])
    raise RuntimeError("PMC page has no downloadable figure image")


def download_image(record: dict, target: Path) -> tuple[int, int]:
    data = fetch(record["image_url"])
    image = Image.open(io.BytesIO(data))
    if image.mode not in ("RGB", "RGBA"):
        image = image.convert("RGB")
    if image.mode == "RGBA" and image.getextrema()[3][0] == 255:
        image = image.convert("RGB")
    image.save(target, "PNG", optimize=True)
    return image.width, image.height


def collect_one(category: dict, result: dict, sleep: float = 0.2) -> dict | None:
    pmcid = result.get("pmcid")
    doi = result.get("doi")
    if not pmcid or not doi:
        return None
    try:
        xml_bytes = fetch(f"https://www.ebi.ac.uk/europepmc/webservices/rest/{pmcid}/fullTextXML")
        chosen = pick_figure(xml_bytes, pmcid)
        if not chosen:
            return None
        root = ET.fromstring(xml_bytes)
        journal = text(root.find(".//journal-meta//journal-title")) or result.get("journalTitle") or ""
        article_title = text(root.find(".//article-meta//article-title")) or result.get("title") or ""
        license_text = text(root.find(".//permissions/license"))
        if "creativecommons.org" not in license_text.lower() and "open access" not in license_text.lower():
            return None
        image_url = nature_image(doi, chosen["href"]) if result.get("source") == "MED" and doi.startswith("10.1038/") else pmc_image(pmcid, chosen["href"])
        record = {
            "id": "", "category": category["key"], "category_name": category["name"],
            "venue": journal, "title": article_title, "pmcid": pmcid, "doi": doi,
            "article_url": f"https://doi.org/{doi}", "figure_label": chosen["label"],
            "caption": chosen["caption"], "image_url": image_url, "image": "",
            "license_note": "Open-access article; figure retained with attribution for local style analysis.",
            "selection_score": chosen["score"],
        }
        target = IMG_DIR / f"cand-{category['key']}-{pmcid}.png"
        record["width"], record["height"] = download_image(record, target)
        record["image"] = str(target)
        time.sleep(sleep)
        return record
    except Exception as exc:  # noqa: BLE001
        print(f"  skip {pmcid}: {exc}", flush=True)
        return None


def category_query(category: dict) -> str:
    journals = " OR ".join(f'JOURNAL:"{j}"' for j in category["journals"])
    terms = " OR ".join(f'ABSTRACT:"{t}"' for t in category["terms"])
    return (f"({journals}) AND ({terms}) AND OPEN_ACCESS:Y AND HAS_FT:Y "
            "AND FIRST_PDATE:[2023-01-01 TO 2026-12-31]")


def contact_sheet(records: list[dict], target: Path, columns: int = 8, thumb: tuple[int, int] = (320, 210)) -> None:
    if not records:
        return
    rows = (len(records) + columns - 1) // columns
    cell_w, cell_h = thumb[0] + 16, thumb[1] + 56
    sheet = Image.new("RGB", (columns * cell_w, rows * cell_h), "#e9ecef")
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default()
    for index, record in enumerate(records):
        x = (index % columns) * cell_w + 8
        y = (index // columns) * cell_h + 8
        try:
            image = Image.open(record["image"]).convert("RGB")
            image.thumbnail(thumb)
            canvas = Image.new("RGB", thumb, "white")
            canvas.paste(image, ((thumb[0] - image.width) // 2, (thumb[1] - image.height) // 2))
            sheet.paste(canvas, (x, y))
        except Exception:  # noqa: BLE001
            draw.rectangle([x, y, x + thumb[0], y + thumb[1]], fill="#ffffff", outline="#adb5bd")
        label = f"{record['id']} {record['category_name']} {record['venue']}"
        draw.text((x, y + thumb[1] + 4), label[:58], fill="#1a1a1a", font=font)
    target.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(target)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--per-category", type=int, default=7)
    parser.add_argument("--only", default="")
    args = parser.parse_args()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    IMG_DIR.mkdir(parents=True, exist_ok=True)
    categories = [c for c in CATEGORIES if not args.only or c["key"] in args.only.split(",")]
    all_records = []
    for category in categories:
        print(f"[{category['name']}] searching", flush=True)
        query = category_query(category)
        results = europepmc_query(query, page_size=max(14, args.per_category * 2))
        if not results:
            print("  no results", flush=True)
            continue
        records = []
        with ThreadPoolExecutor(max_workers=4) as pool:
            futures = {pool.submit(collect_one, category, result): result for result in results}
            for future in as_completed(futures):
                record = future.result()
                if record:
                    records.append(record)
                if len(records) >= args.per_category:
                    # Keep already submitted work; duplicates are pruned below.
                    pass
        records.sort(key=lambda item: (-item["selection_score"], item["venue"], item["pmcid"]))
        records = records[: args.per_category]
        for index, record in enumerate(records, 1):
            record["id"] = f"x-{category['key']}-{index:02d}"
        all_records.extend(records)
        print(f"  selected {len(records)}", flush=True)
    # Stable ordering by category then index.
    all_records.sort(key=lambda item: (item["category"], item["id"]))
    META_PATH.write_text(json.dumps(all_records, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    contact_sheet(all_records, OUT_DIR / "contact-sheet-candidates.png")
    print(f"wrote {len(all_records)} candidates to {META_PATH}", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
