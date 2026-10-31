# Scoring stats and visuals roadmap

Expand Vardy Watch around **the scoring race** and **chasing legends**, while
keeping live streaks and record chases at the heart of the site.

Work through the numbered items one at a time. Each checkbox represents a
feature that is implemented and validated, not just designed.

## Delivery order

### 1. Six-season top-scorer chart

- [x] Complete

**Goal:** Explore the Golden Boot race this season and the previous five seasons.

**Visual:** Ranked horizontal bars in club colours, with a season selector.
Clicking a player opens their scoring details.

**Scope:** Show player, club and goal total; include tied scorers fairly. Clearly
distinguish the ongoing season from completed seasons.

Show the top 50 scorers (including ties at the cutoff), with transferred players
combined into one total and segmented by club goals.

**Done when:** Totals reconcile with fixture scoring data, ties and transfers
are handled, and the chart works on mobile with accessible text equivalents.

### 2. Golden Boot pace comparison

- [ ] Complete

**Goal:** Answer: "Is this player ahead of previous Golden Boot winners' pace?"

**Visual:** Cumulative goals line chart comparing a selected current scorer
with winners from the previous five seasons.

**Scope:** Align by team league games played, not calendar date. Stop the
current player's line at the latest completed game; do not imply future results.
Include joint Golden Boot winners.

**Decide before building:** Default comparison lines and how to align a player
who transfers between clubs during a season.

**Done when:** Each point reconciles with completed fixtures, the alignment is
explained, and lines remain readable without relying on colour alone.

### 3. Club single-season record chase

- [ ] Complete

**Goal:** Show how close a current scorer is to their club's best-ever individual
Premier League season.

**Visual:** Progress bar or chase card showing the current total, record holder,
record season and goals needed to equal or beat the record.

**Scope:** Count only goals scored for the selected club. Label this explicitly
as a Premier League single-season record, not an all-competitions record.

**Data dependency:** Verified historical club records covering the full PL era.

**Done when:** Record provenance is available, joint record holders are supported,
and equalling or exceeding the record produces accurate wording.

### 4. Player season scoring fingerprint

- [ ] Complete

**Goal:** Reveal consistency, droughts and explosive performances at a glance.

**Visual:** One tile per club league match, distinguishing no goal, one goal,
a brace and a hat-trick or more. Open fixture details from each tile.

**Placement:** Player details, alongside existing streak views.

**Scope:** A no-goal tile means the player did not score in that club fixture;
it must not imply that they played. Distinguish future fixtures from completed
ones and handle transfers explicitly.

**Done when:** Tiles reconcile with fixture data and the legend, keyboard access
and mobile layout make the pattern understandable.

### 5. Club all-time PL scoring ladder

- [ ] Complete

**Goal:** Show a player's place among their club's Premier League scoring legends.

**Visual:** Ranked bars with the selected player highlighted, plus the next
player they can overtake and the goals needed.

**Scope:** Count only PL goals scored for that club, including separate spells.
Keep this distinct from the single-season record chase.

**Data dependency:** Verified full-history player-by-club PL totals.

**Done when:** Ties, multiple spells and milestones are correct, and historical
totals are not presented as current squad membership.

### 6. Premier League all-time scoring ladder

- [ ] Complete

**Goal:** Compare a player with the league's all-time scorers.

**Visual:** Career-goal leaderboard with the selected player highlighted and
milestone markers.

**Scope:** Combine PL goals across clubs. Distinguish career totals from this
season's contribution and show the next reachable milestone.

**Data dependency:** Verified PL career totals covering the full competition history.

**Done when:** Totals have a clear source and as-of date, ties are correct, and
updates do not double-count goals already included in the historical baseline.

### 7. Goals versus consistency

- [ ] Complete

**Goal:** Distinguish frequent scorers from players whose totals arrive in bursts.

**Visual:** Scatter plot of total goals against number of matches scored in.

**Scope:** Season selector and player details on selection. Describe scoring
frequency without suggesting an appearance-adjusted rate.

**Decide before building:** Minimum goal threshold and how to label overlapping points.

**Done when:** Both axes reconcile with fixture data and the chart has an
accessible table alternative.

### 8. Club reliance on its leading scorer

- [ ] Complete

**Goal:** Show which clubs spread their goals and which depend on one player.

**Visual:** Ranked bars showing each club's leading scorer's share of club goals.

**Scope:** Show the numerator and denominator alongside the percentage.
Explain whether club totals include own goals credited in their favour.

