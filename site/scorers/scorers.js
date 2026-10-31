const dataUrl = new URL("../data/scoring-seasons.json", document.baseURI);
const seasonSelect = document.querySelector("#scorer-season");
const scorerList = document.querySelector("#scorer-list");
const scorerStatus = document.querySelector("#scorers-status");
const consistencySeasonSelect = document.querySelector("#consistency-season");
const consistencyStatus = document.querySelector("#consistency-status");
const consistencyChart = document.querySelector("#consistency-chart");
const consistencyTableBody = document.querySelector("#consistency-table-body");
const consistencySelection = document.querySelector("#consistency-selection");
let scoringData;
let maxGoalsAcrossSeasons = 1;
const minimumConsistencyGoals = 3;
const svgNamespace = "http://www.w3.org/2000/svg";

function formatUpdated(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Update date unavailable";
  return `DATA UPDATED ${date.toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
  })}`;
}

function sortScorers(scorers) {
  return [...scorers].sort((a, b) =>
    b.goals - a.goals ||
    a.playerName.localeCompare(b.playerName, "en") ||
    a.playerKey.localeCompare(b.playerKey),
  );
}

function topScorers(scorers) {
  const sorted = sortScorers(scorers);
  const cutoff = sorted[Math.min(49, sorted.length - 1)]?.goals;
  return sorted.filter((player, index) => index < 50 || player.goals === cutoff);
}

function formatFixtureDate(value) {
  return new Date(value).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
  });
}

function renderPlayerDetails(player, season) {
  const dialog = document.querySelector("#scorer-player-dialog");
  document.querySelector("#scorer-player-title").textContent = player.playerName;
  document.querySelector("#scorer-player-season").textContent =
    `${season.seasonLabel} · ${season.status === "in_progress" ? "In progress" : "Final"}`;
  document.querySelector("#scorer-player-summary").textContent =
    `${player.goals} ${player.goals === 1 ? "goal" : "goals"} · ` +
    player.clubs.map((club) =>
      `${club.clubName} · ${club.goals} ${club.goals === 1 ? "goal" : "goals"}`,
    ).join("; ");

  const clubs = new Set(player.clubs.map((club) => club.clubName));
  const fixtures = season.fixtures.flatMap((fixture) =>
    fixture.teams
      .filter((clubName) => clubs.has(clubName))
      .map((clubName) => ({ fixture, clubName })),
  ).sort((a, b) =>
    a.fixture.date.localeCompare(b.fixture.date) ||
    a.clubName.localeCompare(b.clubName, "en"),
  );
  const list = document.querySelector("#scorer-player-fixtures");
  list.replaceChildren();
  for (const { fixture, clubName } of fixtures) {
    const clubIndex = fixture.teams.indexOf(clubName);
    const goals = fixture.scorers
      .filter((scorer) => scorer.playerKey === player.playerKey &&
        scorer.clubName === clubName)
      .reduce((total, scorer) => total + scorer.goals, 0);
    const item = document.createElement("li");
    item.className = `player-fixture player-fixture-${fixture.status}`;
    const date = document.createElement("time");
    date.dateTime = fixture.date;
    date.textContent = formatFixtureDate(fixture.date);
    const details = document.createElement("span");
    const status = ({
      completed: "Full time",
      live: "Live · provisional",
      scheduled: "Scheduled",
      postponed: "Postponed",
      cancelled: "Cancelled",
    })[fixture.status] || "Status unavailable";
    details.textContent = `${clubName} · ${clubIndex === 0 ? "Home" : "Away"} vs ` +
      `${fixture.teams[1 - clubIndex]} · ` +
      `${goals ? `${goals} ${goals === 1 ? "goal" : "goals"}` : "No credited goals"} · ${status}`;
    item.append(date, details);
    list.append(item);
  }
  dialog.showModal();
}

