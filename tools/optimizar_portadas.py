"""Optimiza las portadas: las redimensiona y las guarda en WebP.

Uso:
    python tools/optimizar_portadas.py ORIGEN [ORIGEN ...] -o assets/portadas/normativa-general
    python tools/optimizar_portadas.py assets/portadas            (convierte en el sitio)

Cada imagen queda con un ancho máximo de 480 px (suficiente para la tarjeta en
pantallas de alta densidad) y calidad 80. Requiere Pillow: pip install pillow
"""
import argparse
import re
import sys
import unicodedata
from pathlib import Path

from PIL import Image

EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}
MAX_WIDTH = 480


def slug(name):
    """'4_-_Ley_N__348' -> 'ley-348'; '1. CPE Bolivia' -> 'cpe-bolivia'."""
    text = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower().replace("_", " ")
    text = re.sub(r"^\d+[\s._-]+", "", text)          # numeración inicial
    text = re.sub(r"\bn[o°]?\b", " ", text)           # "N.º" (la º se pierde o queda como "o")
    return re.sub(r"[^a-z0-9]+", "-", text).strip("-")


def optimize(source, target):
    with Image.open(source) as image:
        image = image.convert("RGBA" if image.mode in ("RGBA", "LA", "P") else "RGB")
        if image.width > MAX_WIDTH:
            image = image.resize((MAX_WIDTH, round(image.height * MAX_WIDTH / image.width)), Image.LANCZOS)
        image.save(target, "WEBP", quality=80, method=6)
    print(f"{source.name:40} {source.stat().st_size // 1024:>5} KB -> {target.name:28} {target.stat().st_size // 1024:>4} KB")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("sources", nargs="+", type=Path, help="imágenes o carpetas")
    parser.add_argument("-o", "--out", type=Path, help="carpeta de salida (por defecto, la de cada imagen)")
    parser.add_argument("--keep-names", action="store_true", help="no renombrar los archivos")
    args = parser.parse_args()

    files = []
    for source in args.sources:
        files += sorted(p for p in source.iterdir() if p.suffix.lower() in EXTENSIONS) if source.is_dir() else [source]
    if not files:
        sys.exit("No se encontraron imágenes.")
    for file in files:
        out = args.out or file.parent
        out.mkdir(parents=True, exist_ok=True)
        name = file.stem if args.keep_names else slug(file.stem)
        target = out / f"{name}.webp"
        if target.resolve() == file.resolve():
            target = out / f"{name}.opt.webp"
        optimize(file, target)


if __name__ == "__main__":
    main()
