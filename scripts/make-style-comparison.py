from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).resolve().parents[1] / 'artifacts' / 'style-benchmark'
assets = [
    ('参考：CVPR 2024 三面板方法总览', root / 'conference-figures' / 'cvpr-05.png'),
    ('改造前：上一轮星火流程图（标题＋重复总览条＋彩色卡片）', root.parent / 'desktop-live' / 'editorial-workflow-after.png'),
    ('改造后：本轮期刊风格（白底、小写面板标记、细线、无图内标题）', root / 'journal-flow-after.png'),
]
width, margin, label_h, gap = 1280, 32, 34, 18
font_path = Path(r'C:\Windows\Fonts\msyh.ttc')
if not font_path.exists(): font_path = Path(r'C:\Windows\Fonts\simhei.ttf')
title_font = ImageFont.truetype(str(font_path), 24)
label_font = ImageFont.truetype(str(font_path), 16)
small_font = ImageFont.truetype(str(font_path), 13)

sizes = []
for _, path in assets:
    im = Image.open(path).convert('RGB')
    h = round(im.height * (width - 2 * margin) / im.width)
    sizes.append(h)
height = 74 + sum(h + label_h + gap for h in sizes) + 20
sheet = Image.new('RGB', (width, height), 'white')
draw = ImageDraw.Draw(sheet)
draw.text((margin, 22), '顶会/顶刊方法图视觉基准与改造对照', fill='#17191c', font=title_font)
y = 74
for (label, path), target_h in zip(assets, sizes):
    draw.text((margin, y), label, fill='#4f555b', font=label_font)
    y += label_h
    im = Image.open(path).convert('RGB')
    im = im.resize((width - 2 * margin, target_h), Image.Resampling.LANCZOS)
    sheet.paste(im, (margin, y))
    draw.rectangle((margin, y, width - margin - 1, y + target_h - 1), outline='#d7dce1', width=1)
    y += target_h + gap
draw.line((margin, height - 34, width - margin, height - 34), fill='#d7dce1', width=1)
draw.text((margin, height - 27), '来源：CVPR 2024 开放论文；Nature 系列开放论文。仅作本地风格分析。',
          fill='#6b7178', font=small_font)
out = root / 'comparison-journal-style.png'
sheet.save(out)
print(out, sheet.size)
