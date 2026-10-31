const dataUrl = new URL("../data/scoring-seasons.json", document.baseURI);
const query = new URL(document.baseURI).searchParams;
const playerKey = query.get("player");
const seasonYear = Number(query.get("season"));

function formatUpdated(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Update date unavailable";
  return `DATA UPDATED ${date.toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
  })}`;
}

function formatFixtureDate(value) {
  return new Date(value).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
  });
}

function fixtureStatus(status) {
  return ({
    completed: "Full time",
    live: "Live · provisional",
    scheduled: "Scheduled",
    postponed: "Postponed",
    cancelled: "Cancelled",
  })[status] || "Status unavailable";
}

function renderFixture(fixture, player, clubName) {
  const index = fixture.teams.indexOf(clubName);
  if (index < 0) return null;
  const opponent = fixture.teams[1 - index];
  const goals = fixture.scorers
    .filter((scorer) => scorer.playerKey === player.playerKey &&
      scorer.clubName === clubName)
    .reduce((total, scorer) => total + scorer.goals, 0);

  const item = document.createElement("li");
  item.className = `player-fixture player-fixture-${fixture.status}`;
  item.tabIndex = -1;
  const date = document.createElement("time");
  date.dateTime = fixture.date;
  date.textContent = formatFixtureDate(fixture.date);
  const details = document.createElement("span");
  details.textContent = `${clubName} · ${index === 0 ? "Home" : "Away"} vs ${opponent} · ` +
    `${scoringFingerprint.outcome({ ...fixture, goals })} · ` +
    fixtureStatus(fixture.status);
  item.append(date, details);
  return item;
}

function completedFixtures(data) {
  return data.seasons.flatMap((season) =>
    season.fixtures
      .filter((fixture) => fixture.status === "completed")
      .map((fixture) => ({
        ...fixture,
        season: season.season,
        seasonLabel: season.seasonLabel,
        fixtureKey: `${season.season}|${fixture.date}|${fixture.teams.join("|")}`,
      })),
  );
}

function renderFavouriteOpponents(data, player) {
  const fixtures = completedFixtures(data);
  const coverage = document.querySelector("#opponents-coverage");
  const status = document.querySelector("#opponents-status");
  const body = document.querySelector("#opponents-list");
  const start = document.querySelector("#opponents-start");
  const end = document.querySelector("#opponents-end");
  const mode = document.querySelector("#opponents-mode");
  const venue = document.querySelector("#opponents-venue");
  const heading = document.querySelector("#opponents-value-heading");
  const caption = document.querySelector("#opponents-caption");
  if (!fixtures.length) {
    coverage.textContent = "No completed fixture coverage is available in these exports.";
    status.textContent = "Opponent totals are unavailable, not confirmed zeros.";
    return;
  }

  const dates = fixtures.map((fixture) => fixture.date.slice(0, 10)).sort();
  start.min = dates[0];
  start.max = dates.at(-1);
  start.value = dates[0];
  end.min = dates[0];
  end.max = dates.at(-1);
  end.value = dates.at(-1);
  const seasons = [...new Set(fixtures.map((fixture) => fixture.seasonLabel))];
  coverage.textContent = `Export coverage: ${formatFixtureDate(dates[0])}–${formatFixtureDate(dates.at(-1))}; ` +
    `${seasons.join(", ")} · ${fixtures.length.toLocaleString("en-GB")} completed fixtures. ` +
    "This is the available six-season scorer export, not full Premier League history; " +
    "dates or opponents outside its fixture coverage are not zeros.";

  const clubsBySeason = new Map();
  for (const fixture of fixtures) {
    for (const scorer of fixture.scorers) {
      if (scorer.playerKey !== player.playerKey) continue;
      if (!clubsBySeason.has(fixture.season)) clubsBySeason.set(fixture.season, new Set());
      clubsBySeason.get(fixture.season).add(scorer.clubName);
    }
  }

  function render() {
    body.replaceChildren();
    const from = start.value;
    const to = end.value;
    const metric = mode.value;
    heading.textContent = metric === "goals" ? "Goals" : "Scoring matches";
    caption.textContent = `${player.playerName} · ${metric === "goals" ? "goals" : "matches with a credited goal"} ` +
      `against each opponent, with meetings for context.`;
    if (from && to && from > to) {
      status.textContent = "Choose a start date on or before the end date.";
      return;
    }

    const totals = new Map();
    let coveredMeetings = 0;
    for (const fixture of fixtures) {
      const date = fixture.date.slice(0, 10);
      if (date < from || date > to) continue;
      const clubs = clubsBySeason.get(fixture.season);
      if (!clubs) continue;
      const playerClubSides = fixture.teams
        .map((club, index) => clubs.has(club) ? index : -1)
        .filter((index) => index >= 0);
      if (!playerClubSides.length) continue;
      const clubSide = playerClubSides[0];
      if (venue.value !== "all" &&
        ((venue.value === "home" && clubSide !== 0) ||
          (venue.value === "away" && clubSide !== 1))) continue;
      const opponent = fixture.teams[1 - clubSide];
      if (!opponent) continue;
      const entry = totals.get(opponent) || { goals: 0, matches: new Set(), meetings: 0 };
      entry.meetings += 1;
      coveredMeetings += 1;
      for (const scorer of fixture.scorers) {
        if (scorer.playerKey === player.playerKey && scorer.clubName === fixture.teams[clubSide]) {
          entry.goals += scorer.goals;
          entry.matches.add(fixture.fixtureKey);
        }
      }
      totals.set(opponent, entry);
    }

    if (!coveredMeetings) {
      status.textContent = "No completed opponent fixtures for this player’s recorded scoring clubs in this range and venue. This is unavailable coverage, not a confirmed zero.";
      return;
    }
    status.textContent = `${coveredMeetings.toLocaleString("en-GB")} completed club meetings in this filtered range. ` +
      "Meeting counts describe fixtures involving clubs this player scored for, not player appearances.";
    const rows = [...totals].sort(([nameA, a], [nameB, b]) =>
      (metric === "goals" ? b.goals - a.goals : b.matches.size - a.matches.size) ||
      nameA.localeCompare(nameB, "en"),
    );
    const maximum = Math.max(1, ...rows.map(([, entry]) =>
      metric === "goals" ? entry.goals : entry.matches.size,
    ));
    for (const [opponent, entry] of rows) {
      const value = metric === "goals" ? entry.goals : entry.matches.size;
      const row = document.createElement("tr");
      const name = document.createElement("th");
      name.scope = "row";
      name.textContent = opponent;
      const result = document.createElement("td");
      result.className = "opponents-heat";
      result.style.setProperty("--heat", String(value / maximum));
      const primary = document.createElement("strong");
      primary.textContent = `${value} ${metric === "goals" ?
        (value === 1 ? "goal" : "goals") :
        (value === 1 ? "scoring match" : "scoring matches")}`;
      const secondary = document.createElement("span");
      secondary.textContent = metric === "goals"
        ? `${entry.matches.size} ${entry.matches.size === 1 ? "scoring match" : "scoring matches"}`
        : `${entry.goals} ${entry.goals === 1 ? "goal" : "goals"}`;
      result.append(primary, secondary);
      const meetings = document.createElement("td");
      meetings.textContent = String(entry.meetings);
      row.append(name, result, meetings);
      body.append(row);
    }
  }

  document.querySelector("#opponents-filters").addEventListener("input", render);
  document.querySelector("#opponents-filters").addEventListener("change", render);
  render();
}

