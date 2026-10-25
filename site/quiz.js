(() => {
  "use strict";

  const HISTORY_PREFIX = "vardywatch.quiz.v1:";
  const editionPattern = /^\d{4}-\d{2}-\d{2}$/;
  const revisionPattern = /^[a-f0-9]+$/i;
  const nonempty = (value) => typeof value === "string" && value.trim().length > 0;
  const validDay = (value) => editionPattern.test(value)
    && Number.isFinite(Date.parse(value))
    && new Date(value).toISOString().slice(0, 10) === value;
  const validTimestamp = (value) => typeof value === "string"
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    && validDay(value.slice(0, 10)) && Number.isFinite(Date.parse(value));

  function validateQuiz(quiz) {
    const fail = (message) => { throw new Error(`Invalid quiz: ${message}`); };
    if (!quiz || quiz.schemaVersion !== 1) fail("unsupported schema version.");
    if (!validDay(quiz.edition) || !revisionPattern.test(quiz.revision)
      || typeof quiz.revision !== "string") fail("invalid edition or revision.");
    if (!nonempty(quiz.title)) fail("missing title.");
    if (![quiz.publishedAt, quiz.coverageStart, quiz.coverageEndExclusive].every(validTimestamp)
      || Date.parse(quiz.coverageStart) >= Date.parse(quiz.coverageEndExclusive)) {
      fail("invalid publication or coverage dates.");
    }
    if (!Array.isArray(quiz.questions) || quiz.questions.length < 5 || quiz.questions.length > 10) {
      fail("expected 5–10 questions.");
    }
    const ids = new Set();
    for (const question of quiz.questions) {
      if (!question || !nonempty(question.id) || ids.has(question.id)
        || !nonempty(question.prompt) || !nonempty(question.explanation)
        || !Array.isArray(question.options) || question.options.length !== 4
        || !question.options.every(nonempty) || new Set(question.options).size !== 4
        || !question.options.includes(question.answer)) fail("invalid question or answer.");
      ids.add(question.id);
    }
    return quiz;
  }

  function shuffle(options, random) {
    const shuffled = [...options];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const other = Math.floor(random() * (index + 1));
      [shuffled[index], shuffled[other]] = [shuffled[other], shuffled[index]];
    }
    return shuffled;
  }

  function createAttempt(quiz, random = Math.random) {
    validateQuiz(quiz);
    return {
      quiz, index: 0, score: 0, answers: [], completed: false,
      options: quiz.questions.map((question) => shuffle(question.options, random)),
    };
  }

  function answerQuestion(attempt, answer) {
    if (attempt.completed || attempt.answers.length !== attempt.index) {
      throw new Error("This question has already been answered.");
    }
    const question = attempt.quiz.questions[attempt.index];
    if (!question.options.includes(answer)) throw new Error("Choose one of the four options.");
    const correct = answer === question.answer;
    attempt.answers.push(answer);
    if (correct) attempt.score += 1;
    attempt.completed = attempt.answers.length === attempt.quiz.questions.length;
    return { correct, answer: question.answer, explanation: question.explanation };
  }

  function nextQuestion(attempt) {
    if (attempt.completed || attempt.answers.length !== attempt.index + 1) {
      throw new Error("Answer the current question before continuing.");
    }
    attempt.index += 1;
  }

  function historyKey(edition, revision) {
    return `${HISTORY_PREFIX}${edition}:${revision}`;
  }

  function parseHistory(raw, key) {
    const history = JSON.parse(raw);
    if (!history || !validDay(history.edition) || typeof history.revision !== "string"
      || !revisionPattern.test(history.revision)
      || historyKey(history.edition, history.revision) !== key
      || !Array.isArray(history.attempts) || !history.attempts.length
      || !history.attempts.every((attempt) => attempt && validTimestamp(attempt.completedAt)
        && Number.isInteger(attempt.total) && attempt.total >= 5 && attempt.total <= 10
        && Number.isInteger(attempt.score) && attempt.score >= 0 && attempt.score <= attempt.total)
      || new Set(history.attempts.map((attempt) => attempt.total)).size !== 1) {
      throw new Error("Malformed quiz history.");
    }
    return history;
  }

  function saveCompletedAttempt(getStorage, attempt, now = () => new Date()) {
    if (!attempt.completed) throw new Error("Only completed attempts can be saved.");
    try {
      const storage = getStorage();
      const { edition, revision } = attempt.quiz;
      const key = historyKey(edition, revision);
      const raw = storage.getItem(key);
      const history = raw === null ? { edition, revision, attempts: [] } : parseHistory(raw, key);
      const total = attempt.quiz.questions.length;
      if (history.attempts.some((record) => record.total !== total)) {
        throw new Error("Question count differs for this immutable revision.");
      }
      history.attempts.push({ completedAt: now().toISOString(), score: attempt.score, total });
      storage.setItem(key, JSON.stringify(history));
      return { saved: true };
    } catch (error) {
      return { saved: false, error: `Score was not saved on this device: ${error.message}` };
    }
  }

  function readHistory(getStorage) {
    const groups = [];
    const errors = [];
    try {
      const storage = getStorage();
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        if (!key || !key.startsWith(HISTORY_PREFIX)) continue;
        try {
          groups.push(parseHistory(storage.getItem(key), key));
        } catch (error) {
          errors.push(`Could not read quiz history (${key}): ${error.message}`);
        }
      }
    } catch (error) {
      errors.push(`Quiz history is unavailable on this device: ${error.message}`);
    }
    groups.sort((a, b) => b.edition.localeCompare(a.edition) || a.revision.localeCompare(b.revision));
    return { groups, errors };
  }

  function clearHistory(getStorage) {
    try {
      const storage = getStorage();
      const keys = [];
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        if (key && key.startsWith(HISTORY_PREFIX)) keys.push(key);
      }
      for (const key of keys) storage.removeItem(key);
      return { cleared: true };
    } catch (error) {
      return { cleared: false, error: `Quiz history could not be fully cleared: ${error.message}` };
    }
  }

  function mount(document, fetchQuiz, getStorage) {
    const player = document.querySelector("#quiz-player");
    let history = document.querySelector("#quiz-history");
    if (!player && !history) return;

    function node(tag, text, className) {
      const element = document.createElement(tag);
      if (text !== undefined) element.textContent = text;
      if (className) element.className = className;
      return element;
    }

    function button(text, action, className) {
      const element = node("button", text, className);
      element.type = "button";
      element.addEventListener("click", action);
      return element;
    }

    function status(text, error = false) {
      const element = node("p", text, error ? "quiz-error" : "quiz-status");
      element.setAttribute("role", error ? "alert" : "status");
      return element;
    }

    let game;
    if (player) {
      game = node("div", undefined, "quiz-game");
      player.replaceChildren(game);
      game.append(status("Loading quiz..."));
      if (!history) {
        history = node("section");
        history.id = "quiz-history";
        player.append(history);
      }
    }

    function renderHistory(message) {
      const { groups, errors } = readHistory(getStorage);
      history.replaceChildren(node("h2", "Scores on this device"));
      history.append(node("p", "Completed attempts only, stored in this browser. Editions and revisions have separate scores."));
      if (message) history.append(status(message.text, message.error));
      for (const error of errors) history.append(status(error, true));
      if (!groups.length && !errors.length) history.append(node("p", "No completed attempts saved on this device."));
      for (const group of groups) {
        const section = node("section", undefined, "quiz-history-group");
        section.append(node("h3", `${group.edition} · revision ${group.revision}`));
        const attempts = [...group.attempts].reverse()
          .sort((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt));
        const latest = attempts[0];
        const best = attempts.reduce((score, record) => Math.max(score, record.score), 0);
        section.append(node("p", `Latest: ${latest.score}/${latest.total} · Best: ${best}/${latest.total} · Completed attempts: ${attempts.length}`));
        const details = node("details");
        details.append(node("summary", "All completed attempts"));
        const list = node("ol");
        for (const record of attempts) {
          const item = node("li");
          const time = node("time", new Date(record.completedAt).toLocaleString());
          time.dateTime = record.completedAt;
          item.append(time, node("span", ` — ${record.score}/${record.total}`));
          list.append(item);
        }
        details.append(list);
        section.append(details);
        history.append(section);
      }
      const clear = button("Clear quiz history on this device", () => {
        const result = clearHistory(getStorage);
        renderHistory(result.cleared
          ? { text: "Quiz history cleared on this device." }
          : { text: result.error, error: true });
        history.querySelector("button").focus();
      }, "quiz-action");
      history.append(clear);
    }

    renderHistory();
    if (!player) return;

    let attempt;
    let saveResult;
    function renderQuestion(focus = true) {
      const question = attempt.quiz.questions[attempt.index];
      game.replaceChildren();
      const progress = node("h2", `Question ${attempt.index + 1} of ${attempt.quiz.questions.length}`);
      progress.tabIndex = -1;
      const fieldset = node("fieldset");
      fieldset.append(node("legend", question.prompt));
      const options = node("div", undefined, "quiz-options");
      const feedback = status("");
      feedback.setAttribute("aria-live", "polite");
      feedback.setAttribute("aria-atomic", "true");
      feedback.tabIndex = -1;
      const controls = node("div", undefined, "quiz-controls");
      for (const option of attempt.options[attempt.index]) {
        const choice = button(option, () => {
          const result = answerQuestion(attempt, option);
          for (const child of options.children) child.disabled = true;
          choice.textContent = `${option} — your answer`;
          feedback.textContent = `${result.correct ? "Correct." : "Not quite."} Correct answer: ${result.answer}. ${result.explanation}`;
          if (attempt.completed) {
            saveResult = saveCompletedAttempt(getStorage, attempt);
            controls.append(status(saveResult.saved
              ? "Completed attempt saved on this device." : saveResult.error, !saveResult.saved));
            renderHistory();
          }
          controls.append(button(attempt.completed ? "See final score" : "Next question", () => {
            if (attempt.completed) renderScore();
            else {
              nextQuestion(attempt);
              renderQuestion();
            }
          }, "quiz-action"));
          feedback.focus();
        }, "quiz-option");
        options.append(choice);
      }
      fieldset.append(options);
      game.append(progress, fieldset, feedback, controls);
      if (focus) progress.focus();
    }

    function renderScore() {
      const heading = node("h2", `Final score: ${attempt.score}/${attempt.quiz.questions.length}`);
      heading.tabIndex = -1;
      game.replaceChildren(heading, status(saveResult.saved
        ? "Completed attempt saved on this device." : saveResult.error, !saveResult.saved));
      game.append(button("Play again", () => {
        attempt = createAttempt(attempt.quiz);
        saveResult = undefined;
        renderQuestion();
      }, "quiz-action"));
      heading.focus();
    }

    return (async () => {
      try {
        const response = await fetchQuiz(player.dataset.quizSrc);
        if (!response.ok) throw new Error(`Quiz request failed (HTTP ${response.status}).`);
        const quiz = validateQuiz(await response.json());
        const source = new URL(player.dataset.quizSrc, document.baseURI);
        if (source.pathname !== `/quiz/data/${quiz.edition}-${quiz.revision}.json`) {
          throw new Error("Quiz edition or revision does not match this page.");
        }
        attempt = createAttempt(quiz);
        renderQuestion(false);
      } catch (error) {
        game.replaceChildren(status(`Unable to load this quiz. ${error.message} Please reload to try again.`, true));
      }
    })();
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      validateQuiz, createAttempt, answerQuestion, nextQuestion, historyKey,
      saveCompletedAttempt, readHistory, clearHistory, mount,
    };
  }
  if (typeof document !== "undefined") {
    mount(document, (source) => fetch(source), () => window.localStorage);
  }
})();