function addScorerRow(scorer, rank, season) {
  const item = document.createElement("li");
  item.className = "scorer-row";

  const position = document.createElement("span");
  position.className = "scorer-rank";
  position.textContent = String(rank);
  position.setAttribute("aria-label", `Rank ${rank}`);

  const identity = document.createElement("div");
  identity.className = "scorer-identity";
  const link = document.createElement("button");
  link.type = "button";
  link.className = "scorer-player";
  link.textContent = scorer.playerName;
  link.setAttribute("aria-label",
    `View ${scorer.playerName}'s ${season.seasonLabel} scoring details`);
  link.addEventListener("click", () => renderPlayerDetails(scorer, season));

  const clubs = document.createElement("span");
  clubs.className = "scorer-clubs";
  clubs.textContent = scorer.clubs
    .map((club) => `${club.clubName} (${club.goals})`)
    .join(", ");
  identity.append(link, clubs);

  const goals = document.createElement("span");
  goals.className = "scorer-goals";
  goals.textContent = `${scorer.goals} ${scorer.goals === 1 ? "goal" : "goals"}`;

  const barTrack = document.createElement("span");
  barTrack.className = "scorer-bar-track";
  barTrack.setAttribute("aria-hidden", "true");
  const bar = document.createElement("span");
  bar.className = "scorer-bar";
  bar.style.width = `${(scorer.goals / maxGoalsAcrossSeasons) * 100}%`;
  for (const club of scorer.clubs) {
    const segment = document.createElement("span");
    segment.className = "scorer-segment";
    segment.style.width = `${(club.goals / scorer.goals) * 100}%`;
    segment.style.backgroundColor = scoringData.clubColors[club.clubName];
    segment.title = `${club.clubName}: ${club.goals} ${club.goals === 1 ? "goal" : "goals"}`;
    bar.append(segment);
  }
  barTrack.append(bar);
  item.append(position, identity, goals, barTrack);
  return item;
}

function renderSeason() {
  const season = scoringData.seasons.find((entry) =>
    entry.season === Number(seasonSelect.value),
  );
  if (!season) throw new Error("The selected season is missing from scorer data.");

  const selected = topScorers(season.scorers);
  scorerList.replaceChildren();
  let rank = 0;
  let previousGoals;
  selected.forEach((scorer, index) => {
    if (scorer.goals !== previousGoals) rank = index + 1;
    previousGoals = scorer.goals;
    scorerList.append(addScorerRow(scorer, rank, season));
  });

  const statusLabel = season.status === "in_progress" ? "In progress" : "Final";
  const status = document.querySelector("#scorer-season-status");
  status.textContent = statusLabel;
  status.className = `season-status ${season.status}`;
  scorerStatus.textContent = selected.length
    ? `Showing the top 50 scorers for ${season.seasonLabel}, including ties at the cutoff.`
    : `No credited goals are recorded for ${season.seasonLabel}.`;
  document.title = `Top scorers ${season.seasonLabel} | Vardy Watch`;
}

function playerDetailsUrl(player, season) {
  const url = new URL("../players/", document.baseURI);
  url.searchParams.set("player", player.playerKey);
  url.searchParams.set("season", String(season.season));
  return url.href;
}

function deriveConsistencyRows(season) {
  const scoredFixtures = new Map();
  for (const fixture of season.fixtures) {
    if (fixture.status !== "completed") continue;
    const playersInFixture = new Set(fixture.scorers
      .filter((scorer) => scorer.goals > 0)
      .map((scorer) => scorer.playerKey));
    for (const playerKey of playersInFixture) {
      scoredFixtures.set(playerKey, (scoredFixtures.get(playerKey) || 0) + 1);
    }
  }
  return season.scorers
    .filter((player) => player.goals >= minimumConsistencyGoals)
    .map((player) => ({
      ...player,
      scoringMatches: scoredFixtures.get(player.playerKey) || 0,
    }))
    .sort((a, b) =>
      b.goals - a.goals ||
      b.scoringMatches - a.scoringMatches ||
      a.playerName.localeCompare(b.playerName, "en") ||
      a.playerKey.localeCompare(b.playerKey),
    );
}

function svgElement(name, attributes = {}) {
  const element = document.createElementNS(svgNamespace, name);
  for (const [attribute, value] of Object.entries(attributes)) {
    element.setAttribute(attribute, String(value));
  }
  return element;
}

function chartPlayerSelection(player, season) {
  consistencySelection.replaceChildren();
  const heading = document.createElement("strong");
  heading.textContent = player.playerName;
  const summary = document.createElement("span");
  summary.textContent =
    `${player.goals} ${player.goals === 1 ? "goal" : "goals"} · ` +
    `${player.scoringMatches} scoring ${player.scoringMatches === 1 ? "match" : "matches"} · ` +
    season.seasonLabel;
  const link = document.createElement("a");
  link.href = playerDetailsUrl(player, season);
  link.textContent = "Open player season details";
  consistencySelection.append(heading, summary, link);
}

