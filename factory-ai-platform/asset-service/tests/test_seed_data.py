"""Contract tests for the DB-free asset seed catalog."""
from __future__ import annotations

from copy import deepcopy
from pathlib import Path
from runpy import run_path

SEED_MODULE = run_path(
    Path(__file__).parents[1] / "app" / "scripts" / "seed_data.py",
    run_name="asset_seed_catalog",
)

MKZ_PLANT = SEED_MODULE["MKZ_PLANT"]
LINES = SEED_MODULE["LINES"]
MACHINES = SEED_MODULE["MACHINES"]
EXTRA_MACHINES = SEED_MODULE["EXTRA_MACHINES"]
SENSORS = SEED_MODULE["SENSORS"]
_prepare_child_entries = SEED_MODULE["_prepare_child_entries"]


def _all_entries():
    return [MKZ_PLANT, *LINES, *MACHINES, *EXTRA_MACHINES, *SENSORS]


def test_seed_catalog_has_at_least_50_assets_and_unique_external_ids():
    entries = _all_entries()
    external_ids = [entry["external_id"] for entry in entries]

    assert len(entries) >= 50
    assert len(external_ids) == len(set(external_ids))


def test_seed_catalog_parent_references_resolve():
    line_ids = {line["external_id"] for line in LINES}
    machines = [*MACHINES, *EXTRA_MACHINES]
    machine_ids = {machine["external_id"] for machine in machines}

    assert all(machine["line"] in line_ids for machine in machines)
    assert all(sensor["parent_external"] in machine_ids for sensor in SENSORS)


def test_preparing_child_entries_does_not_mutate_source_catalog():
    machines_before = deepcopy([*MACHINES, *EXTRA_MACHINES])
    sensors_before = deepcopy(SENSORS)

    list(_prepare_child_entries([*MACHINES, *EXTRA_MACHINES], "line"))
    list(_prepare_child_entries(SENSORS, "parent_external"))

    assert [*MACHINES, *EXTRA_MACHINES] == machines_before
    assert SENSORS == sensors_before
