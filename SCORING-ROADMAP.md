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

- [x] Complete

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

- [x] Complete

**Goal:** Show how close a current scorer is to the best individual club season
observed in the available scorer export.

**Visual:** Progress bar or chase card showing the current total, record holder,
record season and goals needed to equal or beat the record.

**Scope:** Count completed-fixture goals only, separately for each player and
club. Compare the in-progress season's provisional totals against completed
seasons available in the scorer export. Show joint observed-range holders and
the exact exported coverage/current as-of date. Do not describe this limited
comparison as all-time, best-ever or a career record.

**Data dependency:** The current six-season scorer export (five completed
seasons plus the current season); derive the observed baseline from its
fixture-level credited goals. The export currently spans 2021/22–2026/27, not
the full Premier League era.

**Done when:** Export coverage and current-season as-of status are explicit,
joint observed-range holders are supported, and equalling or exceeding the
observed best produces accurate wording. Mobile, keyboard and readable text
checks pass, and the local change is published and integrated.

### 4. Player season scoring fingerprint

- [x] Complete

**Goal:** Reveal consistency, droughts and explosive performances at a glance.

**Visual:** One tile per club league match, distinguishing no goal, one goal,
a brace and a hat-trick or more. Open fixture details from each tile.

**Placement:** Player details, alongside existing streak views.

**Scope:** A no-goal tile means the player did not score in that club fixture;
it must not imply that they played. Distinguish future fixtures from completed
ones and handle transfers explicitly.

**Done when:** Tiles reconcile with fixture data and the legend, keyboard access
and mobile layout make the pattern understandable.

### 5. Club available-season PL scoring ladder (2021/22–2026/27)

- [ ] Complete

**Goal:** Show a player's place among their club's scorers in the available
2021/22–2026/27 exports.

**Visual:** Ranked bars with the selected player highlighted, plus the next
player they can overtake and the goals needed.

**Scope:** Count only exported PL goals scored for that club across available
2021/22–2026/27 seasons, including separate spells within that coverage.
Label the date range and provisional current-season status explicitly; these
are not career or all-time totals. Keep this distinct from the single-season
record chase. Approved scope change; implementation remains pending.

**Data dependency:** Reconciled available 2021/22–2026/27 fixture scorer exports.

**Done when:** Ties, multiple spells and milestones are correct, and historical
totals are not presented as current squad membership.

### 6. Premier League available-season scoring ladder (2021/22–2026/27)

- [ ] Complete

**Goal:** Compare a player with league scorers across available 2021/22–2026/27
seasons.

**Visual:** Available-season goal leaderboard with the selected player highlighted and
milestone markers.

**Scope:** Combine exported PL goals across clubs in available 2021/22–2026/27
seasons only. Distinguish this range's totals from this season's provisional
contribution and show the next reachable milestone. Never claim career or
all-time coverage. Approved scope change; implementation remains pending.

**Data dependency:** Reconciled available 2021/22–2026/27 fixture scorer exports.

**Done when:** Totals have a clear source and as-of date, ties are correct, and
updates do not double-count goals already included in the available-season baseline.

### 7. Goals versus consistency

- [x] Complete

**Goal:** Distinguish frequent scorers from players whose totals arrive in bursts.

**Visual:** Scatter plot of total goals against number of matches scored in.

**Scope:** Season selector and player details on selection. Describe scoring
frequency without suggesting an appearance-adjusted rate.

**Decide before building:** Minimum goal threshold and how to label overlapping points.

**Done when:** Both axes reconcile with fixture data and the chart has an
accessible table alternative.

### 8. Club reliance on its leading scorer

- [x] Complete

**Goal:** Show which clubs spread their goals and which depend on one player.

**Visual:** Ranked bars showing each club's leading scorer's share of club goals.

**Scope:** Show the numerator and denominator alongside the percentage.
Explain whether club totals include own goals credited in their favour.

**Decide before building:** Denominator definition and treatment of joint leading scorers.

**Done when:** Percentages reconcile with the stated definition and clubs with
no goals have an explicit, non-misleading display.

### 9. Favourite opponents

- [x] Complete

**Goal:** Explore who a player scores against most often.

**Visual:** Player-by-opponent heatmap showing goals or scoring matches, with
home/away filters.

**Scope:** Make the date range visible. Show fixture counts for context:
more goals against an opponent may simply reflect more meetings.

**Decide before building:** Default season/range and goals versus scoring-matches mode.

**Done when:** Counts reconcile with fixtures, filters work together, and missing
coverage is not shown as a confirmed zero.

