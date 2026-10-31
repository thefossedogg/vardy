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
  const date = document.createElement("time");
  date.dateTime = fixture.date;
  date.textContent = formatFixtureDate(fixture.date);
  const details = document.createElement("span");
  details.textContent = `${clubName} · ${index === 0 ? "Home" : "Away"} vs ${opponent} · ` +
    `${goals ? `${goals} ${goals === 1 ? "goal" : "goals"}` : "No credited goals"} · ` +
    fixtureStatus(fixture.status);
  item.append(date, details);
  return item;
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
  for (const { fixture, clubName } of fixtures) {
    const item = renderFixture(fixture, player, clubName);
    if (item) list.append(item);
  }
}

loadPlayerSeason().catch((error) => {
  document.querySelector("#player-status").textContent =
    "Could not load player scoring details. Please try again later.";
  console.error(error);
});
