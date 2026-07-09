"""
Sample CEP rules for MKZ Factory Monitor.

These 10 rules cover:
1. Temperature threshold breach (duration-based)
2. Multi-machine failure pattern (N-within)
3. Output drop vs same hour yesterday
4. Vibration anomaly detection
5. Cascading failure detection
6. Thermal drift detection
7. Current spike detection
8. Machine idle detection
9. ML-based anomaly (severity escalation)
10. Model drift detection
"""

from app.schemas.rule import CEPRule, ConditionConfig, RuleAction, RuleConditionType

# ──────────────────────────────────────────────────────────────
# Rule 1: Temperature Exceeds Threshold for >2 minutes
# Trigger: temperature > 100°C for more than 2 minutes
# ──────────────────────────────────────────────────────────────

RULE_TEMP_HIGH = CEPRule(
    rule_id="temp-high-001",
    rule_name="Temperature Exceeds Threshold",
    description="Triggers when temperature exceeds 100°C for more than 2 minutes on any machine. "
    "This is a critical threshold — prolonged high temperature indicates cooling system failure or overload.",
    version="1.0.0",
    condition_type=RuleConditionType.THRESHOLD_BREACH_DURATION,
    condition_config=ConditionConfig(
        condition_type=RuleConditionType.THRESHOLD_BREACH_DURATION,
        target_metric="temperature",
        threshold_value=100.0,
        threshold_unit="°C",
        min_duration_seconds=120.0,
    ),
    action=RuleAction(
        action_type="emit_event",
        event_type_to_emit="temperature_high",
        severity="critical",
        message_template="Nhiệt độ máy {machine} vượt 100°C trong hơn 2 phút. Giá trị hiện tại: {value}°C",
    ),
    priority=5,
    tags=["thermal", "critical", "safety"],
)

# ──────────────────────────────────────────────────────────────
# Rule 2: 3+ Machines Fail on Same Line Within 5 Minutes
# Trigger: 3+ machine failures on LS18 within 5 minutes
# ──────────────────────────────────────────────────────────────

RULE_MULTI_MACHINE_FAILURE = CEPRule(
    rule_id="multi-failure-001",
    rule_name="Multiple Machine Failure on Same Line",
    description="Triggers when 3 or more machines on the same production line fail within a 5-minute window. "
    "This may indicate a shared utility failure (power, air supply, coolant) or a line-level cascade event.",
    version="1.0.0",
    condition_type=RuleConditionType.PATTERN_N_WITHIN,
    condition_config=ConditionConfig(
        condition_type=RuleConditionType.PATTERN_N_WITHIN,
        event_type_filter="machine_stopped",
        min_count=3,
        time_window_minutes=5.0,
        target_machine_codes=["Press-001", "Press-002", "Press-003", "Conveyor-001"],
    ),
    action=RuleAction(
        action_type="emit_event",
        event_type_to_emit="multi_machine_failure",
        severity="critical",
        message_template="Phát hiện {count} máy dừng trên {line} trong 5 phút. Có thể do lỗi nguồn hoặc hệ thống chung.",
    ),
    priority=1,
    tags=["pattern", "critical", "line"],
)

# ──────────────────────────────────────────────────────────────
# Rule 3: Output Drops >20% vs Same Hour Yesterday
# Trigger: production output drops more than 20% compared to the same hour yesterday
# ──────────────────────────────────────────────────────────────

RULE_OUTPUT_DROP = CEPRule(
    rule_id="output-drop-001",
    rule_name="Production Output Drop",
    description="Triggers when the current production output is more than 20% lower than the same hour yesterday. "
    "This helps identify equipment degradation, material issues, or operator-related slowdowns.",
    version="1.0.0",
    condition_type=RuleConditionType.COMPARISON_SAME_HOUR_YESTERDAY,
    condition_config=ConditionConfig(
        condition_type=RuleConditionType.COMPARISON_SAME_HOUR_YESTERDAY,
        target_metric="output_count",
        threshold_value=20.0,
        baseline_value=None,  # Populated at runtime from historical data
    ),
    action=RuleAction(
        action_type="emit_event",
        event_type_to_emit="output_drop",
        severity="warning",
        message_template="Sản lượng dây chuyền {line} giảm {deviation}% so với cùng giờ hôm qua. "
        "Cần kiểm tra tình trạng máy và nguyên vật liệu.",
    ),
    priority=20,
    tags=["production", "degradation"],
)

# ──────────────────────────────────────────────────────────────
# Rule 4: Vibration Anomaly Detected
# Trigger: vibration exceeds 7mm/s (warning) or 10mm/s (critical)
# ──────────────────────────────────────────────────────────────

