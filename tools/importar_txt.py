"""Genera data/preguntas.js a partir de los archivos de texto del banco de preguntas.

Formato de cada .txt (ver README.md):
    CAPÍTULO: ods-2030-c1          <- id del capítulo en data/catalogo.js
    1. Enunciado (puede ocupar varias líneas)
    A. Alternativa
    B. Alternativa
    C. Alternativa
    D. Alternativa
    Respuesta correcta: B
    Explicación: por qué es la correcta          (opcional)
    Sustento: artículo o referencia normativa    (opcional)
Las líneas que empiezan con # son comentarios.

Uso:
    python tools/importar_txt.py                        (lee data/fuentes/*.txt)
    python tools/importar_txt.py archivo.txt carpeta/   (archivos o carpetas)
    python tools/importar_txt.py --capitulo ods-2030-c1 preguntas.txt
        (asigna ese capítulo a las preguntas de archivos sin línea CAPÍTULO)
"""
import hashlib
import json
import re
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CATALOG = ROOT / "data" / "catalogo.js"
OUT = ROOT / "data" / "preguntas.js"
SOURCES = ROOT / "data" / "fuentes"

CHAPTER_RE = re.compile(r"^#*\s*CAP[IÍ]TULO\s*:\s*(\S+)\s*$", re.I)
QUESTION_RE = re.compile(r"^(\d{1,4})\s*[.)]\s+(.*)$")
OPTION_RE = re.compile(r"^([A-Da-d])\s*[.)]\s+(.*)$")
ANSWER_RE = re.compile(r"^Respuesta\s+correcta\s*:\s*([A-Da-d])\b", re.I)
EXPLANATION_RE = re.compile(r"^(?:Explicaci[oó]n|Retroalimentaci[oó]n)\s*:\s*(.*)$", re.I)
LEGAL_RE = re.compile(r"^Sustento(?:\s+(?:legal|normativo))?\s*:\s*(.*)$", re.I)
LETTERS = "ABCD"


def normalize(text):
    text = unicodedata.normalize("NFD", text)
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn")
    return re.sub(r"\s+", " ", text).strip().lower()


def clean(text):
    return re.sub(r"[ \t]+", " ", unicodedata.normalize("NFC", text).replace(" ", " ")).strip()


def join_lines(lines):
    """Une líneas conservando los saltos de párrafo del enunciado."""
    text = "\n".join(clean(line) for line in lines)
    return re.sub(r"\n{2,}", "\n", text).strip()


def load_catalog():
    source = CATALOG.read_text(encoding="utf-8")
    catalog = json.loads(source[source.index("{"):source.rindex("}") + 1])
    chapters = [chapter["id"] for book in catalog["books"] for chapter in book["chapters"]]
    # Colecciones con banco propio (las de "mix" no tienen preguntas propias).
    return chapters + [item["id"] for item in catalog.get("collections", []) if not item.get("mix")]


def read_text(path):
    raw = path.read_bytes()
    try:
        return raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        return raw.decode("cp1252")


class Question:
    def __init__(self, number, chapter, line_no, first):
        self.number, self.chapter, self.line_no = number, chapter, line_no
        self.stem, self.options = [first], []
        self.answer = None
        self.explanation, self.legal = [], []
        self.field = self.stem

    def complete(self):
        return self.answer is not None

    def add_option(self, text):
        self.options.append([text])
        self.field = self.options[-1]


