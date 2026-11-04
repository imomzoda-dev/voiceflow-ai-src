"""Generates the app icon and tray icons (run: python scripts/generate-icons.py)."""
from PIL import Image, ImageDraw
import os

OUT = os.path.join(os.path.dirname(__file__), '..', 'resources', 'icons')
os.makedirs(OUT, exist_ok=True)

def gradient(size, c1, c2):
    img = Image.new('RGBA', (size, size))
    px = img.load()
    for y in range(size):
        for x in range(size):
            t = (x + y) / (2 * (size - 1))
            px[x, y] = tuple(int(c1[i] + (c2[i] - c1[i]) * t) for i in range(3)) + (255,)
    return img

def bars(draw, size, color, scale=1.0):
    # Five rounded "audio level" bars centred in the icon.
    heights = [0.30, 0.55, 0.78, 0.55, 0.30]
    w = size * 0.085 * scale
    gap = size * 0.06 * scale
    total = len(heights) * w + (len(heights) - 1) * gap
    x0 = (size - total) / 2
    for i, h in enumerate(heights):
        bh = size * h * scale
        x = x0 + i * (w + gap)
        y = (size - bh) / 2
        draw.rounded_rectangle([x, y, x + w, y + bh], radius=w / 2, fill=color)

def app_icon(size=1024):
    base = gradient(size, (79, 125, 255), (138, 92, 255))
    mask = Image.new('L', (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, size - 1, size - 1], radius=int(size * 0.225), fill=255)
    icon = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    icon.paste(base, (0, 0), mask)
    bars(ImageDraw.Draw(icon), size, (255, 255, 255, 255), 0.95)
    return icon

def tray(size, color, dot=None):
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    bars(d, size, color, 1.15)
    if dot:
        r = size * 0.2
        d.ellipse([size - 2 * r, 0, size, 2 * r], fill=dot)
    return img

app_icon().save(os.path.join(OUT, 'icon.png'))  # 1024 px, used for .icns and the installer
app_icon().resize((256, 256), Image.LANCZOS).save(os.path.join(OUT, 'icon-256.png'))
for scale, suffix in ((1, ''), (2, '@2x')):
    s = 16 * scale
    big = 32 * scale  # render larger then downsample for anti-aliasing
    # Windows/Linux: the coloured app tile stays visible on both light and dark taskbars.
    app_icon(big * 4).resize((s, s), Image.LANCZOS).save(os.path.join(OUT, f'tray{suffix}.png'))
    rec = app_icon(big * 4)
    rd = ImageDraw.Draw(rec)
    r = big * 4 * 0.22
    rd.ellipse([big * 4 - 2 * r, 0, big * 4, 2 * r], fill=(239, 68, 68, 255), outline=(255, 255, 255, 255), width=int(big * 0.4))
    rec.resize((s, s), Image.LANCZOS).save(os.path.join(OUT, f'tray-rec{suffix}.png'))
    tray(big * 4, (0, 0, 0, 255)).resize((s, s), Image.LANCZOS).save(os.path.join(OUT, f'trayTemplate{suffix}.png'))
    tray(big * 4, (0, 0, 0, 255), (0, 0, 0, 255)).resize((s, s), Image.LANCZOS).save(os.path.join(OUT, f'trayRecTemplate{suffix}.png'))
print('icons written to', os.path.abspath(OUT))
