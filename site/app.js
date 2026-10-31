const RECORD = 11;
const isClubPage = document.body?.dataset.page === "clubs";
const dataUrl = new URL(
  isClubPage ? "../data/current-season.json" : "data/current-season.json",
  document.baseURI,
);
let activeRows = [];
let seasonData;
const FAVOURITES_KEY = "vardy-watch:favourites:v1";
const FAVOURITES_LIMIT = 10;
let favourites = [];
let favouriteEntries = new Map();
let favouritesWarning = "";
let favouritesNotice = "";

function parseFavourites(value) {
  const entries = JSON.parse(value ?? "[]");
  if (!Array.isArray(entries) || entries.length > FAVOURITES_LIMIT ||
    entries.some((entry) => !entry || !["team", "player"].includes(entry.type) ||
      typeof entry.key !== "string" || !entry.key ||
      typeof entry.name !== "string" || !entry.name ||
      (entry.clubName !== undefined && typeof entry.clubName !== "string")) ||
    new Set(entries.map((entry) => `${entry.type}:${entry.key}`)).size !== entries.length) {
    throw new Error("Invalid saved favourites.");
  }
  return entries.map(({ type, key, name, clubName }) => ({ type, key, name, clubName }));
}

function readFavourites() {
  try {
    favourites = parseFavourites(localStorage.getItem(FAVOURITES_KEY));
    favouritesWarning = "";
  } catch (error) {
    favouritesWarning = "Saved favourites could not be read. Changes may be lost on navigation or reload.";
    console.error("Could not read favourites.", error);
  }
}

function saveFavourites() {
  try {
    localStorage.setItem(FAVOURITES_KEY, JSON.stringify(favourites));
    favouritesWarning = "";
  } catch (error) {
    favouritesWarning = "Favourites could not be saved. Changes may be lost on navigation or reload.";
    console.error("Could not save favourites.", error);
  }
}

function isFavourite(type, key) {
  return favourites.some((entry) => entry.type === type && entry.key === key);
}

function updateFavouriteControls() {
  for (const button of document.querySelectorAll("[data-favourite-key]")) {
    const selected = isFavourite(button.dataset.favouriteType, button.dataset.favouriteKey);
    button.setAttribute("aria-pressed", String(selected));
    button.setAttribute("aria-label",
      `${selected ? "Unfavourite" : "Favourite"} ${button.dataset.favouriteName}`);
    button.textContent = selected ? "\u2605" : "\u2606";
    button.title = button.getAttribute("aria-label");
  }
  for (const message of document.querySelectorAll("[data-favourites-message]")) {
    message.textContent = [favouritesWarning, favouritesNotice].filter(Boolean).join(" ");
    message.hidden = !message.textContent;
  }
}

function toggleFavourite(entry) {
  favouritesNotice = "";
  if (isFavourite(entry.type, entry.key)) {
    favourites = favourites.filter((saved) => saved.type !== entry.type || saved.key !== entry.key);
  } else if (favourites.length >= FAVOURITES_LIMIT) {
    favouritesNotice = "You can save up to 10 favourites. Remove one to add another.";
    updateFavouriteControls();
    return;
  } else {
    entry = favouriteEntries.get(`${entry.type}:${entry.key}`) || entry;
    favourites.push({
      type: entry.type, key: entry.key, name: entry.name, clubName: entry.clubName,
    });
  }
  saveFavourites();
  renderFavourites();
}

function bindFavouriteButton(button, entry) {
  button.hidden = false;
  button.dataset.favouriteType = entry.type;
  button.dataset.favouriteKey = entry.key;
  button.dataset.favouriteName = entry.name;
  button.onclick = () => toggleFavourite(entry);
}

function clubUrl(slug) {
  const url = new URL(isClubPage ? "./" : "clubs/", document.baseURI);
  url.searchParams.set("club", slug);
  return url.href;
}

