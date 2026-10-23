const RECORD = 11;
const dataUrl = new URL("data/current-season.json", document.baseURI);
let activeRows = [];

function addCell(row, className, content) {
  const cell = document.createElement("td");
  if (className) cell.className = className;
  cell.textContent = content;
  row.append(cell);
  return cell;
}

function renderActive(streaks) {
  const body = document.querySelector("#active-streaks");
  body.replaceChildren();

  if (streaks.length === 0) {
    const row = document.createElement("tr");
    const cell = addCell(row, "empty", "No active scoring streaks in the current data.");
    cell.colSpan = 5;
    body.append(row);
    return;
  }

  for (const streak of streaks) {
    const row = document.createElement("tr");
    addCell(row, "", streak.playerName);

    addCell(row, "", streak.clubName);
    const count = addCell(row, "numeric", "");
    const pill = document.createElement("button");
    pill.type = "button";
    pill.className = "streak-pill";
    pill.textContent = String(streak.matches);
    pill.setAttribute("aria-label", `View ${streak.playerName}'s ${streak.matches}-game streak`);
    pill.addEventListener("click", () => showStreak(streak));
    row.className = "streak-row";
    row.addEventListener("click", (event) => {
      if (!pill.contains(event.target)) showStreak(streak);
    });
    count.append(pill);
    addCell(row, "", formatDate(streak.lastScoringDate));
    const next = addCell(row, "next-game", "");
    if (streak.nextGame) {
      const game = streak.nextGame;
      next.textContent = `${game.opponent.name} (${game.venue === "home" ? "H" : "A"})`;
      const kickoff = document.createElement("time");
      kickoff.className = "next-kickoff";
      kickoff.dateTime = game.fixtureDate;
      kickoff.textContent = formatKickoff(game.fixtureDate);
      const countdown = document.createElement("span");
      countdown.className = "countdown";
      countdown.dataset.kickoff = game.fixtureDate;
      countdown.textContent = formatCountdown(game.fixtureDate);
      next.append(kickoff, countdown);
    } else {
      next.textContent = "Not in current exports";
    }
    body.append(row);
  }
}

function renderBest(runs, selector = "#season-bests") {
  const list = document.querySelector(selector);
  list.replaceChildren();
  if (runs.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "No season streaks in the current data.";
    list.append(empty);
    return;
  }

  for (const run of runs) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "best-item";
    item.addEventListener("click", () => showStreak(run));
    const name = document.createElement("span");
    name.className = "best-name";
    name.textContent = run.playerName;
    const club = document.createElement("span");
    club.className = "best-club";
    club.textContent = run.clubName;
    name.append(club);
    const count = document.createElement("span");
    count.className = "best-count";
    count.textContent = formatRunCount(run);
    item.append(name, count);
    list.append(item);
  }
}

function renderWhatChanged(changes) {
  document.querySelector("#changes-window").textContent =
    `${formatKickoff(changes.windowStart)} to ${formatKickoff(changes.windowEnd)}. ` +
    `Updated ${formatKickoff(changes.generatedAt)}.`;

  const streaks = new Map();
  for (const scorer of changes.scorers) {
    const key = `${scorer.playerName}\u0000${scorer.clubName}`;
    streaks.set(key, { ...scorer, ended: false });
  }
  for (const ended of changes.endedStreaks) {
    const key = `${ended.playerName}\u0000${ended.clubName}`;
    streaks.set(key, { ...ended, ended: true });
  }
  const entries = [...streaks.values()].sort((a, b) =>
    b.matches - a.matches ||
    a.playerName.localeCompare(b.playerName) ||
    a.clubName.localeCompare(b.clubName),
  );
  const list = document.querySelector("#recent-changes");
  list.replaceChildren();
  if (streaks.size === 0) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "No scoring streaks of two or more in this seven-day window.";
    list.append(empty);
    return;
  }

  for (const entry of entries) {
    const item = document.createElement("div");
    item.className = "change-item";
    const name = document.createElement("button");
    name.type = "button";
    name.className = "change-name change-name-button";
    name.textContent = `${entry.playerName} (${entry.clubName})`;
    name.setAttribute("aria-label", `View ${entry.playerName}'s ${entry.matches}-game scoring streak`);
    name.addEventListener("click", () => showStreak(entry));
    const count = document.createElement("span");
    count.className = "change-count";
    count.textContent = `${entry.ended ? "Ended · " : ""}${entry.matches}-match streak`;
    item.append(name, count);
    list.append(item);
  }
}