RULE_VIBRATION_ANOMALY = CEPRule(
    rule_id="vibration-001",
    rule_name="Vibration Anomaly Detected",
    description="Triggers when machine vibration exceeds normal thresholds. "
    "Elevated vibration indicates bearing wear, misalignment, or mechanical looseness. "
    "Warning at 7mm/s, critical at 10mm/s.",
    version="1.0.0",
    condition_type=RuleConditionType.THRESHOLD_HIGH,
    condition_config=ConditionConfig(
        condition_type=RuleConditionType.THRESHOLD_HIGH,
        target_metric="vibration",
        threshold_value=7.0,
        threshold_unit="mm/s",
        severity_mapping={
            "7.0-9.9": "warning",
            "10.0+": "critical",
        },
    ),
    action=RuleAction(
        action_type="emit_event",
        event_type_to_emit="vibration_anomaly",
        severity="warning",
        message_template="Rung động máy {machine} cao bất thường ({value}mm/s). "
        "Cần kiểm tra ổ bạc, độ căng của bộ truyền động.",
    ),
    priority=15,
    tags=["vibration", "maintenance", "mechanical"],
)

# ──────────────────────────────────────────────────────────────
# Rule 5: Cascading Failure Pattern
# Trigger: Temperature spike → Vibration increase → Machine stop (within 10 min)
# ──────────────────────────────────────────────────────────────

RULE_CASCADE_FAILURE = CEPRule(
    rule_id="cascade-001",
    rule_name="Cascading Failure Pattern",
    description="Detects cascading failures: temperature spike followed by vibration increase "
    "followed by machine stop within 10 minutes. This pattern indicates progressive mechanical failure.",
    version="1.0.0",
    condition_type=RuleConditionType.PATTERN_CASCADE,
    condition_config=ConditionConfig(
        condition_type=RuleConditionType.PATTERN_CASCADE,
        event_type_filter="temperature_high",
        time_window_minutes=10.0,
    ),
    action=RuleAction(
        action_type="emit_event",
        event_type_to_emit="cascading_failure",
        severity="critical",
        message_template="Phát hiện lỗi cascade: nhiệt độ tăng → rung động tăng → dừng máy. "
        "Có thể gây hư hỏng nghiêm trọng. Dừng máy kiểm tra ngay.",
    ),
    priority=2,
    tags=["cascade", "critical", "progressive"],
)

# ──────────────────────────────────────────────────────────────
# Rule 6: Thermal Drift Detection
# Trigger: Temperature trend rising >1°C/min over 5 minutes
# ──────────────────────────────────────────────────────────────

RULE_THERMAL_DRIFT = CEPRule(
    rule_id="thermal-drift-001",
    rule_name="Thermal Drift Warning",
    description="Detects when temperature is rising consistently (>1°C/min) over a 5-minute window. "
    "This is an early warning before temperature threshold breach.",
    version="1.0.0",
    condition_type=RuleConditionType.PATTERN_TREND,
    condition_config=ConditionConfig(
        condition_type=RuleConditionType.PATTERN_TREND,
        target_metric="temperature",
        threshold_value=1.0,
        min_duration_seconds=300.0,
    ),
    action=RuleAction(
        action_type="emit_event",
        event_type_to_emit="thermal_drift",
        severity="warning",
        message_template="Nhiệt độ máy {machine} đang tăng đều ({slope}°C/phút). "
        "Kiểm tra hệ thống làm mát trước khi vượt ngưỡng.",
    ),
    priority=25,
    tags=["thermal", "predictive", "early-warning"],
)

# ──────────────────────────────────────────────────────────────
# Rule 7: Current Spike Detection
# Trigger: Current draw exceeds 35A (warning) or 40A (critical)
# ──────────────────────────────────────────────────────────────

RULE_CURRENT_SPIKE = CEPRule(
    rule_id="current-001",
    rule_name="Current Spike Detected",
    description="Triggers when machine current draw exceeds normal operating range. "
    "High current indicates motor overload, jam, or winding fault.",
    version="1.0.0",
    condition_type=RuleConditionType.THRESHOLD_HIGH,
    condition_config=ConditionConfig(
        condition_type=RuleConditionType.THRESHOLD_HIGH,
        target_metric="current",
        threshold_value=35.0,
        threshold_unit="A",
        severity_mapping={
            "35.0-39.9": "warning",
            "40.0+": "critical",
        },
    ),
    action=RuleAction(
        action_type="emit_event",
        event_type_to_emit="current_anomaly",
        severity="warning",
        message_template="Dòng điện máy {machine} cao bất thường ({value}A). "
        "Kiểm tra mô-tơ và bộ điều khiển.",
    ),
    priority=20,
    tags=["electrical", "motor", "overload"],
)

