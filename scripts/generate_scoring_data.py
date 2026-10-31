#!/usr/bin/env python3
"""Build the compact six-season scorer data file from BBC monthly exports."""

import argparse
import hashlib
import json
from pathlib import Path


CLUB_COLORS = {
    "Arsenal": "#EF0107",
    "Aston Villa": "#670E36",
    "Bournemouth": "#DA291C",
    "Brentford": "#E30613",
    "Brighton & Hove Albion": "#0057B8",
    "Burnley": "#6C1D45",
    "Chelsea": "#034694",
    "Coventry City": "#0875B9",
    "Crystal Palace": "#1B458F",
    "Everton": "#003399",
    "Fulham": "#111111",
    "Hull City": "#B38A00",
    "Ipswich Town": "#0033A0",
    "Leeds United": "#8A6D00",
    "Leicester City": "#003090",
    "Liverpool": "#C8102E",
    "Luton Town": "#E85D04",
    "Manchester City": "#6CABDD",
    "Manchester United": "#DA291C",
    "Newcastle United": "#242424",
    "Norwich City": "#008A3B",
    "Nottingham Forest": "#DD0000",
    "Sheffield United": "#C8102E",
    "Southampton": "#D71920",
    "Sunderland": "#C8102E",
    "Tottenham Hotspur": "#132257",
    "Watford": "#D71920",
    "West Bromwich Albion": "#122F67",
    "West Ham United": "#7A263A",
    "Wolverhampton Wanderers": "#C28A00",
}

SCORED_GOAL_TYPES = {"Goal", "Penalty"}
KNOWN_GOAL_TYPES = SCORED_GOAL_TYPES | {"Own Goal"}
EVENT_STATUSES = {
    "PostEvent": "completed",
    "MidEvent": "live",
    "PreEvent": "scheduled",
    "Postponed": "postponed",
    "Cancelled": "cancelled",
}


def load_json(path):
    with path.open(encoding="utf-8-sig") as file:
        return json.load(file)


def canonical_player_id(player_urn):
    if not isinstance(player_urn, str):
        raise ValueError("A credited scorer did not contain a player URN")
    parts = player_urn.strip().split(":")
    if (
        len(parts) < 3
        or parts[0].casefold() != "urn"
        or parts[-2].casefold() != "player"
        or not parts[-1]
    ):
        raise ValueError("A credited scorer contained an invalid player URN")
    return parts[-1].casefold()


def public_key(value):
    return hashlib.sha256(
        json.dumps(value, ensure_ascii=False).encode("utf-8")
    ).hexdigest()[:16]


def event_fixtures(source_dir, years):
    fixtures = {}
    player_identities = {}
    for path in sorted(source_dir.glob("premier-league_*.json")):
        data = load_json(path)
        for group in data.get("eventGroups", []):
            for subgroup in group.get("secondaryGroups", []):
                events = subgroup.get("events") or []
                if isinstance(events, dict):
                    events = [events]
                for event in events:
                    if not isinstance(event, dict):
                        continue
                    if event.get("eventGroupingLabel") != "England - Premier League":
                        continue
                    date = event.get("startDateTime")
                    if not date:
                        raise ValueError(f"{path.name}: Premier League event has no startDateTime")
                    year, month = int(date[0:4]), int(date[5:7])
                    season = year if month >= 8 else year - 1
                    if season not in years:
                        continue
                    home, away = event.get("home", {}), event.get("away", {})
                    home_name, away_name = home.get("fullName"), away.get("fullName")
                    if not home_name or not away_name:
                        raise ValueError(f"{path.name}: event {event.get('urn')} has no team names")
                    key = (date[:16], home_name, away_name)
                    if key in fixtures:
                        raise ValueError(f"Duplicate fixture in exports: {key}")
                    if event.get("status") not in EVENT_STATUSES:
                        raise ValueError(
                            f"{path.name}: unsupported fixture status {event.get('status')!r}"
                        )

                    scorers = {}
                    for team in (home, away):
                        club_name = team["fullName"]
                        for action in team.get("actions", []):
                            if action.get("actionType") != "goal":
                                continue
                            player_urn = action.get("playerUrn")
                            player_name = action.get("playerName")
                            details = action.get("actions")
                            if not player_urn or not player_name or not details:
                                raise ValueError(
                                    f"{path.name}: goal action is missing player identity/details"
                                )
                            identity = canonical_player_id(player_urn)
                            player_key = public_key(("scoring-player", identity))
                            previous = player_identities.setdefault(player_key, identity)
                            if previous != identity:
                                raise ValueError("Public scoring player key collision")
                            for detail in details:
                                goal_type = detail.get("type")
                                if goal_type not in KNOWN_GOAL_TYPES:
                                    raise ValueError(
                                        f"{path.name}: unsupported goal type {goal_type!r}"
                                    )
                                if goal_type == "Own Goal":
                                    continue
                                scorer = scorers.setdefault(
                                    (player_key, club_name),
                                    {"playerKey": player_key, "playerName": player_name,
                                     "clubName": club_name, "goals": 0},
                                )
                                scorer["playerName"] = player_name
                                scorer["goals"] += 1

                    fixtures[key] = {
                        "date": date,
                        "status": EVENT_STATUSES[event["status"]],
                        "teams": [home_name, away_name],
                        "scorers": sorted(
                            scorers.values(),
                            key=lambda scorer: (scorer["clubName"], scorer["playerName"]),
                        ),
                        "season": season,
                    }
    return fixtures


