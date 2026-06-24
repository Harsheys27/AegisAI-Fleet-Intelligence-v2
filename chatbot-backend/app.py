from flask import Flask, request, jsonify
from flask_cors import CORS
import pandas as pd
import ollama
import re
from recommendation import (
    analyze_vehicle,
    get_all_vehicle_scores
)

# ==================== LOAD DATA ====================
# Adjusted for Mac compatibility (relative path)
DATA_FILE = "data/sample_data_exceptions_type.csv"
df = pd.read_csv(DATA_FILE)

# ==================== FLASK APP SETUP ====================
app = Flask(__name__)
CORS(app)

# HEALTH CHECK
@app.route("/", methods=["GET"])
def health():
    return jsonify({
        "status": "running",
        "model": "phi3"
    })

# VEHICLES LIST (TOP 20)
@app.route("/vehicles", methods=["GET"])
def get_vehicles():
    scores_df = get_all_vehicle_scores(df)
    vehicles = []

    for _, row in scores_df.iterrows():
        vehicle_id = int(row["vehicle_id"])
        score = float(row["safety_score"])

        vehicle_data = df[df["vehicle_id"] == vehicle_id]
        exceptions = int(vehicle_data["exception_count"].sum())
        driver_name = str(vehicle_data["driver_name"].iloc[0])

        if score >= 80:
            risk = "LOW"
        elif score >= 60:
            risk = "MEDIUM"
        else:
            risk = "HIGH"

        vehicles.append({
            "id": vehicle_id,
            "vehicle_id": vehicle_id,
            "driver_name": driver_name,
            "score": round(score, 2),
            "exceptions": exceptions,
            "risk": risk
        })

    # Sort by total exceptions descending
    vehicles.sort(key=lambda x: x["exceptions"], reverse=True)
    return jsonify(vehicles[:20])

# EXCEPTIONS BREAKDOWN
@app.route("/exceptions", methods=["GET"])
def exceptions():
    grouped = df.groupby("exception_type")["exception_count"].sum()
    return jsonify({
        "breakdown": grouped.to_dict(),
        "total": int(grouped.sum())
    })

# FLEET SUMMARY METRICS
@app.route("/fleet-summary", methods=["GET"])
def fleet_summary():
    scores = get_all_vehicle_scores(df)

    total_vehicles = int(df["vehicle_id"].nunique())
    total_trips = int(df["trip_id"].nunique())
    total_exceptions = int(df["exception_count"].sum())
    avg_safety_score = round(scores["safety_score"].mean(), 2)

    repeat_vehicles = int(
        (df.groupby("vehicle_id")["exception_count"].sum() > 1).sum()
    )

    return jsonify({
        "total_vehicles": total_vehicles,
        "total_trips": total_trips,
        "avg_safety_score": avg_safety_score,
        "repeat_vehicles": repeat_vehicles,
        "total_exceptions": total_exceptions
    })

# DASHBOARD CHARTS DATA
@app.route("/dashboard-charts", methods=["GET"])
def dashboard_charts():
    vehicle_scores = get_all_vehicle_scores(df)

    # Dynamic Risk Levels
    vehicle_scores["risk_level"] = vehicle_scores["safety_score"].apply(
        lambda x: "Low" if x >= 80 else "Moderate" if x >= 60 else "High"
    )

    # 1. Risk Distribution
    risk_distribution = vehicle_scores["risk_level"].value_counts().to_dict()

    # 2. Driver Performance Bins
    score_bins = {
        "0-20": 0, "21-40": 0, "41-60": 0, "61-80": 0, "81-100": 0
    }
    for score in vehicle_scores["safety_score"]:
        if score <= 20: score_bins["0-20"] += 1
        elif score <= 40: score_bins["21-40"] += 1
        elif score <= 60: score_bins["41-60"] += 1
        elif score <= 80: score_bins["61-80"] += 1
        else: score_bins["81-100"] += 1

    # 3. Exception Trends
    exception_trends = df.groupby("exception_type")["exception_count"].sum().to_dict()

    return jsonify({
        "risk_distribution": risk_distribution,
        "driver_distribution": score_bins,
        "exception_trends": exception_trends
    })

