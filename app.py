from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from flask_bcrypt import Bcrypt
from pymongo import MongoClient
from bson import ObjectId
from datetime import datetime
from dotenv import load_dotenv
import os, base64, random, json
import os, base64, random, json

# ===================== LOAD ENVIRONMENT VARIABLES =====================
load_dotenv()

# ===================== FLASK APP SETUP =====================
app = Flask(__name__, static_folder="static", template_folder=".")
CORS(app)
bcrypt = Bcrypt(app)

# ===================== MONGODB ATLAS SETUP =====================
MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017/")
try:
    client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
    client.admin.command('ping')  # Test connection
    print("✅ MongoDB Atlas Connected!")
except Exception as e:
    print(f"❌ MongoDB Connection Error: {e}")

db = client["smart_drainage"]

users_col       = db["users"]
listings_col    = db["waste_listings"]
pickups_col     = db["pickup_requests"]
reports_col     = db["reports"]
predictions_col = db["predictions"]

# ===================== HELPER FUNCTIONS =====================
def jify(obj):
    """Recursively convert ObjectId / datetime to str for JSON."""
    if isinstance(obj, list):
        return [jify(i) for i in obj]
    if isinstance(obj, dict):
        return {k: jify(v) for k, v in obj.items()}
    if isinstance(obj, ObjectId):
        return str(obj)
    if isinstance(obj, datetime):
        return obj.isoformat()
    return obj

# ===================== SERVE FRONTEND =====================
@app.route("/")
def index():
    return send_from_directory(".", "index.html")

@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({"status": "✅ API is running"}), 200

# ===================== AUTH =====================
@app.route("/api/register", methods=["POST"])
def register():
    d = request.json
    if users_col.find_one({"email": d["email"]}):
        return jsonify({"error": "Email already registered"}), 400
    pw = bcrypt.generate_password_hash(d["password"]).decode()
    uid = users_col.insert_one({
        "name": d["name"], "email": d["email"],
        "password": pw, "reward_points": 0,
        "eco_score": 0, "created_at": datetime.utcnow()
    }).inserted_id
    return jsonify({"message": "Registered", "id": str(uid)}), 201

@app.route("/api/login", methods=["POST"])
def login():
    d = request.json
    u = users_col.find_one({"email": d["email"]})
    if not u or not bcrypt.check_password_hash(u["password"], d["password"]):
        return jsonify({"error": "Invalid credentials"}), 401
    return jsonify({"message": "Login successful", "user": jify({
        "_id": u["_id"], "name": u["name"], "email": u["email"],
        "reward_points": u.get("reward_points", 0),
        "eco_score": u.get("eco_score", 0)
    })})

@app.route("/api/profile/<uid>", methods=["GET"])
def profile(uid):
    u = users_col.find_one({"_id": ObjectId(uid)})
    if not u: return jsonify({"error": "Not found"}), 404
    u.pop("password", None)
    return jsonify(jify(u))

# ===================== WASTE LISTINGS =====================
@app.route("/api/listings", methods=["GET"])
def get_listings():
    kind = request.args.get("type")  # sell | donate
    q = {"listing_type": kind} if kind else {}
    items = list(listings_col.find(q).sort("created_at", -1).limit(50))
    return jsonify(jify(items))

@app.route("/api/listings", methods=["POST"])
def add_listing():
    d = request.json
    d["created_at"] = datetime.utcnow()
    d["status"] = "active"
    lid = listings_col.insert_one(d).inserted_id
    pts = 20 if d.get("listing_type") == "donate" else 10
    users_col.update_one({"_id": ObjectId(d["user_id"])},
                         {"$inc": {"reward_points": pts, "eco_score": pts}})
    return jsonify({"message": "Listing created", "id": str(lid), "points_earned": pts}), 201

@app.route("/api/listings/<lid>", methods=["DELETE"])
def del_listing(lid):
    listings_col.delete_one({"_id": ObjectId(lid)})
    return jsonify({"message": "Deleted"})

# ===================== AI WASTE DETECTION =====================
WASTE_CLASSES = {
    "plastic":   {"methods": ["Mechanical recycling", "Chemical recycling"], "value": "₹5–15/kg"},
    "paper":     {"methods": ["Pulping & repulping", "Composting"],          "value": "₹3–8/kg"},
    "metal":     {"methods": ["Smelting", "Scrap dealing"],                  "value": "₹20–60/kg"},
    "glass":     {"methods": ["Cullet recycling", "Upcycling"],              "value": "₹2–5/kg"},
    "e-waste":   {"methods": ["Component extraction", "Certified e-recycler"], "value": "₹50–200/kg"},
    "organic":   {"methods": ["Composting", "Biogas generation"],            "value": "₹1–3/kg"},
}

@app.route("/api/detect", methods=["POST"])
def detect_waste():
    """Simulate AI waste classification. Replace body with real OpenCV/CNN model."""
    data = request.json
    # Real implementation: decode base64 image → run CNN/OpenCV classifier
    # Here we do pseudo-random seeded on image size for demo reproducibility
    img_b64 = data.get("image", "")
    seed = len(img_b64) % 100
    rng = random.Random(seed)
    category = rng.choice(list(WASTE_CLASSES.keys()))
    confidence = round(rng.uniform(72, 99), 1)
    info = WASTE_CLASSES[category]
    return jsonify({
        "category": category,
        "confidence": confidence,
        "recycling_methods": info["methods"],
        "estimated_value": info["value"],
        "recommendation": f"This appears to be {category}. "
                          f"Suggested action: {info['methods'][0]}."
    })

