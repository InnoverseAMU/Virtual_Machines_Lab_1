#!/usr/bin/env python3
"""Generate a storyboard contact sheet from app captures composited onto Dark Tech Keynote stage."""

import os, sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter

OUT_DIR = os.path.dirname(os.path.abspath(__file__))
CAPTURES = os.path.join(OUT_DIR, 'captures')
CIRCUIT = '/home/asad/Projects/Virtual_Machines_Lab/public/experiments/ex3-1/diagrams/fig-3-1-1.png'

# 9 panels: each is (image_path, shot_number, framing, duration, caption)
PANELS = [
    ('03-observe-mode.png',   '1',  'Full bench – overview',        '0–3 s',   'Wire a transformer test – wires snap into place'),
    ('16-meters-live.png',    '2',  'Medium – transformer cam',     '3–5.5 s', 'More wires, orbit right, bench half-wired'),
    ('14-meters-view.png',    '3',  'Close-up – meters cam',        '5.5–8 s', 'Supply ON, meter needles sweep. "All in 3D."'),
    (None,                    '4',  'Split: diagram + bare bench',  '8–13.5 s','Circuit diagram left, bare bench right + red cards: 230 V / diagram only / damage'),
    ('05-learn-mode.png',     '5',  'Full – Learn mode panel',      '16–18 s', 'Learn mode explains every step. Step 1 of 17.'),
    ('07-self-mode.png',      '6',  'Full – Self mode (fault)',     '18–20 s', 'Wiring fault → MCB TRIPPED, pointer backwards'),
    ('09-observations.png',   '7',  'Medium – Observations tab',    '20–22.5 s','Take readings, efficiency chart, check answers'),
    ('08-circuit-diagram.png','8',  'Full – Diagram + Observe',     '22.5–25.5 s', 'Circuit diagram panel, then Observe mode bench'),
    (None,                    '9',  'End card – dark stage',        '27–30 s', 'Virtual Machines Lab. Practise before you power on.'),
]

COLS = 3
ROWS = 3
THUMB_W = 640
THUMB_H = 360
PAD = 24
LABEL_H = 100
SHEET_W = COLS * THUMB_W + (COLS + 1) * PAD
SHEET_H = ROWS * (THUMB_H + LABEL_H) + (ROWS + 1) * PAD

STAGE_BG = (10, 10, 16)
BORDER_COL = (0, 242, 254)       # cyan accent
RED_COL = (255, 60, 60)
TEXT_COL = (220, 220, 230)
LABEL_COL = (160, 160, 170)
TITLE_COL = (0, 242, 254)

def load_font(size):
    for path in ['/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
                 '/usr/share/fonts/truetype/ubuntu/Ubuntu-R.ttf',
                 '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf']:
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()

def load_font_bold(size):
    for path in ['/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
                 '/usr/share/fonts/truetype/ubuntu/Ubuntu-B.ttf',
                 '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf']:
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()