# AI INSIGHTS FOR WORST VEHICLE
@app.route("/ai-insights", methods=["GET"])
def ai_insights():
    scores_df = get_all_vehicle_scores(df)
    worst_vehicle = scores_df.loc[scores_df["safety_score"].idxmin()]
    vehicle_id = int(worst_vehicle["vehicle_id"])

    result = analyze_vehicle(df, vehicle_id)

    insights = [
        f"Highest risk vehicle: {vehicle_id}",
        f"Driver: {result['driver_name']}",
        f"Safety score: {result['safety_score']}",
        f"Risk level: {result['risk_level']}",
        f"Most frequent exception: {result['highest_risk_exception']}",
        f"Total exceptions: {result['total_exceptions']}"
    ]

    return jsonify({
        "insights": insights
    })

# MAIN AI ANALYSIS CHATBOT ENGINE
@app.route("/analyze", methods=["POST"])
def analyze():
    try:
        data = request.get_json(silent=True) or {}
        query = data.get("query", "")
        vehicle_id = data.get("vehicle_id")

        # Safely extract vehicle_id using regex if not explicitly provided
        if vehicle_id is None:
            match = re.search(r"\d+", query)
            if not match:
                return jsonify({
                    "success": False,
                    "error": "No vehicle_id found in request"
                }), 400
            vehicle_id = int(match.group())

        vehicle_id = int(vehicle_id)
        result = analyze_vehicle(df, vehicle_id)

        if not result:
            return jsonify({
                "success": False,
                "error": "Vehicle not found"
            }), 404

        # Strict Single-Vehicle Prompt System
        prompt = f"""
You are a strict Fleet Safety Analyst.

IMPORTANT RULE:
You must analyze ONLY the given vehicle.
DO NOT mention or compare any other vehicles.

Vehicle Data (ONLY THIS VEHICLE):

Vehicle ID: {result['vehicle_id']}
Driver: {result['driver_name']}
Safety Score: {result['safety_score']}
Grade: {result['grade']}
Risk Level: {result['risk_level']}
Confidence: {result['confidence']}
Total Trips: {result['total_trips']}
Total Exceptions: {result['total_exceptions']}
Exception Breakdown: {result['breakdown']}

TASK:
Give a STRICT single-vehicle analysis:

- Summary (1–2 lines)
- Key Risk (1 line)
- Pattern (1 line)
- 3 Recommendations (bullet points)
- Final Conclusion (1 line)

RULES:
- Do NOT mention other vehicle IDs
- Do NOT compare with fleet
- Do NOT invent data
- Keep it concise and structured
"""

        response = ollama.chat(
            model="phi3",
            keep_alive="30m",
            messages=[
                {"role": "system", "content": "You are a fleet safety analyst."},
                {"role": "user", "content": prompt}
            ]
        )

        ai_analysis = response["message"]["content"]

        def safe(v, default="N/A"):
            return default if v is None else v

        response_payload = {
            "success": True,
            "vehicle_id": result["vehicle_id"],
            "driver_name": result["driver_name"],
            "safety_score": result["safety_score"],
            "grade": result["grade"],
            "risk_level": result["risk_level"],
            "confidence": result["confidence"],
            "fleet_average_score": safe(result.get("fleet_average_score")),
            "total_trips": result["total_trips"],
            "total_exceptions": result["total_exceptions"],
            "exception_rate": safe(result.get("exception_rate")),
            "unique_exception_types": result["unique_exception_types"],
            "highest_risk_exception": result["highest_risk_exception"],
            "breakdown": result["breakdown"],
            "ai_analysis": ai_analysis
        }

        return jsonify(response_payload)

    except Exception as e:
        print("ERROR:", str(e))
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500

# DIRECT INDIVIDUAL VEHICLE FETCH
@app.route("/analyze/<int:vehicle_id>", methods=["GET"])
def analyze_get(vehicle_id):
    result = analyze_vehicle(df, vehicle_id)
    if not result:
        return jsonify({
            "success": False,
            "error": "Vehicle not found"
        }), 404
    return jsonify(result)

# START APPLICATION SERVER
if __name__ == "__main__":
    app.run(
        host="0.0.0.0",
        port=8000,
        debug=True
    )