async function loadPlayerSeason() {
  if (!playerKey || !Number.isInteger(seasonYear)) {
    throw new Error("A player key and season are required in the URL.");
  }
  const response = await fetch(dataUrl, { cache: "no-store" });
  if (!response.ok) throw new Error(`Scorer data request failed (${response.status}).`);
  const data = await response.json();
  const season = data.seasons.find((entry) => entry.season === seasonYear);
  const player = season?.scorers.find((entry) => entry.playerKey === playerKey);
  if (!player) {
    document.querySelector("#player-status").textContent =
      "This player or season could not be found.";
    document.querySelector("#player-season-label").textContent = "PLAYER SEASON";
    return;
  }

  document.title = `${player.playerName} · ${season.seasonLabel} | Vardy Watch`;
  document.querySelector("#player-title").textContent = player.playerName;
  document.querySelector("#player-season-label").textContent =
    `${season.seasonLabel} PREMIER LEAGUE`;
  document.querySelector("#player-status").textContent =
    season.status === "in_progress" ? "In progress · totals may change" : "Final season";
  const updated = document.querySelector("#player-updated");
  updated.textContent = formatUpdated(data.generatedAt);
  if (data.generatedAt) updated.dateTime = data.generatedAt;

  const clubs = player.clubs.map((club) =>
    `${club.clubName} · ${club.goals} ${club.goals === 1 ? "goal" : "goals"}`,
  );
  document.querySelector("#player-summary").textContent =
    `${player.goals} ${player.goals === 1 ? "goal" : "goals"} · ${clubs.join("; ")}`;
  renderClubScoringLadder(data, player);
  renderFavouriteOpponents(data, player);

  const clubNames = new Set(player.clubs.map((club) => club.clubName));
  const fixtures = season.fixtures.flatMap((fixture) =>
    [...clubNames]
      .filter((clubName) => fixture.teams.includes(clubName))
      .map((clubName) => ({ fixture, clubName })),
  ).sort((a, b) =>
    a.fixture.date.localeCompare(b.fixture.date) ||
    a.clubName.localeCompare(b.clubName, "en"),
  );
  const list = document.querySelector("#player-fixtures");
  list.replaceChildren();
  const fingerprints = document.querySelector("#player-fingerprints");
  fingerprints.replaceChildren();
  const contexts = new Map([...clubNames].map((name) => [name, { games: [], targets: [] }]));
  for (const { fixture, clubName } of fixtures) {
    const item = renderFixture(fixture, player, clubName);
    if (!item) continue;
    list.append(item);
    const side = fixture.teams.indexOf(clubName);
    const context = contexts.get(clubName);
    context.targets.push(item);
    context.games.push({
      fixtureDate: fixture.date, status: fixture.status,
      opponent: { name: fixture.teams[1 - side] },
      venue: side === 0 ? "home" : "away",
      goals: fixture.scorers.filter((scorer) =>
        scorer.playerKey === player.playerKey && scorer.clubName === clubName,
      ).reduce((total, scorer) => total + scorer.goals, 0),
    });
  }
  for (const [clubName, context] of contexts) {
    const group = document.createElement("section");
    const heading = document.createElement("h2");
    heading.textContent = `${clubName} · ${season.seasonLabel} · Premier League`;
    group.append(heading, scoringFingerprint.render(
      context.games, heading.textContent, context.targets,
    ));
    fingerprints.append(group);
  }
}

loadPlayerSeason().catch((error) => {
  document.querySelector("#player-status").textContent =
    "Could not load player scoring details. Please try again later.";
  console.error(error);
});
