# -*- coding: utf-8 -*-
"""توليد أيقونات تطبيق المشرف الفني (PWA) بـ Pillow.

الاستخدام:
    py tools/gen_icons.py
"""
import os
from PIL import Image, ImageDraw

NAVY = (27, 42, 74)      # #1B2A4A
WHITE = (255, 255, 255)
TEAL = (31, 122, 140)    # #1F7A8C
GOLD = (255, 200, 0)     # #FFC800

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.dirname(HERE), "icons")


def X(v, s, ox):
    return int(round(ox + v * s))


def draw_book(d, s, ox=0.0, oy=0.0):
    """كتاب مفتوح (مثل أيقونة التطبيق الأسبوعي)."""
    def box(x1, y1, x2, y2):
        return (X(x1, s, ox), X(y1, s, oy), X(x2, s, ox), X(y2, s, oy))

    def rad(v):
        return max(1, int(round(v * s)))

    d.rounded_rectangle(box(150, 330, 480, 700), radius=rad(26), fill=WHITE)
    d.rounded_rectangle(box(544, 330, 874, 700), radius=rad(26), fill=WHITE)
    d.rounded_rectangle(box(484, 330, 540, 700), radius=rad(16), fill=TEAL)
    for y in (410, 495, 580):
        d.rounded_rectangle(box(195, y, 440, y + 26), radius=rad(13), fill=NAVY)
        d.rounded_rectangle(box(584, y, 829, y + 26), radius=rad(13), fill=NAVY)
    d.rounded_rectangle(box(290, 726, 734, 752), radius=rad(12), fill=TEAL)


def draw_magnifier(d, s, ox=0.0, oy=0.0):
    """عدسة تكبير فوق الكتاب — ترمز إلى البحث."""
    def P(x, y):
        return (X(x, s, ox), X(y, s, oy))

    def w(v):
        return max(1, int(round(v * s)))

    cx, cy, r = 735, 745, 138
    # فاصل كحلي حتى تبرز العدسة فوق الكتاب
    d.ellipse([P(cx - r - 30, cy - r - 30), P(cx + r + 30, cy + r + 30)], outline=NAVY, width=w(60))
    # المقبض
    d.line([P(cx + 96, cy + 96), P(cx + 205, cy + 205)], fill=GOLD, width=w(52))
    d.line([P(cx + 96, cy + 96), P(cx + 205, cy + 205)], fill=NAVY, width=w(76))
    d.line([P(cx + 96, cy + 96), P(cx + 205, cy + 205)], fill=GOLD, width=w(48))
    # زجاج العدسة (أفتح قليلاً من الخلفية)
    d.ellipse([P(cx - r + 20, cy - r + 20), P(cx + r - 20, cy + r - 20)], fill=(38, 58, 100))
    # الحلقة
    d.ellipse([P(cx - r, cy - r), P(cx + r, cy + r)], outline=GOLD, width=w(44))
    # لمعة داخلية
    d.arc([P(cx - r + 34, cy - r + 34), P(cx + r - 34, cy + r - 34)],
          start=200, end=300, fill=WHITE, width=w(14))


def make(size: int, scale: float = 1.0) -> Image.Image:
    img = Image.new("RGB", (size, size), NAVY)
    d = ImageDraw.Draw(img)
    if scale == 1.0:
        s = size / 1024.0
        draw_book(d, s)
        draw_magnifier(d, s)
    else:
        s = scale * size / 1024.0
        # توسيط المحتوى داخل مساحة الآمنة (safe zone)
        minx, maxx = 150.0, 940.0
        miny, maxy = 330.0, 960.0
        cw, ch = (maxx - minx) * s, (maxy - miny) * s
        ox = (size - cw) / 2.0 - minx * s
        oy = (size - ch) / 2.0 - miny * s
        draw_book(d, s, ox, oy)
        draw_magnifier(d, s, ox, oy)
    return img


def main():
    os.makedirs(OUT, exist_ok=True)
    make(1024).resize((180, 180), Image.LANCZOS).save(
        os.path.join(OUT, "icon-180.png"), "PNG", optimize=True)
    make(1024).resize((192, 192), Image.LANCZOS).save(
        os.path.join(OUT, "icon-192.png"), "PNG", optimize=True)
    make(1024).resize((512, 512), Image.LANCZOS).save(
        os.path.join(OUT, "icon-512.png"), "PNG", optimize=True)
    make(1024, scale=0.72).save(
        os.path.join(OUT, "icon-512-maskable.png"), "PNG", optimize=True)
    # أيقونة صغيرة للمتصفح
    make(1024).resize((64, 64), Image.LANCZOS).save(
        os.path.join(OUT, "favicon-64.png"), "PNG", optimize=True)
    print("icons written to", OUT)


if __name__ == "__main__":
    main()