function indexFavouriteEntries(data) {
  const entries = new Map();
  const names = new Map();
  const latest = new Map();
  const totals = new Map();
  const runs = [
    ...data.seasonLeaders.flatMap((season) => season.runs),
    ...data.seasonBestRuns, ...data.whatChanged.endedStreaks, ...data.activeInSeason,
  ];
  for (const player of runs) names.set(player.playerKey, player.playerName);
  for (const club of data.clubs) {
    entries.set(`team:${club.clubKey}`, {
      type: "team", key: club.clubKey, name: club.clubName, slug: club.slug,
    });
    for (const player of club.scorers) names.set(player.playerKey, player.playerName);
  }
  // Credited goals identify the latest known club context, not current squad membership.
  for (const fixture of data.fixtures) {
    for (const scorer of fixture.scorers) {
      const totalKey = `${scorer.playerKey}:${scorer.clubKey}:${fixture.season}`;
      totals.set(totalKey, (totals.get(totalKey) || 0) + scorer.goals);
      if (!latest.has(scorer.playerKey) ||
        fixture.fixtureDate > latest.get(scorer.playerKey).fixture.fixtureDate) {
        latest.set(scorer.playerKey, { fixture, scorer });
      }
    }
  }
  for (const [key, name] of names) {
    const context = latest.get(key);
    if (!context) continue;
    const { fixture, scorer } = context;
    const club = fixture.teams.find((team) => team.clubKey === scorer.clubKey);
    const active = data.activeInSeason.find((run) =>
      run.playerKey === key && run.clubKey === club.clubKey && run.season === fixture.season);
    const player = active || {
      playerKey: key, playerName: name, clubKey: club.clubKey, clubName: club.name,
      season: fixture.season, goals: totals.get(`${key}:${club.clubKey}:${fixture.season}`),
    };
    entries.set(`player:${key}`, {
      type: "player", key, name, clubName: club.name, player,
    });
  }
  entries.set(`player:${VARDY_STREAK.playerKey}`, {
    type: "player", key: VARDY_STREAK.playerKey, name: VARDY_STREAK.playerName,
    clubName: VARDY_STREAK.clubName, player: VARDY_STREAK,
  });
  favouriteEntries = entries;
  const refreshed = favourites.map((saved) => {
    const current = entries.get(`${saved.type}:${saved.key}`);
    return current ? {
      type: current.type, key: current.key, name: current.name, clubName: current.clubName,
    } : saved;
  });
  if (JSON.stringify(refreshed) !== JSON.stringify(favourites)) {
    favourites = refreshed;
    saveFavourites();
  }
  renderFavourites();
}

function renderFavourites() {
  const list = document.querySelector("#favourites-list");
  list.replaceChildren();
  document.querySelector("#favourites-status").textContent = favourites.length
    ? `${favourites.length} of ${FAVOURITES_LIMIT} favourites`
    : "No favourites yet. Star a team or a player to save them here.";
  const sorted = [...favourites].sort((a, b) => a.name.localeCompare(b.name, "en"));
  for (const saved of sorted) {
    const current = favouriteEntries.get(`${saved.type}:${saved.key}`);
    const entry = current || saved;
    const row = document.createElement("li");
    const target = document.createElement(current?.type === "team" ? "a" : "button");
    target.className = "favourite-target";
    if (target.tagName === "BUTTON") target.type = "button";
    const icon = document.createElement("span");
    icon.setAttribute("role", "img");
    icon.setAttribute("aria-label", saved.type === "team" ? "Team" : "Player");
    icon.textContent = saved.type === "team" ? "\u2691" : "\u{1f464}";
    const label = document.createElement("span");
    label.textContent = entry.name;
    if (entry.clubName) {
      const club = document.createElement("small");
      club.textContent = entry.clubName;
      label.append(club);
    }
    target.append(icon, label);
    if (!current) {
      target.disabled = true;
      const unavailable = document.createElement("small");
      unavailable.textContent = seasonData ? "Unavailable" : "Data unavailable";
      label.append(unavailable);
    } else if (current.type === "team") {
      target.href = clubUrl(current.slug);
    } else {
      target.addEventListener("click", () => {
        const picker = document.querySelector("#favourites-picker");
        picker.open = false;
        picker.querySelector("summary").focus();
        showStreak(current.player, "favourites");
      });
    }
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "favourite-star";
    bindFavouriteButton(remove, entry);
    remove.onclick = () => {
      const index = [...list.children].indexOf(row);
      toggleFavourite(entry);
      const remaining = list.querySelectorAll(".favourite-star");
      (remaining[Math.min(index, remaining.length - 1)] ||
        document.querySelector("#favourites-picker summary")).focus();
    };
    row.append(target, remove);
    list.append(row);
  }
  updateFavouriteControls();
}

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
const PLAYER_PORTRAITS = {
  "E. Haaland": "images/haaland.png",
  "Evanilson": "images/evanilson.png",
};

function buildPyramid() {
  const pyramid = document.querySelector("#pyramid");
  for (let step = RECORD; step >= FIRST_STEP; step -= 1) {
    const row = document.createElement("div");
    row.className = "pyr-row";
    row.style.setProperty("--step", String(step - FIRST_STEP));
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
  const portraitSrc = className === "chip-now" && Object.hasOwn(PLAYER_PORTRAITS, run.playerName)
    ? PLAYER_PORTRAITS[run.playerName] : null;
  if (portraitSrc) {
    chip.classList.add("pyr-player");
    const portrait = document.createElement("img");
    portrait.className = "pyr-chip-portrait";
    portrait.addEventListener("error", () => {
      chip.classList.remove("pyr-player");
      chip.replaceChildren(name, tag);
    }, { once: true });
    portrait.src = portraitSrc;
    portrait.alt = "";
    chip.append(portrait);
  } else {
    chip.append(name, tag);
  }
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
  // The benchmark predates the fixture exports and has no exported player ID.
  playerKey: "benchmark:jamie-vardy",
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
    if (game.failed || game.completed) item.append(fixtureStreakBadge(game.failed ? 0 : item.value));
    list.append(item);
  }
}

