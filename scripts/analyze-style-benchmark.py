from pathlib import Path
from PIL import Image, ImageFilter, ImageStat
import json, csv, colorsys, math
from collections import Counter
from statistics import median

root = Path(__file__).resolve().parents[1] / 'artifacts' / 'style-benchmark'
records = []
for name in ('conference-metadata.json', 'journal-metadata.json', 'expanded-metadata.json'):
    for record in json.loads((root / name).read_text(encoding='utf-8')):
        if name == 'conference-metadata.json':
            record.update({'dataset': 'conference', 'group': 'compare', 'field': '计算机视觉', 'figure_role': 'method'})
        elif name == 'journal-metadata.json':
            record.update({'dataset': 'journal', 'group': 'compare', 'field': '生命科学/结构', 'figure_role': 'method'})
        else:
            record.update({'dataset': 'expanded', 'group': 'expanded', 'field': record.get('field', '未分类')})
        records.append(record)
records = [r for r in records if r.get('image') and Path(r['image']).exists()]

rows = []
for record in records:
    image = Image.open(record['image']).convert('RGB')
    image.thumbnail((800, 800))
    pixels = list(image.getdata())
    ink = dark = colorful = near_white = 0
    saturations = []
    hue_bins = Counter()
    for r, g, b in pixels:
        value = max(r, g, b) / 255
        saturation = (max(r, g, b) - min(r, g, b)) / max(1, max(r, g, b))
        if value > 0.96: near_white += 1
        is_ink = value < 0.94 or saturation > 0.12
        if not is_ink: continue
        ink += 1
        saturations.append(saturation)
        if value < 0.42: dark += 1
        if saturation > 0.22 and value > 0.2:
            colorful += 1
            h, _, _ = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            hue_bins[int(h * 360) // 30 * 30] += 1
    quant = image.quantize(colors=16, method=Image.Quantize.MEDIANCUT).convert('RGB')
    counts = Counter(quant.getdata())
    total_quant = sum(counts.values())
    top = [{'rgb': '#%02x%02x%02x' % color, 'share': round(count / total_quant, 3)} for color, count in counts.most_common(6)]
    palette_2pct = sum(1 for count in counts.values() if count / total_quant >= 0.02)
    palette_5pct = sum(1 for count in counts.values() if count / total_quant >= 0.05)
    # Edge density and grayscale entropy measure visual structure beyond blank space.
    gray = image.convert('L')
    edges = gray.filter(ImageFilter.FIND_EDGES)
    edge_bins = edges.histogram()
    edge_density = sum(edge_bins[25:]) / max(1, sum(edge_bins))
    edge_strength = ImageStat.Stat(edges).mean[0] / 255
    gray_bins = gray.histogram()
    gray_entropy = -sum((c / max(1, len(pixels))) * math.log2(c / max(1, len(pixels))) for c in gray_bins if c)
    total_hue = max(1, sum(hue_bins.values()))
    hue_families = sorted([{'hue': f'{h}-{h+29}', 'share': round(c / total_hue, 3)}
                           for h, c in hue_bins.items() if c / total_hue >= 0.08], key=lambda x: -x['share'])
    rows.append({
        'id': record['id'], 'dataset': record.get('dataset'), 'group': record.get('group'),
        'field': record.get('field'), 'figure_role': record.get('figure_role'),
        'venue': record['venue'], 'width': image.width, 'height': image.height,
        'aspect': round(image.width / image.height, 2),
        'near_white': round(near_white / len(pixels), 3),
        'ink': round(ink / len(pixels), 3),
        'dark_ink': round(dark / max(1, ink), 3),
        'ink_saturation_median': round(median(saturations) if saturations else 0, 3),
        'colorful_ink': round(colorful / max(1, ink), 3),
        'edge_density': round(edge_density, 3),
        'edge_strength': round(edge_strength, 3),
        'gray_entropy': round(gray_entropy, 3),
        'palette_2pct': palette_2pct,
        'palette_5pct': palette_5pct,
        'hue_families': hue_families,
        'palette': top,
    })

def summary(items):
    if not items: return {}
    def med(key): return round(median([x[key] for x in items]), 3)
    return {'count': len(items),
            'aspect_median': med('aspect'), 'aspect_range': [min(x['aspect'] for x in items), max(x['aspect'] for x in items)],
            'near_white_median': med('near_white'), 'ink_median': med('ink'), 'dark_ink_median': med('dark_ink'),
            'ink_saturation_median': med('ink_saturation_median'), 'colorful_ink_median': med('colorful_ink'),
            'edge_density_median': med('edge_density'), 'edge_strength_median': med('edge_strength'),
            'gray_entropy_median': med('gray_entropy'), 'palette_2pct_median': med('palette_2pct'),
            'palette_5pct_median': med('palette_5pct')}

groups = {
    'all': rows,
    'conference': [r for r in rows if r['dataset'] == 'conference'],
    'journal': [r for r in rows if r['dataset'] == 'journal'],
    'expanded': [r for r in rows if r['dataset'] == 'expanded'],
    'method': [r for r in rows if r['figure_role'] == 'method'],
    'layout_reference': [r for r in rows if r['figure_role'] == 'layout'],
}
field_summary = {}
for field in sorted({r['field'] for r in rows}):
    field_rows = [r for r in rows if r['field'] == field]
    field_summary[field] = summary(field_rows)

data = {'summary': {key: summary(value) for key, value in groups.items()},
        'fields': field_summary,
        'counts': {'total': len(rows), 'datasets': dict(Counter(r['dataset'] for r in rows)),
                   'roles': dict(Counter(r['figure_role'] for r in rows)),
                   'fields': dict(Counter(r['field'] for r in rows))},
        'images': rows}
(root / 'metrics.json').write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
with (root / 'metrics.csv').open('w', newline='', encoding='utf-8-sig') as handle:
    writer = csv.DictWriter(handle, fieldnames=['id','dataset','group','field','figure_role','venue','width','height','aspect','near_white','ink','dark_ink','ink_saturation_median','colorful_ink','edge_density','edge_strength','gray_entropy','palette_2pct','palette_5pct','hue_families','palette'])
    writer.writeheader()
    for row in rows:
        row = {**row, 'hue_families': ';'.join(f"{x['hue']}:{x['share']}" for x in row['hue_families']),
               'palette': ';'.join(f"{x['rgb']}:{x['share']}" for x in row['palette'])}
        writer.writerow(row)
print(json.dumps(data['summary'], ensure_ascii=False, indent=2))
print(json.dumps(data['counts'], ensure_ascii=False, indent=2))
