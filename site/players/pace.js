/* A transfer boundary is inferred from the first credited goal at the next club,
   not a verified registration date. Keep this convention visible in the UI. */
function buildPace(season, playerKey) {
  const completed = season.fixtures.filter((fixture) => fixture.status === "completed")
    .sort((a, b) => a.date.localeCompare(b.date));
  const spells = [];
  for (const fixture of completed) {
    const scorer = fixture.scorers.find((entry) => entry.playerKey === playerKey);
    if (scorer && spells.at(-1)?.clubName !== scorer.clubName) {
      spells.push({ clubName: scorer.clubName, start: fixture.date });
    }
  }
  if (!spells.length) return [];
  spells[0].start = "";
  let total = 0;
  const points = [];
  for (const fixture of completed) {
    const spell = spells.findLast((entry) => entry.start <= fixture.date);
    if (!spell || !fixture.teams.includes(spell.clubName)) continue;
    const goals = fixture.scorers.filter((entry) =>
      entry.playerKey === playerKey && entry.clubName === spell.clubName,
    ).reduce((sum, entry) => sum + entry.goals, 0);
    total += goals;
    points.push({ game: points.length + 1, goals: total, fixture, clubName: spell.clubName });
  }
  return points;
}

function paceWinners(data) {
  const winners = [];
  for (let year = data.season - 1; year >= data.season - 5; year--) {
    const season = data.seasons.find((entry) => entry.season === year);
    if (!season || season.status !== "final") {
      throw new Error("Five complete historical seasons are required.");
    }
    const completed = season.fixtures.filter((fixture) => fixture.status === "completed");
    const clubs = new Set(completed.flatMap((fixture) => fixture.teams));
    if (completed.length !== 380 || clubs.size !== 20 ||
      [...clubs].some((club) =>
        completed.filter((fixture) => fixture.teams.includes(club)).length !== 38)) {
      throw new Error("Historical fixture coverage is incomplete.");
    }
    const totals = new Map();
    for (const fixture of completed) {
      for (const scorer of fixture.scorers) {
        totals.set(scorer.playerKey, (totals.get(scorer.playerKey) || 0) + scorer.goals);
      }
    }
    const maximum = Math.max(0, ...totals.values());
    if (!maximum) throw new Error("Historical scorer totals are missing.");
    for (const player of season.scorers) {
      if (player.goals !== (totals.get(player.playerKey) || 0)) {
        throw new Error("Historical scorer totals do not reconcile.");
      }
    }
    const joint = [...totals.values()].filter((total) => total === maximum).length > 1;
    for (const [key, goals] of totals) {
      if (goals !== maximum) continue;
      const player = season.scorers.find((entry) => entry.playerKey === key);
      if (!player) throw new Error("Historical winner identity is missing.");
      const points = buildPace(season, key);
      if (points.at(-1)?.goals !== goals) throw new Error("Winner pace does not reconcile.");
      winners.push({ label: `${player.playerName} · ${season.seasonLabel}${joint ? " · joint winner" : ""}`,
        season: year, points });
    }
  }
  return winners;
}

const paceColors = ["#11251e", "#0057b8", "#9b1c31", "#6a328c", "#815300", "#00675b", "#444444"];
const paceDashes = ["", "12 5", "3 5", "14 4 3 4", "7 4", "18 5 3 5 3 5", "2 3 8 3"];

