import copy
import json
import os
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
import unittest

from playwright.sync_api import expect, sync_playwright


STORAGE_KEY = "vardy-watch:favourites:v1"
DATA = {
    "season": 2026,
    "seasonLabel": "2026/27",
    "generatedAt": "2026-10-24T22:00:00Z",
    "archiveStartsAt": "2020-01-01",
    "benchmark": {"season": "2015/16"},
    "activeInSeason": [],
    "seasonBestRuns": [],
    "seasonLeaders": [],
    "whatChanged": {"endedStreaks": []},
    "clubs": [
        {
            "clubKey": "team-alpha",
            "clubName": "Alpha United",
            "slug": "alpha",
            "completedFixtures": 1,
            "activeInSeason": [],
            "scorers": [
                {"playerKey": "player-ada", "playerName": "Ada Goal", "goals": 1, "rank": 1}
            ],
        },
        {
            "clubKey": "team-beta",
            "clubName": "Beta City",
            "slug": "beta",
            "completedFixtures": 1,
            "activeInSeason": [],
            "scorers": [
                {"playerKey": "player-ben", "playerName": "Ben Goal", "goals": 1, "rank": 1}
            ],
        },
    ],
    "fixtures": [
        {
            "season": 2026,
            "fixtureDate": "2026-10-01T14:00:00Z",
            "status": "completed",
            "teams": [
                {"clubKey": "team-alpha", "name": "Alpha United"},
                {"clubKey": "team-beta", "name": "Beta City"},
            ],
            "score": [1, 1],
            "scorers": [
                {"playerKey": "player-ada", "clubKey": "team-alpha", "goals": 1},
                {"playerKey": "player-ben", "clubKey": "team-beta", "goals": 1},
            ],
        }
    ],
}


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