function selectConsistencyPoint(players, season) {
  consistencySelection.replaceChildren();
  if (players.length === 1) {
    chartPlayerSelection(players[0], season);
    return;
  }
  const prompt = document.createElement("p");
  prompt.textContent = `${players.length} players share these values. Choose a player:`;
  const choices = document.createElement("div");
  choices.className = "consistency-player-choices";
  for (const player of players) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = player.playerName;
    button.addEventListener("click", () => chartPlayerSelection(player, season));
    choices.append(button);
  }
  consistencySelection.append(prompt, choices);
}

function appendChartAxis(maximum, axis, formatter = (value) => String(value)) {
  const start = axis === "x" ? 76 : 24;
  const end = axis === "x" ? 770 : 410;
  const count = 5;
  for (let index = 0; index <= count; index += 1) {
    const value = Math.round((maximum * index) / count);
    const position = axis === "x"
      ? start + ((end - start) * index) / count
      : end - ((end - start) * index) / count;
    const line = axis === "x"
      ? svgElement("line", { x1: position, y1: 24, x2: position, y2: 410 })
      : svgElement("line", { x1: 76, y1: position, x2: 770, y2: position });
    line.setAttribute("class", "consistency-gridline");
    const label = svgElement("text", axis === "x"
      ? { x: position, y: 435, "text-anchor": "middle" }
      : { x: 64, y: position + 5, "text-anchor": "end" });
    label.setAttribute("class", "consistency-tick");
    label.textContent = formatter(value);
    consistencyChart.append(line, label);
  }
}

function renderConsistency(season) {
  const rows = deriveConsistencyRows(season);
  consistencyChart.replaceChildren(
    svgElement("title", { id: "consistency-chart-title" }),
    svgElement("desc", { id: "consistency-chart-desc" }),
  );
  consistencyChart.querySelector("title").textContent =
    `Goals versus scoring matches, ${season.seasonLabel}`;
  consistencyChart.querySelector("desc").textContent =
    `Players with at least ${minimumConsistencyGoals} goals. Horizontal axis: completed ` +
    `matches scored in. Vertical axis: total season goals. Select a point; exact data ` +
    `and player links are in the table below.`;
  consistencyChart.setAttribute("aria-label",
    `Goals versus scoring matches, ${season.seasonLabel}`);
  consistencyTableBody.replaceChildren();
  const caption = document.querySelector("#consistency-table-caption");
  caption.textContent = `Goals and scoring matches by player, ${season.seasonLabel}`;
  for (const player of rows) {
    const row = document.createElement("tr");
    const nameCell = document.createElement("th");
    nameCell.scope = "row";
    const link = document.createElement("a");
    link.href = playerDetailsUrl(player, season);
    link.textContent = player.playerName;
    nameCell.append(link);
    const goalsCell = document.createElement("td");
    goalsCell.textContent = String(player.goals);
    const matchesCell = document.createElement("td");
    matchesCell.textContent = String(player.scoringMatches);
    row.append(nameCell, goalsCell, matchesCell);
    consistencyTableBody.append(row);
  }

  if (!rows.length) {
    consistencyStatus.textContent =
      `No players reached ${minimumConsistencyGoals} goals in ${season.seasonLabel}.`;
    consistencySelection.textContent =
      "There are no qualifying players to select for this season.";
    return;
  }

  const maxMatches = Math.max(1, ...rows.map((player) => player.scoringMatches));
  const maxGoals = Math.max(1, ...rows.map((player) => player.goals));
  const xMaximum = Math.ceil(maxMatches / 5) * 5;
  const yMaximum = Math.ceil(maxGoals / 5) * 5;
  const left = 76;
  const right = 770;
  const top = 24;
  const bottom = 410;
  appendChartAxis(xMaximum, "x");
  appendChartAxis(yMaximum, "y");
  const xLabel = svgElement("text", {
    x: (left + right) / 2, y: 472, "text-anchor": "middle",
  });
  xLabel.setAttribute("class", "consistency-axis-label");
  xLabel.textContent = "Completed matches scored in";
  const yLabel = svgElement("text", {
    x: 17, y: (top + bottom) / 2, "text-anchor": "middle",
    transform: `rotate(-90 17 ${(top + bottom) / 2})`,
  });
  yLabel.setAttribute("class", "consistency-axis-label");
  yLabel.textContent = "Total goals";
  consistencyChart.append(xLabel, yLabel);

  const clusters = new Map();
  for (const player of rows) {
    const key = `${player.scoringMatches}:${player.goals}`;
    if (!clusters.has(key)) clusters.set(key, []);
    clusters.get(key).push(player);
  }
  for (const players of clusters.values()) {
    const { goals, scoringMatches } = players[0];
    const x = left + (scoringMatches / xMaximum) * (right - left);
    const y = bottom - (goals / yMaximum) * (bottom - top);
    const radius = Math.min(20, 8 + Math.sqrt(players.length) * 2);
    const point = svgElement("g", {
      class: "consistency-point",
      role: "button",
      tabindex: "0",
      "aria-label": players.length === 1
        ? `${players[0].playerName}: ${goals} goals in ${scoringMatches} scoring matches. Select for details.`
        : `${players.length} players: ${goals} goals in ${scoringMatches} scoring matches. Select to choose a player.`,
    });
    point.append(svgElement("circle", { cx: x, cy: y, r: radius }));
    if (players.length > 1) {
      const count = svgElement("text", {
        x, y: y + 4, "text-anchor": "middle", "aria-hidden": "true",
      });
      count.textContent = String(players.length);
      point.append(count);
    }
    const activate = () => selectConsistencyPoint(players, season);
    point.addEventListener("click", activate);
    point.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        activate();
      }
    });
    consistencyChart.append(point);
  }
  consistencyStatus.textContent =
    `${rows.length} players with at least ${minimumConsistencyGoals} goals in ` +
    `${season.seasonLabel}. Matches count only when a player scored in a completed fixture.`;
  consistencySelection.textContent =
    "Select a point or a player in the table to view season details.";
}