function paceSvg(tag, attributes, text) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderPace(series) {
  const selected = series.filter((entry) => entry.selected);
  const maxGame = Math.max(38, ...selected.map((entry) => entry.points.length));
  const maxGoals = Math.max(5, ...selected.flatMap((entry) => entry.points.map((point) => point.goals)));
  const x = (game) => 55 + game / maxGame * 520;
  const y = (goals) => 320 - goals / maxGoals * 280;
  const svg = paceSvg("svg", { viewBox: "0 0 640 385", role: "img",
    "aria-labelledby": "pace-svg-title pace-svg-description" });
  svg.append(
    paceSvg("title", { id: "pace-svg-title" }, "Cumulative goals by completed team league game"),
    paceSvg("desc", { id: "pace-svg-description" },
      "Each line has a distinct dash pattern, matched to a named legend sample below. Exact goals and source fixtures are in the expandable tables. No future points are plotted."),
  );
  for (const game of [0, 10, 20, 30, maxGame]) {
    svg.append(paceSvg("text", { x: x(game), y: 349, "text-anchor": "middle" }, game));
  }
  for (const goals of [0, Math.ceil(maxGoals / 2), maxGoals]) {
    svg.append(paceSvg("line", { x1: x(0), x2: x(maxGame), y1: y(goals), y2: y(goals),
      stroke: "#cbd5e1" }),
    paceSvg("text", { x: 45, y: y(goals) + 7, "text-anchor": "end" }, goals));
  }
  svg.append(paceSvg("text", { x: 320, y: 380, "text-anchor": "middle" }, "Completed team league games"),
    paceSvg("text", { x: 55, y: 24 }, "Goals"));
  const tables = document.querySelector("#pace-tables");
  tables.replaceChildren();
  const current = series[0].points.at(-1);
  const comparisons = [];
  for (const entry of selected) {
    const color = paceColors[entry.index % paceColors.length];
    const dash = paceDashes[entry.index] ?? `${entry.index * 3} 4 2 4`;
    svg.append(paceSvg("polyline", {
      points: [[x(0), y(0)], ...entry.points.map((point) => [x(point.game), y(point.goals)])]
        .map((point) => point.join(",")).join(" "),
      fill: "none", stroke: color, "stroke-width": entry.index === 0 ? 4 : 3,
      "stroke-dasharray": dash,
    }));
    const last = entry.points.at(-1);
    svg.append(paceSvg("circle", { cx: x(last.game), cy: y(last.goals), r: 5, fill: color }));
    const sameGame = entry.points[current.game - 1];
    if (entry.index && sameGame) {
      const difference = current.goals - sameGame.goals;
      comparisons.push(`${entry.label}: ${difference === 0 ? "level" :
        `${Math.abs(difference)} ${Math.abs(difference) === 1 ? "goal" : "goals"} ${difference > 0 ? "ahead" : "behind"}`}`);
    } else if (entry.index) {
      comparisons.push(`${entry.label}: no completed comparison at game ${current.game}`);
    }
    const legend = document.createElement("p");
    legend.className = "pace-line-label";
    const sample = paceSvg("svg", { viewBox: "0 0 60 12", "aria-hidden": "true" });
    sample.append(paceSvg("line", { x1: 0, x2: 60, y1: 6, y2: 6,
      stroke: color, "stroke-width": 3, "stroke-dasharray": dash }));
    legend.append(sample, document.createTextNode(`[${entry.index + 1}] ${entry.label} · ${last.goals} goals after ${last.game} games`));
    const details = document.createElement("details");
    const summary = document.createElement("summary");
    summary.textContent = `Exact points and fixtures: ${entry.label}`;
    const table = document.createElement("table");
    const caption = document.createElement("caption");
    caption.textContent = `${entry.label} · cumulative goals, not appearances`;
    const head = document.createElement("thead");
    const headers = document.createElement("tr");
    for (const text of ["Game", "Goals", "Completed fixture · counted club"]) {
      const cell = document.createElement("th");
      cell.scope = "col";
      cell.textContent = text;
      headers.append(cell);
    }
    head.append(headers);
    const body = document.createElement("tbody");
    for (const point of entry.points) {
      const row = document.createElement("tr");
      for (const text of [point.game, point.goals,
        `${point.fixture.date.slice(0, 10)} · ${point.fixture.teams.join(" vs ")} · ${point.clubName}`]) {
        const cell = document.createElement("td");
        cell.textContent = text;
        row.append(cell);
      }
      body.append(row);
    }
    table.append(caption, head, body);
    details.append(summary, table);
    tables.append(legend, details);
  }
  document.querySelector("#pace-chart").replaceChildren(svg);
  document.querySelector("#pace-status").textContent =
    `${series[0].label}: ${current.goals} goals after ${current.game} completed team games. ` +
    (comparisons.length ? `At game ${current.game} — ${comparisons.join("; ")}.` : "Choose a winner to compare.");
}

async function loadPace() {
  const query = new URL(document.baseURI).searchParams;
  const response = await fetch(new URL("../data/scoring-seasons.json", document.baseURI),
    { cache: "no-store" });
  if (!response.ok) throw new Error("Pace data unavailable.");
  const data = await response.json();
  if (Number(query.get("season")) !== data.season) return;
  const season = data.seasons.find((entry) => entry.season === data.season);
  const player = season?.scorers.find((entry) => entry.playerKey === query.get("player"));
  if (!player) return;
  document.querySelector("#pace-panel").hidden = false;
  const points = buildPace(season, player.playerKey);
  if (!points.length) {
    document.querySelector("#pace-status").textContent = "No completed-fixture goals for this player yet. Live goals are excluded.";
    document.querySelector("#pace-comparisons").hidden = true;
    return;
  }
  const series = [{ label: `${player.playerName} · ${season.seasonLabel} · current`,
    points, selected: true, index: 0 }, ...paceWinners(data).map((winner, index) =>
    ({ ...winner, selected: winner.season === data.season - 1, index: index + 1 }))];
  if (series.some((entry) => new Set(entry.points.map((point) => point.clubName)).size > 1)) {
    const note = document.querySelector("#pace-transfer");
    note.hidden = false;
    note.textContent = "Transfer alignment is inferred, not a registration history: count the first scoring club's completed fixtures from season start, switch at the first credited goal for a different club, then continue with that club's fixtures. Games are stitched chronologically (including goalless games); other clubs' concurrent fixtures are not counted. A later return starts another spell. Actual transfer dates and pre-first-goal games at the new club are unknown.";
  }
  const controls = document.querySelector("#pace-comparisons");
  for (const entry of series.slice(1)) {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = entry.selected;
    input.addEventListener("change", () => { entry.selected = input.checked; renderPace(series); });
    label.append(input, document.createTextNode(` [${entry.index + 1}] ${entry.label}`));
    controls.append(label);
  }
  renderPace(series);
}

loadPace().catch((error) => {
  document.querySelector("#pace-panel").hidden = false;
  document.querySelector("#pace-status").textContent =
    "Could not load a verified pace comparison. Historical coverage or data may be unavailable.";
  document.querySelector("#pace-comparisons").hidden = true;
  console.error(error);
});
