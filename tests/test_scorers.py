import json
import os
import re
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
import unittest

from playwright.sync_api import expect, sync_playwright


def scorer(player_key, name, goals, clubs):
    return {
        "playerKey": player_key,
        "playerName": name,
        "goals": goals,
        "clubs": [
            {"clubName": club_name, "goals": club_goals}
            for club_name, club_goals in clubs
        ],
    }


def fixture(date, home, away, player_key, club_name, goals=1):
    return {
        "date": f"{date}T15:00:00Z",
        "status": "completed",
        "teams": [home, away],
        "scorers": [{
            "playerKey": player_key,
            "playerName": "Aaron Transfer",
            "clubName": club_name,
            "goals": goals,
        }],
    }


def make_data():
    current_scorers = [
        scorer("urn:test:transfer", "Aaron Transfer", 5,
               [("Alpha United", 3), ("Beta City", 2)])
    ]
    current_scorers.extend(
        scorer(f"urn:test:player-{index:02}", f"Player {index:02}", 2,
               [("Alpha United", 2)])
        for index in range(48)
    )
    current_scorers.extend(
        scorer(f"urn:test:cutoff-{name.lower()}",
               f"Cutoff {name}", 1, [("Alpha United", 1)])
        for name in ("Charlie", "Alpha", "Bravo")
    )
    seasons = [{
        "season": 2026,
        "seasonLabel": "2026/27",
        "status": "in_progress",
        "scorers": current_scorers,
        "fixtures": [
            fixture("2026-08-01", "Alpha United", "Other Club",
                    "urn:test:transfer", "Alpha United", goals=2),
            fixture("2026-08-08", "Other Club", "Alpha United",
                    "urn:test:transfer", "Alpha United"),
            fixture("2026-08-15", "Beta City", "Other Club",
                    "urn:test:transfer", "Beta City"),
            fixture("2026-08-22", "Other Club", "Beta City",
                    "urn:test:transfer", "Beta City"),
            {
                "date": "2026-08-29T15:00:00Z",
                "status": "completed",
                "teams": ["Alpha United", "Quiet FC"],
                "scorers": [],
            },
            {
                "date": "2026-08-30T15:00:00Z",
                "status": "completed",
                "teams": ["Quiet FC", "Alpha United"],
                "scorers": [],
            },
        ],
    }]
    seasons.extend({
        "season": year,
        "seasonLabel": f"{year}/{str(year + 1)[-2:]}",
        "status": "final",
        "scorers": [scorer(
            f"urn:test:historical-{year}", "Historical Top Scorer", 8,
            [("Alpha United", 8)],
        )],
        "fixtures": [
            {
                **fixture(f"{year}-08-{index:02}", "Alpha United", "Other Club",
                          f"urn:test:historical-{year}", "Alpha United"),
                "scorers": [{
                    "playerKey": f"urn:test:historical-{year}",
                    "playerName": "Historical Top Scorer",
                    "clubName": "Alpha United",
                    "goals": 1,
                }],
            }
            for index in range(1, 9)
        ],
    } for year in range(2025, 2020, -1))
    return {
        "season": 2026,
        "seasonLabel": "2026/27",
        "generatedAt": "2026-10-25T20:43:58Z",
        "clubColors": {"Alpha United": "#123456", "Beta City": "#654321"},
        "seasons": seasons,
    }


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


class ScorerPageTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        site = Path(__file__).resolve().parents[1] / "site"
        cls.server = ThreadingHTTPServer(
            ("127.0.0.1", 0), partial(QuietHandler, directory=str(site))
        )
        cls.thread = Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.base_url = f"http://127.0.0.1:{cls.server.server_port}"
        cls.playwright = sync_playwright().start()
        cls.browser = cls.playwright.chromium.launch(
            channel=os.environ.get("BROWSER_CHANNEL", "msedge"), headless=True
        )

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.playwright.stop()
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def setUp(self):
        self.data = make_data()
        self.context = self.browser.new_context()
        self.context.route(
            "**/data/scoring-seasons.json",
            lambda route: route.fulfill(json=self.data),
        )
        self.page = self.context.new_page()
        self.errors = []
        self.page.on("pageerror", lambda error: self.errors.append(str(error)))

    def tearDown(self):
        self.context.close()
        self.assertEqual([], self.errors)

    def test_scorer_chart_cutoff_ties_scale_and_player_modal(self):
        self.page.goto(self.base_url + "/scorers/")
        expect(self.page.locator("#scorer-season")).to_have_value("2026")
        expect(self.page.locator("#scorer-season-status")).to_have_text("In progress")
        expect(self.page.locator("#scorers-updated")).to_have_attribute(
            "datetime", "2026-10-25T20:43:58Z"
        )
        expect(self.page.locator("#scorers-updated")).to_contain_text("DATA UPDATED")
        expect(self.page.locator("#scorer-season option").first).to_contain_text(
            "2026/27 · In progress"
        )
        self.page.locator("#scorer-season").select_option("2025")
        expect(self.page.locator("#scorer-season-status")).to_have_text("Final")
        self.page.locator("#scorer-season").select_option("2026")
        expect(self.page.locator("#scorer-list > li")).to_have_count(52)
        tied_rows = self.page.locator("#scorer-list > li").filter(
            has=self.page.locator(".scorer-rank", has_text="50")
        )
        expect(tied_rows.locator(".scorer-player")).to_have_text(
            ["Cutoff Alpha", "Cutoff Bravo", "Cutoff Charlie"]
        )

        first = self.page.locator("#scorer-list > li").first
        expect(first.locator(".scorer-clubs")).to_have_text(
            "Alpha United (3), Beta City (2)"
        )
        expect(first.locator(".scorer-bar")).to_have_attribute("style", "width: 62.5%;")
        expect(first.locator(".scorer-segment")).to_have_count(2)
        self.page.set_viewport_size({"width": 390, "height": 844})
        self.assertLessEqual(
            self.page.evaluate("document.documentElement.scrollWidth"), 390
        )
        first.locator(".scorer-player").click()

        expect(self.page).to_have_url(self.base_url + "/scorers/")
        expect(self.page.locator("#scorer-player-dialog")).to_be_visible()
        expect(self.page.locator("#scorer-player-title")).to_have_text("Aaron Transfer")
        expect(self.page.locator("#scorer-player-season")).to_have_text(
            "2026/27 · In progress"
        )
        expect(self.page.locator("#scorer-player-summary")).to_have_text(
            "5 goals · Alpha United · 3 goals; Beta City · 2 goals"
        )
        expect(self.page.locator("#scorer-player-dialog .player-data-note")).to_contain_text(
            "does not include player appearances"
        )
        expect(self.page.locator("#scorer-player-fixtures > li")).to_have_count(6)
        expect(self.page.locator("#scorer-player-fixtures")).to_contain_text("Beta City")
        player_button = first.locator(".scorer-player")
        self.page.keyboard.press("Escape")
        expect(self.page.locator("#scorer-player-dialog")).not_to_be_visible()
        expect(player_button).to_be_focused()
        self.page.keyboard.press("Enter")
        expect(self.page.locator("#scorer-player-dialog")).to_be_visible()
        self.page.keyboard.press("Escape")
        expect(self.page.locator("#scorer-player-dialog")).not_to_be_visible()
        expect(player_button).to_be_focused()
        self.page.keyboard.press("Enter")
        expect(self.page.locator("#scorer-player-dialog")).to_be_visible()
        self.page.get_by_role("button", name="Close player scoring details").click()
        expect(self.page.locator("#scorer-player-dialog")).not_to_be_visible()

    def test_favourite_opponents_transfers_filters_and_keyboard_mobile(self):
        self.page.set_viewport_size({"width": 390, "height": 844})
        self.page.goto(
            self.base_url + "/players/?player=urn%3Atest%3Atransfer&season=2026"
        )
        expect(self.page.locator("#opponents-coverage")).to_contain_text(
            "2026/27 · 6 completed fixtures"
        )
        expect(self.page.locator("#opponents-start")).to_have_value("2026-08-01")
        expect(self.page.locator("#opponents-end")).to_have_value("2026-08-30")
        expect(self.page.locator("#opponents-list tr")).to_have_count(2)
        other = self.page.locator("#opponents-list tr").filter(
            has=self.page.locator("th", has_text="Other Club")
        )
        quiet = self.page.locator("#opponents-list tr").filter(
            has=self.page.locator("th", has_text="Quiet FC")
        )
        expect(other.locator("td").nth(0)).to_contain_text("5 goals")
        expect(other.locator("td").nth(0)).to_contain_text("4 scoring matches")
        expect(other.locator("td").nth(1)).to_have_text("4")
        expect(quiet.locator("td").nth(0)).to_contain_text("0 goals")
        expect(quiet.locator("td").nth(1)).to_have_text("2")

        for _ in range(12):
            if self.page.evaluate("document.activeElement.id") == "opponents-start":
                break
            self.page.keyboard.press("Tab")
        self.assertEqual(
            "opponents-start",
            self.page.evaluate("document.activeElement.id"),
        )
        for _ in range(8):
            if self.page.evaluate("document.activeElement.id") == "opponents-mode":
                break
            self.page.keyboard.press("Tab")
        self.assertEqual(
            "opponents-mode",
            self.page.evaluate("document.activeElement.id"),
        )
        self.page.keyboard.press("ArrowDown")
        self.page.keyboard.press("Enter")
        expect(self.page.locator("#opponents-mode")).to_have_value("matches")
        expect(other.locator("td").nth(0)).to_contain_text("4 scoring matches")

        self.page.locator("#opponents-venue").focus()
        self.page.keyboard.press("ArrowDown")
        self.page.keyboard.press("Enter")
        expect(self.page.locator("#opponents-venue")).to_have_value("home")
        expect(other.locator("td").nth(0)).to_contain_text("2 scoring matches")
        expect(other.locator("td").nth(1)).to_have_text("2")
        self.assertLessEqual(
            self.page.evaluate("document.documentElement.scrollWidth"), 390
        )

        self.page.locator("#opponents-start").fill("2026-08-08")
        self.page.locator("#opponents-end").fill("2026-08-22")
        expect(other.locator("td").nth(0)).to_contain_text("1 scoring match")
        expect(other.locator("td").nth(1)).to_have_text("1")
        self.page.locator("#opponents-start").fill("2026-08-02")
        self.page.locator("#opponents-end").fill("2026-08-02")
        expect(self.page.locator("#opponents-status")).to_contain_text(
            "not a confirmed zero"
        )
        expect(self.page.locator("#opponents-list tr")).to_have_count(0)
        self.page.locator("#opponents-start").fill("2026-08-23")
        expect(self.page.locator("#opponents-status")).to_contain_text(
            "Choose a start date"
        )

    def test_generated_scorer_data_opens_a_real_player_modal_and_season(self):
        site = Path(__file__).resolve().parents[1] / "site"
        self.data = json.loads(
            (site / "data" / "scoring-seasons.json").read_text(encoding="utf-8")
        )
        self.page.goto(self.base_url + "/scorers/")
        expect(self.page.locator("#scorer-season")).to_have_value(
            str(self.data["season"])
        )
        first = self.page.locator("#scorer-list > li").first
        self.assertGreaterEqual(self.page.locator("#scorer-list > li").count(), 50)
        expected_player = sorted(
            self.data["seasons"][0]["scorers"],
            key=lambda player: (
                -player["goals"], player["playerName"].casefold(),
                player["playerKey"],
            ),
        )[0]
        expect(first.locator(".scorer-player")).to_have_text(
            expected_player["playerName"]
        )
        first.locator(".scorer-player").click()
        expect(self.page.locator("#scorer-player-dialog")).to_be_visible()
        expect(self.page.locator("#scorer-player-title")).to_have_text(
            expected_player["playerName"]
        )
        expect(self.page.locator("#scorer-player-summary")).to_contain_text(
            f'{expected_player["goals"]} '
        )
        expect(self.page.locator("#scorer-player-fixtures > li").first).to_be_visible()
        self.page.locator("#scorer-player-link").click()
        expect(self.page.locator("#player-title")).to_have_text(
            expected_player["playerName"]
        )
        expect(self.page.locator("#player-fixtures > li").first).to_be_visible()
        expect(self.page.locator("#opponents-status")).to_contain_text(
            "completed club meetings"
        )
        self.assertGreater(self.page.locator("#opponents-list tr").count(), 0)

    def test_fingerprint_buckets_transfers_statuses_and_mobile_keyboard(self):
        season = self.data["seasons"][0]
        key = "urn:test:transfer"
        season["scorers"][0] = scorer(
            key, "Aaron Transfer", 12, [("Alpha United", 6), ("Beta City", 6)]
        )
        season["fixtures"] = []
        for index, (club, goals, status) in enumerate([
            ("Alpha United", 0, "completed"),
            ("Alpha United", 1, "completed"),
            ("Alpha United", 2, "completed"),
            ("Alpha United", 3, "completed"),
            ("Beta City", 4, "completed"),
            ("Beta City", 0, "scheduled"),
            ("Beta City", 0, "postponed"),
            ("Beta City", 0, "cancelled"),
            ("Beta City", 2, "live"),
            ("Beta City", 0, "unknown"),
        ]):
            game = fixture(f"2026-08-{index + 1:02}", club, "Other Club", key, club)
            game["status"] = status
            game["scorers"][0]["goals"] = goals
            # A namesake is not the selected player.
            game["scorers"].append({
                "playerKey": "urn:test:namesake", "playerName": "Aaron Transfer",
                "clubName": club, "goals": 2,
            })
            season["fixtures"].append(game)
        self.page.set_viewport_size({"width": 390, "height": 844})
        self.page.goto(self.base_url + f"/players/?player={key}&season=2026")
        tiles = self.page.locator(".fingerprint-tile")
        expect(tiles).to_have_text(["0", "1", "2", "3+", "3+", "–", "P", "C", "L", "?"])
        expect(self.page.locator(".fingerprint-summary")).to_have_text([
            "6 credited goals · 4 completed club fixtures · 3 completed fixtures with a goal. "
            "Not an appearance-adjusted rate; live goals are provisional.",
            "6 credited goals · 1 completed club fixtures · 1 completed fixtures with a goal. "
            "Not an appearance-adjusted rate; live goals are provisional.",
        ])
        expect(tiles.nth(4)).to_have_attribute("aria-label", re.compile("4 goals"))
        expect(tiles.nth(8)).to_have_attribute(
            "aria-label", re.compile(r"Live · 2 goals \(provisional\)")
        )
        expect(self.page.locator(".fingerprint-note").first).to_contain_text("before/after any transfer")
        expect(self.page.locator(".fingerprint-legend").first).to_contain_text("2 Brace")
        tiles.first.focus()
        self.page.keyboard.press("Tab")
        expect(tiles.nth(1)).to_be_focused()
        self.page.keyboard.press("Enter")
        expect(self.page.locator("#player-fixtures > li").nth(1)).to_be_focused()
        tiles.nth(5).focus()
        self.page.keyboard.press("Space")
        expect(self.page.locator("#player-fixtures > li").nth(5)).to_be_focused()
        expect(self.page.locator("#player-fixtures > li").nth(5)).to_contain_text(
            "Scheduled · not completed"
        )
        self.assertLessEqual(self.page.evaluate("document.documentElement.scrollWidth"), 390)
        self.assertTrue(tiles.evaluate_all(
            "(nodes) => nodes.every(n => n.getBoundingClientRect().width >= 44 && "
            "n.getBoundingClientRect().height >= 44)"
        ))
        self.page.set_viewport_size({"width": 320, "height": 740})
        self.assertLessEqual(self.page.evaluate("document.documentElement.scrollWidth"), 320)

    def test_fingerprint_missing_coverage_is_not_zero(self):
        self.data["seasons"][0]["fixtures"] = []
        self.page.goto(self.base_url + "/players/?player=urn:test:transfer&season=2026")
        expect(self.page.locator(".fingerprint-tile")).to_have_count(0)
        expect(self.page.locator("#player-fingerprints")).to_contain_text(
            "No fixture coverage available"
        )

    def test_real_fingerprint_reconciles_transferred_player(self):
        site = Path(__file__).resolve().parents[1] / "site"
        self.data = json.loads(
            (site / "data" / "scoring-seasons.json").read_text(encoding="utf-8")
        )
        season = next(s for s in self.data["seasons"] if any(
            len(p["clubs"]) > 1 for p in s["scorers"]
        ))
        player = next(p for p in season["scorers"] if len(p["clubs"]) > 1)
        self.page.goto(self.base_url +
                       f'/players/?player={player["playerKey"]}&season={season["season"]}')
        groups = self.page.locator("#player-fingerprints > section")
        expect(groups).to_have_count(len(player["clubs"]))
        for index, club in enumerate(player["clubs"]):
            tiles = groups.nth(index).locator(".fingerprint-tile")
            expected = [f for f in season["fixtures"] if club["clubName"] in f["teams"]]
            expect(tiles).to_have_count(len(expected))
            goals = tiles.evaluate_all("(nodes) => nodes.map(n => Number(n.dataset.goals))")
            self.assertEqual(club["goals"], sum(goals))
            self.assertEqual([
                sum(s["goals"] for s in f["scorers"]
                    if s["playerKey"] == player["playerKey"] and
                    s["clubName"] == club["clubName"])
                for f in expected
            ], goals)
        groups.first.locator(".fingerprint-tile").first.click()
        expect(self.page.locator("#player-fixtures > li").first).to_be_focused()
        self.page.set_viewport_size({"width": 320, "height": 740})
        self.assertLessEqual(self.page.evaluate("document.documentElement.scrollWidth"), 320)


