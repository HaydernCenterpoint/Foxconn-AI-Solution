"""Seed script: 50+ assets for MKZ Factory (Plant → Lines → Machines → Sensors).
Run: python -m app.scripts.seed_data
"""
from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ===================================================================
# SEED DATA: MKZ Factory Asset Hierarchy
# ===================================================================

MKZ_PLANT = {
    "name": "MKZ Factory",
    "type": "plant",
    "external_id": "MKZ-HQ",
    "manufacturer": "MKZ Corp",
    "location_zone": "Zone A",
    "metadata": {
        "capacity": "100,000 units/year",
        "year_built": 2018,
        "address": "123 Industrial Park, Hanoi, Vietnam",
        "total_employees": 450,
        "timezone": "Asia/Ho_Chi_Minh",
    },
    "tags": ["flagship", "primary"],
}

LINES: List[Dict[str, Any]] = [
    {
        "name": "LS18 — Assembly Line 18",
        "type": "line",
        "external_id": "LS18",
        "manufacturer": "Siemens",
        "metadata": {
            "cycle_time": "45 seconds",
            "target_output": "800 units/day",
            "shift_config": "3-shift",
            "line_length": "120 meters",
            "stations": 12,
        },
        "tags": ["high-volume", "primary"],
    },
    {
        "name": "LS19 — Assembly Line 19",
        "type": "line",
        "external_id": "LS19",
        "manufacturer": "Siemens",
        "metadata": {
            "cycle_time": "50 seconds",
            "target_output": "700 units/day",
            "shift_config": "3-shift",
            "line_length": "110 meters",
            "stations": 10,
        },
        "tags": ["medium-volume"],
    },
    {
        "name": "LS20 — Painting Line",
        "type": "line",
        "external_id": "LS20",
        "manufacturer": "Dürr",
        "metadata": {
            "cycle_time": "180 seconds",
            "target_output": "300 units/day",
            "shift_config": "2-shift",
            "line_length": "200 meters",
            "stages": ["pretreatment", "primer", "topcoat", "cure"],
        },
        "tags": ["finishing", "painting"],
    },
]

