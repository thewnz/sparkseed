"""Select 80 expanded benchmark figures from the 108 collected candidates.

The reject list was produced by visual review of four contact sheets. Only
top-venue figures are kept; Scientific Reports is excluded. Figure roles are
assigned from caption language and can be overridden in LAYOUT_ONLY.
"""
from __future__ import annotations

import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "artifacts" / "style-benchmark"
CANDIDATES = ROOT / "expanded-candidates" / "candidates.json"
OUT_DIR = ROOT / "expanded-figures"
OUT_META = ROOT / "expanded-metadata.json"

REJECT = {
    # Result-only or purely descriptive figures, and all non-top venues.
    "x-cancer-04", "x-cancer-05", "x-cancer-06", "x-cancer-07",
    "x-cell-01", "x-cell-03", "x-cell-07",
    "x-chemistry-01", "x-compbio-07",
    "x-earth-03", "x-earth-05", "x-earth-07",
    "x-ecology-02", "x-ecology-04", "x-ecology-05", "x-ecology-06", "x-ecology-07",
    "x-engineering-03", "x-genetics-01", "x-genetics-04",
    "x-immunology-01", "x-immunology-02", "x-immunology-04",
    "x-social-01", "x-social-04", "x-social-05", "x-social-06", "x-social-07",
}

LAYOUT_ONLY = {
    "x-cancer-01", "x-cancer-03", "x-cell-02", "x-cell-04", "x-cell-06",
    "x-earth-04", "x-ecology-01", "x-engineering-01", "x-genetics-03",
    "x-genetics-07", "x-immunology-05", "x-immunology-07", "x-medicine-05",
    "x-medicine-06", "x-neuro-03", "x-neuro-05", "x-neuro-06", "x-neuro-07",
    "x-plant-04", "x-social-02", "x-social-03", "x-synthetic-03",
}

METHOD_CUES = (
    "framework", "workflow", "pipeline", "architecture", "schematic", "overview",
    "mechanism", "principle", "design", "assembly", "device", "system", "construction",
    "approach", "workflow", "strategy",
)

JOURNAL_FIELDS = {
    "Nature Physics": ("physics", "物理/量子"),
    "Nature Chemistry": ("chemistry", "化学/催化"),
    "Nature Nanotechnology": ("materials", "材料/纳米"),
    "Nature Genetics": ("genetics", "遗传/基因组"),
    "Nature Cell Biology": ("cell", "细胞/发育"),
    "Nature Neuroscience": ("neuro", "神经科学"),
    "Nature Medicine": ("medicine", "医学/临床"),
    "Nature Ecology & Evolution": ("ecology", "生态/演化"),
    "Nature Climate Change": ("earth", "地球/气候"),
    "Nature Geoscience": ("earth", "地球/气候"),
    "Nature Human Behaviour": ("social", "社会/行为"),
    "Nature Methods": ("compbio", "计算生物/组学"),
    "Nature Biotechnology": ("compbio", "计算生物/组学"),
    "Nature Immunology": ("immunology", "免疫/疫苗"),
    "Nature Plants": ("plant", "植物/农业"),
    "Nature Cancer": ("cancer", "肿瘤生物学"),
    "Nature Microbiology": ("synthetic", "合成生物/微生物"),
}