def make_split_panel(circuit_path, bench_path, w, h):
    """Create the split diagram + bench panel with red callout cards."""
    img = Image.new('RGB', (w, h), STAGE_BG)
    draw = ImageDraw.Draw(img)
    
    # Left half: circuit diagram on white card
    half_w = w // 2 - 8
    if os.path.exists(circuit_path):
        circ = Image.open(circuit_path).convert('RGB')
        # Place on a white card
        card_w, card_h = half_w - 20, h - 60
        card = Image.new('RGB', (card_w, card_h), (255, 255, 255))
        circ_resized = circ.copy()
        circ_resized.thumbnail((card_w - 10, card_h - 10), Image.LANCZOS)
        cx = (card_w - circ_resized.width) // 2
        cy = (card_h - circ_resized.height) // 2
        card.paste(circ_resized, (cx, cy))
        img.paste(card, (10, 10))
    
    # Right half: unwired bench (use self mode)
    if os.path.exists(bench_path):
        bench = Image.open(bench_path).convert('RGB')
        bench_resized = bench.copy()
        bench_resized.thumbnail((half_w, h - 20), Image.LANCZOS)
        img.paste(bench_resized, (half_w + 8, (h - bench_resized.height) // 2))
    
    # Red callout cards
    font = load_font(14)
    cards = ['⚡ 230 V', '📖 Learn from a diagram only', '⚠ One wrong connection…']
    for i, text in enumerate(cards):
        cx = half_w + 20
        cy = 10 + i * 35
        draw.rounded_rectangle([(cx, cy), (cx + half_w - 30, cy + 28)], radius=4, 
                               fill=(40, 10, 10), outline=(255, 60, 60))
        draw.text((cx + 8, cy + 6), text, fill=(255, 100, 100), font=font)
    
    return img

def make_end_card(w, h):
    """Create the end card panel."""
    img = Image.new('RGB', (w, h), STAGE_BG)
    draw = ImageDraw.Draw(img)
    
    title_font = load_font_bold(28)
    tag_font = load_font(16)
    credit_font = load_font(12)
    
    # Title
    draw.text((w//2, h//3), 'Virtual Machines Lab', fill=TITLE_COL, font=title_font, anchor='mm')
    # Tagline
    draw.text((w//2, h//3 + 40), 'Practise before you power on.', fill=TEXT_COL, font=tag_font, anchor='mm')
    # Credits
    draw.text((w//2, h//3 + 80), 'ZHCET · AMU · EEC2910', fill=LABEL_COL, font=credit_font, anchor='mm')
    draw.text((w//2, h//3 + 100), 'Asad Mokarim', fill=LABEL_COL, font=credit_font, anchor='mm')
    
    # Cyan border glow
    draw.rectangle([(2, 2), (w-3, h-3)], outline=BORDER_COL, width=1)
    
    return img

def main():
    sheet = Image.new('RGB', (SHEET_W, SHEET_H), STAGE_BG)
    draw = ImageDraw.Draw(sheet)
    
    # Title bar
    title_font = load_font_bold(20)
    sub_font = load_font(14)
    label_font = load_font(12)
    caption_font = load_font(11)
    
    # Draw title at top
    draw.text((PAD, 4), 'STORYBOARD — Virtual Machines Lab', fill=TITLE_COL, font=title_font)
    draw.text((SHEET_W - PAD - 300, 6), 'Dark Tech Keynote · 30 s · 1920×1080 · 24 fps', fill=LABEL_COL, font=label_font)
    
    for idx, (img_file, shot_num, framing, duration, caption) in enumerate(PANELS):
        col = idx % COLS
        row = idx // COLS
        x = PAD + col * (THUMB_W + PAD)
        y = PAD + 24 + row * (THUMB_H + LABEL_H + PAD)
        
        # Create the thumbnail
        if img_file is None and shot_num == '4':
            thumb = make_split_panel(CIRCUIT, os.path.join(CAPTURES, '07-self-mode.png'), THUMB_W, THUMB_H)
        elif img_file is None and shot_num == '9':
            thumb = make_end_card(THUMB_W, THUMB_H)
        else:
            img_path = os.path.join(CAPTURES, img_file)
            if os.path.exists(img_path):
                thumb = Image.open(img_path).convert('RGB')
                thumb = thumb.resize((THUMB_W, THUMB_H), Image.LANCZOS)
            else:
                thumb = Image.new('RGB', (THUMB_W, THUMB_H), (30, 30, 40))
                d = ImageDraw.Draw(thumb)
                d.text((THUMB_W//2, THUMB_H//2), f'[{img_file}]', fill=TEXT_COL, font=label_font, anchor='mm')
        
        # Draw 1px cyan border
        bordered = Image.new('RGB', (THUMB_W + 2, THUMB_H + 2), BORDER_COL)
        bordered.paste(thumb, (1, 1))
        sheet.paste(bordered, (x - 1, y - 1))
        
        # Shot number badge
        draw.rounded_rectangle([(x, y), (x + 28, y + 20)], radius=3, fill=BORDER_COL)
        draw.text((x + 14, y + 10), shot_num, fill=STAGE_BG, font=label_font, anchor='mm')
        
        # Labels below thumbnail
        label_y = y + THUMB_H + 6
        draw.text((x, label_y), f'{framing}', fill=TEXT_COL, font=sub_font)
        draw.text((x + THUMB_W - 2, label_y), duration, fill=TITLE_COL, font=label_font, anchor='ra')
        
        # Caption
        # Wrap text
        words = caption.split()
        lines = []
        current = ''
        for w in words:
            test = (current + ' ' + w).strip()
            bbox = draw.textbbox((0, 0), test, font=caption_font)
            if bbox[2] > THUMB_W - 4:
                lines.append(current)
                current = w
            else:
                current = test
        if current:
            lines.append(current)
        
        for i, line in enumerate(lines[:3]):
            draw.text((x, label_y + 20 + i * 16), line, fill=LABEL_COL, font=caption_font)
    
    out_path = os.path.join(OUT_DIR, 'storyboard.png')
    sheet.save(out_path, 'PNG')
    print(f'Storyboard saved to {out_path} ({SHEET_W}×{SHEET_H})')

if __name__ == '__main__':
    main()