### 10. Weekly movers

- [x] Complete

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
- Items 3, 5 and 6 use the explicitly available 2021/22–2026/27 export range,
  recording provenance, coverage and an as-of date, never all-time/career claims.
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

The notes below capture independent branch validation before integration, not
the current release state. The final release entry supersedes their pending
publication/blocker statements. Items 5/6 remain unimplemented and unchecked
under the approved available 2021/22–2026/27 scope; they do not block this release.

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
- 2026-10-31 — Item 3 implementation is local on
  `feat/club-season-record-chase-export` and pending publication/integration.
  It compares each current club scorer's completed-fixture goals with the best
  completed seasons in the available export only; the season labels and latest
  completed-fixture date are shown. It is not a full Premier League-history
  record. Item 3 remains unchecked until publication and integration.
### 2026-10-31 — Item 4 locally validated, pending publication

Implemented independently from original `main` (`c353bdb`) on
`pending-item-4-scoring-fingerprint`; the item 4 checkbox intentionally remains
unchecked until integration/publication. No item 1 baseline, item 2 pace or item 3
record-chase branch is required or included in this branch.

- Added one oldest-first tile per exported club league fixture to player season
  pages and player modals, alongside the existing fixture/streak views. Buttons
  open/focus the corresponding dated text fixture details without another modal.
- Completed fixtures show 0/1/2/3+; the exact count remains in accessible labels
  and fixture details. Scheduled, live/provisional, postponed, cancelled and
  unknown statuses are distinct; incomplete games are not zero-goal outcomes.
  Legends, per-tile text labels, visible keyboard focus and 44px targets provide
  colour-independent and mobile access.