# ──────────────────────────────────────────────────────────────
# Rule 8: Machine Idle Detection
# Trigger: Machine not producing for >15 minutes during shift
# ──────────────────────────────────────────────────────────────

RULE_MACHINE_IDLE = CEPRule(
    rule_id="idle-001",
    rule_name="Machine Idle Detection",
    description="Triggers when a machine has been idle (no production events) for more than 15 minutes "
    "during active shift hours (6:00-22:00). May indicate a soft fault or operator availability issue.",
    version="1.0.0",
    condition_type=RuleConditionType.THRESHOLD_BREACH_DURATION,
    condition_config=ConditionConfig(
        condition_type=RuleConditionType.THRESHOLD_BREACH_DURATION,
        event_type_filter="machine_stopped",
        min_duration_seconds=900.0,
    ),
    action=RuleAction(
        action_type="emit_event",
        event_type_to_emit="machine_idle",
        severity="info",
        message_template="Máy {machine} không hoạt động trong hơn 15 phút giờ làm việc. "
        "Kiểm tra trạng thái và nguyên nhân dừng.",
    ),
    priority=50,
    tags=["availability", "operational"],
)

# ──────────────────────────────────────────────────────────────
# Rule 9: ML-Based Anomaly Detection (Severity Escalation)
# Trigger: ML anomaly score > 0.7 on any metric
# ──────────────────────────────────────────────────────────────

RULE_ML_ANOMALY = CEPRule(
    rule_id="ml-anomaly-001",
    rule_name="ML-Based Anomaly Detection",
    description="Triggers when the Isolation Forest anomaly score exceeds 0.7. "
    "This is a data-driven detection that catches complex multi-dimensional anomalies "
    "that threshold rules miss. Severity escalates based on score level.",
    version="1.0.0",
    condition_type=RuleConditionType.ML_ANOMALY_SCORE,
    condition_config=ConditionConfig(
        condition_type=RuleConditionType.ML_ANOMALY_SCORE,
        threshold_value=0.7,
    ),
    action=RuleAction(
        action_type="emit_event",
        event_type_to_emit="anomaly_detected",
        severity="warning",
        message_template="ML phát hiện bất thường trên máy {machine} (anomaly_score={score}). "
        "Kiểm tra các thông số vận hành.",
    ),
    priority=10,
    tags=["ml", "anomaly", "data-driven"],
)

# ──────────────────────────────────────────────────────────────
# Rule 10: Model Drift Detection
# Trigger: ML model predictions consistently wrong over 1 hour window
# ──────────────────────────────────────────────────────────────

RULE_MODEL_DRIFT = CEPRule(
    rule_id="model-drift-001",
    rule_name="Model Drift Detection",
    description="Triggers when ML model predictions diverge significantly from actual outcomes "
    "over a rolling 1-hour window. Indicates that the model needs retraining.",
    version="1.0.0",
    condition_type=RuleConditionType.PATTERN_N_WITHIN,
    condition_config=ConditionConfig(
        condition_type=RuleConditionType.PATTERN_N_WITHIN,
        event_type_filter="predicted_failure",
        min_count=5,
        time_window_minutes=60.0,
    ),
    action=RuleAction(
        action_type="emit_event",
        event_type_to_emit="model_drift",
        severity="warning",
        message_template="ML model có drift: {count} predictions không chính xác trong 1 giờ. "
        "Cần retrain model với data mới.",
    ),
    priority=40,
    tags=["ml", "model-quality", "drift"],
)

# ──────────────────────────────────────────────────────────────
# Registry
# ──────────────────────────────────────────────────────────────

ALL_RULES: list[CEPRule] = [
    RULE_TEMP_HIGH,
    RULE_MULTI_MACHINE_FAILURE,
    RULE_OUTPUT_DROP,
    RULE_VIBRATION_ANOMALY,
    RULE_CASCADE_FAILURE,
    RULE_THERMAL_DRIFT,
    RULE_CURRENT_SPIKE,
    RULE_MACHINE_IDLE,
    RULE_ML_ANOMALY,
    RULE_MODEL_DRIFT,
]

RULES_BY_ID: dict[str, CEPRule] = {r.rule_id: r for r in ALL_RULES}


def get_rule(rule_id: str) -> CEPRule | None:
    return RULES_BY_ID.get(rule_id)


def get_rules_by_tag(tag: str) -> list[CEPRule]:
    return [r for r in ALL_RULES if tag in r.tags]


def get_critical_rules() -> list[CEPRule]:
    """Rules with priority 1-10 that require immediate attention."""
    return [r for r in ALL_RULES if r.priority <= 10]
