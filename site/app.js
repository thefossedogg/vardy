const RECORD = 11;
const isClubPage = document.body?.dataset.page === "clubs";
const dataUrl = new URL(
  isClubPage ? "../data/current-season.json" : "data/current-season.json",
  document.baseURI,
);
let activeRows = [];
let seasonData;

function addCell(row, className, content) {
  const cell = document.createElement("td");
  if (className) cell.className = className;
  cell.textContent = content;
  row.append(cell);
  return cell;
}

function renderActive(streaks, emptyMessage = "No active scoring streaks in the current data.") {
  const body = document.querySelector("#active-streaks");
  body.replaceChildren();

  if (streaks.length === 0) {
    const row = document.createElement("tr");
    const cell = addCell(row, "empty", emptyMessage);
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
    pill.addEventListener("click", () => showStreak(streak, "active_streaks"));
    row.className = "streak-row";
    row.addEventListener("click", (event) => {
      if (!pill.contains(event.target)) showStreak(streak, "active_streaks");
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
    item.addEventListener("click", () => showStreak(run, "season_bests"));
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
  const entries = changes.endedStreaks;
  const list = document.querySelector("#recent-changes");
  list.replaceChildren();
  if (entries.length === 0) {
    const row = document.createElement("tr");
    const cell = addCell(row, "empty", "No scoring streaks ended in this seven-day window.");
    cell.colSpan = 3;
    list.append(row);
    return;
  }

  for (const entry of entries) {
    const row = document.createElement("tr");
    row.className = "streak-row";
    const name = document.createElement("button");
    name.type = "button";
    name.className = "change-name-button";
    name.textContent = entry.playerName;
    name.setAttribute("aria-label", `View ${entry.playerName}'s ${entry.matches}-game scoring streak`);
    name.addEventListener("click", () => showStreak(entry, "recently_ended"));
    addCell(row, "", "").append(name);
    addCell(row, "", entry.clubName);
    const streak = addCell(row, "numeric", "");
    const pill = document.createElement("button");
    pill.type = "button";
    pill.className = "streak-pill";
    pill.textContent = `Ended · ${entry.matches}`;
    pill.setAttribute("aria-label", `View ${entry.playerName}'s ended ${entry.matches}-match streak`);
    pill.addEventListener("click", () => showStreak(entry, "recently_ended"));
    row.addEventListener("click", (event) => {
      if (!name.contains(event.target) && !pill.contains(event.target)) showStreak(entry, "recently_ended");
    });
    streak.append(pill);
    list.append(row);
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
      item.addEventListener("click", () => showStreak(run, "season_history"));
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
  chip.addEventListener("click", () => showStreak(run, "pyramid"));
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
      slot("pyr-right", step)?.append(pyramidChip(run, season.seasonLabel, "chip-past"));
    }
  }
  for (const run of active) {
    if (run.matches < FIRST_STEP) continue;
    const step = Math.min(RECORD, run.matches);
    slot("pyr-left", step)?.append(pyramidChip(run, run.clubName, "chip-now"));
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
    const isTarget = item.value === 12 && !streak.failedGame;
    item.className = game.failed
      ? "game-failed"
      : isTarget ? "game-target" : game.completed ? "game-completed" : "game-scheduled";
    item.setAttribute("aria-label",
      game.failed
        ? "Failed to score in this club fixture"
        : `Game ${item.value}, ${game.completed ? "completed scoring game" : "scheduled"}${isTarget ? ", record-breaking target" : ""}`);
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

function showStreak(streak, source) {
  if (streak !== VARDY_STREAK) {
    showSeasonFixtures(streak);
    globalThis.vardyAnalytics?.track("view_streak", {
      player_name: streak.playerName,
      club_name: streak.clubName,
      streak_length: streak.matches,
      streak_source: source,
    });
    return;
  }
  document.querySelector("#streak-dialog").className = "";
  document.querySelector("#streak-dialog-summary").tabIndex = -1;
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
  renderRouteNote(runs);
  document.querySelector("#streak-dialog").showModal();
  globalThis.vardyAnalytics?.track("view_streak", {
    player_name: streak.playerName,
    club_name: streak.clubName,
    streak_length: streak.matches,
    streak_source: source,
  });
}

function renderRouteNote(runs) {
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
}

function fixtureFocusIndex(games, now = Date.now(), historical = false) {
  const next = historical ? -1 : games.findIndex((game) =>
    game.status === "scheduled" && new Date(game.fixtureDate).getTime() >= now,
  );
  const targetIndex = next < 0 ? games.length - 1 : next;
  return { index: Math.max(0, targetIndex - 2), targetIndex };
}

function showSeasonFixtures(player) {
  const runs = player.bestRuns || [player];
  const dialog = document.querySelector("#streak-dialog");
  dialog.className = "season-modal";
  document.querySelector("#streak-dialog-title").textContent = player.playerName;
  const summary = document.querySelector("#streak-dialog-summary");
  summary.tabIndex = 0;
  summary.textContent = player.matches
    ? `Streak · ${formatRunCount(player)} · ` + runs.map((run) =>
      `${run.clubName} · ${formatDate(run.startDate || run.games?.[0]?.fixtureDate)} – ${formatDate(run.lastScoringDate || run.games?.at(-1)?.fixtureDate)}` +
      (run.failedGame ? ` · Ended ${formatDate(run.failedGame.fixtureDate)}` : ""),
    ).join("; ")
    : `${player.clubName} · ${player.season}/${String(player.season + 1).slice(-2)} Premier League · ${player.goals} season goals`;
  document.querySelector("#streak-games").hidden = true;
  document.querySelector("#streak-games").replaceChildren();
  renderRouteNote(runs);
  const groups = document.querySelector("#streak-repeated-runs");
  groups.replaceChildren();
  const contexts = new Map();
  for (const run of runs) {
    for (const fixture of seasonData.fixtures) {
      if (fixture.season < (run.startSeason ?? run.season) || fixture.season > run.season) continue;
      const team = fixture.teams.find((entry) => entry.clubKey === run.clubKey);
      if (team) contexts.set(`${run.clubKey}:${fixture.season}`, {
        clubKey: run.clubKey, clubName: team.name, season: fixture.season,
      });
    }
  }
  const scrollTargets = [];
  for (const club of [...contexts.values()].sort((a, b) =>
    b.season - a.season || a.clubName.localeCompare(b.clubName),
  )) {
    const fixtures = seasonData.fixtures.filter((fixture) =>
      fixture.season === club.season &&
      fixture.teams.some((team) => team.clubKey === club.clubKey),
    ).sort((a, b) => a.fixtureDate.localeCompare(b.fixtureDate));
    const games = fixtures.map((fixture) => {
      const side = fixture.teams.findIndex((team) => team.clubKey === club.clubKey);
      return {
        ...fixture,
        opponent: fixture.teams[1 - side],
        venue: side === 0 ? "home" : "away",
        goals: fixture.scorers.filter((scorer) =>
          scorer.playerKey === player.playerKey && scorer.clubKey === club.clubKey,
        ).reduce((total, scorer) => total + scorer.goals, 0),
        result: fixture.score
          ? `${club.clubName} ${fixture.score[side]}–${fixture.score[1 - side]} ${fixture.teams[1 - side].name}`
          : "",
      };
    });
    const group = document.createElement("section");
    group.className = "repeated-run season-fixtures-group";
    const heading = document.createElement("h3");
    const label = `${club.clubName} · ${club.season}/${String(club.season + 1).slice(-2)} · Premier League`;
    heading.textContent = label;
    const totals = document.createElement("p");
    const scored = games.filter((game) => game.status !== "scheduled" && game.goals > 0);
    totals.textContent = `${scored.reduce((total, game) => total + game.goals, 0)} goals · ` +
      `Scored in ${scored.length} of ${games.filter((game) => game.status !== "scheduled").length} completed club fixtures.`;
    const details = document.createElement("p");
    const last = scored.at(-1);
    const latestCompleted = games.filter((game) => game.status !== "scheduled").at(-1);
    const next = games.find((game) =>
      game.status === "scheduled" && (!latestCompleted || game.fixtureDate > latestCompleted.fixtureDate),
    );
    details.textContent = `Last goal: ${last ? `${formatDate(last.fixtureDate)} · ${last.opponent.name}` : "—"}. ` +
      `Next game: ${next ? `${next.opponent.name} (${next.venue === "home" ? "H" : "A"}) · ${formatKickoff(next.fixtureDate)}` : "None in this season's exports"}.`;
    const viewport = document.createElement("div");
    viewport.className = "season-fixtures";
    viewport.tabIndex = 0;
    viewport.setAttribute("role", "region");
    viewport.setAttribute("aria-label", `${label} fixtures, oldest first`);
    const list = document.createElement("ol");
    list.className = "game-list season-game-list";
    for (const game of games) {
      const item = document.createElement("li");
      const scheduled = game.status === "scheduled";
      item.className = scheduled ? "fixture-scheduled" : game.goals > 0 ? "fixture-scored" : "fixture-goalless";
      const state = document.createElement("span");
      state.textContent = `${scheduled ? "Scheduled" : game.goals > 0 ? "Scored" : "No credited goal"} · ${game.goals} goals` +
        ` · ${game.opponent.name} (${game.venue === "home" ? "H" : "A"})` +
        (game.result ? ` · ${game.result}` : "");
      const kickoff = document.createElement("time");
      kickoff.dateTime = game.fixtureDate;
      kickoff.textContent = formatKickoff(game.fixtureDate);
      item.append(state, kickoff);
      list.append(item);
    }
    viewport.append(list);
    group.append(heading, totals, details, viewport);
    groups.append(group);
    scrollTargets.push({
      viewport, list,
      ...fixtureFocusIndex(games, Date.now(), club.season < seasonData.season),
    });
  }
  if (contexts.size === 0) {
    const empty = document.createElement("p");
    empty.textContent = "Season fixtures are not available in these exports.";
    groups.append(empty);
  }
  const note = document.createElement("p");
  note.textContent = "All club fixtures, oldest first. No credited goal includes nonappearance; appearances are not recorded. Scheduled games are not predicted goals. Dates may change.";
  groups.append(note);
  dialog.showModal();
  document.querySelector(".dialog-games").scrollTop = 0;
  requestAnimationFrame(() => {
    for (const { viewport, list, index, targetIndex } of scrollTargets) {
      const target = list.children[targetIndex];
      viewport.scrollTop = Math.max(
        list.children[index].offsetTop - list.children[0].offsetTop,
        target.offsetTop - list.children[0].offsetTop + target.offsetHeight - viewport.clientHeight + 8,
      );
    }
    if (scrollTargets.length) {
      const first = scrollTargets[0];
      const target = first.list.children[first.targetIndex];
      const outer = document.querySelector(".dialog-games");
      const overflow = target.getBoundingClientRect().bottom - outer.getBoundingClientRect().bottom;
      if (overflow > 0) outer.scrollTop += overflow + 8;
    }
  });
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
  return visible.length;
}

async function fetchSeasonData() {
  const response = await fetch(dataUrl, { cache: "no-store" });
  if (!response.ok) throw new Error(`Data request failed (${response.status}).`);
  return response.json();
}

function renderClubPage(data, slug = new URL(document.baseURI).searchParams.get("club")) {
  seasonData = data;
  const directory = document.querySelector("#club-directory");
  const detail = document.querySelector("#club-detail");
  const status = document.querySelector("#clubs-status");
  const title = document.querySelector("#clubs-title");
  document.querySelector(".section-heading .eyebrow").textContent = `${data.seasonLabel} PREMIER LEAGUE`;
  const updated = document.querySelector("#updated-at");
  updated.textContent = data.generatedAt ? `UPDATED ${formatDate(data.generatedAt)}` : "DATA NOT SYNCED YET";
  if (data.generatedAt) updated.dateTime = data.generatedAt;
  directory.hidden = slug !== null;
  detail.hidden = true;

  if (slug === null) {
    title.textContent = "Your club";
    document.title = "Your club | Vardy Watch";
    status.textContent = "Choose a club to see its scorers and active scoring streaks.";
    const list = document.querySelector("#club-list");
    list.replaceChildren();
    for (const club of data.clubs) {
      const item = document.createElement("li");
      const link = document.createElement("a");
      link.href = `?club=${encodeURIComponent(club.slug)}`;
      link.dataset.clubSlug = club.slug;
      link.textContent = club.clubName;
      item.append(link);
      list.append(item);
    }
    if (data.clubs.length === 0) status.textContent = "No clubs in the current season fixtures.";
    return;
  }

  const club = data.clubs.find((entry) => entry.slug === slug);
  if (!club) {
    title.textContent = "Club not found";
    document.title = "Club not found | Vardy Watch";
    status.textContent = "This club is not in the current season. Use the club directory to choose a club.";
    return;
  }

  detail.hidden = false;
  title.textContent = club.clubName;
  document.title = `${club.clubName} | ${data.seasonLabel} scorers | Vardy Watch`;
  status.textContent = club.completedFixtures === 0
    ? "No completed league fixtures yet."
    : `${club.completedFixtures} completed league fixtures this season.`;
  const scorers = document.querySelector("#club-scorers");
  scorers.replaceChildren();
  for (const scorer of club.scorers) {
    const row = document.createElement("tr");
    const active = club.activeInSeason.find((run) => run.playerKey === scorer.playerKey);
    const player = active || { ...scorer, clubKey: club.clubKey, clubName: club.clubName, season: data.season };
    row.className = `streak-row${active ? " club-active-row" : ""}`;
    addCell(row, "numeric", String(scorer.rank));
    const button = document.createElement("button");
    button.type = "button";
    button.className = "change-name-button";
    button.textContent = scorer.playerName;
    button.setAttribute("aria-label", `View ${scorer.playerName}'s season fixtures`);
    button.addEventListener("click", () => showStreak(player, "club_scorers"));
    addCell(row, "", "").append(button);
    addCell(row, "numeric", String(scorer.goals));
    addCell(row, "numeric", active ? `Active · ${active.matches} games` : "—");
    row.addEventListener("click", (event) => {
      if (!button.contains(event.target)) showStreak(player, "club_scorers");
    });
    scorers.append(row);
  }
  if (club.scorers.length === 0) {
    const row = document.createElement("tr");
    const cell = addCell(row, "empty", club.completedFixtures === 0
      ? "No completed league fixtures yet."
      : "No credited goals this season.");
    cell.colSpan = 4;
    scorers.append(row);
  }
}

async function loadClubData() {
  const data = await fetchSeasonData();
  if (
    !Array.isArray(data.fixtures) ||
    !Array.isArray(data.clubs) ||
    data.clubs.some((club) =>
      typeof club.slug !== "string" ||
      typeof club.clubName !== "string" ||
      !Number.isInteger(club.completedFixtures) ||
      !Array.isArray(club.scorers) ||
      !Array.isArray(club.activeInSeason),
    )
  ) {
    throw new Error("The season data file is missing valid club statistics.");
  }
  renderClubPage(data);
  globalThis.vardyAnalytics?.pageView();
  const slug = new URL(document.baseURI).searchParams.get("club");
  if (slug !== null) {
    const club = data.clubs.find((entry) => entry.slug === slug);
    if (club) {
      globalThis.vardyAnalytics?.track("view_club", {
        club_slug: club.slug, club_name: club.clubName,
      });
    } else {
      globalThis.vardyAnalytics?.track("club_not_found");
    }
  }
}

async function loadData() {
  const data = await fetchSeasonData();
  seasonData = data;
  if (
    !Array.isArray(data.fixtures) ||
    !Array.isArray(data.activeInSeason) ||
    !Array.isArray(data.seasonBestRuns) ||
    !Array.isArray(data.seasonLeaders)
  ) {
    throw new Error("The season data file is missing one or more streak lists.");
  }
  if (
    !data.whatChanged ||
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

if (isClubPage) {
  loadClubData().catch((error) => {
    document.querySelector("#updated-at").textContent = "DATA UNAVAILABLE";
    document.querySelector("#clubs-status").textContent = "Could not load club data. Please try again later.";
    document.querySelector("#club-directory").hidden = true;
    document.querySelector("#club-detail").hidden = true;
    console.error(error);
    globalThis.vardyAnalytics?.pageView();
    globalThis.vardyAnalytics?.track("data_load_error", { page_type: "clubs" });
  });
} else {
  let filterTimer;
  document.querySelector("#search").addEventListener("input", (event) => {
    const query = event.currentTarget.value;
    const resultCount = filterRows(query);
    clearTimeout(filterTimer);
    filterTimer = setTimeout(() => {
      globalThis.vardyAnalytics?.track("filter_streaks", {
        query_length: query.trim().length, result_count: resultCount,
      });
    }, 500);
  });

  buildPyramid();
  document.querySelector("#vardy-button").addEventListener("click", () => showStreak(VARDY_STREAK, "vardy_record"));

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
    const changes = document.createElement("p");
    changes.className = "empty";
    changes.textContent = "Could not load streaks.";
    document.querySelector("#recent-changes").replaceChildren(changes);
    console.error(error);
    globalThis.vardyAnalytics?.track("data_load_error", { page_type: "home" });
  });
}

document.querySelector("#streak-dialog").addEventListener("close", () => {
  globalThis.vardyAnalytics?.track("close_streak");
});

setInterval(updateCountdowns, 1000);