# ===================== PICKUP REQUESTS =====================
@app.route("/api/pickups", methods=["GET"])
def get_pickups():
    uid = request.args.get("user_id")
    q = {"user_id": uid} if uid else {}
    items = list(pickups_col.find(q).sort("created_at", -1))
    return jsonify(jify(items))

@app.route("/api/pickups", methods=["POST"])
def add_pickup():
    d = request.json
    d["created_at"] = datetime.utcnow()
    d["status"] = "pending"
    pid = pickups_col.insert_one(d).inserted_id
    return jsonify({"message": "Pickup requested", "id": str(pid)}), 201

@app.route("/api/pickups/<pid>", methods=["PATCH"])
def update_pickup(pid):
    d = request.json
    pickups_col.update_one({"_id": ObjectId(pid)}, {"$set": d})
    return jsonify({"message": "Updated"})

# ===================== COMMUNITY REPORTS =====================
@app.route("/api/reports", methods=["GET"])
def get_reports():
    items = list(reports_col.find().sort("created_at", -1).limit(50))
    return jsonify(jify(items))

@app.route("/api/reports", methods=["POST"])
def add_report():
    d = request.json
    d["created_at"] = datetime.utcnow()
    d["status"] = "open"
    rid = reports_col.insert_one(d).inserted_id
    users_col.update_one({"_id": ObjectId(d["user_id"])},
                         {"$inc": {"reward_points": 5, "eco_score": 5}})
    return jsonify({"message": "Report submitted", "id": str(rid)}), 201

@app.route("/api/reports/<rid>", methods=["PATCH"])
def update_report(rid):
    d = request.json
    reports_col.update_one({"_id": ObjectId(rid)}, {"$set": d})
    return jsonify({"message": "Updated"})

# ===================== ML RISK PREDICTION =====================
AREAS = [
    "Kukatpally", "LB Nagar", "Secunderabad", "Himayatnagar",
    "Tarnaka", "Dilsukhnagar", "Uppal", "Mehdipatnam",
    "Ameerpet", "Begumpet", "Malakpet", "Charminar"
]

def predict_risk(area: str) -> dict:
    """Simulate ML risk score. Replace with trained sklearn model."""
    seed = sum(ord(c) for c in area) + datetime.utcnow().day
    rng = random.Random(seed)
    score = round(rng.uniform(10, 95), 1)
    level = "HIGH" if score > 70 else "MEDIUM" if score > 40 else "LOW"
    actions = {
        "HIGH":   "Immediate cleanup + drain inspection required",
        "MEDIUM": "Schedule cleanup within 48 hours",
        "LOW":    "Monitor weekly – no urgent action needed"
    }
    return {"area": area, "risk_score": score, "level": level,
            "action": actions[level], "updated_at": datetime.utcnow().isoformat()}

@app.route("/api/predictions", methods=["GET"])
def get_predictions():
    results = [predict_risk(a) for a in AREAS]
    results.sort(key=lambda x: x["risk_score"], reverse=True)
    return jsonify(results)

# ===================== ANALYTICS =====================
@app.route("/api/analytics", methods=["GET"])
def analytics():
    total_users     = users_col.count_documents({})
    total_listings  = listings_col.count_documents({})
    total_donations = listings_col.count_documents({"listing_type": "donate"})
    total_sales     = listings_col.count_documents({"listing_type": "sell"})
    total_pickups   = pickups_col.count_documents({})
    total_reports   = reports_col.count_documents({})

    # Monthly trend (mock – replace with real aggregation)
    months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
    trend  = [random.randint(30, 200) for _ in months]

    waste_by_type = {k: random.randint(10, 150) for k in WASTE_CLASSES}

    return jsonify({
        "total_users": total_users,
        "total_listings": total_listings,
        "total_donations": total_donations,
        "total_sales": total_sales,
        "total_pickups": total_pickups,
        "total_reports": total_reports,
        "monthly_trend": {"labels": months, "data": trend},
        "waste_by_type": waste_by_type
    })

# ===================== ADMIN =====================
@app.route("/api/admin/login", methods=["POST"])
def admin_login():
    d = request.json
    if d.get("username") == "admin" and d.get("password") == "admin123":
        return jsonify({"message": "Admin login successful", "role": "admin"})
    return jsonify({"error": "Invalid admin credentials"}), 401

@app.route("/api/admin/users", methods=["GET"])
def admin_users():
    items = list(users_col.find({}, {"password": 0}).sort("created_at", -1))
    return jsonify(jify(items))

# ===================== REWARDS LEADERBOARD =====================
@app.route("/api/leaderboard", methods=["GET"])
def leaderboard():
    top = list(users_col.find({}, {"name": 1, "reward_points": 1, "eco_score": 1})
                         .sort("reward_points", -1).limit(10))
    return jsonify(jify(top))

# ===================== ERROR HANDLING =====================
@app.errorhandler(404)
def not_found(error):
    return jsonify({"error": "Route not found"}), 404

@app.errorhandler(500)
def server_error(error):
    return jsonify({"error": "Internal server error"}), 500

# ===================== RUN APP =====================
if __name__ == "__main__":
    port = int(os.getenv('PORT', 5000))
    app.run(debug=False, host='0.0.0.0', port=port)
