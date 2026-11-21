// Lógica del simulacro sin dependencias de la interfaz: armado de la sesión,
// límite de tiempo, calificación y nivel de dominio.
const Engine = (() => {
  const SECONDS_PER_QUESTION = 90;

  // Escala orientativa de dominio (puntaje sobre 100).
  const LEVELS = [
    { min: 90, name: "Dominio sobresaliente", tone: "excellent" },
    { min: 80, name: "Dominio alto", tone: "high" },
    { min: 70, name: "Dominio satisfactorio", tone: "good" },
    { min: 60, name: "Dominio básico", tone: "basic" },
    { min: 0, name: "Requiere reforzamiento", tone: "low" },
  ];

  function shuffle(list) {
    const copy = [...list];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function normalize(text) {
    return String(text).normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/\s+/g, " ").trim().toLowerCase();
  }

  // Descarta preguntas repetidas por id o por enunciado.
  function uniqueQuestions(questions) {
    const seen = new Set();
    return questions.filter((question) => {
      const keys = [`id:${question.id}`, `q:${normalize(question.q)}`];
      if (keys.some((key) => seen.has(key))) return false;
      keys.forEach((key) => seen.add(key));
      return true;
    });
  }

  // "auto" = 1,5 min por pregunta, "none" = sin límite, número = minutos.
  function timeLimit(time, count) {
    if (time === "none") return null;
    if (time === "auto") return count * SECONDS_PER_QUESTION;
    const minutes = Number(time);
    return minutes > 0 ? Math.round(minutes * 60) : null;
  }

  // Ajusta las letras citadas en la retroalimentación ("La alternativa B…",
  // "… porque A: …. C: ….") al nuevo orden de las alternativas.
  // order[nueva posición] = posición original.
  function relabel(text, order) {
    if (!text || order.every((original, i) => original === i)) return text;
    const letters = "ABCD";
    const map = (letter) => letters[order.indexOf(letters.indexOf(letter))] || letter;
    const out = text
      .replace(/\b(alternativas?\s+)([A-D])\b/g, (_, prefix, letter) => prefix + map(letter))
      .replace(/(^|\s)([A-D]):(?=\s)/g, (_, space, letter) => space + map(letter) + ":");
    // Reordena alfabéticamente la lista final "X: motivo. Y: motivo."
    const start = out.search(/(^|\s)[A-D]: /);
    if (start < 0) return out;
    const items = out.slice(start).trim().split(/\s(?=[A-D]: )/);
    if (!items.every((item) => /^[A-D]: /.test(item))) return out;
    return out.slice(0, start) + (start ? " " : "") + items.sort().join(" ");
  }

  // Bloques de preguntas en el orden de creación del banco: 1–25, 26–50, …
  const BLOCK_SIZE = 25;

  function blocks(total) {
    const list = [];
    for (let start = 1; start <= total; start += BLOCK_SIZE) {
      const end = Math.min(start + BLOCK_SIZE - 1, total);
      list.push({ value: `${start}-${end}`, start, end });
    }
    return list;
  }

  // "26-50" -> { start: 26, end: 50 }; null si no hay bloque.
  function parseBlock(block) {
    const match = /^(\d+)-(\d+)$/.exec(block || "");
    return match ? { start: Number(match[1]), end: Number(match[2]) } : null;
  }

  // Reparte "count" preguntas en partes iguales entre las listas (25 % de cada
  // una si son 4); el resto se asigna al azar. Dentro de cada lista se eligen
  // al azar. Devuelve las elegidas agrupadas por lista, en el orden de las listas.
  function mixPools(pools, count) {
    const usable = pools.filter((pool) => pool.length);
    if (!usable.length) return [];
    const quotas = usable.map(() => Math.floor(count / usable.length));
    shuffle(usable.map((_, i) => i)).slice(0, count % usable.length).forEach((i) => quotas[i]++);
    return usable.flatMap((pool, i) => shuffle(uniqueQuestions(pool)).slice(0, quotas[i]));
  }

  function blockLabel(block) {
    const range = parseBlock(block);
    return range ? `Preguntas ${range.start} a ${range.end}` : "";
  }

  // config: { mode, count, time, shuffleQuestions, shuffleOptions, retryWrong, block }
  // context: { bookId, bookTitle, chapterId, chapterTitle }
  // Con bloque, solo se usan sus preguntas: en el orden del banco o, con orden
  // aleatorio, mezcladas dentro del bloque.
  function createSession(config, context, bank) {
    const block = parseBlock(config.block);
    const numbered = bank.map((question, i) => ({ ...question, number: i + 1 }));
    const pool = uniqueQuestions(block ? numbered.slice(block.start - 1, block.end) : numbered);
    const source = config.shuffleQuestions ? shuffle(pool) : pool;
    const questions = source.slice(0, Math.max(1, config.count)).map((question) => {
      const natural = question.options.map((_, i) => i);
      const order = config.shuffleOptions ? shuffle(natural) : natural;
      return {
        id: question.id,
        number: question.number,
        source: question.source,
        text: question.q,
        options: order.map((i) => question.options[i]),
        answer: order.indexOf(question.answer),
        explanation: relabel(question.explanation || "", order),
        legal: question.legal || "",
      };
    });

    return {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      config: { ...config },
      ...context,
      questions,
      answers: Array(questions.length).fill(null),
      index: 0,
      elapsed: 0,
      limit: timeLimit(config.time, questions.length),
      startedOn: new Date().toISOString(),
      finished: false,
      timedOut: false,
    };
  }

  // "Volver a preguntar las falladas": agrega una copia de la pregunta al final
  // (con las alternativas mezcladas de nuevo si corresponde). Se repite cada
  // vez que se falla, hasta acertarla. Las copias tienen "repeat" y no cuentan
  // en la calificación.
  function requeue(session, index) {
    const question = session.questions[index];
    const repeats = session.questions.filter((q) => q.id === question.id && q.repeat).length;
    if (question.requeued) return false;
    const natural = question.options.map((_, i) => i);
    const order = session.config.shuffleOptions ? shuffle(natural) : natural;
    const copy = {
      id: question.id,
      number: question.number,
      source: question.source,
      text: question.text,
      options: order.map((i) => question.options[i]),
      answer: order.indexOf(question.answer),
      explanation: relabel(question.explanation, order),
      legal: question.legal,
      repeat: repeats + 1,
    };
    session.questions.push(copy);
    session.answers.push(null);
    question.requeued = true;
    if (session.config.time === "auto" && session.limit !== null) session.limit += SECONDS_PER_QUESTION;
    return true;
  }

  // Posiciones de los repasos que aún no se respondieron.
  function pendingRepeats(session) {
    return session.questions.map((_, i) => i)
      .filter((i) => session.questions[i].repeat && session.answers[i] === null);
  }

  // Resumen de los repasos: cuántas copias hubo y cuántas se acertaron.
  function repeatSummary(session) {
    const repeated = session.questions.map((q, i) => i).filter((i) => session.questions[i].repeat);
    return {
      total: repeated.length,
      correct: repeated.filter((i) => statusOf(session, i) === "correct").length,
    };
  }

  function statusOf(session, index) {
    const chosen = session.answers[index];
    if (chosen === null) return "blank";
    return chosen === session.questions[index].answer ? "correct" : "wrong";
  }

  function levelFor(score) {
    return LEVELS.find((level) => score >= level.min);
  }

  // Solo se califican las preguntas originales (no los repasos).
  function grade(session) {
    const originals = session.questions.map((_, i) => i).filter((i) => !session.questions[i].repeat);
    const total = originals.length;
    let correct = 0;
    let blank = 0;
    originals.forEach((i) => {
      const status = statusOf(session, i);
      if (status === "correct") correct++;
      if (status === "blank") blank++;
    });
    // Aritmética entera: se trunca para no subir de nivel por redondeo.
    const score = total ? Math.floor((correct * 100) / total) : 0;
    return {
      total,
      correct,
      wrong: total - correct - blank,
      blank,
      answered: total - blank,
      score,
      percent: score,
      level: levelFor(score),
    };
  }

  return { SECONDS_PER_QUESTION, LEVELS, shuffle, normalize, uniqueQuestions, relabel, timeLimit, BLOCK_SIZE, blocks, parseBlock, blockLabel, mixPools, createSession, requeue, pendingRepeats, repeatSummary, statusOf, levelFor, grade };
})();

if (typeof module !== "undefined") module.exports = Engine;
