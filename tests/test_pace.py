import copy
import json
import os
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
import unittest

from playwright.sync_api import expect, sync_playwright


SITE = Path(__file__).resolve().parents[1] / "site"


def fixture(date, teams, club=None, goals=0, status="completed", key="transfer"):
    return {"date": date + "T15:00:00Z", "teams": teams, "status": status,
            "scorers": [{"playerKey": key, "playerName": key,
                         "clubName": club, "goals": goals}] if goals else []}


def transfer_season():
    return {"season": 2026, "seasonLabel": "2026/27", "status": "in_progress",
            "scorers": [{"playerKey": "transfer", "playerName": "Transfer Player",
                         "goals": 7, "clubs": [{"clubName": "A", "goals": 4},
                                              {"clubName": "B", "goals": 3}]}],
            "fixtures": [
                fixture("2026-08-01", ["A", "X"]),
                fixture("2026-08-02", ["B", "X"]),
                fixture("2026-08-08", ["A", "X"], "A", 2),
                fixture("2026-08-10", ["B", "X"]),
                fixture("2026-08-15", ["B", "X"], "B", 3),
                fixture("2026-08-16", ["A", "X"]),
                fixture("2026-08-22", ["B", "X"]),
                fixture("2026-08-29", ["A", "X"], "A", 2),
                fixture("2026-08-30", ["B", "X"]),
                fixture("2026-09-01", ["A", "X"]),
                fixture("2026-09-08", ["A", "X"], "A", 6, "live"),
                fixture("2026-09-15", ["A", "X"], status="scheduled"),
                fixture("2026-09-22", ["A", "X"], status="postponed"),
                fixture("2026-09-29", ["A", "X"], status="cancelled"),
            ]}


def data_with_joint_winners():
    data = json.loads((SITE / "data" / "scoring-seasons.json").read_text(encoding="utf8"))
    # Exercise a joint most-recent winner as well as the real 2021/22 joint winners.
    latest = data["seasons"][1]
    winner = max(latest["scorers"], key=lambda entry: entry["goals"])
    joint = copy.deepcopy(winner)
    joint["playerKey"] = "joint-winner"
    joint["playerName"] = "Joint Winner"
    latest["scorers"].append(joint)
    for match in latest["fixtures"]:
        for goal in list(match["scorers"]):
            if goal["playerKey"] == winner["playerKey"]:
                match["scorers"].append({**goal, "playerKey": joint["playerKey"],
                                         "playerName": joint["playerName"]})
    data["seasons"][0] = transfer_season()
    return data


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


class PaceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(
            ("127.0.0.1", 0), partial(QuietHandler, directory=str(SITE)))
        cls.thread = Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.base_url = f"http://127.0.0.1:{cls.server.server_port}"
        cls.playwright = sync_playwright().start()
        cls.browser = cls.playwright.chromium.launch(
            channel=os.environ.get("BROWSER_CHANNEL", "msedge"), headless=True)

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.playwright.stop()
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def setUp(self):
        self.context = self.browser.new_context()
        self.page = self.context.new_page()
        self.errors = []
        self.page.on("pageerror", lambda error: self.errors.append(str(error)))

    def tearDown(self):
        self.context.close()
        self.assertEqual([], self.errors)

    def open_data(self, data, key="transfer", year=2026):
        self.context.route("**/data/scoring-seasons.json",
                           lambda route: route.fulfill(json=data))
        self.page.goto(self.base_url + f"/players/?player={key}&season={year}")

    def test_transfer_returns_goalless_games_and_no_future_projection(self):
        data = data_with_joint_winners()
        self.open_data(data)
        expect(self.page.locator("#pace-status")).to_contain_text("7 goals after 6")
        expect(self.page.locator("#pace-transfer")).to_contain_text("not a registration")
        points = self.page.evaluate("season => buildPace(season, 'transfer')", data["seasons"][0])
        self.assertEqual([0, 2, 5, 5, 7, 7], [point["goals"] for point in points])
        self.assertEqual(["A", "A", "B", "B", "A", "A"],
                         [point["clubName"] for point in points])
        self.assertEqual("2026-09-01", points[-1]["fixture"]["date"][:10])
        expect(self.page.locator("#pace-chart polyline")).to_have_count(3)
        expect(self.page.locator("#pace-comparisons input:checked")).to_have_count(2)
        expect(self.page.locator("#pace-comparisons")).to_contain_text("Son Heung-Min")
        expect(self.page.locator("#pace-comparisons")).to_contain_text("joint winner")
        # The current polyline ends at game 6, rather than being extended to 38.
        endpoint = self.page.locator("#pace-chart polyline").first.get_attribute("points")
        self.assertAlmostEqual(55 + 6 / 38 * 520, float(endpoint.split()[-1].split(",")[0]))

    def test_keyboard_controls_text_equivalent_and_mobile_layout(self):
        self.open_data(data_with_joint_winners())
        expect(self.page.locator("#pace-status")).to_contain_text("At game 6")
        controls = self.page.locator("#pace-comparisons input")
        controls.first.focus()
        self.page.keyboard.press("Space")
        expect(controls.first).not_to_be_checked()
        expect(self.page.locator("#pace-chart polyline")).to_have_count(2)
        for index in range(controls.count()):
            if not controls.nth(index).is_checked():
                controls.nth(index).focus()
                self.page.keyboard.press("Space")
        expect(self.page.locator("#pace-chart polyline")).to_have_count(8)
        patterns = self.page.locator("#pace-chart polyline").evaluate_all(
            "lines => lines.map(line => line.getAttribute('stroke-dasharray'))")
        # Seven actual historical winners + current in this joint-winner test.
        self.assertEqual(len(patterns), len(set(patterns)))
        summary = self.page.locator("#pace-tables summary").first
        summary.focus()
        self.page.keyboard.press("Enter")
        expect(self.page.locator("#pace-tables table").first).to_be_visible()
        expect(self.page.locator("#pace-tables tbody").first.locator("tr")).to_have_count(6)
        expect(self.page.locator("#pace-tables tbody").first).to_contain_text("2026-09-01")
        for width in (1280, 390, 320):
            self.page.set_viewport_size({"width": width, "height": 844})
            self.assertLessEqual(self.page.evaluate("document.documentElement.scrollWidth"), width)
            expect(self.page.locator("#pace-chart svg")).to_be_visible()
            expect(summary).to_be_visible()

    def test_real_snapshot_winners_and_every_completed_fixture_point_reconcile(self):
        data = json.loads((SITE / "data" / "scoring-seasons.json").read_text(encoding="utf8"))
        current = data["seasons"][0]
        player = max(current["scorers"], key=lambda entry: entry["goals"])
        self.open_data(data, player["playerKey"], data["season"])
        expect(self.page.locator("#pace-status")).to_contain_text("completed team games")
        winners = self.page.evaluate("data => paceWinners(data)", data)
        self.assertEqual(6, len(winners))
        self.assertEqual(2, sum("joint winner" in winner["label"] for winner in winners))
        self.assertEqual({2021, 2022, 2023, 2024, 2025},
                         {winner["season"] for winner in winners})
        all_points = self.page.evaluate("""data => data.seasons.map(season =>
            season.scorers.map(player => buildPace(season, player.playerKey).map(point =>
                ({game: point.game, goals: point.goals, date: point.fixture.date,
                  teams: point.fixture.teams,
                  clubName: point.clubName}))))""", data)
        for season, season_points in zip(data["seasons"], all_points):
            fixtures = {(match["date"], tuple(match["teams"])): match
                        for match in season["fixtures"]}
            for player, points in zip(season["scorers"], season_points):
                completed_goals = sum(
                    scorer["goals"] for match in season["fixtures"]
                    if match["status"] == "completed" for scorer in match["scorers"]
                    if scorer["playerKey"] == player["playerKey"])
                self.assertEqual(completed_goals, points[-1]["goals"] if points else 0)
                total = 0
                for index, point in enumerate(points, 1):
                    match = fixtures[(point["date"], tuple(point["teams"]))]
                    self.assertEqual("completed", match["status"])
                    self.assertEqual(index, point["game"])
                    total += sum(scorer["goals"] for scorer in match["scorers"]
                                 if scorer["playerKey"] == player["playerKey"]
                                 and scorer["clubName"] == point["clubName"])
                    self.assertEqual(total, point["goals"])

    def test_missing_history_is_unavailable_not_zero_and_historical_page_has_no_pace(self):
        data = data_with_joint_winners()
        data["seasons"][1]["fixtures"].pop()
        self.open_data(data)
        expect(self.page.locator("#pace-status")).to_contain_text("Could not load a verified")
        expect(self.page.locator("#pace-chart polyline")).to_have_count(0)
        self.page.goto(self.base_url + "/players/?player=joint-winner&season=2025")
        expect(self.page.locator("#player-title")).to_have_text("Joint Winner")
        expect(self.page.locator("#pace-panel")).not_to_be_visible()

    def test_live_only_player_has_no_completed_comparison(self):
        data = data_with_joint_winners()
        data["seasons"][0]["fixtures"] = [
            fixture("2026-09-08", ["A", "X"], "A", 1, "live")]
        self.open_data(data)
        expect(self.page.locator("#pace-status")).to_contain_text("Live goals are excluded")
        expect(self.page.locator("#pace-chart polyline")).to_have_count(0)


if __name__ == "__main__":
    unittest.main()