MACHINES: List[Dict[str, Any]] = [
    # --- LS18 Machines ---
    {
        "name": "Press-001", "type": "machine", "line": "LS18",
        "external_id": "PRESS-001", "manufacturer": "Schuler",
        "location_zone": "Zone A", "location_area": "LS18-F01",
        "metadata": {
            "model_number": "SMP-2500", "serial_number": "SCH-2018-001",
            "power_rating": "2500 kW", "spindle_hours": 12450,
            "max_force": "25000 kN", "stroke": "800 mm",
            "last_calibration": "2026-06-15", "next_maintenance_date": "2026-08-15",
        },
        "tags": ["press", "stamping", "critical"],
    },
    {
        "name": "Press-002", "type": "machine", "line": "LS18",
        "external_id": "PRESS-002", "manufacturer": "Schuler",
        "location_zone": "Zone A", "location_area": "LS18-F01",
        "metadata": {
            "model_number": "SMP-2500", "serial_number": "SCH-2018-002",
            "power_rating": "2500 kW", "spindle_hours": 9870,
            "maxForce": "25000 kN", "stroke": "800 mm",
            "last_calibration": "2026-06-20", "next_maintenance_date": "2026-08-20",
        },
        "tags": ["press", "stamping"],
    },
    {
        "name": "Conveyor-001", "type": "machine", "line": "LS18",
        "external_id": "CONV-001", "manufacturer": "Bosch Rexroth",
        "location_zone": "Zone A", "location_area": "LS18-F02",
        "metadata": {
            "model_number": "TS-5", "serial_number": "BRX-2018-011",
            "power_rating": "15 kW", "beltSpeed": "0.5 m/s",
            "belt_width": "800 mm", "maxLoad": "500 kg",
            "last_maintenance": "2026-05-01", "next_maintenance_date": "2026-08-01",
        },
        "tags": ["conveyor", "material-handling"],
    },
    {
        "name": "Robot-Weld-001", "type": "machine", "line": "LS18",
        "external_id": "RW-001", "manufacturer": "KUKA",
        "location_zone": "Zone A", "location_area": "LS18-F03",
        "metadata": {
            "model_number": "KR-60-3", "serial_number": "KUKA-2018-031",
            "payload": "60 kg", "reach": "2033 mm",
            "axes": 6, "repeatability": "±0.05 mm",
            "last_maintenance": "2026-04-10", "next_maintenance_date": "2026-07-10",
        },
        "tags": ["robot", "welding", "critical"],
    },
    {
        "name": "Robot-Weld-002", "type": "machine", "line": "LS18",
        "external_id": "RW-002", "manufacturer": "KUKA",
        "location_zone": "Zone A", "location_area": "LS18-F03",
        "metadata": {
            "model_number": "KR-60-3", "serial_number": "KUKA-2018-032",
            "payload": "60 kg", "reach": "2033 mm",
            "axes": 6, "repeatability": "±0.05 mm",
            "last_maintenance": "2026-04-15", "next_maintenance_date": "2026-07-15",
        },
        "tags": ["robot", "welding"],
    },
    {
        "name": "QC-Station-001", "type": "machine", "line": "LS18",
        "external_id": "QC-001", "manufacturer": "Carl Zeiss",
        "location_zone": "Zone A", "location_area": "LS18-F10",
        "metadata": {
            "model_number": "Contura-7", "serial_number": "ZEISS-2019-101",
            "measurement_range": "1200x1000x700 mm",
            "accuracy": "1.5 μm", "last_calibration": "2026-05-30",
            "next_maintenance_date": "2026-11-30",
        },
        "tags": ["qc", "quality-control", "inspection"],
    },
    # --- LS19 Machines ---
    {
        "name": "CNC-Mill-001", "type": "machine", "line": "LS19",
        "external_id": "CNC-001", "manufacturer": "DMG MORI",
        "location_zone": "Zone A", "location_area": "LS19-F01",
        "metadata": {
            "model_number": "CMX-50U", "serial_number": "DMG-2019-201",
            "power_rating": "18 kW", "spindle_speed": "12000 rpm",
            "spindle_hours": 5620, "work_area": "500x400x400 mm",
            "last_maintenance": "2026-03-20", "next_maintenance_date": "2026-09-20",
        },
        "tags": ["cnc", "milling", "precision"],
    },
    {
        "name": "CNC-Mill-002", "type": "machine", "line": "LS19",
        "external_id": "CNC-002", "manufacturer": "DMG MORI",
        "location_zone": "Zone A", "location_area": "LS19-F01",
        "metadata": {
            "model_number": "CMX-50U", "serial_number": "DMG-2019-202",
            "power_rating": "18 kW", "spindle_speed": "12000 rpm",
            "spindle_hours": 4310, "work_area": "500x400x400 mm",
            "last_maintenance": "2026-03-25", "next_maintenance_date": "2026-09-25",
        },
        "tags": ["cnc", "milling"],
    },
    {
        "name": "Lathe-001", "type": "machine", "line": "LS19",
        "external_id": "LATHE-001", "manufacturer": "Mazak",
        "location_zone": "Zone A", "location_area": "LS19-F02",
        "metadata": {
            "model_number": "QT-250", "serial_number": "MAZAK-2019-301",
            "power_rating": "22 kW", "maxTurnDiameter": "400 mm",
            "spindle_hours": 3890, "max_spindle_speed": "4000 rpm",
            "last_maintenance": "2026-04-05", "next_maintenance_date": "2026-10-05",
        },
        "tags": ["cnc", "lathe", "turning"],
    },
    {
        "name": "Conveyor-002", "type": "machine", "line": "LS19",
        "external_id": "CONV-002", "manufacturer": "Bosch Rexroth",
        "location_zone": "Zone A", "location_area": "LS19-F03",
        "metadata": {
            "model_number": "TS-5", "serial_number": "BRX-2019-012",
            "power_rating": "12 kW", "belt_speed": "0.4 m/s",
            "belt_width": "600 mm", "max_load": "350 kg",
            "last_maintenance": "2026-05-10", "next_maintenance_date": "2026-08-10",
        },
        "tags": ["conveyor", "material-handling"],
    },
    # --- LS20 Machines ---
    {
        "name": "Paint-Booth-001", "type": "machine", "line": "LS20",
        "external_id": "PB-001", "manufacturer": "Dürr",
        "location_zone": "Zone B", "location_area": "LS20-P01",
        "metadata": {
            "model_number": "EcoRP-3", "serial_number": "DURR-2020-001",
            "booth_dimensions": "15x6x5 m", "air_flow": "30000 m3/h",
            "temperature_range": "20-25°C", "humidity_range": "55-65%",
            "last_maintenance": "2026-02-15", "next_maintenance_date": "2026-08-15",
        },
        "tags": ["painting", "finishing", "critical"],
    },
    {
        "name": "Oven-Cure-001", "type": "machine", "line": "LS20",
        "external_id": "OVEN-001", "manufacturer": "Dürr",
        "location_zone": "Zone B", "location_area": "LS20-P02",
        "metadata": {
            "model_number": "EcoCure", "serial_number": "DURR-2020-002",
            "max_temp": "200°C", "power_rating": "450 kW",
            "conveyor_speed": "2 m/min", "zones": 4,
            "last_maintenance": "2026-03-01", "next_maintenance_date": "2026-09-01",
        },
        "tags": ["oven", "curing", "painting"],
    },
]