**Decide before building:** Denominator definition and treatment of joint leading scorers.

**Done when:** Percentages reconcile with the stated definition and clubs with
no goals have an explicit, non-misleading display.

### 9. Favourite opponents

- [ ] Complete

**Goal:** Explore who a player scores against most often.

**Visual:** Player-by-opponent heatmap showing goals or scoring matches, with
home/away filters.

**Scope:** Make the date range visible. Show fixture counts for context:
more goals against an opponent may simply reflect more meetings.

**Decide before building:** Default season/range and goals versus scoring-matches mode.

**Done when:** Counts reconcile with fixtures, filters work together, and missing
coverage is not shown as a confirmed zero.

### 10. Weekly movers

- [ ] Complete

**Goal:** Give returning visitors a quick answer to "What changed?"

**Visual:** Compact cards for a new scoring leader, milestone reached, record
overtaken or streak extended.

**Scope:** Use an explicit comparison window and link each card to the relevant
player, club or record view. Complement existing recently ended streaks.

**Decide before building:** Rolling seven days versus matchweek, and card priority.

**Done when:** Changes are derived reproducibly, ties do not create false leader
changes, and quiet periods have an honest empty state.

## Shared data and presentation rules

- The current export contains club scorer totals and fixture-level scoring data.
  Verify coverage and reconciliation before using them for each new feature.
- The archive starts in January 2020. Do not label archive-only totals as PL
  all-time records, and do not treat a partially covered season as complete.
- Source full-history club records and career totals separately, recording
  provenance, coverage and an as-of date.
- Preserve stable player and club identity across seasons and transfers.
- Keep live races on the homepage and deeper comparisons on club/player views.
- Provide mobile-friendly visuals, keyboard access and readable text equivalents.
- Defer goals per 90, non-penalty goals and conversion rates until minutes,
  penalty and shot data are verified.

## Workflow for each item

1. Confirm the scope and resolve its listed decisions.
2. Check data coverage, definitions and historical sources where required.
3. Implement the smallest complete feature using existing site patterns.
4. Validate totals, edge cases, accessibility and mobile presentation.
5. Mark the item complete and record any material limitations below.

## Delivery notes

Add dated implementation notes and any remaining limitations here as items ship.

- 2026-10-31 — Item 1 implementation: six-season ranked scorer chart with tie-safe
  top-50 cutoffs, transfer club segments, season status labels and keyboard-
  accessible player scoring details. Scorer totals reconcile with the archived
  fixture scorer records. The archive does not record appearances, so a fixture
  with no credited goals is not evidence that a player appeared. Publication is
  pending: the required full test suite repeatedly times out in the unrelated
  `test_club_menu_stars_toggle_without_navigation_on_both_pages` favourite-menu
  test because its `team-alpha` control never appears.
- 2026-10-31 — Item 1 pending baseline is preserved on local branch
  `pending-item-1-baseline`, commit `382ede6`; no publication. The global gate
  remains the unrelated favourite-menu regression where `team-alpha` never
  appears in `test_club_menu_stars_toggle_without_navigation_on_both_pages`.
- 2026-10-31 — Item 2 isolated from committed main `c353bdbe`: current player
  pages compare cumulative completed-fixture goals with all previous-five-season
  winners, including joint winners. Latest season winner(s) default on; others
  are opt-in to avoid clutter. Dash samples and named text/table equivalents
  avoid colour-only interpretation. Transfers use chronological scoring spells,
  switching at the first credited goal at the next club, not verified transfer
  dates; unknown pre-first-goal games at that club are omitted and explained.
  BBC export provenance and coverage are documented in README. Checkbox remains
  unchecked pending full-suite/global publication gate. Five focused Edge browser
  tests pass: real-snapshot reconciliation for every scorer/point, joint winners,
  transfer/return spells, goalless and excluded live/future fixtures, unavailable
  history, keyboard checkboxes/tables, and 1280/390/320px layouts. The documented
  full suite ran once (22 tests, 99.083s): the pre-existing favourite-menu
  `team-alpha` timeout persists. It also exposed an item-2 CSS-class selector
  collision in the scorer test; fixed by keeping pace notes separate from the
  existing player-note class. Combined pace/scorer regression validation passes
  (7 tests, 21.917s); `git diff --check` also passes. No baseline-item dependency:
  item 2 uses only the dataset/player views already on committed main.
  No pushes or deployment attempts while the global gate remains unresolved.
