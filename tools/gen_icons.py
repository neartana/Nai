# Generates the Nai icons in the ASCII style: an indigo square with a 1px ink border and two
# white block eyes (the same mark the panel and the Settings page draw). Crisp, no antialiasing.
# Run from the extension folder: python3 tools/gen_icons.py
from PIL import Image, ImageDraw
import os

INK = (0x1C, 0x1C, 0x24, 255)
INDIGO = (0x5B, 0x5B, 0xD6, 255)
WHITE = (255, 255, 255, 255)

os.makedirs("icons", exist_ok=True)

for size in (16, 32, 48, 128):
    img = Image.new("RGBA", (size, size), INK)
    d = ImageDraw.Draw(img)
    border = max(1, round(size / 32))
    d.rectangle([border, border, size - 1 - border, size - 1 - border], fill=INDIGO)
    eye_w = max(2, round(size * 0.125))
    eye_h = max(4, round(size * 0.27))
    gap = max(2, round(size * 0.19))
    x0 = (size - (eye_w * 2 + gap)) // 2
    y0 = (size - eye_h) // 2
    for x in (x0, x0 + eye_w + gap):
        d.rectangle([x, y0, x + eye_w - 1, y0 + eye_h - 1], fill=WHITE)
    img.save(f"icons/icon-{size}.png")
    print(f"icons/icon-{size}.png")