SENSORS: List[Dict[str, Any]] = [
    # Press-001 sensors
    {
        "name": "Press-001-Temperature", "type": "sensor", "parent_external": "PRESS-001",
        "manufacturer": "Pt100", "external_id": "SENS-P001-T01",
        "location_zone": "Zone A",
        "metadata": {
            "sensor_type": "temperature", "unit": "°C",
            "min_value": -20, "max_value": 150,
            "accuracy": "±0.5°C", "calibration_interval_days": 180,
            "last_calibration": "2026-01-15",
        },
        "tags": ["temperature", "press", "critical"],
    },
    {
        "name": "Press-001-Vibration", "type": "sensor", "parent_external": "PRESS-001",
        "manufacturer": "Wilcoxon", "external_id": "SENS-P001-V01",
        "location_zone": "Zone A",
        "metadata": {
            "sensor_type": "vibration", "unit": "mm/s",
            "min_value": 0, "max_value": 50,
            "frequency_range": "10-1000 Hz", "accuracy": "±2%",
            "last_calibration": "2026-01-15",
        },
        "tags": ["vibration", "press", "critical"],
    },
    {
        "name": "Press-001-Pressure", "type": "sensor", "parent_external": "PRESS-001",
        "manufacturer": "HBM", "external_id": "SENS-P001-P01",
        "location_zone": "Zone A",
        "metadata": {
            "sensor_type": "pressure", "unit": "MPa",
            "min_value": 0, "max_value": 350,
            "accuracy": "±0.5% FS", "last_calibration": "2026-01-15",
        },
        "tags": ["pressure", "press", "critical"],
    },
    {
        "name": "Press-001-Power", "type": "sensor", "parent_external": "PRESS-001",
        "manufacturer": "Siemens", "external_id": "SENS-P001-PW01",
        "location_zone": "Zone A",
        "metadata": {
            "sensor_type": "power", "unit": "kW",
            "min_value": 0, "max_value": 3000,
            "accuracy": "±1%",
        },
        "tags": ["power", "press"],
    },
    # Conveyor-001 sensors
    {
        "name": "Conveyor-001-Speed", "type": "sensor", "parent_external": "CONV-001",
        "manufacturer": "Sick", "external_id": "SENS-C001-SP01",
        "location_zone": "Zone A",
        "metadata": {
            "sensor_type": "speed", "unit": "m/s",
            "min_value": 0, "max_value": 2.0,
            "accuracy": "±0.01 m/s",
        },
        "tags": ["speed", "conveyor"],
    },
    {
        "name": "Conveyor-001-Load", "type": "sensor", "parent_external": "CONV-001",
        "manufacturer": "HBM", "external_id": "SENS-C001-L01",
        "location_zone": "Zone A",
        "metadata": {
            "sensor_type": "load", "unit": "kg",
            "min_value": 0, "max_value": 600,
            "accuracy": "±0.5 kg",
        },
        "tags": ["load", "conveyor"],
    },
    # Robot-Weld-001 sensors
    {
        "name": "Robot-001-Arc-Current", "type": "sensor", "parent_external": "RW-001",
        "manufacturer": "Miller", "external_id": "SENS-RW001-AC01",
        "location_zone": "Zone A",
        "metadata": {
            "sensor_type": "current", "unit": "A",
            "min_value": 0, "max_value": 400,
            "accuracy": "±1A",
        },
        "tags": ["current", "welding", "arc"],
    },
    {
        "name": "Robot-001-Arc-Voltage", "type": "sensor", "parent_external": "RW-001",
        "manufacturer": "Miller", "external_id": "SENS-RW001-AV01",
        "location_zone": "Zone A",
        "metadata": {
            "sensor_type": "voltage", "unit": "V",
            "min_value": 0, "max_value": 50,
            "accuracy": "±0.5V",
        },
        "tags": ["voltage", "welding", "arc"],
    },
    # CNC-Mill-001 sensors
    {
        "name": "CNC-001-Spindle-Temp", "type": "sensor", "parent_external": "CNC-001",
        "manufacturer": "NSK", "external_id": "SENS-CNC001-ST01",
        "location_zone": "Zone A",
        "metadata": {
            "sensor_type": "temperature", "unit": "°C",
            "min_value": 0, "max_value": 100,
            "accuracy": "±1°C",
        },
        "tags": ["temperature", "spindle", "cnc"],
    },
    {
        "name": "CNC-001-Spindle-Vibration", "type": "sensor", "parent_external": "CNC-001",
        "manufacturer": "Bently Nevada", "external_id": "SENS-CNC001-SV01",
        "location_zone": "Zone A",
        "metadata": {
            "sensor_type": "vibration", "unit": "mm/s",
            "min_value": 0, "max_value": 25,
            "accuracy": "±2%",
        },
        "tags": ["vibration", "spindle", "cnc"],
    },
    # Paint-Booth-001 sensors
    {
        "name": "PaintBooth-Temperature", "type": "sensor", "parent_external": "PB-001",
        "manufacturer": "Vaisala", "external_id": "SENS-PB001-T01",
        "location_zone": "Zone B",
        "metadata": {
            "sensor_type": "temperature", "unit": "°C",
            "min_value": 15, "max_value": 30,
            "accuracy": "±0.3°C",
        },
        "tags": ["temperature", "paint-booth", "critical"],
    },
    {
        "name": "PaintBooth-Humidity", "type": "sensor", "parent_external": "PB-001",
        "manufacturer": "Vaisala", "external_id": "SENS-PB001-H01",
        "location_zone": "Zone B",
        "metadata": {
            "sensor_type": "humidity", "unit": "%RH",
            "min_value": 30, "max_value": 80,
            "accuracy": "±1.5% RH",
        },
        "tags": ["humidity", "paint-booth", "critical"],
    },
    # Oven-Cure-001 sensors
    {
        "name": "Oven-Temperature-Zone1", "type": "sensor", "parent_external": "OVEN-001",
        "manufacturer": "Pyrocontrole", "external_id": "SENS-OVN001-T01",
        "location_zone": "Zone B",
        "metadata": {
            "sensor_type": "temperature", "unit": "°C",
            "min_value": 0, "max_value": 250,
            "accuracy": "±2°C", "zone": 1,
        },
        "tags": ["temperature", "oven", "zone1"],
    },
    {
        "name": "Oven-Temperature-Zone2", "type": "sensor", "parent_external": "OVEN-001",
        "manufacturer": "Pyrocontrole", "external_id": "SENS-OVN001-T02",
        "location_zone": "Zone B",
        "metadata": {
            "sensor_type": "temperature", "unit": "°C",
            "min_value": 0, "max_value": 250,
            "accuracy": "±2°C", "zone": 2,
        },
        "tags": ["temperature", "oven", "zone2"],
    },
    {
        "name": "Oven-Temperature-Zone3", "type": "sensor", "parent_external": "OVEN-001",
        "manufacturer": "Pyrocontrole", "external_id": "SENS-OVN001-T03",
        "location_zone": "Zone B",
        "metadata": {
            "sensor_type": "temperature", "unit": "°C",
            "min_value": 0, "max_value": 250,
            "accuracy": "±2°C", "zone": 3,
        },
        "tags": ["temperature", "oven", "zone3"],
    },
    {
        "name": "Oven-Temperature-Zone4", "type": "sensor", "parent_external": "OVEN-001",
        "manufacturer": "Pyrocontrole", "external_id": "SENS-OVN001-T04",
        "location_zone": "Zone B",
        "metadata": {
            "sensor_type": "temperature", "unit": "°C",
            "min_value": 0, "max_value": 250,
            "accuracy": "±2°C", "zone": 4,
        },
        "tags": ["temperature", "oven", "zone4"],
    },
    # Additional machine condition and process sensors
    {
        "name": "Press-002-Temperature", "type": "sensor", "parent_external": "PRESS-002",
        "manufacturer": "Pt100", "external_id": "SENS-P002-T01",
        "location_zone": "Zone A",
        "metadata": {
            "sensor_type": "temperature", "unit": "°C",
            "min_value": -20, "max_value": 150, "accuracy": "±0.5°C",
        },
        "tags": ["temperature", "press"],
    },
    {
        "name": "Press-002-Vibration", "type": "sensor", "parent_external": "PRESS-002",
        "manufacturer": "Wilcoxon", "external_id": "SENS-P002-V01",
        "location_zone": "Zone A",
        "metadata": {
            "sensor_type": "vibration", "unit": "mm/s",
            "min_value": 0, "max_value": 50, "accuracy": "±2%",
        },
        "tags": ["vibration", "press"],
    },
    {
        "name": "Robot-002-Arc-Current", "type": "sensor", "parent_external": "RW-002",
        "manufacturer": "Miller", "external_id": "SENS-RW002-AC01",
        "location_zone": "Zone A",
        "metadata": {
            "sensor_type": "current", "unit": "A",
            "min_value": 0, "max_value": 400, "accuracy": "±1A",
        },
        "tags": ["current", "welding", "arc"],
    },
    {
        "name": "Packaging-001-Throughput", "type": "sensor", "parent_external": "PKG-001",
        "manufacturer": "Sick", "external_id": "SENS-PKG001-TP01",
        "location_zone": "Zone C",
        "metadata": {
            "sensor_type": "throughput", "unit": "units/min",
            "min_value": 0, "max_value": 80, "accuracy": "±1 unit/min",
        },
        "tags": ["throughput", "packaging"],
    },
    {
        "name": "CNC-002-Spindle-Temp", "type": "sensor", "parent_external": "CNC-002",
        "manufacturer": "NSK", "external_id": "SENS-CNC002-ST01",
        "location_zone": "Zone A",
        "metadata": {
            "sensor_type": "temperature", "unit": "°C",
            "min_value": 0, "max_value": 100, "accuracy": "±1°C",
        },
        "tags": ["temperature", "spindle", "cnc"],
    },
    {
        "name": "CNC-002-Spindle-Vibration", "type": "sensor", "parent_external": "CNC-002",
        "manufacturer": "Bently Nevada", "external_id": "SENS-CNC002-SV01",
        "location_zone": "Zone A",
        "metadata": {
            "sensor_type": "vibration", "unit": "mm/s",
            "min_value": 0, "max_value": 25, "accuracy": "±2%",
        },
        "tags": ["vibration", "spindle", "cnc"],
    },
    {
        "name": "Lathe-001-Spindle-Vibration", "type": "sensor", "parent_external": "LATHE-001",
        "manufacturer": "Bently Nevada", "external_id": "SENS-LATHE001-SV01",
        "location_zone": "Zone A",
        "metadata": {
            "sensor_type": "vibration", "unit": "mm/s",
            "min_value": 0, "max_value": 25, "accuracy": "±2%",
        },
        "tags": ["vibration", "spindle", "lathe"],
    },
    {
        "name": "Conveyor-002-Speed", "type": "sensor", "parent_external": "CONV-002",
        "manufacturer": "Sick", "external_id": "SENS-C002-SP01",
        "location_zone": "Zone A",
        "metadata": {
            "sensor_type": "speed", "unit": "m/s",
            "min_value": 0, "max_value": 2.0, "accuracy": "±0.01 m/s",
        },
        "tags": ["speed", "conveyor"],
    },
    {
        "name": "Conveyor-003-Speed", "type": "sensor", "parent_external": "CONV-003",
        "manufacturer": "Sick", "external_id": "SENS-C003-SP01",
        "location_zone": "Zone B",
        "metadata": {
            "sensor_type": "speed", "unit": "m/s",
            "min_value": 0, "max_value": 2.0, "accuracy": "±0.01 m/s",
        },
        "tags": ["speed", "conveyor", "painting-line"],
    },
    {
        "name": "Conveyor-003-Load", "type": "sensor", "parent_external": "CONV-003",
        "manufacturer": "HBM", "external_id": "SENS-C003-L01",
        "location_zone": "Zone B",
        "metadata": {
            "sensor_type": "load", "unit": "kg",
            "min_value": 0, "max_value": 250, "accuracy": "±0.5 kg",
        },
        "tags": ["load", "conveyor", "painting-line"],
    },
]