def validate_fixtures(fixtures, current_data, years):
    expected = {}
    for fixture in current_data["fixtures"]:
        if fixture["season"] not in years:
            continue
        key = (
            fixture["fixtureDate"][:16],
            fixture["teams"][0]["name"],
            fixture["teams"][1]["name"],
        )
        if key in expected:
            raise ValueError(f"Duplicate fixture in current-season.json: {key}")
        expected[key] = fixture

    if fixtures.keys() != expected.keys():
        missing = sorted(expected.keys() - fixtures.keys())[:3]
        extra = sorted(fixtures.keys() - expected.keys())[:3]
        raise ValueError(f"Fixture coverage differs; missing={missing}, extra={extra}")

    for key, fixture in fixtures.items():
        canonical = expected[key]
        for side, club_key in enumerate(
            team["clubKey"] for team in canonical["teams"]
        ):
            expected_goals = sum(
                scorer["goals"] for scorer in canonical["scorers"]
                if scorer["clubKey"] == club_key
            )
            actual_goals = sum(
                scorer["goals"] for scorer in fixture["scorers"]
                if scorer["clubName"] == fixture["teams"][side]
            )
            if actual_goals != expected_goals:
                raise ValueError(
                    f"Scorer totals differ for {key}, {fixture['teams'][side]}: "
                    f"exports={actual_goals}, current data={expected_goals}"
                )


def build_data(source_dir, current_data_path):
    current_data = load_json(current_data_path)
    current_season = current_data["season"]
    years = set(range(current_season - 5, current_season + 1))
    complete_seasons = set(current_data["completeSeasons"])
    expected_complete = years - {current_season}
    if not expected_complete.issubset(complete_seasons):
        raise ValueError("Current data does not mark the previous five seasons complete")

    fixtures = event_fixtures(source_dir, years)
    validate_fixtures(fixtures, current_data, years)

    unknown_clubs = sorted({
        club for fixture in fixtures.values() for club in fixture["teams"]
        if club not in CLUB_COLORS
    })
    if unknown_clubs:
        raise ValueError(f"Missing club colours: {', '.join(unknown_clubs)}")

    seasons = []
    for year in sorted(years, reverse=True):
        season_fixtures = sorted(
            (fixture for fixture in fixtures.values() if fixture["season"] == year),
            key=lambda fixture: fixture["date"],
        )
        scorers = {}
        for fixture in season_fixtures:
            for scorer in fixture["scorers"]:
                player = scorers.setdefault(
                    scorer["playerKey"],
                    {"playerKey": scorer["playerKey"],
                     "playerName": scorer["playerName"], "goals": 0, "clubs": {}},
                )
                player["playerName"] = scorer["playerName"]
                player["goals"] += scorer["goals"]
                player["clubs"][scorer["clubName"]] = (
                    player["clubs"].get(scorer["clubName"], 0) + scorer["goals"]
                )
        seasons.append({
            "season": year,
            "seasonLabel": f"{year}/{str(year + 1)[-2:]}",
            "status": "in_progress" if year == current_season else "final",
            "scorers": [
                {
                    **player,
                    "clubs": [
                        {"clubName": name, "goals": goals}
                        for name, goals in sorted(player["clubs"].items())
                    ],
                }
                for player in sorted(
                    scorers.values(),
                    key=lambda entry: (entry["playerName"].casefold(), entry["playerKey"]),
                )
            ],
            "fixtures": [
                {key: value for key, value in fixture.items() if key != "season"}
                for fixture in season_fixtures
            ],
        })

    return {
        "season": current_season,
        "seasonLabel": current_data["seasonLabel"],
        "generatedAt": current_data["generatedAt"],
        "clubColors": CLUB_COLORS,
        "seasons": seasons,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", type=Path, required=True,
                        help="Directory containing the monthly Premier League JSON exports")
    parser.add_argument("--current-data", type=Path,
                        default=Path("site/data/current-season.json"))
    parser.add_argument("--output", type=Path,
                        default=Path("site/data/scoring-seasons.json"))
    args = parser.parse_args()
    data = build_data(args.source_dir, args.current_data)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(
        f"Wrote {args.output}: "
        + ", ".join(
            f"{season['seasonLabel']} ({len(season['scorers'])} scorers)"
            for season in data["seasons"]
        )
    )


if __name__ == "__main__":
    main()
