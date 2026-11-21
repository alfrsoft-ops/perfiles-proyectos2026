"""Convierte un banco de preguntas en Word (.docx) al formato .txt de data/fuentes.

Formato esperado del .docx (un párrafo por línea):
    Pregunta 1
    Enunciado (uno o más párrafos)
    A. Alternativa ... D. Alternativa
    Respuesta correcta: A
    Retroalimentación fundamentada            <- título, se descarta
    La alternativa A es correcta porque ...   <- se usa como explicación
    Aplicación razonada. ...                  <- nota general, va al encabezado
    Referencia verificable. Documento, p. 24, párr. 4.   <- se usa como sustento
    —
Si antes del enunciado hay "Dimensión: …" o "Modalidad: …", quedan como
comentario sobre la pregunta (Modalidad «Aplicación razonada» marca la explicación).
Lo que aparece antes de "Pregunta 1" y después de la última referencia se
copia como comentario (#) al inicio del .txt.

Uso:
    python tools/docx_a_txt.py banco.docx --capitulo ods-2030-c1 [-o data/fuentes/x.txt] [--omitir 2,5,9]
    (--omitir deja esas preguntas como comentario, con una nota, sin importarlas)
Luego: python tools/importar_txt.py
"""
import re
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# "Pregunta 1", "PREGUNTA N.º 1  [A]" o "PREGUNTA N.º 1 Criterio A · Aplicación razonada"
QUESTION_RE = re.compile(r"^Pregunta\s+(?:N\.?\s*[º°o]\s*)?(\d{1,4})\b\s*(?:\[[A-Z]\])?\s*"
                         r"(?:[^·]*?·\s*)?(?:Criterio\s+\S+\s*[·|-]\s*(?P<kind>.+?))?\s*$", re.I)
OPTION_RE = re.compile(r"^([A-D])\s*[.)]\s+(.*)$")
ANSWER_RE = re.compile(r"^Respuesta\s+correcta\s*:\s*([A-D])\b", re.I)
FEEDBACK_RE = re.compile(
    r"^(?:Retroalimentaci[oó]n|Fundamentaci[oó]n)(?:\s+fundamentada)?\s*(?:\(([^)]*)\))?\s*:?\s*(.*)$", re.I)
NOTE_RE = re.compile(r"^Aplicaci[oó]n razonada\.\s*", re.I)
# "Referencia: …", "Referencia verificable. …" o "Tipo de sustento: Textual | Referencia: …"
REFERENCE_RE = re.compile(
    r"^(?:Tipo de sustento\s*:\s*(?P<kind>[^|]*?)\s*\|\s*)?Referencia(\s+verificable)?\s*[.:]\s*", re.I)
REASONED_RE = re.compile(r"aplicaci[oó]n razonada", re.I)
# Ficha antes del enunciado: "Dimensión: Conocimiento y memorización." / "Modalidad: Conceptual."
META_RE = re.compile(r"^(Dimensi[oó]n|Modalidad)\s*:\s*(.+?)\.?$", re.I)


def tidy_quotes(text):
    """Quita el par de comillas duplicado de las citas: ““texto”” -> “texto”."""
    if text.startswith("““") and "”" in text:
        end = text.rindex("”")
        text = text[1:end] + text[end + 1:]
    return text
SEPARATORS = {"—", "–", "-", "***"}


def paragraphs(path):
    xml = zipfile.ZipFile(path).read("word/document.xml").decode("utf-8")
    for block in re.findall(r"<w:p[ >].*?</w:p>", xml, re.S):
        block = re.sub(r"<w:(tab|br|cr)\b[^>]*/>", "<w:t> </w:t>", block)
        text = "".join(re.findall(r"<w:t(?:\s[^>]*)?>([^<]*)</w:t>", block))
        text = (text.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
                .replace("&quot;", '"').replace("&apos;", "'").replace(" ", " "))
        text = re.sub(r"\s+", " ", text).strip()
        if text:
            yield text