# Additional machines to bring total to 20+
EXTRA_MACHINES: List[Dict[str, Any]] = [
    {
        "name": "Press-003", "type": "machine", "line": "LS18",
        "external_id": "PRESS-003", "manufacturer": "Schuler",
        "location_zone": "Zone A", "location_area": "LS18-F01",
        "metadata": {
            "model_number": "SMP-1800", "serial_number": "SCH-2019-003",
            "power_rating": "1800 kW", "spindle_hours": 6200,
            "maxForce": "18000 kN", "last_maintenance": "2026-02-10",
            "next_maintenance_date": "2026-08-10",
        },
        "tags": ["press", "stamping"],
    },
    {
        "name": "Robot-Weld-003", "type": "machine", "line": "LS18",
        "external_id": "RW-003", "manufacturer": "FANUC",
        "location_zone": "Zone A", "location_area": "LS18-F04",
        "metadata": {
            "model_number": "M-20iD-25", "serial_number": "FANUC-2020-041",
            "payload": "25 kg", "reach": "1831 mm", "axes": 6,
            "last_maintenance": "2026-05-20", "next_maintenance_date": "2026-08-20",
        },
        "tags": ["robot", "welding"],
    },
    {
        "name": "Laser-Cut-001", "type": "machine", "line": "LS19",
        "external_id": "LASER-001", "manufacturer": "Trumpf",
        "location_zone": "Zone A", "location_area": "LS19-F04",
        "metadata": {
            "model_number": "TruLaser-3030", "serial_number": "TRUMPF-2019-501",
            "power_rating": "6 kW", "max_sheet": "3000x1500 mm",
            "cutting_speed": "50 m/min", "last_maintenance": "2026-03-15",
            "next_maintenance_date": "2026-09-15",
        },
        "tags": ["laser", "cutting"],
    },
    {
        "name": "EDM-001", "type": "machine", "line": "LS19",
        "external_id": "EDM-001", "manufacturer": "Makino",
        "location_zone": "Zone A", "location_area": "LS19-F05",
        "metadata": {
            "model_number": "U6 H.E.A.T.", "serial_number": "MAKINO-2020-601",
            "power_rating": "30 kW", "max_workpiece": "850x600x400 mm",
            "last_maintenance": "2026-04-01", "next_maintenance_date": "2026-10-01",
        },
        "tags": ["edm", "wire-cut"],
    },
    {
        "name": "CMM-001", "type": "machine", "line": "LS18",
        "external_id": "CMM-001", "manufacturer": "Hexagon",
        "location_zone": "Zone A", "location_area": "LS18-F11",
        "metadata": {
            "model_number": "Global-S-07-07-06", "serial_number": "HEX-2019-701",
            "measurement_range": "700x700x600 mm", "accuracy": "1.8 μm",
            "last_calibration": "2026-06-01", "next_maintenance_date": "2026-12-01",
        },
        "tags": ["cmm", "quality", "inspection"],
    },
    {
        "name": "Hydraulic-Press-001", "type": "machine", "line": "LS19",
        "external_id": "HP-001", "manufacturer": "Beckhoff",
        "location_zone": "Zone A", "location_area": "LS19-F06",
        "metadata": {
            "model_number": "HP-500T", "serial_number": "BCK-2019-801",
            "power_rating": "75 kW", "maxForce": "5000 kN",
            "last_maintenance": "2026-03-10", "next_maintenance_date": "2026-09-10",
        },
        "tags": ["hydraulic", "press"],
    },
    {
        "name": "Packaging-001", "type": "machine", "line": "LS18",
        "external_id": "PKG-001", "manufacturer": "Bosch",
        "location_zone": "Zone C", "location_area": "LS18-F12",
        "metadata": {
            "model_number": "SVE-1412", "serial_number": "BOSCH-2020-901",
            "power_rating": "8 kW", "throughput": "60 units/min",
            "last_maintenance": "2026-05-05", "next_maintenance_date": "2026-11-05",
        },
        "tags": ["packaging", "end-of-line"],
    },
    {
        "name": "Conveyor-003", "type": "machine", "line": "LS20",
        "external_id": "CONV-003", "manufacturer": "Interroll",
        "location_zone": "Zone B", "location_area": "LS20-F01",
        "metadata": {
            "model_number": "MCP-200", "serial_number": "INTROLL-2020-013",
            "power_rating": "5 kW", "belt_speed": "1.0 m/s",
            "belt_width": "500 mm", "max_load": "200 kg",
            "last_maintenance": "2026-04-20", "next_maintenance_date": "2026-10-20",
        },
        "tags": ["conveyor", "painting-line"],
    },
]