function renderSeasonLeaders(seasons) {
  const list = document.querySelector("#season-leaders");
  list.replaceChildren();
  if (seasons.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "No complete season summaries are available.";
    list.append(empty);
    return;
  }

  for (const season of seasons) {
    const card = document.createElement("article");
    card.className = "season-leader-card";
    const heading = document.createElement("h4");
    heading.textContent = season.seasonLabel;
    card.append(heading);

    for (const run of season.runs) {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "season-leader";
      item.addEventListener("click", () => showStreak(run));
      const identity = document.createElement("span");
      identity.className = "best-name";
      identity.textContent = run.playerName;
      const club = document.createElement("span");
      club.className = "best-club";
      club.textContent = run.clubName;
      identity.append(club);
      const count = document.createElement("span");
      count.className = "best-count";
      count.textContent = formatRunCount(run);
      item.append(identity, count);
      card.append(item);
    }
    list.append(card);
  }
}

const FIRST_STEP = 3;
function buildPyramid() {
  const pyramid = document.querySelector("#pyramid");
  for (let step = RECORD; step >= FIRST_STEP; step -= 1) {
    const row = document.createElement("div");
    row.className = "pyr-row";
    const left = document.createElement("div");
    left.className = "pyr-side pyr-left";
    left.dataset.step = String(step);
    const block = document.createElement("div");
    block.className = `pyr-step pyr-step-${step}`;
    block.textContent = String(step);
    const right = document.createElement("div");
    right.className = "pyr-side pyr-right";
    right.dataset.step = String(step);
    row.append(left, block, right);
    pyramid.append(row);
  }
}

function pyramidChip(run, label, className) {
  const chip = document.createElement("button");
  chip.type = "button";
  chip.className = `pyr-chip ${className}`;
  chip.setAttribute("aria-label",
    `View ${run.playerName}'s ${run.matches}-game streak, ${label}`);
  chip.addEventListener("click", () => showStreak(run));
  const name = document.createElement("strong");
  name.textContent = run.playerName;
  const tag = document.createElement("span");
  tag.textContent = label;
  chip.append(name, tag);
  return chip;
}

function renderPyramid(seasons, active) {
  const pyramid = document.querySelector("#pyramid");
  const sides = [...pyramid.querySelectorAll(".pyr-side[data-step]")];
  const slot = (side, step) =>
    sides.find((el) => el.dataset.step === String(step) && el.classList.contains(side));
  for (const el of sides) el.replaceChildren();

  for (const season of seasons) {
    for (const run of season.runs) {
      if (run.matches < FIRST_STEP) continue;
      const step = Math.min(RECORD, run.matches);
      slot("pyr-left", step)?.append(pyramidChip(run, season.seasonLabel, "chip-past"));
    }
  }
  for (const run of active) {
    if (run.matches < FIRST_STEP) continue;
    const step = Math.min(RECORD, run.matches);
    slot("pyr-right", step)?.append(pyramidChip(run, run.clubName, "chip-now"));
  }
}

function formatRunCount(run) {
  const repeats = run.bestRuns?.length || 1;
  return `${run.matches} ${run.matches === 1 ? "GAME" : "GAMES"}${repeats > 1 ? ` x${repeats}` : ""}`;
}

