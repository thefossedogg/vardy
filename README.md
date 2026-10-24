# Vardy Watch

A static Premier League scoring-streak website.

Visit [vardywatch.com](https://vardywatch.com).

Star a team on its club page or a player in their modal to save up to ten
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