- Defaults: separate whole-season groups for every credited scoring club (and
  the modal's selected streak club); no inferred transfer dates or appearances.
  Each group explicitly includes fixtures before/after any transfer. Totals use
  credited player goals, including provisional live goals; consistency counts
  use completed club fixtures only, never appearances. Player/club keys from
  each export resolve identity locally; no guessing across export key schemes.
- Coverage: all six scorer seasons have 380 exported fixtures, with current
  2026/27 showing 80 completed and 300 scheduled at the saved export. Tests
  reconcile all six seasons against canonical fixture dates, teams, statuses
  and club scoring totals, and every player's per-club/combined goals. Real
  transferred-player tiles reconcile fixture-by-fixture and by club.
  Missing coverage is explicit, not a confirmed zero. The January-2020 archive
  boundary still applies to older modal seasons; the 2015/16 Vardy benchmark
  retains its existing streak-only display.
- Focused Playwright/Microsoft Edge checks cover scorer navigation, real and
  synthetic transfers, identical names with distinct keys, zero/one/brace/3/4
  goals, live goals, future/pending statuses, unavailable coverage, mobile
  layouts (390px and 320px), Enter/Space/Tab, tile-to-details focus, homepage
  favourites and club-modal navigation, and Escape dismissal. Saved real-data
  club/player views also pass mobile and total checks. Final focused commands:
  `python -m unittest discover -s tests -p test_scorers.py` — 6 passed in 11.803s;
  `python -m unittest discover -s tests -p test_favourites.py -k fingerprint -k modal -k season`
  — 4 passed in 14.133s. `git diff --check` passed.
- Required full `python -m unittest discover -s tests` run: 22 tests in 83.215s,
  21 passed, one pre-existing error in
  `test_club_menu_stars_toggle_without_navigation_on_both_pages` on `/`:
  30-second timeout waiting for `[data-favourite-key="team-alpha"]`.
  This unrelated favourites failure was not fixed. Global publication remains
  paused; no push. Item 4 needs integration, the recovered full-suite gate and
  publication approval before its checkbox can be checked.
- 2026-10-31 — Item 7 implementation is on a local, unpublished branch. The
  consistency view uses a minimum of 3 goals and clusters identical
  goals/scoring-match points instead of overlapping player labels; exact values
  and player links are available in its table. Scoring matches count distinct
  completed fixtures with a credited goal, and season totals use stable player
  identity across transfers. The focused scorer-page Edge tests pass; the full
  suite still errors in the pre-existing favourites test because `team-alpha`
  is missing. The completion checkbox remains open pending all delivery gates
  and integration/publication.
- 2026-10-31 — Item 8 is implemented on an isolated branch. Leading-scorer
  share uses each player's credited goals in completed fixtures this season;
  the denominator is the club's completed-fixture score, so it includes own
  goals. Joint leaders are listed together but each share uses one leader's
  individual goal count, not the combined count. Clubs with no completed goals
  show no percentage. The affected-page Edge test passes; keep the checkbox
  pending the documented full suite and integration/publication checks.
- 2026-10-31 — Item 9 is implemented on an isolated local branch, with goals
  and the full available six-season export as the defaults. The completion
  checkbox remains unchecked pending a passing full regression suite and
  integration. The required full-suite run did not pass: it hit the known
  unrelated Favourites club-navigation timeout because `team-alpha` is absent
  from that test fixture. Two scorer-test assertions also failed in that first
  run after the feature fixture changed; the affected Edge test file now passes
  3/3 after correction, and the full suite was not rerun. Opponent coverage is
  limited to completed fixtures in `scoring-seasons.json`, and meeting context
  counts fixtures involving clubs for which the player has credited goals, not
  player appearances.
2026-10-31 — Item 10 implementation added on an independent local branch.
Defaults: an inclusive rolling seven-day window ending at the export's
`generatedAt` timestamp, shown in UTC; card priority is record overtaken, new
scoring leader, milestone, then streak extended. Leader and season-goal
milestones use credited goals in available current-season completed-fixture
exports; milestones are 10, 20, 30, and so on. The record card means passing
Jamie Vardy's documented 11-consecutive-game benchmark. Missing exports are
not treated as no-goal fixtures; the empty state is explicitly limited to
available data. Local feature checks are recorded in the implementation
session, but the checkbox remains open pending global validation, integration,
and publication.

### 2026-10-31 — Integrated release validation

- Integrated items 1/2/3/4/7/8/9/10 in order on
  `release/integrated-scoring-20261031`, preserving their independent branches.
  Revised item 3 compares observed club records from five completed seasons
  2021/22–2025/26 with provisional 2026/27 goals through the latest completed
  fixture, 25 October 2026. No full-history record claims.
- Fixed the original favourites timeout: the shared `.club-picker` class's first
  element was Favourites, not Your club. The regression now selects the club
  directory by its contained list; no timeout increases or waived assertions.
  Its original narrowed command passed (1 test, 3.938s).
- Preserved scorer modals and added their link to full season details, pace,
  fingerprints and opponent filters. Repaired automatic test merging that placed
  consistency browser tests in a non-browser class; preserved all assertions,
  updating expected synthetic totals and precise button names for the combined UI.
- Real-data checks found distinct export identities: weekly-mover cards now open
  the homepage's same-export player/streak modal rather than sending hashed keys
  to BBC-URN season pages. No name-based identity matching. Reliance leader names
  resolve from same-export club scorer metadata because fixture rows lack names.
  Both fixes have red-to-green regression seams.
- Required final `python -m unittest discover -s tests`: **40 passed in 103.985s**
  in Microsoft Edge. This includes original favourites, ties/transfers/statuses,
  all-six-season fixture/scorer/consistency/pace reconciliation, accessible text,
  mobile and keyboard checks, combined independent selectors, modal-to-season
  links, pace checkboxes, fingerprint focus, opponent filters, and real mover links.
- Additional real-data checks passed at 1280/390/320px on homepage, scorers and
  clubs, with no page errors or document overflow. All 20 clubs' observed record
  holders/current goals and reliance names/numerators/score denominators reconciled.
- Items 5/6 remain unchecked and unimplemented under the approved available
  2021/22–2026/27 scope. Publication and its live-site verification remain the
  last gate before checking off the eight integrated items.

### 2026-10-31 — Publication verified

- Release payload `da4d1e3` fast-forwarded to `main` and pushed non-force only
  after all local gates passed; remote main was still the original `c353bdb`.
  GitHub Pages run **41191328739** completed successfully for that exact payload:
  <https://github.com/thefossedogg/vardy/actions/runs/41191328739>.
- Public <https://vardywatch.com/> checks passed: seven JS/CSS assets match the
  release; homepage/scorers/club directory at 1280/390/320px have no overflow;
  real mover modal, Escape and club-directory keyboard navigation work; observed
  club-record coverage/as-of and reliance leader names are correct.
- Live combined selectors, scorer-modal-to-player link, pace checkboxes,
  fingerprint fixture focus and opponent filters passed with no page errors.
  All 25 opponent goal/meeting totals for the live leading scorer reconciled
  with the six-season fixture export.
- Items **1/2/3/4/7/8/9/10** are now checked off after integrated validation and
  verified publication. Items **5/6** remain pending, available 2021/22–2026/27
  only, without career/all-time claims. This checkbox-only follow-up must also
  complete its Pages deployment; it does not change the validated site payload.