def parse_file(path, default_chapter):
    questions, problems = [], []
    chapter, current = default_chapter, None

    def close():
        if current:
            questions.append(current)

    for line_no, raw in enumerate(read_text(path).splitlines(), 1):
        line = raw.strip()
        chapter_match = CHAPTER_RE.match(line)
        if chapter_match:
            close()
            current, chapter = None, chapter_match.group(1)
            continue
        if line.startswith("#"):
            continue
        if not line:
            if current and current.field is current.stem:
                current.stem.append("")
            continue

        question_match = QUESTION_RE.match(line)
        if question_match and (current is None or current.complete()):
            close()
            current = Question(question_match.group(1), chapter, line_no, question_match.group(2))
            continue
        if current is None:
            problems.append(f"línea {line_no}: texto fuera de una pregunta, se ignora")
            continue

        answer = ANSWER_RE.match(line)
        explanation = EXPLANATION_RE.match(line)
        legal = LEGAL_RE.match(line)
        option = OPTION_RE.match(line)
        if answer:
            current.answer = LETTERS.index(answer.group(1).upper())
            current.field = None
        elif explanation:
            current.explanation.append(explanation.group(1))
            current.field = current.explanation
        elif legal:
            current.legal.append(legal.group(1))
            current.field = current.legal
        elif (option and current.answer is None and len(current.options) < 4
              and option.group(1).upper() == LETTERS[len(current.options)]):
            current.add_option(option.group(2))
        elif current.field is not None:
            current.field.append(line)
        else:
            problems.append(f"línea {line_no}: texto después de la respuesta, se ignora")
    close()
    return questions, problems


def build(question, problems):
    """Valida una pregunta y la convierte al formato del banco."""
    where = f"pregunta {question.number} (línea {question.line_no})"
    if not question.chapter:
        problems.append(f"{where}: sin capítulo (falta la línea CAPÍTULO), se omite")
        return None
    stem = join_lines(question.stem)
    options = [join_lines(lines).replace("\n", " ") for lines in question.options]
    if len(options) != 4:
        problems.append(f"{where}: tiene {len(options)} alternativas, se omite")
        return None
    if question.answer is None:
        problems.append(f"{where}: sin 'Respuesta correcta', se omite")
        return None
    if not stem or not all(options):
        problems.append(f"{where}: enunciado o alternativa vacía, se omite")
        return None
    if len({normalize(o) for o in options}) < 4:
        problems.append(f"{where}: alternativas repetidas, se omite")
        return None
    return {
        "id": hashlib.sha1(normalize(stem).encode("utf-8")).hexdigest()[:12],
        "q": stem,
        "options": options,
        "answer": question.answer,
        "explanation": join_lines(question.explanation).replace("\n", " "),
        "legal": join_lines(question.legal).replace("\n", " "),
    }


def collect_files(args):
    files = []
    for arg in args or [str(SOURCES)]:
        source = Path(arg)
        files.extend([source] if source.is_file() else sorted(source.glob("*.txt")))
    return files


def main():
    args = sys.argv[1:]
    default_chapter = None
    if "--capitulo" in args:
        i = args.index("--capitulo")
        if i + 1 >= len(args):
            print("Uso: python tools/importar_txt.py --capitulo <id> archivo.txt")
            return 2
        default_chapter = args[i + 1]
        del args[i:i + 2]

    chapters = load_catalog()
    files = collect_files(args)
    if not files:
        print("[!] No se encontraron archivos .txt")
        return 1

    bank = {chapter: [] for chapter in chapters}
    seen, ok = {}, True
    for path in files:
        parsed, problems = parse_file(path, default_chapter)
        added = 0
        for question in parsed:
            item = build(question, problems)
            if not item:
                continue
            if question.chapter not in bank:
                problems.append(f"pregunta {question.number}: el capítulo '{question.chapter}' "
                                "no existe en data/catalogo.js, se omite")
                continue
            if item["id"] in seen:
                problems.append(f"pregunta {question.number}: enunciado repetido "
                                f"(ya está en {seen[item['id']]}), se omite")
                continue
            seen[item["id"]] = f"{path.name}, pregunta {question.number}"
            bank[question.chapter].append(item)
            added += 1
        print(f"{path.name:40} {added:4} preguntas")
        for problem in problems:
            print(f"    - {problem}")
        ok = ok and not problems

    print("\nPreguntas por capítulo:")
    for chapter, questions in bank.items():
        print(f"  {chapter:32} {len(questions):4}")

    OUT.write_text(
        "// Generado por tools/importar_txt.py a partir de data/fuentes. No editar a mano.\n"
        "window.QUESTION_BANK = " + json.dumps(bank, ensure_ascii=False, indent=1) + ";\n",
        encoding="utf-8",
    )
    print(f"\nEscrito {OUT.relative_to(ROOT)} ({sum(map(len, bank.values()))} preguntas)")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
