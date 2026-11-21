// Desarrollo del simulacro (preguntas, temporizador, retroalimentación),
// resultados y revisión. El avance se guarda en cada respuesta y cada pocos segundos.
const Quiz = (() => {
  const $ = (selector) => document.querySelector(selector);
  const quizPanel = $("#quizPanel");
  const resultsPanel = $("#resultsPanel");
  const reviewPanel = $("#reviewPanel");
  const quizTimer = $("#quizTimer");
  const quizTime = $("#quizTime");
  const optionList = $("#optionList");
  const feedbackSlot = $("#feedbackSlot");
  const questionText = $("#questionText");
  const mapGrid = $("#quizMapGrid");
  const finishDialog = $("#finishDialog");
  const reviewList = $("#reviewList");
  const reviewEmpty = $("#reviewEmpty");
  const reviewFilters = document.querySelectorAll(".review-filter");

  const LETTERS = ["A", "B", "C", "D"];
  const SAVE_EVERY = 5;

  let quiz = null;
  let timer = null;
  let clockBase = 0;
  let lastSaved = 0;

  const isPractice = () => quiz.config.mode === "practica";
  const isLocked = (index = quiz.index) => isPractice() && quiz.answers[index] !== null;
  const unanswered = () => quiz.answers.filter((answer) => answer === null).length;

  function persist() {
    if (quiz && !quiz.finished) {
      Store.saveSession(quiz);
      lastSaved = quiz.elapsed;
    }
  }

  // ---- Inicio, reanudación y salida ----

  // context.mix (colección "Preguntas del banco"): se arma el banco eligiendo
  // al azar la misma proporción de cada libro.
  async function launch(context, config) {
    const questions = context.mix
      ? Engine.mixPools(await Repo.getMixPools(context.mix), config.count)
      : await Repo.getQuestions(context.chapterId);
    if (!questions.length) {
      toast("Este capítulo aún no tiene preguntas cargadas.");
      return;
    }
    open(Engine.createSession(config, context, questions));
  }

  function resume() {
    const saved = Store.loadSession();
    if (!saved || saved.finished || !saved.questions || !saved.questions.length) return false;
    open(saved);
    return true;
  }

  function open(session) {
    quiz = session;
    persist();
    Shell.setHeader({
      title: "Simulacro de examen",
      subtitle: `${quiz.bookTitle} · ${quiz.chapterTitle}${quiz.config.block ? ` · ${Engine.blockLabel(quiz.config.block)}` : ""}`,
      onBack: () => requestExit(quiz.bookId ? `#/libro/${quiz.bookId}` : catalogRoute()),
    });
    Shell.show("quiz");
    $("#modeChip").textContent = isPractice() ? "Modo práctica" : "Modo examen";
    $("#modeChip").classList.toggle("is-exam", !isPractice());
    showPanel("questions");
    render();
    startTimer();
    if (location.hash !== "#/simulacro") location.hash = "#/simulacro";
  }

  // Catálogo del área del simulacro (los guardados antes de las áreas vuelven a la portada).
  const catalogRoute = () => (quiz.areaId ? `#/area/${encodeURIComponent(quiz.areaId)}` : "#/");

  function close() {
    stopTimer();
    quiz = null;
    quizTimer.hidden = true;
    if (finishDialog.open) finishDialog.close();
  }

  // Salir conserva el avance para continuarlo desde el inicio.
  async function requestExit(target) {
    if (location.hash !== "#/simulacro") history.replaceState(null, "", "#/simulacro");
    if (quiz.finished) {
      close();
      location.hash = target;
      return;
    }
    const answered = quiz.questions.length - unanswered();
    if (answered > 0) {
      const leave = await confirmDialog({
        title: "¿Salir del simulacro?",
        message: `Llevas ${answered} de ${plural(quiz.questions.length, "pregunta", "preguntas")}. Tu avance queda guardado y podrás continuarlo desde el inicio.`,
        ok: "Salir",
        cancel: "Seguir respondiendo",
      });
      if (!leave || !quiz) return;
      persist();
    } else {
      Store.clearSession();
    }
    close();
    location.hash = target;
  }

  // ---- Temporizador ----

  function startTimer() {
    stopTimer();
    clockBase = Date.now() - quiz.elapsed * 1000;
    quizTimer.hidden = false;
    tick();
    timer = setInterval(tick, 1000);
  }

  function stopTimer() {
    clearInterval(timer);
    timer = null;
  }

  function tick() {
    quiz.elapsed = Math.floor((Date.now() - clockBase) / 1000);
    const remaining = quiz.limit === null ? null : quiz.limit - quiz.elapsed;
    quizTime.textContent = formatTime(remaining === null ? quiz.elapsed : remaining);
    quizTimer.setAttribute("aria-label", remaining === null ? "Tiempo transcurrido" : "Tiempo restante");
    quizTimer.classList.toggle("is-low", remaining !== null && remaining <= 60);
    if (remaining !== null && remaining <= 0) {
      quiz.elapsed = quiz.limit;
      quiz.timedOut = true;
      finish();
    } else if (quiz.elapsed - lastSaved >= SAVE_EVERY) {
      persist();
    }
  }

  // ---- Preguntas ----

  function showPanel(name) {
    quizPanel.hidden = name !== "questions";
    resultsPanel.hidden = name !== "results";
    reviewPanel.hidden = name !== "review";
    quizTimer.hidden = name !== "questions";
    window.scrollTo(0, 0);
  }

  function render() {
    const { questions, index, answers } = quiz;
    const question = questions[index];
    const total = questions.length;
    const answered = total - unanswered();
    const percent = Math.round((answered / total) * 100);
    const locked = isLocked();

    $("#quizPosition").textContent = `Pregunta ${index + 1} de ${total}`;
    $("#quizPercent").textContent = `${percent}%`;
    $("#quizBarFill").style.width = `${percent}%`;
    $("#quizBar").setAttribute("aria-valuenow", String(percent));
    $("#quizBar").setAttribute("aria-valuetext", `${answered} de ${total} respondidas`);
    $("#questionNumber").textContent = index + 1;
    questionText.textContent = question.text;
    $("#repeatChip").hidden = !question.repeat;
    // Por bloque se muestra el número que la pregunta tiene en el banco.
    // En "Preguntas del banco" se muestra de qué libro y capítulo viene.
    $("#questionChapter").textContent = question.source
      ? question.source
      : quiz.config.block && question.number
        ? `${quiz.chapterTitle} · N.º ${question.number} del banco`
        : quiz.chapterTitle;

    optionList.replaceChildren(...question.options.map((_, i) => {
      const button = buildOption("button", question, i, answers[index], locked);
      button.type = "button";
      button.setAttribute("aria-pressed", String(answers[index] === i));
      if (locked) button.setAttribute("aria-disabled", "true");
      button.addEventListener("click", () => choose(i));
      return button;
    }));

    feedbackSlot.replaceChildren(...(locked ? [buildFeedback(question, answers[index], true)] : []));
    renderMap(answered);

    $("#prevButton").disabled = index === 0;
    $("#nextLabel").textContent = index === total - 1 ? "Ver resultados" : "Siguiente";
  }

  function renderMap(answered) {
    $("#quizMapLabel").textContent = `Mapa de preguntas · ${answered} de ${quiz.questions.length} respondidas`;
    mapGrid.replaceChildren(...quiz.questions.map((_, i) => {
      const button = el("button", "map-item", String(i + 1));
      button.type = "button";
      const status = Engine.statusOf(quiz, i);
      if (status !== "blank") button.classList.add(isPractice() ? `is-${status}` : "is-answered");
      if (quiz.questions[i].repeat) button.classList.add("is-repeat");
      if (i === quiz.index) {
        button.classList.add("is-current");
        button.setAttribute("aria-current", "step");
      }
      button.setAttribute("aria-label",
        `Pregunta ${i + 1}${quiz.questions[i].repeat ? " (repaso)" : ""}${status === "blank" ? ", sin responder" : ", respondida"}`);
      button.addEventListener("click", () => goTo(i));
      return button;
    }));
  }

  // Alternativa con su letra; si está corregida, marca correcta/incorrecta.
  function buildOption(tag, question, i, chosen, reveal) {
    const option = el(tag, "option");
    option.append(
      el("span", "option-letter", LETTERS[i]),
      el("span", "option-text", question.options[i]),
      el("span", "option-badge"),
      el("span", "option-mark")
    );
    option.lastChild.setAttribute("aria-hidden", "true");
    if (reveal && i === question.answer) {
      option.classList.add("is-correct");
      option.querySelector(".option-badge").textContent = "Correcta";
      option.lastChild.innerHTML = ICONS.check;
    } else if (reveal && chosen === i) {
      option.classList.add("is-wrong");
      option.querySelector(".option-badge").textContent = "Incorrecta";
      option.lastChild.innerHTML = ICONS.cross;
    } else if (chosen === i) {
      option.classList.add("is-selected");
    }
    return option;
  }

  // live: retroalimentación durante el simulacro (avisa si la pregunta volverá).
  function buildFeedback(question, chosen, live = false) {
    const status = chosen === null ? "blank" : chosen === question.answer ? "correct" : "wrong";
    const letter = LETTERS[question.answer];
    const box = el("div", "feedback");

    const verdict = el("p", `feedback-verdict is-${status}`);
    verdict.innerHTML = status === "correct" ? ICONS.check : ICONS.cross;
    verdict.append(el("span", "", {
      correct: "¡Respuesta correcta!",
      wrong: `Respuesta incorrecta. La respuesta correcta es la ${letter}.`,
      blank: `Sin responder. La respuesta correcta es la ${letter}.`,
    }[status]));

    const legal = el("div", "feedback-legal");
    const head = el("div", "feedback-legal-head");
    const badge = el("span", "feedback-legal-icon");
    badge.innerHTML = ICONS.legal;
    head.append(badge, el("h3", "", "Sustento"));
    const body = el("div", "feedback-legal-body");
    if (question.explanation) body.append(labeled("Fundamentación", question.explanation));
    if (question.legal) body.append(labeled("Referencia", question.legal));
    if (!question.explanation && !question.legal) {
      body.append(
        labeled("Respuesta correcta", `${letter}) ${question.options[question.answer]}`),
        el("p", "feedback-missing", "Esta pregunta aún no tiene fundamentación ni referencia registradas en el banco de preguntas.")
      );
    }
    legal.append(head, body);
    box.append(verdict);
    if (live && status === "wrong" && question.requeued) {
      box.append(el("p", "feedback-requeue", "Esta pregunta volverá a aparecer al final, hasta que la respondas correctamente."));
    }
    box.append(legal);
    return box;
  }

  function labeled(label, text) {
    const paragraph = el("p");
    paragraph.append(el("strong", "", `${label}: `), document.createTextNode(text));
    return paragraph;
  }

  function choose(i) {
    if (isLocked()) return;
    quiz.answers[quiz.index] = i;
    if (isPractice() && quiz.config.retryWrong && i !== quiz.questions[quiz.index].answer) {
      Engine.requeue(quiz, quiz.index);
    }
    persist();
    render();
    const feedback = feedbackSlot.firstElementChild;
    if (feedback) feedback.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  function goTo(index) {
    if (index < 0 || index >= quiz.questions.length) return;
    quiz.index = index;
    persist();
    render();
    window.scrollTo(0, 0);
    questionText.focus({ preventScroll: true });
  }

  // ---- Finalización y resultados ----

  async function requestFinish() {
    // Con "volver a preguntar las falladas", no se finaliza mientras queden
    // repasos sin responder (salvo que se agote el tiempo).
    const pending = quiz.config.retryWrong ? Engine.pendingRepeats(quiz) : [];
    if (pending.length) {
      const go = await confirmDialog({
        title: "Aún hay preguntas por corregir",
        message: `Te ${pending.length === 1 ? "falta" : "faltan"} ${plural(pending.length, "pregunta fallada", "preguntas falladas")} por responder correctamente. El simulacro finaliza cuando todas estén correctas.`,
        ok: "Ir a la pendiente",
        cancel: "Seguir aquí",
      });
      if (go && quiz && !quiz.finished) goTo(pending[0]);
      return;
    }
    const { blank, answered } = Engine.grade(quiz);
    $("#finishMessage").textContent = blank
      ? `Tienes ${plural(blank, "pregunta sin responder", "preguntas sin responder")}, que no sumarán puntos. ¿Deseas finalizar y ver tus resultados?`
      : "Respondiste todas las preguntas. ¿Deseas finalizar y ver tus resultados?";
    $("#finishAnswered").textContent = answered;
    $("#finishBlank").textContent = blank;
    $("#finishBlankBox").classList.toggle("has-blank", blank > 0);
    finishDialog.showModal();
  }

  function finish() {
    stopTimer();
    if (finishDialog.open) finishDialog.close();
    quiz.finished = true;
    const result = Engine.grade(quiz);
    Store.clearSession();
    Store.addResult({
      id: quiz.id,
      date: new Date().toISOString(),
      bookId: quiz.bookId,
      bookTitle: quiz.bookTitle,
      chapterId: quiz.chapterId,
      chapterTitle: quiz.chapterTitle + (quiz.config.block ? ` (${Engine.blockLabel(quiz.config.block)})` : ""),
      mode: quiz.config.mode,
      total: result.total,
      correct: result.correct,
      wrong: result.wrong,
      blank: result.blank,
      score: result.score,
      level: result.level.name,
      tone: result.level.tone,
      elapsed: quiz.elapsed,
      timedOut: quiz.timedOut,
    });
    renderResults(result);
    showPanel("results");
  }

  function renderResults(result) {
    const mode = isPractice() ? "Modo práctica" : "Modo examen";
    $("#scoreRing").style.setProperty("--score", result.score);
    $("#scoreRing").dataset.tone = result.level.tone;
    $("#scoreValue").textContent = result.score;
    $("#resultsTitle").textContent = quiz.timedOut ? "Tiempo agotado" : "Simulacro finalizado";
    $("#levelBadge").textContent = result.level.name;
    $("#levelBadge").dataset.tone = result.level.tone;
    const repeats = Engine.repeatSummary(quiz);
    $("#resultsNote").textContent =
      `${mode}${quiz.config.block ? ` · ${Engine.blockLabel(quiz.config.block)}` : ""} · ` +
      `${result.correct} de ${result.total} respuestas correctas (${result.percent}%)` +
      (repeats.total ? ` · Repasos: ${repeats.correct} de ${repeats.total} acertados` : "");
    $("#statCorrect").textContent = result.correct;
    $("#statWrong").textContent = result.wrong;
    $("#statBlank").textContent = result.blank;
    $("#statTime").textContent = formatTime(quiz.elapsed);
  }

  // ---- Revisión ----

  function showReview() {
    const result = Engine.grade(quiz);
    // Se revisan las preguntas calificadas; los repasos no se listan.
    let number = 0;
    const items = quiz.questions.flatMap((question, index) => {
      if (question.repeat) return [];
      number++;
      const chosen = quiz.answers[index];
      const status = Engine.statusOf(quiz, index);
      const item = el("li", `review-item is-${status}`);
      const head = el("div", "review-item-head");
      head.append(
        el("span", "question-number", String(number)),
        el("span", "review-status", { correct: "Correcta", wrong: "Incorrecta", blank: "Sin responder" }[status])
      );
      const options = el("div", "option-list");
      options.append(...question.options.map((_, i) => buildOption("div", question, i, chosen, true)));
      item.append(head, el("h3", "question-text", question.text), options, buildFeedback(question, chosen));
      return item;
    });

    $("#reviewSummary").textContent =
      `${result.correct} de ${result.total} respuestas correctas · ${result.blank} sin responder`;
    $("#filterAll").textContent = result.total;
    $("#filterCorrect").textContent = result.correct;
    $("#filterWrong").textContent = result.wrong;
    $("#filterBlank").textContent = result.blank;
    reviewList.replaceChildren(...items);
    filterReview("all");
    showPanel("review");
  }

  const EMPTY_FILTER = {
    correct: "No tienes respuestas correctas en este simulacro.",
    wrong: "No tienes respuestas incorrectas.",
    blank: "Respondiste todas las preguntas.",
  };

  function filterReview(filter) {
    let visible = 0;
    reviewList.querySelectorAll(".review-item").forEach((item) => {
      const show = filter === "all" || item.classList.contains(`is-${filter}`);
      item.hidden = !show;
      if (show) visible++;
    });
    reviewFilters.forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.filter === filter)));
    reviewEmpty.hidden = visible > 0;
    reviewEmpty.textContent = EMPTY_FILTER[filter] || "";
  }

  // ---- Eventos ----

  $("#prevButton").addEventListener("click", () => goTo(quiz.index - 1));
  $("#nextButton").addEventListener("click", () => {
    if (quiz.index === quiz.questions.length - 1) requestFinish();
    else goTo(quiz.index + 1);
  });
  $("#finishButton").addEventListener("click", requestFinish);
  $("#finishCancel").addEventListener("click", () => finishDialog.close());
  $("#finishConfirm").addEventListener("click", finish);
  closeOnBackdrop(finishDialog);

  $("#reviewButton").addEventListener("click", showReview);
  $("#reviewBack").addEventListener("click", () => showPanel("results"));
  $("#retryButton").addEventListener("click", () => {
    const { bookId, bookTitle, chapterId, chapterTitle, mix, areaId, config } = quiz;
    close();
    launch({ bookId, bookTitle, chapterId, chapterTitle, mix, areaId }, config);
  });
  $("#homeButton").addEventListener("click", () => requestExit(catalogRoute()));
  reviewFilters.forEach((button) => button.addEventListener("click", () => filterReview(button.dataset.filter)));

  // Guarda el tiempo al ocultar o cerrar la pestaña.
  document.addEventListener("visibilitychange", () => { if (document.hidden) persist(); });
  window.addEventListener("pagehide", persist);

  // Atajos: A-D o 1-4 para responder, flechas para navegar.
  document.addEventListener("keydown", (event) => {
    if (!quiz || quiz.finished || quizPanel.hidden) return;
    if (event.ctrlKey || event.metaKey || event.altKey || document.querySelector("dialog[open]")) return;
    if (event.target.closest("input, select, textarea, summary")) return;
    const key = event.key.toLowerCase();
    const option = "abcd".includes(key) ? "abcd".indexOf(key) : "1234".indexOf(key);
    if (key.length === 1 && option >= 0) choose(option);
    else if (event.key === "ArrowRight") goTo(quiz.index + 1);
    else if (event.key === "ArrowLeft") goTo(quiz.index - 1);
  });

  return {
    launch,
    resume,
    requestExit,
    close,
    isActive: () => quiz !== null,
    isRunning: () => quiz !== null && !quiz.finished,
  };
})();
