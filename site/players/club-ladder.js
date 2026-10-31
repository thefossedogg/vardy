function buildClubLadderData(data) {
  if (!Array.isArray(data?.seasons) || !Number.isInteger(data.season)) {
    throw new Error("The scorer export is missing valid seasons.");
  }
  const seasons = [...data.seasons].sort((a, b) => a.season - b.season);
  const totalsByClub = new Map();
  for (const season of seasons) {
    if (!Number.isInteger(season.season) || typeof season.seasonLabel !== "string" ||
      !Array.isArray(season.fixtures)) {
      throw new Error("The scorer export is missing valid fixture coverage.");
    }
    for (const fixture of season.fixtures) {
      if (fixture.status !== "completed") continue;
      if (!Array.isArray(fixture.scorers)) {
        throw new Error("A completed fixture is missing scorer data.");
      }
      for (const scorer of fixture.scorers) {
        if (typeof scorer.playerKey !== "string" || !scorer.playerKey ||
          typeof scorer.playerName !== "string" || typeof scorer.clubName !== "string" ||
          !Number.isInteger(scorer.goals) || scorer.goals < 1) continue;
        const clubPlayers = totalsByClub.get(scorer.clubName) || new Map();
        const player = clubPlayers.get(scorer.playerKey) || {
          playerKey: scorer.playerKey,
          playerName: scorer.playerName,
          goals: 0,
        };
        player.playerName = scorer.playerName;
        player.goals += scorer.goals;
        clubPlayers.set(scorer.playerKey, player);
        totalsByClub.set(scorer.clubName, clubPlayers);
      }
    }
  }

  const rowsByClub = new Map();
  for (const [clubName, players] of totalsByClub) {
    const rows = [...players.values()].sort((a, b) =>
      b.goals - a.goals ||
      a.playerName.localeCompare(b.playerName, "en") ||
      a.playerKey.localeCompare(b.playerKey),
    );
    let rank = 0;
    let previousGoals;
    rows.forEach((player, index) => {
      if (player.goals !== previousGoals) rank = index + 1;
      player.rank = rank;
      previousGoals = player.goals;
    });
    rowsByClub.set(clubName, rows);
  }
  const dates = seasons.flatMap((season) =>
    season.fixtures
      .filter((fixture) => fixture.status === "completed" && fixture.date)
      .map((fixture) => fixture.date),
  ).sort();
  const currentSeason = seasons.find((season) => season.season === data.season);
  const currentDates = currentSeason?.fixtures
    .filter((fixture) => fixture.status === "completed" && fixture.date)
    .map((fixture) => fixture.date)
    .sort() || [];
  const labels = seasons.map((season) => season.seasonLabel);
  const contiguous = seasons.every((season, index) =>
    index === 0 || season.season === seasons[index - 1].season + 1,
  );
  return {
    rowsByClub,
    currentSeason,
    completedThrough: currentDates.at(-1) || dates.at(-1) || null,
    coverageLabel: contiguous && labels.length > 1
      ? `${labels[0]}–${labels.at(-1)}`
      : labels.join(", "),
  };
}

function renderClubScoringLadder(data, player) {
  const section = document.querySelector("#club-ladders");
  const groups = document.querySelector("#club-ladder-groups");
  const coverage = document.querySelector("#club-ladder-coverage");
  const ladder = buildClubLadderData(data);
  groups.replaceChildren();

  const playerClubs = [...ladder.rowsByClub]
    .filter(([, rows]) => rows.some((row) => row.playerKey === player.playerKey));
  if (!playerClubs.length) {
    section.hidden = true;
    return;
  }

  const current = ladder.currentSeason;
  const currentNote = current?.status === "in_progress"
    ? `${current.seasonLabel} is in progress; totals are provisional through ${
      formatClubLadderDate(ladder.completedThrough)
    }.`
    : `Latest completed fixture in these exports: ${formatClubLadderDate(ladder.completedThrough)}.`;
  coverage.textContent = `Available export coverage: ${ladder.coverageLabel}. ${currentNote} ` +
    "Counts use credited goals in completed Premier League fixtures only. These are not career or all-time totals, and historical scorers are not necessarily current squad members.";

  for (const [clubName, allRows] of playerClubs) {
    const rows = allRows;
    const selected = rows.find((row) => row.playerKey === player.playerKey);
    const nextAhead = rows.find((row) => row.goals > selected.goals);
    const group = document.createElement("section");
    group.className = "club-ladder-group";
    const heading = document.createElement("h3");
    heading.textContent = clubName;
    const status = document.createElement("p");
    status.className = "club-ladder-milestone";
    if (nextAhead) {
      const tiedAhead = rows.filter((row) => row.goals === nextAhead.goals);
      const needed = nextAhead.goals - selected.goals + 1;
      const names = tiedAhead.map((row) => row.playerName).join(", ");
      status.textContent = `Rank ${selected.rank} · next scorer ahead: ${names} (` +
        `${nextAhead.goals} ${nextAhead.goals === 1 ? "goal" : "goals"}). ` +
        `${needed} more ${needed === 1 ? "goal" : "goals"} to move ahead of them.`;
    } else {
      const tiedLeaders = rows.filter((row) => row.goals === selected.goals);
      status.textContent = tiedLeaders.length > 1
        ? `Joint leader at rank ${selected.rank}; 1 more goal to lead outright.`
        : `Leads this available-season ${clubName} scoring ladder.`;
    }

    const list = document.createElement("ol");
    list.className = "club-ladder-list";
    const maximum = rows[0].goals;
    for (const row of rows) {
      const item = document.createElement("li");
      item.className = "club-ladder-row";
      if (row.playerKey === player.playerKey) {
        item.classList.add("club-ladder-selected");
        item.setAttribute("aria-current", "true");
      }
      const position = document.createElement("span");
      position.className = "club-ladder-rank";
      position.textContent = String(row.rank);
      position.setAttribute("aria-label", `Rank ${row.rank}`);
      const name = document.createElement("span");
      name.className = "club-ladder-name";
      name.textContent = row.playerName;
      const total = document.createElement("span");
      total.className = "club-ladder-total";
      total.textContent = `${row.goals} ${row.goals === 1 ? "goal" : "goals"}`;
      const track = document.createElement("span");
      track.className = "club-ladder-track";
      track.setAttribute("aria-hidden", "true");
      const bar = document.createElement("span");
      bar.className = "club-ladder-bar";
      bar.style.width = `${(row.goals / maximum) * 100}%`;
      track.append(bar);
      item.append(position, name, total, track);
      list.append(item);
    }
    group.append(heading, status, list);
    groups.append(group);
  }
  section.hidden = false;
}

function formatClubLadderDate(value) {
  if (!value) return "no completed fixtures yet";
  return new Date(value).toLocaleDateString("en-GB", {
    day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
  });
}
