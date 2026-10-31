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


def make_scoring_data():
    return {
        "season": 2026,
        "seasons": [
            {
                "season": 2024,
                "seasonLabel": "2024/25",
                "status": "final",
                "fixtures": [
                    fixture("2025-05-01", "completed", [
                        ("a", "A One", "Alpha United", 6),
                        ("b", "B Two", "Alpha United", 6),
                    ])
                ],
            },
            {
                "season": 2025,
                "seasonLabel": "2025/26",
                "status": "final",
                "fixtures": [
                    fixture("2026-05-01", "completed", [
                        ("c", "C Three", "Alpha United", 6),
                    ])
                ],
            },
            {
                "season": 2026,
                "seasonLabel": "2026/27",
                "status": "in_progress",
                "fixtures": [
                    fixture("2026-10-25", "completed", [
                        ("current", "Current Equal", "Alpha United", 6),
                        ("moved", "Moved Player", "Alpha United", 2),
                        ("moved", "Moved Player", "Beta City", 5),
                    ]),
                    fixture("2026-10-26", "scheduled", [
                        ("scheduled", "Not Yet Scored", "Alpha United", 99),
                    ]),
                ],
            },
        ],
    }


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


class ClubRecordChaseTests(unittest.TestCase):
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

    def tearDown(self):
        self.context.close()
        self.assertEqual([], self.errors)

    def open_club(self):
        current = json.loads(
            (SITE / "data" / "current-season.json").read_text(encoding="utf-8")
        )
        club = next(club for club in current["clubs"] if club["clubName"] == "Manchester City")
        self.page.goto(f"{self.base_url}/clubs/?club={club['slug']}")
        expect(self.page.locator("#club-record-content .record-chase-note")).to_be_visible()

    def test_calculates_joint_holders_transfer_club_goals_and_completed_only(self):
        self.open_club()
        data = make_scoring_data()
        result = self.page.evaluate(
            "([name, data]) => calculateClubRecordChase(name, data)",
            ["Alpha United", data],
        )
        self.assertEqual(6, result["record"])
        self.assertEqual(
            [("A One", "2024/25"), ("B Two", "2024/25"), ("C Three", "2025/26")],
            [(holder["playerName"], holder["seasonLabel"])
             for holder in result["recordHolders"]],
        )
        self.assertEqual(
            [("Current Equal", 6), ("Moved Player", 2)],
            [(player["playerName"], player["goals"]) for player in result["currentGoals"]],
        )
        self.assertEqual("2026-10-25T15:00:00Z", result["completedThrough"])
        beta = self.page.evaluate(
            "([name, data]) => calculateClubRecordChase(name, data)",
            ["Beta City", data],
        )
        self.assertEqual(5, beta["currentGoals"][0]["goals"])

    def test_chase_copy_is_accurate_and_explicit_about_observed_coverage(self):
        self.open_club()
        data = make_scoring_data()
        self.page.evaluate(
            "([name, data]) => renderClubRecordChase(name, data)",
            ["Alpha United", data],
        )
        expect(self.page.locator(".record-chase-holders li")).to_have_text([
            "A One · 2024/25", "B Two · 2024/25", "C Three · 2025/26",
        ])
        expect(self.page.locator(".record-chase-player").first).to_contain_text(
            "Has equalled the observed best"
        )
        expect(self.page.locator(".record-chase-player").last).to_contain_text(
            "4 more goals to equal the observed best."
        )
        expect(self.page.locator(".record-chase-note")).to_contain_text(
            "Observed completed-season coverage: 2024/25–2025/26."
        )
        expect(self.page.locator("#club-record-status")).to_contain_text(
            "provisional"
        )
        self.assertIn("not an all-time or full Premier League record",
                      self.page.locator(".record-chase-note").inner_text())

        data["seasons"][-1]["fixtures"][0]["scorers"].append({
            "playerKey": "beaten", "playerName": "Record Beater",
            "clubName": "Alpha United", "goals": 7,
        })
        self.page.evaluate(
            "([name, data]) => renderClubRecordChase(name, data)",
            ["Alpha United", data],
        )
        expect(self.page.locator(".record-chase-player").filter(
            has_text="Record Beater"
        )).to_contain_text("Has beaten the observed best by 1 goal")

    def test_empty_historical_coverage_does_not_claim_a_record(self):
        self.open_club()
        data = make_scoring_data()
        data["seasons"] = [data["seasons"][-1]]
        result = self.page.evaluate(
            "([name, data]) => calculateClubRecordChase(name, data)",
            ["Alpha United", data],
        )
        self.assertIsNone(result["record"])
        self.assertEqual([], result["recordHolders"])
        self.page.evaluate(
            "([name, data]) => renderClubRecordChase(name, data)",
            ["Alpha United", data],
        )
        expect(self.page.locator(".record-chase-best")).to_contain_text(
            "No completed club season in this export coverage"
        )
        expect(self.page.locator(".record-chase-note")).to_contain_text(
            "No completed seasons are included in this scorer export."
        )

    def test_live_club_page_has_keyboard_accessible_text_on_mobile(self):
        self.open_club()
        expect(self.page.get_by_role(
            "heading", name="Club single-season record chase"
        )).to_be_visible()
        expect(self.page.get_by_role("progressbar").first).to_be_visible()
        self.page.keyboard.press("Tab")
        expect(self.page.get_by_role("link", name="Vardy Watch")).to_be_focused()
        self.page.set_viewport_size({"width": 375, "height": 812})
        self.assertLessEqual(
            self.page.evaluate("document.documentElement.scrollWidth"), 375
        )
        note = self.page.locator(".record-chase-note").inner_text()
        self.assertIn("Observed completed-season coverage:", note)
        self.assertIn("Current season:", note)


if __name__ == "__main__":
    unittest.main()