function showStreak(streak, source) {
  bindFavouriteButton(document.querySelector("#player-favourite"), {
    type: "player", key: streak.playerKey, name: streak.playerName, clubName: streak.clubName,
  });
  favouritesNotice = "";
  updateFavouriteControls();
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

function fixtureStreakBadge(matches) {
  const badge = document.createElement("span");
  badge.className = "streak-count-badge";
  if (matches === 0) {
    badge.className += " streak-missed-badge";
    badge.setAttribute("aria-label", "No credited goal");
    badge.textContent = "\u2715";
    return badge;
  }
  badge.setAttribute("aria-label", `Game ${matches} of scoring streak`);
  const ball = document.createElement("span");
  ball.setAttribute("aria-hidden", "true");
  ball.textContent = "\u26bd";
  const count = document.createElement("strong");
  count.setAttribute("aria-hidden", "true");
  count.textContent = String(matches);
  badge.append(ball, count);
  return badge;
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
      const creditedClubs = new Set(fixture.scorers.filter((scorer) =>
        scorer.playerKey === player.playerKey,
      ).map((scorer) => scorer.clubKey));
      for (const team of fixture.teams) {
        if (team.clubKey === run.clubKey || creditedClubs.has(team.clubKey)) {
          contexts.set(`${team.clubKey}:${fixture.season}`, {
            clubKey: team.clubKey, clubName: team.name, season: fixture.season,
          });
        }
      }
    }
  }
  const scrollTargets = [];
  const activeRun = runs.find((run) => Array.isArray(run.upcomingGames));
  for (const club of [...contexts.values()].sort((a, b) =>
    b.season - a.season || a.clubName.localeCompare(b.clubName),
  )) {
    const upcomingStreakCounts = new Map(
      activeRun?.clubKey === club.clubKey
        ? activeRun.upcomingGames.map((game, index) => [
          game.fixtureDate, activeRun.matches + index + 1,
        ])
        : [],
    );
    const fixtures = seasonData.fixtures.filter((fixture) =>
      fixture.teams.some((team) => team.clubKey === club.clubKey),
    ).sort((a, b) => a.fixtureDate.localeCompare(b.fixtureDate));
    let streakCount = 0;
    const games = fixtures.map((fixture) => {
      const side = fixture.teams.findIndex((team) => team.clubKey === club.clubKey);
      const goals = fixture.scorers.filter((scorer) =>
        scorer.playerKey === player.playerKey && scorer.clubKey === club.clubKey,
      ).reduce((total, scorer) => total + scorer.goals, 0);
      streakCount = fixture.status !== "scheduled" && goals > 0 ? streakCount + 1 : 0;
      return {
        ...fixture,
        opponent: fixture.teams[1 - side],
        venue: side === 0 ? "home" : "away",
        goals,
        streakCount,
        result: fixture.score
          ? `${club.clubName} ${fixture.score[side]}–${fixture.score[1 - side]} ${fixture.teams[1 - side].name}`
          : "",
      };
    }).filter((game) => game.season === club.season);
    const group = document.createElement("section");
    group.className = "repeated-run season-fixtures-group";
    const heading = document.createElement("h3");
    const label = `${club.clubName} · ${club.season}/${String(club.season + 1).slice(-2)} · Premier League`;
    heading.textContent = label;
    const viewport = document.createElement("div");
    viewport.className = "season-fixtures";
    viewport.tabIndex = 0;
    viewport.setAttribute("role", "region");
    viewport.setAttribute("aria-label", `${label} fixtures, oldest first`);
    const list = document.createElement("ol");
    list.className = "game-list season-game-list";
    for (const game of games) {
      const item = document.createElement("li");
      item.tabIndex = -1;
      const scheduled = game.status === "scheduled";
      item.className = scheduled ? "fixture-scheduled" : game.goals > 0 ? "fixture-scored" : "fixture-goalless";
      const state = document.createElement("span");
      state.textContent = scoringFingerprint.outcome(game) +
        ` · ${game.opponent.name} (${game.venue === "home" ? "H" : "A"})` +
        (game.result ? ` · ${game.result}` : "");
      const kickoff = document.createElement("time");
      kickoff.dateTime = game.fixtureDate;
      kickoff.textContent = formatKickoff(game.fixtureDate);
      item.append(state, kickoff);
      const streakCount = scheduled
        ? upcomingStreakCounts.get(game.fixtureDate)
        : game.streakCount;
      if (streakCount === RECORD || streakCount === RECORD + 1) {
        const milestone = document.createElement("span");
        const breaksRecord = streakCount === RECORD + 1;
        milestone.className = `streak-count-badge record-milestone ${breaksRecord ? "record-break" : "record-equal"}`;
        milestone.setAttribute("role", "img");
        milestone.setAttribute("aria-label", breaksRecord
          ? `Breaks the ${RECORD}-game record`
          : `Equals the ${RECORD}-game record`);
        milestone.textContent = breaksRecord ? "\u{1F3C6}" : "=";
        item.append(milestone);
      } else if (game.status === "completed") {
        item.append(fixtureStreakBadge(game.streakCount));
      }
      list.append(item);
    }
    viewport.append(list);
    group.append(heading, scoringFingerprint.render(games, label, [...list.children]), viewport);
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

function renderClubPicker(data) {
  if (!Array.isArray(data.clubs) || data.clubs.some((club) =>
    typeof club.slug !== "string" || typeof club.clubName !== "string",
  )) {
    throw new Error("The season data file is missing valid clubs.");
  }
  const list = document.querySelector("#club-picker-list");
  const currentSlug = isClubPage ? new URL(document.baseURI).searchParams.get("club") : null;
  const clubsUrl = new URL(isClubPage ? "./" : "clubs/", document.baseURI);
  list.replaceChildren();
  for (const club of [...data.clubs].sort((a, b) => a.clubName.localeCompare(b.clubName, "en"))) {
    const item = document.createElement("li");
    const link = document.createElement("a");
    const url = new URL(clubsUrl);
    url.searchParams.set("club", club.slug);
    link.href = url.href;
    link.dataset.clubSlug = club.slug;
    link.textContent = club.clubName;
    if (club.slug === currentSlug) link.setAttribute("aria-current", "page");
    const star = document.createElement("button");
    star.type = "button";
    star.className = "favourite-star";
    bindFavouriteButton(star, {
      type: "team", key: club.clubKey, name: club.clubName,
    });
    item.append(link, star);
    list.append(item);
  }
  const status = document.querySelector("#club-picker-status");
  status.textContent = data.clubs.length ? "Choose your club" : "No clubs in the current season fixtures.";
  updateFavouriteControls();
}

function setupClubPicker(picker) {
  picker.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && picker.open) {
      picker.open = false;
      picker.querySelector("summary").focus();
      event.preventDefault();
    }
  });
  document.addEventListener("click", (event) => {
    if (!event.composedPath().includes(picker)) picker.open = false;
  });
  document.addEventListener("focusin", (event) => {
    if (!picker.contains(event.target)) picker.open = false;
  });
}