TITLE_FIELDS = [
    (("tumor", "tumour", "cancer", "oncolog", "metasta", "carcinoma", "glioma", "glioblastoma"), ("cancer", "肿瘤生物学")),
    (("immun", "antibod", "vaccin", "t cell", "b cell", "nk cell"), ("immunology", "免疫/疫苗")),
    (("neuro", "brain", "cortex", "synap", "retina", "cortical", "amygdala"), ("neuro", "神经科学")),
    (("plant", "photosynth", "chloroplast", "crop", "mycorrhiz", "root", "arbuscular"), ("plant", "植物/农业")),
    (("climate", "weather", "earth", "ocean", "hydrolog", "carbon cycle", "heat extreme", "water scarcity", "river basin"), ("earth", "地球/气候")),
    (("ecolog", "evolution", "species", "biodiversity", "microbiome", "food web", "ecosystem"), ("ecology", "生态/演化")),
    (("robot", "wearable", "microfluidic", "sensor", "actuator", "device", "organoid-on-chip"), ("engineering", "工程/机器人")),
    (("genome", "genomic", "crispr", "gene editing", "chromatin", "epigenom", "regulatory network"), ("genetics", "遗传/基因组")),
    (("protein", "proteogenom", "algorithm", "deep learning", "computational", "pipeline", "sequencing analysis", "multiome"), ("compbio", "计算生物/组学")),
    (("catalys", "photocatal", "electrochem", "electrosynth", "reaction", "luminophore", "chemistry"), ("chemistry", "化学/催化")),
    (("nanostructure", "nanoparticle", "metamaterial", "dna origami", "thin film", "cof", "covalent organic framework"), ("materials", "材料/纳米")),
    (("cell ", "cellular", "organoid", "stem cell", "differentiation", "tissue architecture", "bioprint"), ("cell", "细胞/发育")),
    (("clinical", "patient", "trial", "diagnos", "cohort", "therapy", "treatment"), ("medicine", "医学/临床")),
    (("social", "behavior", "cognition", "trust", "decision making", "collective"), ("social", "社会/行为")),
    (("synthetic", "promoter", "microbial", "bacteri", "metabolic engineering", "genetic circuit"), ("synthetic", "合成生物/微生物")),
]


def infer_field(record: dict) -> tuple[str, str, str]:
    venue = record.get("venue", "")
    if venue in JOURNAL_FIELDS:
        key, name = JOURNAL_FIELDS[venue]
        return key, name, "journal"
    low = record.get("title", "").lower()
    for terms, field in TITLE_FIELDS:
        if any(term in low for term in terms):
            return field[0], field[1], "title"
    bucket = record.get("category", "")
    name = record.get("category_name", "")
    return bucket, name, "search_bucket"


def role(record: dict) -> str:
    if record["source_candidate_id"] in LAYOUT_ONLY:
        return "layout"
    caption = record["caption"].lower()
    return "method" if any(cue in caption for cue in METHOD_CUES) else "layout"


def main() -> None:
    records = json.loads(CANDIDATES.read_text(encoding="utf-8"))
    selected = [r for r in records if r["id"] not in REJECT]
    assert len(selected) == 80, f"expected 80 selected records, got {len(selected)}"
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    final = []
    selected.sort(key=lambda r: (r["category"], r["id"]))
    for index, record in enumerate(selected, 1):
        field_key, field_name, field_rule = infer_field(record)
        image = OUT_DIR / f"expanded-{index:02d}.png"
        shutil.copyfile(record["image"], image)
        item = {
            "id": f"expanded-{index:02d}",
            "source_candidate_id": record["id"],
            "venue": record["venue"],
            "title": record["title"],
            "field": field_name,
            "field_key": field_key,
            "field_rule": field_rule,
            "search_bucket": record["category_name"],
            "pmcid": record["pmcid"],
            "doi": record["doi"],
            "article_url": record["article_url"],
            "figure_label": record["figure_label"],
            "caption": record["caption"],
            "image_url": record["image_url"],
            "image": str(image),
            "width": record["width"],
            "height": record["height"],
            "figure_role": role({**record, "source_candidate_id": record["id"]}),
            "selection_score": record["selection_score"],
            "license_note": record["license_note"],
        }
        final.append(item)
    OUT_META.write_text(json.dumps(final, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    from collections import Counter
    print(f"selected {len(final)} records")
    print("fields:", dict(Counter(item["field"] for item in final)))
    print("roles:", dict(Counter(item["figure_role"] for item in final)))


if __name__ == "__main__":
    main()