const VARDY_STREAK = {
  playerName: "Jamie Vardy",
  clubName: "Leicester City · 2015/16",
  matches: 11,
  startDate: "2015-08-29",
  lastScoringDate: "2015-11-28",
  games: [
    ["2015-08-29", "Bournemouth", "away", "1-1", "1 (pen)"],
    ["2015-09-13", "Aston Villa", "home", "3-2", "1"],
    ["2015-09-19", "Stoke City", "away", "2-2", "1"],
    ["2015-09-26", "Arsenal", "home", "2-5", "2"],
    ["2015-10-03", "Norwich City", "away", "2-1", "1 (pen)"],
    ["2015-10-17", "Southampton", "away", "2-2", "2"],
    ["2015-10-24", "Crystal Palace", "home", "1-0", "1"],
    ["2015-10-31", "West Bromwich Albion", "away", "3-2", "1"],
    ["2015-11-07", "Watford", "home", "2-1", "1"],
    ["2015-11-21", "Newcastle United", "away", "3-0", "1"],
    ["2015-11-28", "Manchester United", "home", "1-1", "1"],
  ].map(([fixtureDate, opponent, venue, score, goals]) => ({
    fixtureDate, opponent: { name: opponent }, venue, score, goals, dateOnly: true,
  })),
};

function renderGames(streak, list = document.querySelector("#streak-games")) {
  list.replaceChildren();
  const games = [
    ...streak.games.map((game) => ({ ...game, completed: true })),
    ...(streak.failedGame ? [{ ...streak.failedGame, failed: true }] : []),
    ...(streak.upcomingGames || []).map((game) => ({ ...game, completed: false })),
  ];
  list.start = games.length;
  for (let index = games.length - 1; index >= 0; index -= 1) {
    const game = games[index];
    const item = document.createElement("li");
    item.value = index + 1;
    item.className = game.failed
      ? "game-failed"
      : item.value === 12 ? "game-target" : game.completed ? "game-completed" : "game-scheduled";
    item.setAttribute("aria-label",
      game.failed
        ? "Failed to score in this club fixture"
        : `Game ${item.value}, ${game.completed ? "completed scoring game" : "scheduled"}${item.value === 12 ? ", record-breaking target" : ""}`);
    const opponent = document.createElement("span");
    opponent.textContent = `${game.failed ? "Failed to score · " : ""}${game.opponent.name} (${game.venue === "home" ? "H" : "A"})` +
      (game.score ? ` · Leicester ${game.score}, Vardy ${game.goals}` : "");
    const kickoff = document.createElement("time");
    kickoff.dateTime = game.fixtureDate;
    kickoff.textContent = game.dateOnly ? formatDate(game.fixtureDate) : formatKickoff(game.fixtureDate);
    item.append(opponent, kickoff);
    list.append(item);
  }
}

function showStreak(streak) {
  const runs = streak.bestRuns || [streak];
  document.querySelector("#streak-dialog-title").textContent = streak.playerName;
  document.querySelector("#streak-dialog-summary").textContent =
    `${[...new Set(runs.map((run) => run.clubName))].join(", ")} · ${formatRunCount(streak)}`;
  const gameList = document.querySelector("#streak-games");
  const repeatedRuns = document.querySelector("#streak-repeated-runs");
  gameList.hidden = runs.length > 1;
  repeatedRuns.replaceChildren();
  if (runs.length === 1) {
    renderGames(runs[0]);
  } else {
    gameList.replaceChildren();
    for (const run of runs) {
      const group = document.createElement("section");
      group.className = "repeated-run";
      group.setAttribute("aria-label",
        `${run.clubName}, ${formatDate(run.startDate)} to ${formatDate(run.lastScoringDate)}`);
      const list = document.createElement("ol");
      list.className = "game-list";
      list.reversed = true;
      renderGames(run, list);
      group.append(list);
      repeatedRuns.append(group);
    }
  }
  const current = runs.find((run) => Array.isArray(run.upcomingGames));
  const routeNote = document.querySelector("#streak-route-note");
  routeNote.hidden = !current;
  if (!routeNote.hidden) {
    const remaining = Math.max(0, current.targetMatches - current.matches);
    const available = current.upcomingGames.length;
    routeNote.textContent = remaining === 0
      ? "This streak has already reached 12 games."
      : `Score in the next ${remaining} consecutive club fixtures to reach 12 and beat Vardy's record. ` +
        "These are scheduled games, not predicted goals; dates may change." +
        (available < remaining
          ? ` Only ${available} of ${remaining} required fixtures are available in this season's exports.`
          : "");
  }
  document.querySelector("#streak-dialog").showModal();
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function formatKickoff(value) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(new Date(value));
}

