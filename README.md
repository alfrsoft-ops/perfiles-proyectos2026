# Simulacro de Examen – Técnico Pedagógico

Simulador web de exámenes de opción múltiple organizado en libros y capítulos. Funciona sin instalación ni servidor, en PC, tablet y Android, con modo claro y oscuro.

## Ejecutar
Abre `index.html` en un navegador moderno (Chrome, Edge, Firefox). Para desarrollo puedes usar la extensión Live Server de Visual Studio Code. Para publicarlo, basta con subir la carpeta completa a cualquier hosting estático.

## Etapas
0. **Portada** (`#/`): tarjetas de las áreas de evaluación (Normativa General, Normativa Específica y Técnico Pedagógico), definidas en `areas` dentro de `data/catalogo.js`.
1. **Catálogo de un área**: tarjetas con portada (`#/area/<id>`). Cada libro indica su área con `"area"`; los que no la tienen van a `tecnico-pedagogico`. `"coverLabel"` escribe un texto sobre la portada (se usa con la portada genérica `assets/portadas/normativa-especifica.svg`).
2. **Capítulos**: título, cantidad de preguntas, mejor puntaje y «Empezar simulacro» (`#/libro/<id>`).
3. **Configuración**: modo práctica o examen; bloque de preguntas (todo el banco, o bloques de 25 en el orden de creación del banco: 1 a 25, 26 a 50, 51 a 75 y 76 a 100; con un bloque, «Orden aleatorio» mezcla solo las preguntas de ese bloque y, desmarcado, se responden en el orden del banco; se muestra el N.º de cada pregunta en el banco); cantidad (10, 20, 50 o todas), tiempo (automático = 1,5 min por pregunta, personalizado o sin límite), orden aleatorio, mezcla de alternativas y «Volver a preguntar al final las cuestiones que se fallen». Esta última opción es solo para el modo práctica: cada pregunta fallada vuelve al final del simulacro, y se repite cada vez que se falla, hasta responderla correctamente. Mientras quede alguna pendiente no se puede finalizar, salvo que se agote el tiempo. Los repasos no suman puntaje (solo cuenta el primer intento) y, con tiempo automático, agregan 1,5 min cada uno.
4. **Simulacro**: una pregunta por pantalla, alternativas A–D, barra de progreso, mapa de preguntas, temporizador y retroalimentación (en práctica). Atajos: `A`–`D` o `1`–`4` para responder y las flechas para navegar.
5. **Resultados**: puntaje sobre 100, porcentaje, correctas, incorrectas, sin responder, tiempo, nivel de dominio y revisión detallada con filtros.

Bajo el catálogo de un área van los botones definidos en `collections` dentro de `data/catalogo.js` (cada uno con su `"area"`). En `"mix"` se pueden indicar libros (todos sus capítulos) o capítulos sueltos, y `"mixUnits"` nombra esas partes en la configuración.
- **Simulacro integral de la CPE** (Normativa general): sortea preguntas de las 4 partes de la Constitución (`cpe-general`, `cpe-parte-2`, `cpe-parte-3`, `cpe-parte-4`), 25 % de cada una.
- **Banco de preguntas integradas**: banco propio (`CAPÍTULO: integrado`, cargado desde `data/fuentes/integrado.docx`) con preguntas de los 4 libros. Se configura como cualquier capítulo.
- **Preguntas del banco**: sortea preguntas de los bancos de los 4 libros en partes iguales (25 % de cada uno; cantidades de 20 a 100). No usa el banco integrado. Cada pregunta muestra de qué libro y capítulo viene.

El historial de resultados está en **Progreso** (`#/progreso`). Un simulacro en curso se guarda solo: si se cierra la pestaña o se sale, se puede continuar desde el inicio.

| Puntaje | Nivel de dominio |
|---|---|
| 90–100 | Dominio sobresaliente |
| 80–89 | Dominio alto |
| 70–79 | Dominio satisfactorio |
| 60–69 | Dominio básico |
| Menos de 60 | Requiere reforzamiento |

