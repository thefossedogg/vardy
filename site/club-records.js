const clubScoringDataUrl = new URL("../data/scoring-seasons.json", document.baseURI);
let clubRecordRequest = 0;

function sumClubSeasonGoals(season, clubName) {
  const players = new Map();
  for (const fixture of season.fixtures) {
    if (fixture.status !== "completed") continue;
    for (const scorer of fixture.scorers) {
      if (scorer.clubName !== clubName || !Number.isInteger(scorer.goals) ||
        scorer.goals < 1 || typeof scorer.playerKey !== "string") continue;
      const player = players.get(scorer.playerKey) || {
        playerKey: scorer.playerKey,
        playerName: scorer.playerName,
        goals: 0,
      };
      player.playerName = scorer.playerName;
      player.goals += scorer.goals;
      players.set(scorer.playerKey, player);
    }
  }
  return [...players.values()];
}

function calculateClubRecordChase(clubName, data) {
  if (typeof clubName !== "string" || !clubName ||
    !Number.isInteger(data?.season) || !Array.isArray(data.seasons) ||
    data.seasons.some((season) =>
      !Number.isInteger(season.season) || typeof season.seasonLabel !== "string" ||
      typeof season.status !== "string" || !Array.isArray(season.fixtures),
    )) {
    throw new Error("The scorer export is missing valid season or fixture data.");
  }

  const completedSeasons = data.seasons
    .filter((season) => season.status === "final" && season.season !== data.season)
    .sort((a, b) => a.season - b.season);
  const currentSeason = data.seasons.find((season) => season.season === data.season);
  let record = 0;
  let recordHolders = [];
  for (const season of completedSeasons) {
    for (const player of sumClubSeasonGoals(season, clubName)) {
      if (player.goals > record) {
        record = player.goals;
        recordHolders = [];
      }
      if (player.goals === record) {
        recordHolders.push({ ...player, seasonLabel: season.seasonLabel });
      }
    }
  }

  const currentGoals = currentSeason
    ? sumClubSeasonGoals(currentSeason, clubName)
    : [];
  const completedDates = currentSeason?.fixtures
    .filter((fixture) => fixture.status === "completed" && fixture.date)
    .map((fixture) => fixture.date)
    .sort();
  const completedThrough = completedDates?.at(-1) || null;
  const coverage = completedSeasons.map((season) => season.seasonLabel);
  const contiguous = completedSeasons.every((season, index) =>
    index === 0 || season.season === completedSeasons[index - 1].season + 1,
  );
  const coverageLabel = contiguous && coverage.length > 1
    ? `${coverage[0]}–${coverage.at(-1)}`
    : coverage.join(", ");

  return {
    currentSeason: currentSeason || null,
    currentGoals: currentGoals.sort((a, b) =>
      b.goals - a.goals || a.playerName.localeCompare(b.playerName, "en"),
    ),
    completedThrough,
    coverage,
    coverageLabel,
    record: record || null,
    recordHolders,
  };
}

function addRecordText(parent, tagName, className, text) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  element.textContent = text;
  parent.append(element);
  return element;
}

function formatRecordDate(value) {
  if (!value) return "no completed fixtures yet";
  return new Date(value).toLocaleDateString("en-GB", {
    day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
  });
}

function renderClubRecordChase(clubName, data) {
  const status = document.querySelector("#club-record-status");
  const content = document.querySelector("#club-record-content");
  const result = calculateClubRecordChase(clubName, data);
  content.replaceChildren();

  if (result.record) {
    addRecordText(content, "p", "record-chase-best",
      `Observed best in the completed export seasons: ${result.record} ${
        result.record === 1 ? "goal" : "goals"
      }.`);
    const holders = document.createElement("ul");
    holders.className = "record-chase-holders";
    for (const holder of result.recordHolders) {
      addRecordText(holders, "li", "",
        `${holder.playerName} · ${holder.seasonLabel}`);
    }
    content.append(holders);
  } else {
    addRecordText(content, "p", "record-chase-best",
      "No completed club season in this export coverage sets a scoring baseline.");
  }

  const current = result.currentSeason;
  const isInProgress = current?.status === "in_progress";
  const currentAsOf = current
    ? `${current.seasonLabel} ${
      isInProgress ? "in progress" : "not in progress"
    } through ${formatRecordDate(result.completedThrough)}.`
    : "No current season is included in the scorer export.";
  if (isInProgress) {
    if (!result.currentGoals.length) {
      addRecordText(content, "p", "record-chase-empty",
        `No credited goals for ${clubName} in completed ${current.seasonLabel} fixtures yet.`);
    }
    for (const player of result.currentGoals) {
      const entry = document.createElement("article");
      entry.className = "record-chase-player";
      addRecordText(entry, "h3", "", `${player.playerName} · ${player.goals} ${
        player.goals === 1 ? "goal" : "goals"
      }`);
      if (result.record) {
        const progress = document.createElement("progress");
        progress.max = result.record;
        progress.value = Math.min(player.goals, result.record);
        progress.setAttribute("aria-label",
          `${player.playerName}: ${player.goals} goals against the observed best of ${result.record}`);
        entry.append(progress);
        let chaseText;
        if (player.goals < result.record) {
          const needed = result.record - player.goals;
          chaseText = `${needed} more ${needed === 1 ? "goal" : "goals"} to equal the observed best.`;
        } else if (player.goals === result.record) {
          chaseText = `Has equalled the observed best; one more goal would set a new best in this export range.`;
        } else {
          const above = player.goals - result.record;
          chaseText = `Has beaten the observed best by ${above} ${
            above === 1 ? "goal" : "goals"
          } in this export range.`;
        }
        addRecordText(entry, "p", "", chaseText);
      }
      content.append(entry);
    }
    status.textContent = `Current totals are provisional, based on completed fixtures through ${
      formatRecordDate(result.completedThrough)
    }.`;
  } else {
    status.textContent = currentAsOf;
  }

  const coverageText = result.coverage.length
    ? `Observed completed-season coverage: ${result.coverageLabel}.`
    : "No completed seasons are included in this scorer export.";
  const currentText = current
    ? `Current season: ${currentAsOf}${isInProgress ? " Totals are provisional." : ""}`
    : currentAsOf;
  addRecordText(content, "p", "record-chase-note",
    `${coverageText} ${currentText} This is an observed-range comparison, not an all-time or full Premier League record. Goals are credited to the club the player scored for; transfers are counted separately by club.`);
}

async function loadClubRecordChase(clubName) {
  const request = ++clubRecordRequest;
  const status = document.querySelector("#club-record-status");
  const content = document.querySelector("#club-record-content");
  if (!status || !content) return;
  status.textContent = "Loading scorer-export record data…";
  content.replaceChildren();
  try {
    const response = await fetch(clubScoringDataUrl, { cache: "no-store" });
    if (!response.ok) throw new Error(`Scorer export request failed (${response.status}).`);
    const data = await response.json();
    if (request === clubRecordRequest) renderClubRecordChase(clubName, data);
  } catch (error) {
    if (request !== clubRecordRequest) return;
    status.textContent = "Could not load the scorer-export record comparison.";
    console.error(error);
  }
}