function validateData(data) {
  if (!Number.isInteger(data.season) || !Array.isArray(data.seasons) ||
    !data.seasons.length || !data.clubColors ||
    data.seasons.some((season) => !Array.isArray(season.scorers) ||
      !Array.isArray(season.fixtures) ||
      season.scorers.some((scorer) =>
        typeof scorer.playerKey !== "string" ||
        typeof scorer.playerName !== "string" ||
        !Number.isInteger(scorer.goals) ||
        !Array.isArray(scorer.clubs) ||
        scorer.clubs.some((club) => !data.clubColors[club.clubName]),
      ))) {
    throw new Error("The scorer data file is missing valid season or player statistics.");
  }
}

async function loadScoringData() {
  const response = await fetch(dataUrl, { cache: "no-store" });
  if (!response.ok) throw new Error(`Scorer data request failed (${response.status}).`);
  scoringData = await response.json();
  validateData(scoringData);
  maxGoalsAcrossSeasons = Math.max(1, ...scoringData.seasons.flatMap((season) =>
    season.scorers.map((scorer) => scorer.goals),
  ));

  const seasons = [...scoringData.seasons].sort((a, b) => b.season - a.season);
  for (const season of seasons) {
    const option = document.createElement("option");
    option.value = String(season.season);
    option.textContent = `${season.seasonLabel} · ${
      season.status === "in_progress" ? "In progress" : "Final"
    }`;
    seasonSelect.append(option);
  }
  seasonSelect.value = String(scoringData.season);
  for (const season of seasons) {
    const option = document.createElement("option");
    option.value = String(season.season);
    option.textContent = `${season.seasonLabel} · ${
      season.status === "in_progress" ? "In progress" : "Final"
    }`;
    consistencySeasonSelect.append(option);
  }
  consistencySeasonSelect.value = String(scoringData.season);
  seasonSelect.disabled = false;
  consistencySeasonSelect.disabled = false;
  seasonSelect.addEventListener("change", renderSeason);
  consistencySeasonSelect.addEventListener("change", () => {
    const season = scoringData.seasons.find((entry) =>
      entry.season === Number(consistencySeasonSelect.value),
    );
    if (!season) throw new Error("The selected consistency season is missing from scorer data.");
    renderConsistency(season);
  });

  const updated = document.querySelector("#scorers-updated");
  updated.textContent = formatUpdated(scoringData.generatedAt);
  if (scoringData.generatedAt) updated.dateTime = scoringData.generatedAt;
  renderSeason();
  renderConsistency(scoringData.seasons.find((entry) =>
    entry.season === Number(consistencySeasonSelect.value),
  ));
}

loadScoringData().catch((error) => {
  scorerStatus.textContent = "Could not load scorer data. Please try again later.";
  consistencyStatus.textContent =
    "Could not load goals-versus-consistency data. Please try again later.";
  console.error(error);
});