class FavouritesTests(unittest.TestCase):
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
        self.data = copy.deepcopy(DATA)
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

    def go(self, path="/clubs/?club=alpha"):
        self.page.goto(self.base_url + path)
        expect(self.page.locator("#club-picker-status")).to_have_text("Choose your club")

    def seed(self, entries):
        self.go()
        self.page.evaluate(
            "([key, entries]) => localStorage.setItem(key, JSON.stringify(entries))",
            [STORAGE_KEY, entries],
        )
        self.page.reload()

    def saved(self):
        return self.page.evaluate(
            "(key) => JSON.parse(localStorage.getItem(key))", STORAGE_KEY
        )

    def open_favourites(self):
        self.page.locator("#favourites-picker summary").click()
        return self.page.locator("#favourites-picker")

    def star_ada(self):
        self.page.get_by_role("button", name="View Ada Goal's season fixtures").click()
        self.page.locator("#player-favourite").click()
        expect(self.page.locator("#streak-dialog")).to_be_visible()
        self.page.get_by_role("button", name="Close streak details").click()

    def test_persistence_mixed_order_and_navigation_from_both_pages(self):
        self.go()
        self.page.locator("#team-favourite").click()
        self.star_ada()
        self.page.reload()
        expect(self.page.locator("#team-favourite")).to_have_attribute("aria-pressed", "true")
        self.assertEqual(2, len(self.saved()))
        picker = self.open_favourites()
        expect(picker.locator(".favourite-target > span:last-child")).to_have_text(
            ["Ada GoalAlpha United", "Alpha United"]
        )
        picker.get_by_role("button", name="Unfavourite Alpha United").click()
        expect(picker).to_have_attribute("open", "")
        expect(self.page.locator("#team-favourite")).to_have_attribute("aria-pressed", "false")
        expect(self.page.locator("#streak-dialog")).not_to_be_visible()
        self.assertEqual(1, len(self.saved()))

        self.go("/")
        self.open_favourites().locator(".favourite-target").click()
        expect(self.page.locator("#streak-dialog-title")).to_have_text("Ada Goal")
        self.assertEqual(self.base_url + "/", self.page.url)
        expect(self.page.locator("#player-favourite")).to_have_attribute("aria-pressed", "true")
        self.page.get_by_role("button", name="Close streak details").click()
        self.go("/clubs/?club=beta")
        self.page.locator("#team-favourite").click()
        self.open_favourites().get_by_role("button", name="Player Ada Goal").click()
        self.assertIn("club=beta", self.page.url)
        expect(self.page.locator("#streak-dialog-summary")).to_contain_text("Alpha United")
        self.page.get_by_role("button", name="Close streak details").click()
        self.go("/")
        self.open_favourites().get_by_role("link", name="Team Beta City").click()
        expect(self.page).to_have_url(self.base_url + "/clubs/?club=beta")

    def test_empty_state_and_keyboard_removal_keep_dropdown_open(self):
        self.go()
        picker = self.open_favourites()
        expect(picker.locator("#favourites-status")).to_contain_text("No favourites yet")
        self.page.keyboard.press("Escape")
        expect(picker).not_to_have_attribute("open", "")
        self.page.locator("#team-favourite").click()
        picker = self.open_favourites()
        remove = picker.get_by_role("button", name="Unfavourite Alpha United")
        remove.focus()
        self.page.keyboard.press("Enter")
        expect(picker).to_have_attribute("open", "")
        expect(picker.locator("summary")).to_be_focused()
        expect(picker.locator("#favourites-status")).to_contain_text("No favourites yet")
        self.assertEqual([], self.saved())
        self.page.locator("#clubs-title").click()
        expect(picker).not_to_have_attribute("open", "")

    def test_club_menu_stars_toggle_without_navigation_on_both_pages(self):
        for path in ["/", "/clubs/?club=alpha"]:
            with self.subTest(path=path):
                self.go(path)
                picker = self.page.locator(".club-picker").first
                picker.locator("summary").click()
                star = picker.locator('[data-favourite-key="team-alpha"]')
                star.click()
                expect(picker).to_have_attribute("open", "")
                self.assertEqual(self.base_url + path, self.page.url)
                expect(star).to_have_attribute("aria-pressed", "true")
                self.assertEqual("team-alpha", self.saved()[0]["key"])
                if path != "/":
                    expect(self.page.locator("#team-favourite")).to_have_attribute("aria-pressed", "true")
                star.click()
                expect(picker).to_have_attribute("open", "")
                self.assertEqual([], self.saved())
                picker.get_by_role("link", name="Beta City").click()
                expect(self.page).to_have_url(self.base_url + "/clubs/?club=beta")

    def test_ten_combined_entries_count_unavailable_and_never_evict(self):
        entries = [
            {"type": "player", "key": f"missing-{i}", "name": f"Missing {i}"}
            for i in range(9)
        ] + [{"type": "player", "key": "player-ada", "name": "Ada Goal"}]
        self.seed(entries)
        original = self.saved()
        self.page.locator("#team-favourite").click()
        expect(self.page.locator("#team-favourite")).to_have_attribute("aria-pressed", "false")
        expect(self.page.locator("#clubs-status + [data-favourites-message]")).to_contain_text(
            "You can save up to 10 favourites"
        )
        self.assertEqual(original, self.saved())
        picker = self.open_favourites()
        expect(picker.locator(".favourite-target:disabled")).to_have_count(9)
        picker.get_by_role("button", name="Unfavourite Missing 0").click()
        self.page.keyboard.press("Escape")
        self.page.locator("#team-favourite").click()
        self.assertEqual(10, len(self.saved()))
        self.assertTrue(any(entry["key"] == "team-alpha" for entry in self.saved()))

    def test_unavailable_entries_reactivate_and_remain_removable(self):
        self.data["clubs"][0]["scorers"] = []
        self.seed([
            {"type": "player", "key": "player-ada", "name": "Ada Goal", "clubName": "Alpha United"},
            {"type": "team", "key": "departed-team", "name": "Departed Team"},
        ])
        picker = self.open_favourites()
        expect(picker.locator(".favourite-target:disabled")).to_have_count(2)
        expect(picker.locator(".favourite-target").first).to_contain_text("Unavailable")
        self.data = copy.deepcopy(DATA)
        self.page.reload()
        picker = self.open_favourites()
        expect(picker.locator(".favourite-target:disabled")).to_have_count(1)
        picker.get_by_role("button", name="Unfavourite Departed Team").click()
        picker.get_by_role("button", name="Player Ada Goal").click()
        expect(self.page.locator("#streak-dialog-title")).to_have_text("Ada Goal")

    def test_player_transfer_updates_context_without_duplicate(self):
        self.seed([
            {"type": "player", "key": "player-ada", "name": "Ada Goal", "clubName": "Alpha United"}
        ])
        self.data["clubs"][1]["scorers"].append(
            {"playerKey": "player-ada", "playerName": "Ada Goal", "goals": 2, "rank": 1}
        )
        fixture = copy.deepcopy(self.data["fixtures"][0])
        fixture["fixtureDate"] = "2026-10-20T14:00:00Z"
        fixture["score"] = [0, 2]
        fixture["scorers"] = [
            {"playerKey": "player-ada", "clubKey": "team-beta", "goals": 2}
        ]
        self.data["fixtures"].append(fixture)
        self.go("/clubs/?club=beta")
        self.assertEqual("Beta City", self.saved()[0]["clubName"])
        self.open_favourites().get_by_role("button", name="Player Ada Goal").click()
        expect(self.page.locator("#streak-dialog-summary")).to_contain_text("Beta City")
        expect(self.page.locator("#streak-dialog-summary")).to_contain_text("2 season goals")
        expect(self.page.locator("#player-favourite")).to_have_attribute("aria-pressed", "true")
        self.page.locator("#player-favourite").click()
        self.assertEqual([], self.saved())
        self.page.locator("#player-favourite").click()
        self.assertEqual(1, len(self.saved()))
        self.assertEqual("player-ada", self.saved()[0]["key"])

    def test_storage_failure_warns_in_modal_and_keeps_temporary_choices(self):
        self.context.add_init_script("""
            Storage.prototype.getItem = function() { throw new Error("Read denied"); };
            Storage.prototype.setItem = function() { throw new Error("Write denied"); };
        """)
        self.go()
        expect(self.page.locator("#clubs-status + [data-favourites-message]")).to_contain_text(
            "could not be read"
        )
        self.star_ada()
        expect(self.page.locator("#favourites-status")).to_have_text("1 of 10 favourites")
        self.page.get_by_role("button", name="View Ada Goal's season fixtures").click()
        expect(self.page.locator("#streak-dialog [data-favourites-message]")).to_contain_text(
            "could not be saved"
        )
        expect(self.page.locator("#player-favourite")).to_have_attribute("aria-pressed", "true")

    def test_corrupt_storage_reports_error_instead_of_crashing(self):
        self.go()
        self.page.evaluate("(key) => localStorage.setItem(key, '{invalid')", STORAGE_KEY)
        self.page.reload()
        expect(self.page.locator("#clubs-status + [data-favourites-message]")).to_contain_text(
            "could not be read"
        )
        self.page.locator("#team-favourite").click()
        self.assertEqual("team-alpha", self.saved()[0]["key"])
        expect(self.page.locator("#clubs-status + [data-favourites-message]")).to_be_hidden()

    def test_benchmark_modal_can_be_favourited_and_reopened(self):
        self.go("/")
        self.page.locator("#vardy-button").click()
        self.page.locator("#player-favourite").click()
        self.page.get_by_role("button", name="Close streak details").click()
        self.page.reload()
        self.open_favourites().get_by_role("button", name="Player Jamie Vardy").click()
        expect(self.page.locator("#streak-dialog-title")).to_have_text("Jamie Vardy")
        expect(self.page.locator("#streak-games li")).to_have_count(11)

    def test_other_tab_changes_update_stars_without_lost_entries(self):
        self.go()
        other = self.context.new_page()
        other.goto(self.base_url + "/clubs/?club=beta")
        expect(other.locator("#club-picker-status")).to_have_text("Choose your club")
        other.locator("#team-favourite").click()
        expect(self.page.locator("#favourites-status")).to_have_text("1 of 10 favourites")
        self.page.locator("#team-favourite").click()
        expect(other.locator("#favourites-status")).to_have_text("2 of 10 favourites")
        self.assertEqual(2, len(self.saved()))
        other.evaluate("localStorage.clear()")
        expect(self.page.locator("#team-favourite")).to_have_attribute("aria-pressed", "false")
        expect(self.page.locator("#favourites-status")).to_contain_text("No favourites yet")


if __name__ == "__main__":
    unittest.main()
