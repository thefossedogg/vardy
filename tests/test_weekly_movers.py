import os
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
import unittest
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import expect, sync_playwright


AS_OF = "2026-10-31T12:00:00Z"


def fixture(date, scorers, status="completed"):
    return {
        "season": 2026,
        "fixtureDate": date,
        "status": status,
        "teams": [
            {"clubKey": "club-a", "name": "Alpha United"},
            {"clubKey": "club-b", "name": "Beta City"},
        ],
        "scorers": scorers,
    }


def goals(player_key, club_key, count):
    return {"playerKey": player_key, "clubKey": club_key, "goals": count}


def make_data():
    players = [
        ("player-a", "Ada Alpha", "club-a", "Alpha United"),
        ("player-b", "Ben Beta", "club-b", "Beta City"),
        ("player-runner", "Rory Runner", "club-a", "Alpha United"),
    ]
    return {
        "season": 2026,
        "seasonLabel": "2026/27",
        "generatedAt": AS_OF,
        "archiveStartsAt": "2020-01-01",
        "benchmark": {"season": "2015/16"},
        "clubs": [
            {
                "clubKey": key,
                "clubName": name,
                "slug": key.removeprefix("club-"),
                "scorers": [
                    {"playerKey": player_key, "playerName": player_name, "goals": 0}
                    for player_key, player_name, player_club, _ in players
                    if player_club == key
                ],
            }
            for key, name in (("club-a", "Alpha United"), ("club-b", "Beta City"))
        ],
        "fixtures": [
            fixture("2026-10-23T12:00:00Z", [
                goals("player-a", "club-a", 9),
                goals("player-b", "club-b", 8),
            ]),
            fixture("2026-10-24T12:00:00Z", [goals("player-b", "club-b", 1)]),
            fixture("2026-10-27T15:00:00Z", [goals("player-b", "club-b", 1)]),
            fixture("2026-10-31T13:00:00Z", [goals("player-a", "club-a", 20)]),
            fixture("2026-10-28T15:00:00Z", [goals("player-a", "club-a", 50)], "scheduled"),
        ],
        "activeInSeason": [{
            "playerKey": "player-runner",
            "playerName": "Rory Runner",
            "clubKey": "club-a",
            "clubName": "Alpha United",
            "matches": 12,
            "lastScoringDate": "2026-10-29T15:00:00Z",
            "games": [
                {"fixtureDate": f"2026-10-{day:02d}T15:00:00Z"}
                for day in range(18, 30)
            ],
        }],
        "seasonBestRuns": [],
        "seasonLeaders": [],
        "whatChanged": {"endedStreaks": []},
    }


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


class WeeklyMoverTests(unittest.TestCase):
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
            "**/data/current-season.json",
            lambda route: route.fulfill(json=self.data),
        )
        self.page = self.context.new_page()
        self.errors = []
        self.page.on("pageerror", lambda error: self.errors.append(str(error)))

    def tearDown(self):
        self.context.close()
        self.assertEqual([], self.errors)

    def test_priority_window_coverage_and_mobile_keyboard_navigation(self):
        self.page.set_viewport_size({"width": 390, "height": 844})
        self.page.goto(self.base_url + "/")
        movers = self.page.locator("#weekly-movers")
        expect(movers.locator(".weekly-mover")).to_have_count(4)
        expect(movers.locator(".weekly-mover-type")).to_have_text([
            "Record overtaken",
            "New scoring leader",
            "Season milestone",
            "Streak extended",
        ])
        expect(movers).to_contain_text("Rory Runner")
        expect(movers).to_contain_text("Ben Beta moved into the sole lead with 10")
        expect(self.page.locator("#weekly-movers-window")).to_contain_text(
            "Rolling seven days (inclusive)"
        )
        expect(self.page.locator("#weekly-movers-window")).to_contain_text(
            "As of export generated at"
        )
        expect(self.page.locator("#weekly-movers-window")).to_contain_text("UTC")
        expect(self.page.locator("#weekly-movers-coverage")).to_contain_text(
            "not treated as no-goal results"
        )
        self.assertLessEqual(
            self.page.evaluate("document.documentElement.scrollWidth"), 390
        )

        link = movers.get_by_role("link", name="Ben Beta moved into the sole lead")
        link.focus()
        expect(link).to_be_focused()
        self.page.keyboard.press("Enter")
        expect(self.page).to_have_url(
            self.base_url + "/players/?player=player-b&season=2026"
        )
        query = parse_qs(urlparse(self.page.url).query)
        self.assertEqual({"player": ["player-b"], "season": ["2026"]}, query)

    def test_simultaneous_tie_does_not_claim_a_new_leader(self):
        self.data["fixtures"] = [
            fixture("2026-10-23T12:00:00Z", [
                goals("player-a", "club-a", 10),
                goals("player-b", "club-b", 10),
            ]),
            fixture("2026-10-27T15:00:00Z", [
                goals("player-a", "club-a", 1),
                goals("player-b", "club-b", 1),
            ]),
        ]
        self.data["activeInSeason"] = []
        self.page.goto(self.base_url + "/")
        expect(self.page.locator("#weekly-movers")).to_contain_text(
            "No weekly movers found"
        )
        expect(self.page.locator("#weekly-movers .weekly-mover")).to_have_count(0)

    def test_breaking_a_tie_creates_one_leader_card_and_future_fixtures_are_ignored(self):
        self.data["fixtures"] = [
            fixture("2026-10-23T12:00:00Z", [
                goals("player-a", "club-a", 10),
                goals("player-b", "club-b", 10),
            ]),
            fixture("2026-10-27T15:00:00Z", [
                goals("player-a", "club-a", 1),
                goals("player-b", "club-b", 1),
            ]),
            fixture("2026-10-30T15:00:00Z", [goals("player-b", "club-b", 1)]),
            fixture("2026-10-31T12:00:01Z", [goals("player-a", "club-a", 30)]),
        ]
        self.data["activeInSeason"] = []
        self.page.goto(self.base_url + "/")
        expect(self.page.locator("#weekly-movers .weekly-mover")).to_have_count(1)
        expect(self.page.locator("#weekly-movers")).to_contain_text(
            "Ben Beta moved into the sole lead with 12"
        )
        self.assertEqual([], self.page.locator("#weekly-movers").get_by_text(
            "Season milestone", exact=True
        ).all_text_contents())


if __name__ == "__main__":
    unittest.main()
