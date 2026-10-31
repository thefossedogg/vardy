import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from scripts.check_public_data import check_site
from scripts.generate_scoring_data import build_data, event_fixtures


def event(date, home, away, player_id, name="Test Player", provider="bbc", goals=1):
    return {
        "eventGroupingLabel": "England - Premier League",
        "startDateTime": f"{date}T15:00:00Z",
        "status": "PostEvent",
        "home": {
            "fullName": home,
            "urn": f"urn:{provider}:sportsdata:football:team:test-home",
            "actions": [{
                "actionType": "goal",
                "playerUrn": f"urn:{provider}:sportsdata:football:player:{player_id}",
                "playerName": name,
                "actions": [{"type": "Goal"} for _ in range(goals)],
            }],
        },
        "away": {"fullName": away, "actions": []},
    }


class ScoringExportTests(unittest.TestCase):
    def setUp(self):
        self.directory = TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.source = self.root / "private"
        self.source.mkdir()
        self.site = self.root / "site"
        self.site.mkdir()

    def write_events(self, events):
        (self.source / "premier-league_test.json").write_text(json.dumps({
            "eventGroups": [{"secondaryGroups": [{"events": events}]}],
        }), encoding="utf-8")

    def test_export_hides_ids_and_preserves_identity_and_totals(self):
        events = [
            event("2025-08-01", "Arsenal", "Chelsea", "s-test-one"),
            event("2026-08-01", "Arsenal", "Chelsea", "S-TEST-ONE",
                  name="Renamed Player", provider="openfree", goals=2),
            event("2026-08-08", "Chelsea", "Arsenal", "s-test-one",
                  name="Renamed Player"),
            event("2026-08-15", "Chelsea", "Arsenal", "s-test-two",
                  name="Renamed Player"),
        ]
        self.write_events(events)
        current = {
            "season": 2026,
            "seasonLabel": "2026/27",
            "generatedAt": "2026-10-31T00:00:00Z",
            "completeSeasons": list(range(2021, 2026)),
            "fixtures": [
                {
                    "season": int(match["startDateTime"][:4]),
                    "fixtureDate": match["startDateTime"],
                    "teams": [
                        {"name": match["home"]["fullName"], "clubKey": "home"},
                        {"name": match["away"]["fullName"], "clubKey": "away"},
                    ],
                    "scorers": [{
                        "clubKey": "home",
                        "goals": len(match["home"]["actions"][0]["actions"]),
                    }],
                }
                for match in events
            ],
        }
        current_path = self.root / "current.json"
        current_path.write_text(json.dumps(current), encoding="utf-8")
        data = build_data(self.source, current_path)
        output = self.site / "scoring-seasons.json"
        output.write_text(json.dumps(data), encoding="utf-8")
        check_site(self.site)
        for hidden in ("s-test-one", "s-test-two", "test-home", "urn:"):
            self.assertNotIn(hidden, output.read_text(encoding="utf-8").casefold())
        season = data["seasons"][0]
        renamed = next(player for player in season["scorers"] if player["goals"] == 3)
        namesake = next(player for player in season["scorers"] if player["goals"] == 1)
        self.assertNotEqual(renamed["playerKey"], namesake["playerKey"])
        self.assertEqual(
            renamed["playerKey"], data["seasons"][1]["scorers"][0]["playerKey"]
        )
        self.assertEqual(
            [{"clubName": "Arsenal", "goals": 2}, {"clubName": "Chelsea", "goals": 1}],
            renamed["clubs"],
        )
        for entry in data["seasons"]:
            for player in entry["scorers"]:
                self.assertEqual(player["goals"], sum(
                    scorer["goals"]
                    for fixture in entry["fixtures"]
                    for scorer in fixture["scorers"]
                    if scorer["playerKey"] == player["playerKey"]
                ))
        self.assertEqual(data, build_data(self.source, current_path))

    def test_invalid_identity_and_key_collision_fail_explicitly(self):
        first = event("2026-08-01", "Arsenal", "Chelsea", "one")
        first["home"]["actions"][0]["playerUrn"] = "invalid"
        self.write_events([first])
        with self.assertRaisesRegex(ValueError, "invalid player URN"):
            event_fixtures(self.source, {2026})
        self.write_events([
            event("2026-08-01", "Arsenal", "Chelsea", "one"),
            event("2026-08-08", "Arsenal", "Chelsea", "two"),
        ])
        with patch("scripts.generate_scoring_data.public_key", return_value="collision"):
            with self.assertRaisesRegex(ValueError, "key collision"):
                event_fixtures(self.source, {2026})

    def test_public_check_rejects_ids_in_assets_and_nested_json(self):
        for contents in (
            "urn:bbc:sportsdata:football:team:test-team",
            "s-" + "a1" * 12 + "a",
            "a1" * 12,
            json.dumps({"fixtures": [{"playerKey": "urn:test:player:one"}]}),
            json.dumps({"fixtures": [{"teamId": "short-provider-id"}]}),
        ):
            with self.subTest(contents=contents):
                path = self.site / "data.json"
                path.write_text(contents if contents.startswith("{") else
                                json.dumps({"value": contents}), encoding="utf-8")
                with self.assertRaises(ValueError):
                    check_site(self.site)
        path.write_text(json.dumps({
            "playerKey": "ed442eadeaeca74c", "clubKey": "0123456789abcdef",
            "teams": ["Arsenal", "Chelsea"],
        }), encoding="utf-8")
        check_site(self.site)

    def test_public_check_covers_scripts_not_just_json(self):
        (self.site / "player.js").write_text(
            'const id = "' + "a1" * 12 + '";', encoding="utf-8"
        )
        with self.assertRaisesRegex(ValueError, "public asset"):
            check_site(self.site)


if __name__ == "__main__":
    unittest.main()