readFavourites();
renderFavourites();
globalThis.addEventListener("storage", (event) => {
  if (event.key === FAVOURITES_KEY || event.key === null) {
    readFavourites();
    favouritesNotice = "";
    renderFavourites();
  }
});
for (const picker of document.querySelectorAll(".club-picker")) setupClubPicker(picker);

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
  globalThis.loadClubRecordChase?.(club.clubName);
  bindFavouriteButton(document.querySelector("#team-favourite"), {
    type: "team", key: club.clubKey, name: club.clubName,
  });
  updateFavouriteControls();
  document.title = `${club.clubName} | ${data.seasonLabel} scorers | Vardy Watch`;
  status.textContent = club.completedFixtures === 0
    ? "No completed league fixtures yet."
    : `${club.completedFixtures} completed league fixtures this season.`;
  if (club.liveFixtures) {
    status.textContent += " Live scores, goal totals and streaks are provisional and may change.";
  }
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
  renderClubPicker(data);
  renderClubPage(data);
  indexFavouriteEntries(data);
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
  renderClubPicker(data);
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
    `Archived fixtures start ${formatDate(data.archiveStartsAt)}. Player appearances are not present in the source exports.` +
    (data.liveFixtures ? " Live scores, goal totals and streaks are provisional and may change." : "");
  renderActive(active);
  renderWhatChanged(data.whatChanged);
  renderBest(data.seasonBestRuns);
  renderSeasonLeaders(data.seasonLeaders);
  renderPyramid(data.seasonLeaders, active);
  indexFavouriteEntries(data);
}

if (isClubPage) {
  loadClubData().catch((error) => {
    document.querySelector("#club-picker-status").textContent = "Could not load clubs. Please try again later.";
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
    document.querySelector("#club-picker-status").textContent = "Could not load clubs. Please try again later.";
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
