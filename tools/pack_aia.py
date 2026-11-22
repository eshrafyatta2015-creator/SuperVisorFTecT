#!/usr/bin/env python3
"""إعادة بناء ملف مشروع App Inventor (.aia) من مجلد مفتوح.

الاستخدام:
    py pack_aia.py <مجلد_المشروع_المستخرج> <ملف_الخروج.aia>
"""
import os
import sys
import zipfile


def pack(src_dir: str, out_file: str) -> None:
    src_dir = os.path.abspath(src_dir)
    entries = []
    for base, _dirs, files in os.walk(src_dir):
        for name in files:
            full = os.path.join(base, name)
            arc = os.path.relpath(full, src_dir).replace(os.sep, "/")
            entries.append((arc, full))

    # ترتيب يطابق ما تنتجه أداة App Inventor: youngandroidproject ثم src ثم assets
    def order(item):
        arc = item[0]
        if arc.startswith("youngandroidproject/"):
            return (0, arc)
        if arc.startswith("src/"):
            return (1, arc)
        if arc.startswith("assets/"):
            return (2, arc)
        return (3, arc)

    entries.sort(key=order)
    with zipfile.ZipFile(out_file, "w", zipfile.ZIP_DEFLATED) as zf:
        for arc, full in entries:
            zf.write(full, arc)
    print(f"packed {len(entries)} files -> {out_file}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    pack(sys.argv[1], sys.argv[2])
