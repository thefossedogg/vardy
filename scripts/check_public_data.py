#!/usr/bin/env python3
"""Reject provider identifiers in the public Pages artifact."""

import argparse
import json
from pathlib import Path
import re


PROVIDER_URN = re.compile(
    rb"urn:[a-z0-9_-]+:sportsdata:football:(?:player|team|event|fixture):",
    re.IGNORECASE,
)
PROVIDER_ID = re.compile(
    rb"(?<![a-z0-9])(?:s-)?(?=[a-z0-9]{20,25}(?![a-z0-9]))"
    rb"(?=[a-z0-9]*[a-z])(?=[a-z0-9]*[0-9])[a-z0-9]{20,25}(?![a-z0-9])",
    re.IGNORECASE,
)
INTERNAL_FIELDS = {
    "urn", "playerurn", "teamurn", "cluburn", "fixtureurn", "eventurn",
    "playerid", "teamid", "clubid", "fixtureid", "eventid",
}
PUBLIC_KEYS = {"playerKey", "clubKey"}


def check_json(value, location):
    if isinstance(value, dict):
        for key, child in value.items():
            if key.casefold() in INTERNAL_FIELDS:
                raise ValueError(f"{location}: internal identifier field {key}")
            if key in PUBLIC_KEYS and (
                not isinstance(child, str) or not re.fullmatch(r"[0-9a-f]{16}", child)
            ):
                raise ValueError(f"{location}: {key} is not a sanitized public key")
            check_json(child, location)
    elif isinstance(value, list):
        for child in value:
            check_json(child, location)


def check_site(site):
    if not site.is_dir():
        raise ValueError(f"Public artifact directory does not exist: {site}")
    for path in sorted(site.rglob("*")):
        if not path.is_file():
            continue
        contents = path.read_bytes()
        if PROVIDER_URN.search(contents) or PROVIDER_ID.search(contents):
            raise ValueError(f"{path}: provider identifier in public asset")
        if path.suffix == ".json":
            check_json(json.loads(contents), path)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--site", type=Path, default=Path("site"))
    args = parser.parse_args()
    check_site(args.site)
    print(f"Public identifier check passed: {args.site}")


if __name__ == "__main__":
    main()