def _prepare_child_entries(
    entries: List[Dict[str, Any]],
    parent_key: str,
):
    """Yield parent references and mutable copies without changing the catalog."""
    for source_entry in entries:
        entry = source_entry.copy()
        parent_external = entry.pop(parent_key)
        yield parent_external, entry


async def run_seed():
    from app.db.database import get_db_session
    from app.models.asset import AssetMetric
    from app.schemas.asset import (
        AssetCreateRequest,
        AssetType,
        RelationshipCreateRequest,
        RelationshipType,
    )
    from app.services.asset_service import AssetService

    created_ids: dict[str, uuid.UUID] = {}

    async with get_db_session() as session:
        service = AssetService(session)

        # 1. Create plant
        logger.info("Creating MKZ Factory (plant)...")
        plant = await service.create_asset(
            AssetCreateRequest(**MKZ_PLANT),
            user_id=None
        )
        created_ids["plant"] = plant.id
        logger.info(f"  Plant created: {plant.id} — {plant.name}")

        # 2. Create lines
        for line_data in LINES:
            line = await service.create_asset(
                AssetCreateRequest(
                    name=line_data["name"],
                    type=AssetType(line_data["type"]),
                    parent_id=plant.id,
                    external_id=line_data["external_id"],
                    manufacturer=line_data.get("manufacturer"),
                    metadata=line_data.get("metadata", {}),
                    tags=line_data.get("tags", []),
                ),
                user_id=None
            )
            created_ids[line_data["external_id"]] = line.id
            logger.info(f"  Line created: {line.id} — {line.name}")

        # 3. Create machines
        all_machines = MACHINES + EXTRA_MACHINES
        for line_ext_id, mach_data in _prepare_child_entries(all_machines, "line"):
            parent_id = created_ids.get(line_ext_id)
            if not parent_id:
                logger.warning(f"  Line {line_ext_id} not found for machine {mach_data['name']}, skipping")
                continue

            asset_req = AssetCreateRequest(
                name=mach_data["name"],
                type=AssetType(mach_data["type"]),
                parent_id=parent_id,
                external_id=mach_data["external_id"],
                manufacturer=mach_data.get("manufacturer"),
                model_number=mach_data.get("metadata", {}).get("model_number"),
                serial_number=mach_data.get("metadata", {}).get("serial_number"),
                location_zone=mach_data.get("location_zone"),
                location_area=mach_data.get("location_area"),
                metadata=mach_data.get("metadata", {}),
                tags=mach_data.get("tags", []),
            )
            machine = await service.create_asset(asset_req, user_id=None)
            created_ids[mach_data["external_id"]] = machine.id
            logger.info(f"  Machine created: {machine.id} — {machine.name}")

        # 4. Create sensors
        for parent_ext_id, sens_data in _prepare_child_entries(SENSORS, "parent_external"):
            parent_id = created_ids.get(parent_ext_id)
            if not parent_id:
                logger.warning(f"  Parent machine {parent_ext_id} not found for sensor {sens_data['name']}, skipping")
                continue

            asset_req = AssetCreateRequest(
                name=sens_data["name"],
                type=AssetType(sens_data["type"]),
                parent_id=parent_id,
                external_id=sens_data["external_id"],
                manufacturer=sens_data.get("manufacturer"),
                location_zone=sens_data.get("location_zone"),
                metadata=sens_data.get("metadata", {}),
                tags=sens_data.get("tags", []),
            )
            sensor = await service.create_asset(asset_req, user_id=None)
            created_ids[sens_data["external_id"]] = sensor.id
            logger.info(f"  Sensor created: {sensor.id} — {sensor.name}")

        # 5. Create relationships
        logger.info("Creating relationships...")
        rels = [
            ("PRESS-001", "PRESS-002", "upstream", "Press-002 feeds into Press-001 staging"),
            ("PRESS-001", "RW-001", "upstream", "Press-001 supplies to weld station"),
            ("RW-001", "RW-002", "downstream", "Weld-002 does secondary welding"),
            ("CNC-001", "RW-001", "upstream", "CNC parts feed welding robot"),
            ("CNC-001", "CNC-002", "downstream", "CNC-002 does finishing passes"),
            ("PB-001", "OVEN-001", "upstream", "Paint booth feeds into cure oven"),
            ("PRESS-001", "QC-001", "monitors", "QC station inspects press output"),
        ]
        for src_ext, tgt_ext, rel_type, desc in rels:
            src_id = created_ids.get(src_ext)
            tgt_id = created_ids.get(tgt_ext)
            if src_id and tgt_id:
                await service.create_relationship(RelationshipCreateRequest(
                    asset_id=src_id,
                    related_asset_id=tgt_id,
                    relationship_type=RelationshipType(rel_type),
                    description=desc,
                ))
                logger.info(f"  Relationship: {src_ext} --[{rel_type}]--> {tgt_ext}")

        # 6. Seed historical metrics for health score testing
        logger.info("Seeding historical metrics...")
        from datetime import timedelta
        import random
        now = datetime.now(timezone.utc)

        machine_ids = [created_ids[ext] for ext in [
            "PRESS-001", "PRESS-002", "RW-001", "CNC-001", "PB-001"
        ] if ext in created_ids]

        for mid in machine_ids:
            for days_ago in range(30, 0, -1):
                ts = now - timedelta(days=days_ago)
                metrics = [
                    ("uptime_pct", random.uniform(85, 99)),
                    ("alarm_count", random.uniform(0, 5)),
                    ("performance_pct", random.uniform(70, 95)),
                ]
                for metric_name, metric_value in metrics:
                    session.add(AssetMetric(
                        asset_id=mid,
                        metric_name=metric_name,
                        metric_value=metric_value,
                        recorded_at=ts,
                    ))

        await session.commit()
        logger.info("Seed complete!")
        logger.info(f"Total assets created: Plant=1, Lines={len(LINES)}, Machines={len(all_machines)}, Sensors={len(SENSORS)}")
        logger.info(f"Total: {1 + len(LINES) + len(all_machines) + len(SENSORS)} assets")
        logger.info(f"Relationships: {len(rels)}")
        return created_ids


if __name__ == "__main__":
    asyncio.run(run_seed())
