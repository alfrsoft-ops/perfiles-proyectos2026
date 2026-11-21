// Acceso a áreas, libros, capítulos y preguntas. Hoy lee data/catalogo.js y
// data/preguntas.js; para usar una base de datos o una API basta con reimplementar
// estas funciones (por ejemplo con fetch), que ya devuelven promesas.
const Repo = (() => {
  const catalog = window.CATALOG || { books: [] };
  const bank = window.QUESTION_BANK || {};
  const DEFAULT_AREA = "tecnico-pedagogico";

  const countQuestions = (chapterId) => (bank[chapterId] || []).length;
  const areaOf = (item) => item.area || DEFAULT_AREA;
  const inArea = (areaId) => (item) => !areaId || areaOf(item) === areaId;

  function withCounts(book) {
    const chapters = book.chapters.map((chapter) => ({ ...chapter, total: countQuestions(chapter.id) }));
    return { ...book, area: areaOf(book), chapters, total: chapters.reduce((sum, chapter) => sum + chapter.total, 0) };
  }

  // Un elemento de "mix" es un libro (todos sus capítulos) o un capítulo suelto.
  function mixChapters(id) {
    const book = catalog.books.find((item) => item.id === id);
    if (book) return book.chapters.map((chapter) => ({ book, chapter }));
    const owner = catalog.books.find((item) => item.chapters.some((chapter) => chapter.id === id));
    return owner ? [{ book: owner, chapter: owner.chapters.find((chapter) => chapter.id === id) }] : [];
  }

  // Tarjetas de la portada, con la cantidad de libros y preguntas de cada área.
  function areaWithCounts(area) {
    const books = catalog.books.filter(inArea(area.id)).map(withCounts);
    return { ...area, books: books.length, total: books.reduce((sum, book) => sum + book.total, 0) };
  }

  return {
    async listAreas() {
      return (catalog.areas || []).map(areaWithCounts);
    },
    async getArea(areaId) {
      const area = (catalog.areas || []).find((item) => item.id === areaId);
      return area ? areaWithCounts(area) : null;
    },
    async listBooks(areaId) {
      return catalog.books.filter(inArea(areaId)).map(withCounts);
    },
    async getBook(bookId) {
      const book = catalog.books.find((item) => item.id === bookId);
      return book ? withCounts(book) : null;
    },
    async getQuestions(chapterId) {
      return (bank[chapterId] || []).map((question) => ({ ...question, options: [...question.options] }));
    },
    // Botones bajo el catálogo de un área. Las de "mix" suman las preguntas de sus libros.
    async listCollections(areaId) {
      return (catalog.collections || []).filter(inArea(areaId)).map((item) => {
        const total = item.mix
          ? item.mix.flatMap(mixChapters).reduce((sum, { chapter }) => sum + countQuestions(chapter.id), 0)
          : countQuestions(item.id);
        return { ...item, area: areaOf(item), total };
      });
    },
    // Preguntas de cada elemento de una colección "mix" (una lista por libro o
    // capítulo), marcadas con su procedencia para mostrarla durante el simulacro.
    async getMixPools(ids) {
      return ids.map((id) => mixChapters(id).flatMap(({ book, chapter }) => (bank[chapter.id] || []).map((question) => ({
        ...question,
        options: [...question.options],
        source: `${book.name} · ${chapter.title}`,
      }))));
    },
  };
})();