class FixtureReconciliationTests(unittest.TestCase):
    def test_all_six_seasons_player_club_totals_and_canonical_fixture_coverage(self):
        site = Path(__file__).resolve().parents[1] / "site"
        data = json.loads((site / "data" / "scoring-seasons.json").read_text(encoding="utf-8"))
        canonical = json.loads((site / "data" / "current-season.json").read_text(encoding="utf-8"))
        for season in data["seasons"]:
            expected = {
                (f["fixtureDate"], tuple(t["name"] for t in f["teams"])): f
                for f in canonical["fixtures"] if f["season"] == season["season"]
            }
            self.assertEqual(len(expected), len(season["fixtures"]))
            totals = {}
            for game in season["fixtures"]:
                source = expected[(game["date"], tuple(game["teams"]))]
                self.assertEqual(source["status"], game["status"])
                for side, name in enumerate(game["teams"]):
                    self.assertEqual(
                        sum(s["goals"] for s in source["scorers"]
                            if s["clubKey"] == source["teams"][side]["clubKey"]),
                        sum(s["goals"] for s in game["scorers"] if s["clubName"] == name),
                    )
                for entry in game["scorers"]:
                    key = (entry["playerKey"], entry["clubName"])
                    totals[key] = totals.get(key, 0) + entry["goals"]
            for player in season["scorers"]:
                self.assertEqual(player["goals"], sum(c["goals"] for c in player["clubs"]))
                for club in player["clubs"]:
                    self.assertEqual(
                        club["goals"], totals[(player["playerKey"], club["clubName"])]
                    )

    def test_consistency_chart_clusters_points_and_supports_keyboard_selection(self):
        season = self.data["seasons"][0]
        for key, name in (
            ("urn:test:burst", "Burst Player"),
            ("urn:test:burst-two", "Burst Player Two"),
        ):
            season["scorers"].append(scorer(
                key, name, 4, [("Alpha United", 4)],
            ))
            for current_fixture in season["fixtures"][:2]:
                current_fixture["scorers"].append({
                    "playerKey": key,
                    "playerName": name,
                    "clubName": "Alpha United",
                    "goals": 2,
                })
        season["fixtures"].append({
            **fixture("2026-08-29", "Alpha United", "Other Club",
                      "urn:test:burst", "Alpha United"),
            "status": "scheduled",
        })
        self.data["seasons"][-1]["scorers"][0]["goals"] = 2

        self.page.goto(self.base_url + "/scorers/")
        expect(self.page.locator("#consistency-season")).to_have_value("2026")
        expect(self.page.locator("#consistency-status")).to_contain_text(
            "3 players with at least 3 goals"
        )
        table_summary = self.page.locator(".consistency-table summary")
        table_summary.focus()
        table_summary.press("Enter")
        expect(self.page.locator(".consistency-table")).to_have_attribute("open", "")
        transfer_row = self.page.locator("#consistency-table-body tr").filter(
            has=self.page.locator("a", has_text="Aaron Transfer")
        )
        expect(transfer_row.locator("td")).to_have_text(["4", "4"])
        cluster = self.page.locator(
            '.consistency-point[aria-label*="2 players"]'
        )
        expect(cluster).to_have_count(1)
        cluster.focus()
        cluster.press("Enter")
        expect(self.page.locator(".consistency-player-choices button")).to_have_text(
            ["Burst Player", "Burst Player Two"]
        )
        self.page.get_by_role("button", name="Burst Player Two").click()
        expect(self.page.get_by_role("link", name="Open player season details")).to_have_attribute(
            "href",
            self.base_url +
            "/players/?player=urn%3Atest%3Aburst-two&season=2026",
        )

        self.page.set_viewport_size({"width": 390, "height": 844})
        self.assertLessEqual(
            self.page.evaluate("document.documentElement.scrollWidth"), 390
        )
        self.page.locator("#consistency-season").select_option("2025")
        expect(self.page.locator("#consistency-table-body tr")).to_have_count(1)
        expect(self.page.locator("#consistency-table-body td")).to_have_text(["8", "8"])
        self.page.locator("#consistency-season").select_option("2021")
        expect(self.page.locator("#consistency-status")).to_have_text(
            "No players reached 3 goals in 2021/22."
        )
        expect(self.page.locator("#consistency-table-body tr")).to_have_count(0)

    def test_generated_six_season_goal_and_scoring_match_data_reconciles(self):
        site = Path(__file__).resolve().parents[1] / "site"
        data = json.loads(
            (site / "data" / "scoring-seasons.json").read_text(encoding="utf-8")
        )
        self.assertEqual(6, len(data["seasons"]))
        for season in data["seasons"]:
            goals_by_player = {}
            matches_by_player = {}
            for current_fixture in season["fixtures"]:
                if current_fixture["status"] != "completed":
                    continue
                players_in_fixture = set()
                for credited_scorer in current_fixture["scorers"]:
                    key = credited_scorer["playerKey"]
                    goals_by_player[key] = (
                        goals_by_player.get(key, 0) + credited_scorer["goals"]
                    )
                    players_in_fixture.add(key)
                for key in players_in_fixture:
                    matches_by_player.setdefault(key, set()).add(
                        (current_fixture["date"], tuple(current_fixture["teams"]))
                    )
            for player in season["scorers"]:
                self.assertEqual(
                    player["goals"], goals_by_player.get(player["playerKey"], 0),
                    f'{season["seasonLabel"]}: {player["playerName"]} goals',
                )
                self.assertLessEqual(
                    len(matches_by_player.get(player["playerKey"], set())),
                    player["goals"],
                    f'{season["seasonLabel"]}: {player["playerName"]} scoring matches',
                )

        self.data = data
        self.page.goto(self.base_url + "/scorers/")
        for season in data["seasons"]:
            self.page.locator("#consistency-season").select_option(
                str(season["season"])
            )
            scoring_matches = {}
            for current_fixture in season["fixtures"]:
                if current_fixture["status"] != "completed":
                    continue
                for key in {
                    credited_scorer["playerKey"]
                    for credited_scorer in current_fixture["scorers"]
                    if credited_scorer["goals"] > 0
                }:
                    scoring_matches.setdefault(key, set()).add(
                        (current_fixture["date"], tuple(current_fixture["teams"]))
                    )
            expected = {
                player["playerKey"]: [
                    player["goals"],
                    len(scoring_matches.get(player["playerKey"], set())),
                ]
                for player in season["scorers"]
                if player["goals"] >= 3
            }
            actual = self.page.locator("#consistency-table-body tr").evaluate_all(
                """rows => Object.fromEntries(rows.map(row => {
                  const link = row.querySelector("a");
                  const key = new URL(link.href).searchParams.get("player");
                  const values = [...row.querySelectorAll("td")]
                    .map(cell => Number(cell.textContent));
                  return [key, values];
                }))"""
            )
            self.assertEqual(expected, actual, season["seasonLabel"])


if __name__ == "__main__":
    unittest.main()
