import pandas as pd

# LOAD LOOKUP DATA
# Adjusted path format for your MacBook
LOOKUP_FILE = "data/exception_lookup.csv"
lookup_df = pd.read_csv(LOOKUP_FILE)

# Ensure consistent casing for string mappings
lookup_df["severity"] = (
    lookup_df["severity"]
    .astype(str)
    .str.upper()
)

# SEVERITY WEIGHT CONFIGURATION (Matching Mentor)
SEVERITY_WEIGHTS = {
    "HIGH": 10,
    "MEDIUM": 5,
    "LOW": 2
}
DEFAULT_WEIGHT = 2

# Module-level Caches
_merged_df_cache = None
_all_scores_cache = None
_vehicle_analysis_cache = {}

def get_merged_df(df):
    """Merges lookup dataframe once and caches it."""
    global _merged_df_cache
    if _merged_df_cache is None:
        _merged_df_cache = pd.merge(
            df,
            lookup_df,
            on="exception_type",
            how="left"
        )
    return _merged_df_cache

def get_all_vehicle_scores(df):
    """Calculates relative safety scores scaled against the highest fleet penalty."""
    global _all_scores_cache
    if _all_scores_cache is not None:
        return _all_scores_cache

    merged = get_merged_df(df)

    # Clean severity strings and map weights safely
    merged["weight"] = (
        merged["severity"]
        .fillna("LOW")
        .astype(str)
        .str.upper()
        .map(SEVERITY_WEIGHTS)
        .fillna(DEFAULT_WEIGHT)
    )

    # Compute total penalty points per item
    merged["penalty"] = merged["weight"] * merged["exception_count"]

    # Roll up total penalties grouped by vehicle id
    penalty_by_vehicle = merged.groupby("vehicle_id")["penalty"].sum()
    max_penalty = penalty_by_vehicle.max()

    if max_penalty <= 0:
        max_penalty = 1

    # Relative calculation methodology
    scores = 100 - (penalty_by_vehicle / max_penalty) * 100
    scores = scores.clip(lower=0)
    
    scores = (
        scores
        .rename("safety_score")
        .reset_index()
    )
    scores["safety_score"] = scores["safety_score"].round(2)

    _all_scores_cache = scores
    return scores

def analyze_vehicle(df, vehicle_id):
    """Performs deep parsing analytics on an isolated target vehicle ID."""
    if vehicle_id in _vehicle_analysis_cache:
        return _vehicle_analysis_cache[vehicle_id]

    merged_df = get_merged_df(df)
    vehicle_data = merged_df[merged_df["vehicle_id"] == vehicle_id]

    if vehicle_data.empty:
        return None

    # Base Metrics Extraction
    driver_name = str(vehicle_data["driver_name"].iloc[0])
    total_exceptions = int(vehicle_data["exception_count"].sum())
    total_trips = int(vehicle_data["trip_id"].nunique())
    unique_exception_types = int(vehicle_data["exception_name"].nunique())
    exception_rate = round(total_exceptions / max(total_trips, 1), 2)

    # Confidence Engine Assignments
    if total_trips < 5:
        confidence = "Low"
    elif total_trips < 20:
        confidence = "Medium"
    else:
        confidence = "High"

    # Breakdowns Calculation 
    exception_summary = (
        vehicle_data
        .groupby("exception_name")["exception_count"]
        .sum()
    )

    if not exception_summary.empty:
        highest_risk_exception = exception_summary.idxmax()
        top_exception_count = int(exception_summary.max())
    else:
        highest_risk_exception = "None"
        top_exception_count = 0

    breakdown = exception_summary.to_dict()

    top_exception_percentage = round(
        (top_exception_count / max(total_exceptions, 1)) * 100, 
        2
    )

    # Fetching scores from global relative metrics matrix
    all_scores = get_all_vehicle_scores(df)
    score_row = all_scores[all_scores["vehicle_id"] == vehicle_id]

    if score_row.empty:
        safety_score = 100.0
    else:
        safety_score = float(score_row.iloc[0]["safety_score"])

    fleet_average_score = round(all_scores["safety_score"].mean(), 2)

    # Assigning Risk Metrics Dynamic Windows
    if safety_score >= 80:
        risk_level = "Low"
    elif safety_score >= 60:
        risk_level = "Moderate"
    else:
        risk_level = "High"

    # Grading Schema Assignations
    if safety_score >= 95:
        grade = "A+"
    elif safety_score >= 90:
        grade = "A"
    elif safety_score >= 80:
        grade = "B"
    elif safety_score >= 70:
        grade = "C"
    elif safety_score >= 60:
        grade = "D"
    else:
        grade = "F"

    result = {
        "vehicle_id": int(vehicle_id),
        "driver_name": driver_name,
        "safety_score": round(safety_score, 2),
        "grade": grade,
        "confidence": confidence,
        "risk_level": risk_level,
        "total_exceptions": total_exceptions,
        "total_trips": total_trips,
        "exception_rate": exception_rate,
        "unique_exception_types": unique_exception_types,
        "highest_risk_exception": highest_risk_exception,
        "breakdown": breakdown,
        "top_exception_count": top_exception_count,
        "top_exception_percentage": top_exception_percentage,
        "fleet_average_score": fleet_average_score
    }

    _vehicle_analysis_cache[vehicle_id] = result
    return result