(() => {
  "use strict";

  const HISTORY_PREFIX = "vardywatch.quiz.v1:";
  const ATTEMPT_PREFIX = "vardywatch.quiz.v2:";
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
      quiz: JSON.parse(JSON.stringify(quiz)), index: 0, score: 0, answers: [], completed: false,
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

  function attemptKey(edition) {
    return `${ATTEMPT_PREFIX}${edition}`;
  }

  function parseAttempt(raw, key) {
    const record = JSON.parse(raw);
    if (!record || record.schemaVersion !== 2) throw new Error("Malformed saved quiz attempt.");
    validateQuiz(record.quiz);
    const { quiz, options, answers } = record;
    if (attemptKey(quiz.edition) !== key || !validTimestamp(record.startedAt)
      || !Array.isArray(options) || options.length !== quiz.questions.length
      || !options.every((order, index) => Array.isArray(order) && order.length === 4
        && new Set(order).size === 4 && order.every((option) => quiz.questions[index].options.includes(option)))
      || !Array.isArray(answers) || answers.length > quiz.questions.length
      || !answers.every((answer, index) => quiz.questions[index].options.includes(answer))
      || !Number.isInteger(record.score)
      || record.score !== answers.reduce((score, answer, index) => score + (answer === quiz.questions[index].answer ? 1 : 0), 0)
      || typeof record.completed !== "boolean" || record.completed !== (answers.length === quiz.questions.length)
      || (record.completed ? !validTimestamp(record.completedAt)
        || Date.parse(record.completedAt) < Date.parse(record.startedAt) : record.completedAt !== null)) {
      throw new Error("Malformed saved quiz attempt.");
    }
    return { ...record, index: Math.min(answers.length, quiz.questions.length - 1) };
  }

  function serializeAttempt(attempt) {
    const { index, ...record } = attempt;
    return JSON.stringify(record);
  }

  function editionState(storage, edition) {
    const key = attemptKey(edition);
    const raw = storage.getItem(key);
    const attempt = raw === null ? null : parseAttempt(raw, key);
    const completions = [];
    for (let index = 0; index < storage.length; index += 1) {
      const legacyKey = storage.key(index);
      if (!legacyKey || !legacyKey.startsWith(`${HISTORY_PREFIX}${edition}:`)) continue;
      const group = parseHistory(storage.getItem(legacyKey), legacyKey);
      completions.push(...group.attempts);
    }
    if (attempt?.completed) completions.push({
      score: attempt.score, total: attempt.quiz.questions.length,
      completedAt: attempt.completedAt, attempt,
    });
    const latest = completions.reduce((best, record) => !best
      || Date.parse(record.completedAt) >= Date.parse(best.completedAt) ? record : best, null);
    return { raw, attempt, latest };
  }

  function readHistory(getStorage) {
    const groups = [];
    const errors = [];
    try {
      const storage = getStorage();
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        if (!key || (!key.startsWith(HISTORY_PREFIX) && !key.startsWith(ATTEMPT_PREFIX))) continue;
        try {
          if (key.startsWith(HISTORY_PREFIX)) groups.push(parseHistory(storage.getItem(key), key));
          else {
            const attempt = parseAttempt(storage.getItem(key), key);
            if (attempt.completed) groups.push({
              edition: attempt.quiz.edition, revision: attempt.quiz.revision,
              attempts: [{ completedAt: attempt.completedAt, score: attempt.score, total: attempt.quiz.questions.length }],
            });
          }
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

  function mount(document, fetchQuiz, getStorage, eventTarget = document.defaultView) {
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
      history.append(node("p", "Completed attempts only, stored in this browser. One attempt per edition; older scores are retained."));
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
    }

    renderHistory();
    let attempt;
    let token = null;
    let edition;
    let loadedQuiz;
    let selected;
    let blocked = false;
    let completionToken = null;

    function completionIdentity(record) {
      return record ? JSON.stringify([record.completedAt, record.score, record.total, Boolean(record.attempt)]) : null;
    }

    function fail(error) {
      blocked = true;
      game.replaceChildren(status(`Unable to use this quiz. ${error.message} Saved data has not been reset. Please reload to try again.`, true));
    }

    function synchronize(preserveUnchanged = false) {
      renderHistory();
      if (!player || !edition || blocked) return;
      try {
        const state = editionState(getStorage(), edition);
        if (token !== null && state.raw === null) throw new Error("The saved attempt was removed in another tab. This tab cannot restore it.");
        const latestToken = completionIdentity(state.latest);
        if (preserveUnchanged && state.raw === token && latestToken === completionToken) return;
        token = state.raw;
        completionToken = latestToken;
        selected = undefined;
        if (state.latest) {
          attempt = state.latest.attempt;
          renderScore(state.latest);
        } else if (state.attempt) {
          attempt = state.attempt;
          renderQuestion(false);
        } else if (loadedQuiz) renderStart();
      } catch (error) { fail(error); }
    }

    eventTarget?.addEventListener("storage", (event) => {
      if (event.key !== null && !event.key?.startsWith(HISTORY_PREFIX) && !event.key?.startsWith(ATTEMPT_PREFIX)) return;
      if (player && edition && (event.key === null || event.key === attemptKey(edition)
        || event.key?.startsWith(`${HISTORY_PREFIX}${edition}:`))) synchronize(true);
      else renderHistory();
    });
    if (!player) return;

    function commit(candidate) {
      const storage = getStorage();
      let state;
      try { state = editionState(storage, edition); }
      catch (error) {
        fail(error);
        return false;
      }
      if (state.raw !== token || state.latest) {
        synchronize();
        game.append(status("This attempt changed in another tab. Your answer was not saved.", true));
        return false;
      }
      const raw = serializeAttempt(candidate);
      parseAttempt(raw, attemptKey(edition));
      storage.setItem(attemptKey(edition), raw);
      token = raw;
      attempt = candidate;
      completionToken = candidate.completed ? completionIdentity({
        completedAt: candidate.completedAt, score: candidate.score,
        total: candidate.quiz.questions.length, attempt: candidate,
      }) : null;
      return true;
    }

    function renderStart(message) {
      game.replaceChildren(node("h2", loadedQuiz.title),
        node("p", "One resumable attempt per edition, saved only in this browser. Submitted answers are locked; completed quizzes cannot be replayed."));
      if (message) game.append(status(message, true));
      game.append(button("Start quiz", () => {
        if (blocked) return;
        const candidate = {
          ...createAttempt(loadedQuiz), schemaVersion: 2,
          startedAt: new Date().toISOString(), completedAt: null,
        };
        try {
          if (!commit(candidate)) return;
          selected = undefined;
          renderQuestion();
        } catch (error) {
          if (!blocked && token === null) renderStart(`Quiz could not be started: ${error.message}`);
        }
      }, "quiz-action"));
    }
    function renderRunningScore(scoreboard) {
      const score = node("p", `Score: ${attempt.score}/${attempt.quiz.questions.length}`);
      score.setAttribute("role", "status");
      const markers = node("ol", undefined, "quiz-score-markers");
      markers.setAttribute("aria-label", "Quiz shootout");
      for (let index = 0; index < 10; index += 1) {
        const answered = index < attempt.answers.length;
        const correct = answered && attempt.answers[index] === attempt.quiz.questions[index].answer;
        const state = answered ? (correct ? "correct" : "incorrect") : "pending";
        const marker = node("li", undefined, `quiz-score-marker quiz-score-${state}`);
        marker.setAttribute("aria-label", index < attempt.quiz.questions.length
          ? `Question ${index + 1}: ${answered ? state : "unanswered"}`
          : `Slot ${index + 1}: not used in this quiz`);
        if (answered) {
          const icon = node("span", correct ? "\u26bd" : "\u2715");
          icon.setAttribute("aria-hidden", "true");
          marker.append(icon);
        }
        markers.append(marker);
      }
      scoreboard.replaceChildren(score, markers);
    }

    function renderQuestion(focus = true, message) {
      const question = attempt.quiz.questions[attempt.index];
      const submitted = attempt.answers.length > attempt.index;
      const answer = submitted ? attempt.answers[attempt.index] : selected;
      game.replaceChildren();
      const scoreboard = node("div", undefined, "quiz-scoreboard");
      renderRunningScore(scoreboard);
      const progress = node("h2", `Question ${attempt.index + 1} of ${attempt.quiz.questions.length}`);
      progress.tabIndex = -1;
      const fieldset = node("fieldset");
      fieldset.append(node("legend", question.prompt));
      const options = node("div", undefined, "quiz-options");
      const controls = node("div", undefined, "quiz-controls");
      let selectedChoice;
      for (const option of attempt.options[attempt.index]) {
        const choice = button(option, () => {
          selected = option;
          renderQuestion(false)?.focus();
        }, "quiz-option");
        choice.setAttribute("aria-pressed", String(option === answer));
        if (option === answer) choice.className += " quiz-option-selected";
        if (option === answer) selectedChoice = choice;
        if (submitted) {
          choice.disabled = true;
          if (option === question.answer) {
            choice.className += " quiz-option-correct";
            choice.setAttribute("aria-label", `${option}, correct answer`);
          }
          if (option === answer) {
            choice.setAttribute("aria-label", `${option}, your answer, ${answer === question.answer ? "correct" : "incorrect"}`);
            if (answer !== question.answer) choice.className += " quiz-option-incorrect";
          }
        }
        options.append(choice);
      }
      if (message) controls.append(status(message, true));
      if (submitted) {
        if (attempt.completed) controls.append(status("Completed attempt saved on this device."));
        controls.append(button(attempt.completed ? "See final score" : "Next question", () => {
          selected = undefined;
          if (attempt.completed) renderScore();
          else {
            nextQuestion(attempt);
            renderQuestion();
          }
        }, "quiz-action"));
      } else {
        const submit = button(message ? "Retry saving answer" : "Submit answer", () => {
          if (blocked || selected === undefined) return;
          const candidate = JSON.parse(JSON.stringify(attempt));
          answerQuestion(candidate, selected);
          if (candidate.completed) candidate.completedAt = new Date().toISOString();
          try {
            if (!commit(candidate)) return;
            renderQuestion(false)?.focus();
            renderHistory();
          } catch (error) {
            renderQuestion(false, `Answer was not saved: ${error.message}. Retry saving your selected answer.`);
          }
        }, "quiz-action");
        submit.disabled = selected === undefined;
        controls.append(submit);
      }
      fieldset.append(options);
      game.append(scoreboard, progress, fieldset, controls);
      if (focus) progress.focus();
      return submitted ? controls.children[controls.children.length - 1] : selectedChoice;
    }

    function renderScore(record) {
      const score = record?.score ?? attempt.score;
      const total = record?.total ?? attempt.quiz.questions.length;
      const heading = node("h2", `Final score: ${score}/${total}`);
      heading.tabIndex = -1;
      game.replaceChildren();
      if (attempt) {
        const scoreboard = node("div", undefined, "quiz-scoreboard");
        renderRunningScore(scoreboard);
        game.append(scoreboard);
      }
      game.append(heading, status("Completed attempt saved on this device. This edition cannot be replayed."));
      if (attempt) {
        const review = node("ol", undefined, "quiz-review");
        attempt.quiz.questions.forEach((question, index) => {
          const item = node("li");
          item.append(node("h3", question.prompt),
            node("p", `Your answer: ${attempt.answers[index]}`),
            node("p", `Correct answer: ${question.answer}`),
            node("p", question.explanation));
          review.append(item);
        });
        game.append(review);
      } else game.append(node("p", "Answer review is unavailable for this older saved score."));
      heading.focus();
    }

    return (async () => {
      try {
        const source = new URL(player.dataset.quizSrc, document.baseURI);
        const match = /^\/quiz\/data\/(\d{4}-\d{2}-\d{2})-([a-f0-9]+)\.json$/i.exec(source.pathname);
        if (!match || !validDay(match[1])) throw new Error("Invalid quiz page identity.");
        edition = match[1];
        const state = editionState(getStorage(), edition);
        token = state.raw;
        if (state.latest || state.attempt) {
          synchronize();
          return;
        }
        const response = await fetchQuiz(player.dataset.quizSrc);
        if (!response.ok) throw new Error(`Quiz request failed (HTTP ${response.status}).`);
        const quiz = validateQuiz(await response.json());
        if (source.pathname !== `/quiz/data/${quiz.edition}-${quiz.revision}.json`) {
          throw new Error("Quiz edition or revision does not match this page.");
        }
        loadedQuiz = quiz;
        synchronize();
      } catch (error) {
        game.replaceChildren(status(`Unable to load this quiz. ${error.message} Please reload to try again.`, true));
      }
    })();
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      validateQuiz, createAttempt, answerQuestion, nextQuestion, historyKey,
      attemptKey, parseAttempt, readHistory, mount,
    };
  }
  if (typeof document !== "undefined") {
    mount(document, (source) => fetch(source), () => window.localStorage);
  }
})();
