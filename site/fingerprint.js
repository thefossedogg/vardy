// Both exports use different player/club keys; callers resolve identity before rendering.
globalThis.scoringFingerprint = {
  outcome(game) {
    if (game.status === "completed") {
      return game.goals === 0 ? "No goal" :
        `${game.goals} ${game.goals === 1 ? "goal" : "goals"}`;
    }
    if (game.status === "live") return `Live · ${game.goals} goals (provisional)`;
    return ({
      scheduled: "Scheduled · not completed",
      postponed: "Postponed · not completed",
      cancelled: "Cancelled · not completed",
    })[game.status] || "Completion status unavailable";
  },

  render(games, label, targets) {
    const section = document.createElement("section");
    section.className = "scoring-fingerprint";
    section.setAttribute("aria-label", `${label} scoring fingerprint`);
    const heading = document.createElement("h3");
    heading.textContent = "Season scoring fingerprint";
    const note = document.createElement("p");
    note.className = "fingerprint-note";
    note.textContent = "One tile per exported club league fixture, oldest first. " +
      "0 means no credited goal, not an appearance or absence. " +
      "Whole club seasons are shown, including before/after any transfer; " +
      "credited scoring clubs are not verified squad membership or transfer dates. " +
      "Missing fixtures are not shown as zero. Open a tile for fixture details.";
    const legend = document.createElement("p");
    legend.className = "fingerprint-legend";
    legend.textContent = "0 No goal · 1 One goal · 2 Brace · 3+ Hat-trick or more · " +
      "– Scheduled · L Live (provisional) · P Postponed · C Cancelled · ? Unknown status";
    const summary = document.createElement("p");
    summary.className = "fingerprint-summary";
    const completed = games.filter((game) => game.status === "completed");
    const total = games.reduce((sum, game) => sum + game.goals, 0);
    summary.textContent = `${total} credited goals · ${completed.length} completed club fixtures · ` +
      `${completed.filter((game) => game.goals > 0).length} completed fixtures with a goal. ` +
      "Not an appearance-adjusted rate; live goals are provisional.";
    const list = document.createElement("ol");
    list.className = "fingerprint-tiles";
    games.forEach((game, index) => {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      const completed = game.status === "completed";
      const bucket = completed ? Math.min(3, game.goals) : game.status;
      button.className = `fingerprint-tile fingerprint-${bucket}`;
      button.dataset.goals = game.goals;
      button.dataset.status = game.status;
      button.textContent = completed ? (game.goals >= 3 ? "3+" : String(game.goals)) :
        ({ scheduled: "–", live: "L", postponed: "P", cancelled: "C" })[game.status] || "?";
      const description = `${label} · Fixture ${index + 1} · ` +
        `${new Date(game.fixtureDate).toLocaleDateString("en-GB", {
          day: "numeric", month: "short", year: "numeric",
        })} · ${game.opponent.name} (${game.venue === "home" ? "Home" : "Away"}) · ` +
        this.outcome(game);
      button.setAttribute("aria-label", `Open fixture details: ${description}`);
      button.title = description;
      button.addEventListener("click", () => {
        const target = targets[index];
        target.scrollIntoView({ block: "nearest" });
        target.focus({ preventScroll: true });
      });
      item.append(button);
      list.append(item);
    });
    section.append(heading, note, legend, summary, list);
    if (!games.length) {
      const empty = document.createElement("p");
      empty.textContent = "No fixture coverage available in these exports.";
      section.append(empty);
    }
    return section;
  },
};