function formatCountdown(value, now = Date.now()) {
  const remaining = new Date(value).getTime() - now;
  if (remaining <= 0) return "Kickoff passed - awaiting update";
  const totalSeconds = Math.ceil(remaining / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `In ${days}d ${hours}h ${minutes}m ${seconds}s`;
}

function updateCountdowns() {
  const now = Date.now();
  for (const countdown of document.querySelectorAll(".countdown")) {
    countdown.textContent = formatCountdown(countdown.dataset.kickoff, now);
  }
}

function filterRows(query) {
  const normalized = query.trim().toLocaleLowerCase();
  const visible = activeRows.filter((streak) =>
    `${streak.playerName} ${streak.clubName}`.toLocaleLowerCase().includes(normalized),
  );
  renderActive(visible);
}

async function loadData() {
  const response = await fetch(dataUrl, { cache: "no-store" });
  if (!response.ok) throw new Error(`Data request failed (${response.status}).`);
  const data = await response.json();
  if (
    !Array.isArray(data.activeInSeason) ||
    !Array.isArray(data.seasonBestRuns) ||
    !Array.isArray(data.seasonLeaders)
  ) {
    throw new Error("The season data file is missing one or more streak lists.");
  }
  if (
    !data.whatChanged ||
    !Array.isArray(data.whatChanged.scorers) ||
    !Array.isArray(data.whatChanged.endedStreaks)
  ) {
    throw new Error("The season data file is missing recent changes.");
  }

  document.querySelector(".section-heading .eyebrow").textContent = `${data.seasonLabel} SEASON`;
  const updatedAt = document.querySelector("#updated-at");
  if (data.generatedAt) {
    updatedAt.dateTime = data.generatedAt;
    updatedAt.textContent = `UPDATED ${formatDate(data.generatedAt)}`;
  } else {
    updatedAt.textContent = "DATA NOT SYNCED YET";
  }

  const active = data.activeInSeason;
  activeRows = active;
  document.querySelector("#active-count").textContent = String(active.length);
  const leader = active[0];
  document.querySelector("#closest-streak").textContent = leader ? `${leader.matches} / ${RECORD}` : "—";
  document.querySelector("#closest-player").textContent = leader
    ? `${leader.playerName} · ${leader.clubName} · ${Math.max(0, RECORD - leader.matches)} matches to record`
    : "No active runs yet";
  document.querySelector("#table-note").textContent =
    `Reference: Jamie Vardy’s ${RECORD}-game run in ${data.benchmark.season}. ` +
    `Archived fixtures start ${formatDate(data.archiveStartsAt)}. Player appearances are not present in the source exports.`;
  renderActive(active);
  renderWhatChanged(data.whatChanged);
  renderBest(data.seasonBestRuns);
  renderSeasonLeaders(data.seasonLeaders);
  renderPyramid(data.seasonLeaders, active);
}

document.querySelector("#search").addEventListener("input", (event) => {
  filterRows(event.currentTarget.value);
});

buildPyramid();
document.querySelector("#vardy-button").addEventListener("click", () => showStreak(VARDY_STREAK));

loadData().catch((error) => {
  document.querySelector("#updated-at").textContent = "DATA UNAVAILABLE";
  const row = document.createElement("tr");
  const cell = addCell(row, "empty", "Could not load streak data.");
  cell.colSpan = 5;
  document.querySelector("#active-streaks").replaceChildren(row);
  const bests = document.querySelector("#season-bests");
  bests.replaceChildren();
  const message = document.createElement("p");
  message.className = "empty";
  message.textContent = "Could not load season bests.";
  bests.append(message);
  document.querySelector("#season-leaders").replaceChildren();
  document.querySelector("#changes-window").textContent = "";
  const changes = document.createElement("p");
  changes.className = "empty";
  changes.textContent = "Could not load streaks.";
  document.querySelector("#recent-changes").replaceChildren(changes);
  console.error(error);
});

setInterval(updateCountdowns, 1000);
