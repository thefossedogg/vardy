# Vardy Watch

A static Premier League scoring-streak website.

Visit [vardywatch.com](https://vardywatch.com).

Star a team in the Your club / Club directory menu or on its club page,
or a player in their modal, to save up to ten
favourites in this browser. The Favourites dropdown on the homepage and club
pages opens teams or player details; its stars remove saved entries.
Favourites are independent of the club directory and are not synced to an
account or another browser. Unavailable entries remain removable and count
towards the limit. Player club labels reflect their latest credited goals in
the available exports, not verified current squad membership. If browser storage
is blocked, a warning explains that changes may be lost.

Run the browser regression tests with `python -m unittest discover -s tests`.
They require Python's `playwright` package and Microsoft Edge. Set
`BROWSER_CHANNEL` to another installed Playwright browser channel if needed.

Regenerate the six-season scorer data from the monthly BBC exports with
`python scripts/generate_scoring_data.py --source-dir <monthly-export-directory>`.
The generator checks scorer totals against the published fixture data before
writing `site/data/scoring-seasons.json`.

Current-season player scoring pages include a Golden Boot pace comparison.
The latest completed season's winner(s) are on by default; checkboxes offer
every winner, including joint winners, from the previous five seasons. The
chart counts only completed team league fixtures, includes penalties and
excludes own goals. Expand a line's table to inspect every cumulative point
and its fixture. Live and future fixtures never extend a line.

For players credited at multiple clubs, completed fixtures are stitched by
inferred scoring spells: start with the first scoring club's season, switch
on the first credited goal at the next club, and continue chronologically.
This is not verified registration history; games at the new club before its
first credited goal are unknown and omitted. A return to a club starts another
spell. No-goal fixtures do not establish appearances.

Pace data reuses the existing six-season BBC fixture export; no new paid source
or credentials are needed. The local acquisition script uses the public
`https://web-cdn.api.bbci.co.uk/wc-poll-data/container/sport-data-scores-fixtures`
endpoint with `selectedStartDate`, `selectedEndDate`, `todayDate` and the BBC
football tournament-collection URN. Public source view:
<https://www.bbc.com/sport/football/premier-league/scores-fixtures>.
The published snapshot was generated at `2026-10-31T07:36:31.832404Z`;
generation time is not a verified upstream retrieval time. It covers 2021/22
through 2025/26 completely (380 completed fixtures and 38 per club each), plus
completed 2026/27 games. Winners and points are derived and reconciled from
these fixtures rather than maintained as a second historical totals source.
Regeneration must repeat coverage/reconciliation checks; do not infer missing
history as zero. Run focused pace checks with
`python -m unittest discover -s tests -p test_pace.py`.
Player season pages and the homepage/club player modals include a season scoring
fingerprint alongside fixture/streak details. Tiles show 0, 1, 2 (brace), or 3+
(hat-trick or more); scheduled, live/provisional, postponed and cancelled games
have separate text labels. Open a tile with a click, Enter or Space to focus its
dated fixture details; the full fixture list is the text alternative.

Each scoring club is shown separately using the player and club identifiers in
that view's export (BBC URNs on season pages, existing keys in modals; no
name-based cross-export matching). Whole exported club seasons are shown, not
inferred transfer spells or appearances: a zero only means no credited goal in
that fixture. Transfer dates, non-scoring spells and squad membership are not
available. Summaries count completed club fixtures and fixtures with a goal, not
player appearances; credited totals include live goals provisionally. Missing
coverage is not represented by zero tiles. The historical Vardy benchmark
remains a streak-only view because its season predates the fixture archive.
Player season details include a favourite-opponents heatmap for the available
six-season scorer export. It defaults to the full exported date range and goals;
you can switch to scoring matches and filter by date and the player's scoring
club being home or away. Meeting counts are fixtures involving clubs the player
scored for, not appearances. Dates outside the export's fixture coverage are
unavailable, not confirmed zeroes.
