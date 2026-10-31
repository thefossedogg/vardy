import json
import os
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
import unittest

from playwright.sync_api import expect, sync_playwright


SITE = Path(__file__).resolve().parents[1] / "site"


def fixture(date, status, scorers):
    return {
        "date": f"{date}T15:00:00Z",
        "status": status,
        "teams": ["Alpha United", "Beta City"],
        "scorers": [
            {
                "playerKey": player_key,
                "playerName": name,
                "clubName": club_name,
                "goals": goals,
            }
            for player_key, name, club_name, goals in scorers
        ],
    }


def make_data():
    seasons = [
        {
            "season": 2024,
            "seasonLabel": "2024/25",
            "status": "final",
            "fixtures": [
                fixture("2025-05-01", "completed", [
                    ("selected", "Selected Player", "Alpha United", 3),
                    ("one", "Tied Scorer One", "Alpha United", 5),
                    ("two", "Tied Scorer Two", "Alpha United", 5),
                    ("ahead", "Scorer Ahead", "Alpha United", 8),
                    ("selected", "Selected Player", "Beta City", 4),
                ]),
            ],
        },
        {
            "season": 2025,
            "seasonLabel": "2025/26",
            "status": "final",
            "fixtures": [
                fixture("2026-05-01", "completed", [
                    ("selected", "Selected Player", "Alpha United", 2),
                    ("one", "Tied Scorer One", "Alpha United", 2),
                    ("two", "Tied Scorer Two", "Alpha United", 2),
                    ("ahead", "Scorer Ahead", "Alpha United", 1),
                ]),
            ],
        },
        {
            "season": 2026,
            "seasonLabel": "2026/27",
            "status": "in_progress",
            "fixtures": [
                fixture("2026-10-25", "completed", [
                    ("selected", "Selected Player", "Alpha United", 2),
                    ("selected", "Selected Player", "Beta City", 1),
                ]),
                fixture("2026-10-26", "scheduled", [
                    ("selected", "Selected Player", "Alpha United", 100),
                    ("future", "Future Scorer", "Alpha United", 100),
                ]),
            ],
        },
    ]
    for season in seasons:
        players = {}
        for current_fixture in season["fixtures"]:
            if current_fixture["status"] != "completed":
                continue
            for scorer in current_fixture["scorers"]:
                player = players.setdefault(scorer["playerKey"], {
                    "playerKey": scorer["playerKey"],
                    "playerName": scorer["playerName"],
                    "goals": 0,
                    "clubs": {},
                })
                player["goals"] += scorer["goals"]
                player["clubs"][scorer["clubName"]] = (
                    player["clubs"].get(scorer["clubName"], 0) + scorer["goals"]
                )
        season["scorers"] = [
            {
                **player,
                "clubs": [
                    {"clubName": club, "goals": goals}
                    for club, goals in player["clubs"].items()
                ],
            }
            for player in players.values()
        ]
    return {
        "season": 2026,
        "generatedAt": "2026-10-31T07:36:31Z",
        "seasons": seasons,
    }


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


class ClubScoringLadderTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(
            ("127.0.0.1", 0), partial(QuietHandler, directory=str(SITE))
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
        self.context = self.browser.new_context()
        self.page = self.context.new_page()
        self.errors = []
        self.page.on("pageerror", lambda error: self.errors.append(str(error)))
        self.data = make_data()
        self.page.route(
            "**/data/scoring-seasons.json",
            lambda route: route.fulfill(
                status=200,
                content_type="application/json",
                body=json.dumps(self.data),
            ),
        )
        self.page.goto(
            self.base_url + "/players/?player=selected&season=2026"
        )
        expect(self.page.locator("#club-ladders")).to_be_visible()

    def tearDown(self):
        self.context.close()
        self.assertEqual([], self.errors)

    def test_tied_ranks_next_overtake_transfer_spells_and_provisional_coverage(self):
        alpha = self.page.locator(".club-ladder-group").filter(
            has=self.page.get_by_role("heading", name="Alpha United")
        )
        expect(alpha.locator(".club-ladder-row")).to_have_count(4)
        rows = alpha.locator(".club-ladder-row")
        expect(rows.locator(".club-ladder-rank")).to_have_text(["1", "2", "2", "2"])
        selected = alpha.locator(".club-ladder-selected")
        expect(selected).to_contain_text("Selected Player")
        expect(selected.locator(".club-ladder-total")).to_have_text("7 goals")
        expect(alpha.locator(".club-ladder-milestone")).to_have_text(
            "Rank 2 · next scorer ahead: Scorer Ahead (9 goals). "
            "3 more goals to move ahead of them."
        )
        expect(self.page.locator("#club-ladder-coverage")).to_contain_text(
            "2024/25–2026/27"
        )
        expect(self.page.locator("#club-ladder-coverage")).to_contain_text(
            "provisional through 25 October 2026"
        )
        expect(self.page.locator("#club-ladder-coverage")).to_contain_text(
            "not career or all-time totals"
        )
        beta = self.page.locator(".club-ladder-group").filter(
            has=self.page.get_by_role("heading", name="Beta City")
        )
        expect(beta.locator(".club-ladder-selected")).to_contain_text("5 goals")
        expect(beta.locator(".club-ladder-list .club-ladder-row")).to_have_count(1)
        self.assertNotIn(
            "Future Scorer",
            self.page.locator("#club-ladder-groups").inner_text(),
        )

    def test_joint_leader_milestone_and_readability_on_mobile(self):
        alpha = self.page.locator(".club-ladder-group").filter(
            has=self.page.get_by_role("heading", name="Alpha United")
        )
        self.data["seasons"][2]["fixtures"][0]["scorers"][0]["goals"] = 4
        player = next(
            entry for entry in self.data["seasons"][2]["scorers"]
            if entry["playerKey"] == "selected"
        )
        player["goals"] += 2
        next(
            club for club in player["clubs"] if club["clubName"] == "Alpha United"
        )["goals"] += 2
        self.page.evaluate(
            "([data, player]) => renderClubScoringLadder(data, player)",
            [self.data, player],
        )
        alpha = self.page.locator(".club-ladder-group").filter(
            has=self.page.get_by_role("heading", name="Alpha United")
        )
        expect(alpha.locator(".club-ladder-selected")).to_contain_text("9 goals")
        expect(alpha.locator(".club-ladder-milestone")).to_contain_text(
            "Joint leader at rank 1; 1 more goal to lead outright."
        )
        self.page.set_viewport_size({"width": 320, "height": 740})
        self.assertLessEqual(
            self.page.evaluate("document.documentElement.scrollWidth"), 320
        )
        self.page.keyboard.press("Tab")
        expect(self.page.locator(".wordmark")).to_be_focused()
        expect(self.page.locator(".club-ladder-selected").first).to_be_visible()

    def test_real_export_ladder_reconciles_player_and_club_fixture_totals(self):
        real = json.loads(
            (SITE / "data" / "scoring-seasons.json").read_text(encoding="utf-8")
        )
        season = real["seasons"][0]
        player = season["scorers"][0]
        self.page.evaluate(
            "([data, selected]) => renderClubScoringLadder(data, selected)",
            [real, player],
        )
        rows = self.page.locator(".club-ladder-selected")
        expected_clubs = sorted({
            scorer["clubName"]
            for data_season in real["seasons"]
            for current_fixture in data_season["fixtures"]
            if current_fixture["status"] == "completed"
            for scorer in current_fixture["scorers"]
            if scorer["playerKey"] == player["playerKey"]
        })
        self.assertEqual(len(expected_clubs), rows.count())
        for index, club_name in enumerate(expected_clubs):
            ladder = self.page.locator(".club-ladder-group").filter(
                has=self.page.get_by_role("heading", name=club_name)
            )
            goals = ladder.locator(".club-ladder-selected .club-ladder-total").inner_text()
            self.assertEqual("goals", goals.split()[1])
            expected = sum(
                scorer["goals"]
                for data_season in real["seasons"]
                for current_fixture in data_season["fixtures"]
                if current_fixture["status"] == "completed"
                for scorer in current_fixture["scorers"]
                if scorer["playerKey"] == player["playerKey"] and
                scorer["clubName"] == club_name
            )
            self.assertEqual(expected, int(goals.split()[0]), index)


if __name__ == "__main__":
    unittest.main()