## Archivos
| Archivo | Contenido |
|---|---|
| `index.html` | Estructura de todas las etapas y diálogos |
| `css/styles.css` | Estilos responsive y los dos temas (variables de color y escala tipográfica `--fs-*` en `:root`) |
| `assets/fuentes/` | Source Sans 3 (texto) y Source Serif 4 (títulos), locales para funcionar sin internet |
| `data/catalogo.js` | Libros y capítulos (se edita a mano) |
| `data/preguntas.js` | Banco de preguntas por capítulo (lo genera el importador) |
| `data/fuentes/*.txt` | Fuentes de las preguntas |
| `js/repo.js` | Acceso a libros, capítulos y preguntas |
| `js/storage.js` | Guardado del tema, el simulacro en curso y el historial |
| `js/engine.js` | Armado del simulacro, calificación y nivel de dominio (sin interfaz) |
| `js/quiz.js` | Etapas 4 y 5: preguntas, temporizador, resultados y revisión |
| `js/app.js` | Rutas, catálogo, capítulos, configuración y progreso |
| `js/ui.js`, `js/theme.js` | Utilidades de interfaz y selector de tema |
| `tools/importar_txt.py` | Importador de preguntas |

## Agregar un libro o un capítulo
1. Copia la portada a `assets/portadas/`, optimizada en WebP: `python tools/optimizar_portadas.py <imagen o carpeta> -o assets/portadas/<carpeta>` (ancho máximo 480 px; requiere `pip install pillow`).
2. En `data/catalogo.js` agrega el libro (o el capítulo) con un `id` único. Iconos de capítulo disponibles: `book`, `scale`, `doc`, `chart`, `people`. Si el libro se divide en secciones y no en capítulos, agrégale `"units": ["sección", "secciones"]`.
3. Agrega sus preguntas (ver abajo) y ejecuta el importador.

No hace falta tocar el código: el catálogo, los capítulos y los conteos se generan a partir de estos datos.

## Agregar preguntas
Escribe las preguntas en un `.txt` dentro de `data/fuentes/` (UTF-8) con este formato:

```
CAPÍTULO: ods-2030-c1

1. Enunciado de la pregunta (puede ocupar varias líneas o párrafos)
A. Alternativa
B. Alternativa
C. Alternativa
D. Alternativa
Respuesta correcta: B
Explicación: por qué esa es la respuesta correcta.        (opcional)
Sustento: artículo, párrafo o referencia normativa.       (opcional)
```

- `CAPÍTULO:` asigna las preguntas siguientes al capítulo con ese `id` en `data/catalogo.js`; puede cambiarse varias veces en el mismo archivo.
- `Retroalimentación:` también se acepta en lugar de `Explicación:`. `Sustento legal:` y `Sustento normativo:` equivalen a `Sustento:`.
- Las líneas que empiezan con `#` son comentarios.

Luego genera el banco:

```
python tools/importar_txt.py
```

El importador lee todos los `.txt` de `data/fuentes/`, muestra cuántas preguntas obtuvo por archivo y por capítulo, y avisa (y omite) las preguntas con alternativas faltantes o repetidas, sin respuesta correcta, con un capítulo inexistente o con el enunciado repetido. También acepta archivos o carpetas concretos, y `--capitulo <id>` para archivos sin línea `CAPÍTULO`.

### Bancos en Word (.docx)
Si el banco viene en Word con el formato `PREGUNTA N.º N` (o `Pregunta N`) / `A.`–`D.` / `Respuesta correcta: X` / `Retroalimentación: …` / `Referencia: …`, conviértelo primero a `.txt` y luego ejecuta el importador:

```
python tools/docx_a_txt.py data/fuentes/ods-2030-c1.docx --capitulo ods-2030-c1 -o data/fuentes/ods-2030-c1.txt
python tools/importar_txt.py
```

También se reconocen `Fundamentación: …` (con o sin «(Contenido textual)» / «(Aplicación razonada)») y `Tipo de sustento: … | Referencia: …`. Con `--omitir 2,5,9`, esas preguntas quedan como comentario en el `.txt`, con una nota, y no se importan.

La retroalimentación pasa a «Explicación» y la referencia a «Sustento». La ficha técnica y las notas del documento quedan como comentarios al inicio del `.txt`. Los títulos de sección y la clave de respuestas del final se descartan, porque la respuesta se toma de cada pregunta. Cuando se mezclan las alternativas, el simulador ajusta solo las letras que cita la retroalimentación («La alternativa B es correcta…»).

## Base de datos
Hoy los datos se leen de `data/*.js` y los resultados se guardan en el navegador (`localStorage`). Para conectar una base de datos o una API:
- `js/repo.js`: reimplementa `listBooks`, `getBook` y `getQuestions` (ya devuelven promesas), por ejemplo con `fetch`.
- `js/storage.js`: reimplementa `saveSession`, `loadSession`, `addResult` y `listResults`.

El resto de la aplicación no cambia.