def parse(lines):
    header, trailer, notes, questions = [], [], [], []
    current = None
    for line in lines:
        match = QUESTION_RE.match(line)
        if match:
            current = {"n": match.group(1), "stem": [], "options": [], "answer": None,
                       "feedback": [], "legal": "", "done": False, "after": [], "meta": [],
                       "reasoned": bool(match.group("kind") and REASONED_RE.search(match.group("kind")))}
            questions.append(current)
            continue
        if current is None:
            header.append(line)
        elif current["done"]:
            if line not in SEPARATORS:
                current["after"].append(line)
        elif ANSWER_RE.match(line):
            current["answer"] = ANSWER_RE.match(line).group(1).upper()
        elif not current["stem"] and META_RE.match(line):
            label, value = META_RE.match(line).groups()
            current["meta"].append(f"{label.capitalize()}: {value}")
            if REASONED_RE.search(value):
                current["reasoned"] = True
        elif current["answer"] is None:
            option = OPTION_RE.match(line)
            expected = "ABCD"[len(current["options"])] if len(current["options"]) < 4 else None
            if option and option.group(1) == expected:
                current["options"].append(option.group(2))
            elif current["options"]:
                current["options"][-1] += " " + line
            else:
                current["stem"].append(line)
        elif FEEDBACK_RE.match(line):
            kind, text = FEEDBACK_RE.match(line).groups()
            if kind and REASONED_RE.search(kind):
                current["reasoned"] = True
            if text:
                current["feedback"].append(tidy_quotes(text))
        elif NOTE_RE.match(line):
            if line not in notes:
                notes.append(line)
        elif REFERENCE_RE.match(line):
            kind = REFERENCE_RE.match(line).group("kind")
            if kind and REASONED_RE.search(kind):
                current["reasoned"] = True
            current["legal"] = REFERENCE_RE.sub("", line)
            current["done"] = True
        elif line not in SEPARATORS:
            current["feedback"].append(line)
    # Tras la última pregunta: se conservan las notas y se descartan la clave
    # de respuestas y los títulos de sección (párrafos cortos).
    if questions:
        trailer = [line for line in questions[-1]["after"] if len(line) > 60]
    return header, notes, trailer, questions


def main():
    args = sys.argv[1:]
    options = {}
    for flag in ("--capitulo", "-o", "--omitir"):
        if flag in args:
            i = args.index(flag)
            options[flag] = args[i + 1]
            del args[i:i + 2]
    if len(args) != 1 or "--capitulo" not in options:
        print("Uso: python tools/docx_a_txt.py banco.docx --capitulo <id> [-o salida.txt]")
        return 2

    source = Path(args[0])
    out = Path(options.get("-o") or ROOT / "data" / "fuentes" / f"{options['--capitulo']}.txt")
    header, notes, trailer, questions = parse(paragraphs(source))

    text = [f"# Fuente: {source.name} (convertido con tools/docx_a_txt.py)"]
    text += [f"# {line}" for line in header + notes + trailer]
    text += ["", f"CAPÍTULO: {options['--capitulo']}", ""]
    problems = []
    omitted = {n.strip() for n in options.get("--omitir", "").split(",") if n.strip()}
    for q in questions:
        if len(q["options"]) != 4 or not q["answer"] or not q["stem"]:
            problems.append(f"Pregunta {q['n']}: incompleta (enunciado, 4 alternativas y respuesta)")
        if q["n"] in omitted:
            # Se conserva como comentario: no se importa, pero queda trazable.
            text.append(f"# OMITIDA {q['n']}: la respuesta marcada no corresponde al tema del enunciado.")
            text.append("# " + " ".join(q["stem"]) + " | Respuesta " + str(q["answer"]) + ": "
                        + (q["options"][ord(q["answer"]) - 65] if q["answer"] and len(q["options"]) == 4 else ""))
            text.append("")
            continue
        if q["meta"]:
            text.append("# " + " · ".join(q["meta"]))
        text.append(f"{q['n']}. " + "\n\n".join(q["stem"]))
        text += [f"{letter}. {option}" for letter, option in zip("ABCD", q["options"])]
        text.append(f"Respuesta correcta: {q['answer']}")
        if q["feedback"]:
            feedback = " ".join(q["feedback"])
            if q["reasoned"] and not REASONED_RE.match(feedback):
                feedback = "Aplicación razonada: " + feedback
            text.append("Explicación: " + feedback)
        if q["legal"]:
            text.append("Sustento: " + q["legal"])
        text.append("")

    out.write_text("\n".join(text), encoding="utf-8")
    print(f"{len(questions)} preguntas -> {out}" + (f" ({len(omitted)} omitidas)" if omitted else ""))
    for problem in problems:
        print(f"    - {problem}")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
