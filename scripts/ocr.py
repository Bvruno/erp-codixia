"""OCR local con Tesseract.

Uso:
    python scripts/ocr.py [ruta-imagen]

Si no se pasa ruta, intenta leer la imagen del portapapeles (solo Windows).

Requiere:
    - Tesseract 5.x instalado (por defecto en C:\Program Files\Tesseract-OCR)
    - Modelos spa+eng en TESSDATA_DIR

Variables de entorno:
    TESSERACT_CMD   - ruta a tesseract.exe
    TESSDATA_DIR    - carpeta con .traineddata
    OCR_LANG        - idioma(s) Tesseract, por defecto spa
"""

import os
import sys
from pathlib import Path

# Asegurar salida UTF-8 en Windows para caracteres acentuados.
if sys.stdout.encoding.lower() != "utf-8":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

# Path por defecto del venv/temp creado por el asistente.
DEFAULT_TESSDATA = r"C:\Users\bruno\AppData\Local\Temp\opencode\tesseract-tessdata"
DEFAULT_TESSERACT = r"C:\Program Files\Tesseract-OCR\tesseract.exe"

TESSERACT_CMD = os.environ.get("TESSERACT_CMD", DEFAULT_TESSERACT)
TESSDATA_DIR = os.environ.get("TESSDATA_DIR", DEFAULT_TESSDATA)
OCR_LANG = os.environ.get("OCR_LANG", "spa")

# Tesseract busca traineddata en este directorio; evita problemas de quotes en CLI.
os.environ.setdefault("TESSDATA_PREFIX", TESSDATA_DIR)


def get_image():
    if len(sys.argv) > 1:
        path = Path(sys.argv[1]).resolve()
        if not path.exists():
            print(f"Error: no existe {path}", file=sys.stderr)
            sys.exit(1)
        return path

    try:
        from PIL import ImageGrab
    except ImportError as exc:
        print("Error: ImageGrab no disponible. Instala Pillow.", file=sys.stderr)
        raise SystemExit(1) from exc

    clipboard = ImageGrab.grabclipboard()
    if clipboard is None:
        print("Error: no hay imagen en el portapapeles.", file=sys.stderr)
        print("Usa: python scripts/ocr.py <ruta-imagen>", file=sys.stderr)
        sys.exit(1)

    if isinstance(clipboard, list):
        path = Path(clipboard[0]).resolve()
        if not path.exists():
            print(f"Error: no existe {path}", file=sys.stderr)
            sys.exit(1)
        return path

    return clipboard


def main():
    if not Path(TESSERACT_CMD).exists():
        print(f"Error: no se encuentra Tesseract en {TESSERACT_CMD}", file=sys.stderr)
        print("Define TESSERACT_CMD o instala Tesseract.", file=sys.stderr)
        sys.exit(1)

    if not Path(TESSDATA_DIR).exists():
        print(f"Error: no existe TESSDATA_DIR={TESSDATA_DIR}", file=sys.stderr)
        sys.exit(1)

    import pytesseract
    from PIL import Image

    pytesseract.pytesseract.tesseract_cmd = TESSERACT_CMD

    image = get_image()
    if isinstance(image, Path):
        image = Image.open(image)

    text = pytesseract.image_to_string(image, lang=OCR_LANG)
    print(text.strip())


if __name__ == "__main__":
    main()
