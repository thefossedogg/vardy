const dataUrl = new URL("../data/scoring-seasons.json", document.baseURI);
const seasonSelect = document.querySelector("#scorer-season");
const scorerList = document.querySelector("#scorer-list");
const scorerStatus = document.querySelector("#scorers-status");
let scoringData;
let maxGoalsAcrossSeasons = 1;

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

function addScorerRow(scorer, rank, season) {
  const item = document.createElement("li");
  item.className = "scorer-row";

  const position = document.createElement("span");
  position.className = "scorer-rank";
  position.textContent = String(rank);
  position.setAttribute("aria-label", `Rank ${rank}`);

  const identity = document.createElement("div");
  identity.className = "scorer-identity";
  const link = document.createElement("a");
  const playerUrl = new URL("../players/", document.baseURI);
  playerUrl.searchParams.set("player", scorer.playerKey);
  playerUrl.searchParams.set("season", String(season.season));
  link.href = playerUrl.href;
  link.className = "scorer-player";
  link.textContent = scorer.playerName;
  link.setAttribute("aria-label",
    `View ${scorer.playerName}'s ${season.seasonLabel} scoring details`);

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
  seasonSelect.disabled = false;
  seasonSelect.addEventListener("change", renderSeason);

  const updated = document.querySelector("#scorers-updated");
  updated.textContent = formatUpdated(scoringData.generatedAt);
  if (scoringData.generatedAt) updated.dateTime = scoringData.generatedAt;
  renderSeason();
}

loadScoringData().catch((error) => {
  scorerStatus.textContent = "Could not load scorer data. Please try again later.";
  console.error(error);
});
