"""Shared feature space for the at-risk models.

SHARED_FEATURES is the intersection that can be computed both from OULAD
(the pre-trained public-dataset baseline, manuscript 3.3) and from live
iCARE++ data, so a baseline artifact can score iCARE students on day one.

EXTENDED_FEATURES adds iCARE-only signals; the retraining job
(training/train_icare.py) uses them once enough local data exists. Each
model artifact records its own `feature_names`, and the predictor builds
the input vector per-artifact, so both generations coexist in the registry.
"""

SHARED_FEATURES = [
    "avg_score",                 # mean submitted quiz score, 0-100
    "score_trend",               # OLS slope of scores over attempt order, clipped to [-50, 50]
    "attempts_count",            # number of submitted attempts
    "completion_rate",           # completed assignments / assigned, 0-1 (1.0 when nothing assigned)
    "lateness_rate",             # late submissions / deadline'd submissions, 0-1
    "engagement_index",          # saturating activity volume over the last 60 days, 0-1
    "days_since_last_activity",  # capped at 60
]

EXTENDED_FEATURES = SHARED_FEATURES + [
    "avg_time_ratio",             # mean time_taken / time_limit over timed attempts, clipped [0, 3]
    "weakest_competency_accuracy",  # min per-competency answer accuracy (>=3 answers), 0-1
    "clinical_activity_count",    # vitals + TPR + IVF + progress-note entries
]

# Saturation point for engagement_index: this many activity events in the
# last 60 days counts as fully engaged.
ENGAGEMENT_SATURATION_EVENTS = 30

ACTIVITY_RECENCY_CAP_DAYS = 60
