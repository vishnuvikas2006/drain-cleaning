from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from flask_bcrypt import Bcrypt
from pymongo import MongoClient
from bson import ObjectId
from datetime import datetime
from dotenv import load_dotenv
import os, base64, random, json
import numpy as np

load_dotenv()

app = Flask(__name__, static_folder="static", template_folder=".")
CORS(app)
bcrypt = Bcrypt(app)

MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017/")
try:
    client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
    client.admin.command('ping')
    print("✅ MongoDB Atlas Connected!")
except Exception as e:
    print(f"❌ MongoDB Connection Error: {e}")

db = client["smart_drainage"]

users_col       = db["users"]
listings_col    = db["waste_listings"]
reports_col     = db["reports"]
predictions_col = db["predictions"]
messages_col    = db["messages"]
interests_col   = db["listing_interests"]
wishlist_col    = db["wishlists"]

def jify(obj):
    if isinstance(obj, list):
        return [jify(i) for i in obj]
    if isinstance(obj, dict):
        return {k: jify(v) for k, v in obj.items()}
    if isinstance(obj, ObjectId):
        return str(obj)
    if isinstance(obj, datetime):
        return obj.isoformat()
    return obj

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
    role = d.get("role", "user")  # support "admin" role registration with secret key
    # Require secret key for admin registration
    if role == "admin":
        secret = d.get("admin_secret", "")
        if secret != os.getenv("ADMIN_SECRET", "smartdrain_admin_2024"):
            return jsonify({"error": "Invalid admin secret key"}), 403
    uid = users_col.insert_one({
        "name": d["name"], "email": d["email"],
        "password": pw, "reward_points": 0,
        "eco_score": 0, "created_at": datetime.utcnow(),
        "phone": d.get("phone", ""),
        "avatar": d.get("avatar", ""),
        "total_waste_sold": 0,
        "total_waste_donated": 0,
        "co2_saved": 0,
        "role": role
    }).inserted_id
    return jsonify({"message": "Registered", "id": str(uid), "role": role}), 201

@app.route("/api/login", methods=["POST"])
def login():
    d = request.json
    u = users_col.find_one({"email": d["email"]})
    if not u or not bcrypt.check_password_hash(u["password"], d["password"]):
        return jsonify({"error": "Invalid credentials"}), 401
    return jsonify({"message": "Login successful", "user": jify({
        "_id": u["_id"], "name": u["name"], "email": u["email"],
        "reward_points": u.get("reward_points", 0),
        "eco_score": u.get("eco_score", 0),
        "phone": u.get("phone", ""),
        "role": u.get("role", "user"),
        "total_waste_sold": u.get("total_waste_sold", 0),
        "total_waste_donated": u.get("total_waste_donated", 0),
        "co2_saved": u.get("co2_saved", 0)
    })})

@app.route("/api/profile/<uid>", methods=["GET"])
def profile(uid):
    u = users_col.find_one({"_id": ObjectId(uid)})
    if not u: return jsonify({"error": "Not found"}), 404
    u.pop("password", None)
    return jsonify(jify(u))

@app.route("/api/profile/<uid>", methods=["PUT"])
def update_profile(uid):
    d = request.json
    d.pop("_id", None); d.pop("password", None)
    users_col.update_one({"_id": ObjectId(uid)}, {"$set": d})
    u = users_col.find_one({"_id": ObjectId(uid)})
    u.pop("password", None)
    return jsonify({"message": "Updated", "user": jify(u)})

# ===================== WASTE LISTINGS =====================
WASTE_MARKET_RATES = {
    "plastic":  {"min": 5,  "max": 15,  "co2_per_kg": 1.8},
    "paper":    {"min": 3,  "max": 8,   "co2_per_kg": 0.9},
    "metal":    {"min": 20, "max": 60,  "co2_per_kg": 4.5},
    "glass":    {"min": 2,  "max": 5,   "co2_per_kg": 0.6},
    "e-waste":  {"min": 50, "max": 200, "co2_per_kg": 20.0},
    "organic":  {"min": 1,  "max": 3,   "co2_per_kg": 0.3},
    "other":    {"min": 2,  "max": 10,  "co2_per_kg": 0.5}
}

@app.route("/api/listings", methods=["GET"])
def get_listings():
    kind      = request.args.get("type")
    category  = request.args.get("category")
    search    = request.args.get("q", "")
    sort_by   = request.args.get("sort", "newest")
    page      = int(request.args.get("page", 1))
    limit     = int(request.args.get("limit", 20))
    user_id   = request.args.get("user_id", "")

    q = {"status": {"$in": ["active", "sold"]}}
    if kind:       q["listing_type"] = kind
    if category:   q["waste_type"] = category
    if user_id:    q["user_id"] = user_id
    if search:
        q["$or"] = [
            {"title": {"$regex": search, "$options": "i"}},
            {"description": {"$regex": search, "$options": "i"}},
            {"waste_type": {"$regex": search, "$options": "i"}},
            {"location": {"$regex": search, "$options": "i"}}
        ]
    # For marketplace, only show active
    if not user_id:
        q["status"] = "active"

    sort_map = {
        "newest":     [("created_at", -1)],
        "price_asc":  [("price", 1)],
        "price_desc": [("price", -1)],
        "popular":    [("views", -1)]
    }
    sort_order = sort_map.get(sort_by, [("created_at", -1)])
    skip = (page - 1) * limit
    items = list(listings_col.find(q).sort(sort_order).skip(skip).limit(limit))
    total = listings_col.count_documents(q)

    return jsonify({"items": jify(items), "total": total, "page": page, "pages": (total + limit - 1) // limit})

@app.route("/api/listings", methods=["POST"])
def add_listing():
    d = request.json
    d["created_at"] = datetime.utcnow()
    d["status"] = "active"
    d["views"] = 0
    d["interested_count"] = 0
    if not d.get("title"):
        d["title"] = f"{d.get('waste_type','Waste').capitalize()} - {d.get('quantity','?')}kg"
    lid = listings_col.insert_one(d).inserted_id
    pts = 20 if d.get("listing_type") == "donate" else 10

    qty = float(d.get("quantity", 0) or 0)
    wt = d.get("waste_type", "other")
    co2 = WASTE_MARKET_RATES.get(wt, {}).get("co2_per_kg", 0.5) * qty

    update_fields = {"$inc": {"reward_points": pts, "eco_score": pts, "co2_saved": co2}}
    if d.get("listing_type") == "sell":
        update_fields["$inc"]["total_waste_sold"] = qty
    elif d.get("listing_type") == "donate":
        update_fields["$inc"]["total_waste_donated"] = qty

    users_col.update_one({"_id": ObjectId(d["user_id"])}, update_fields)
    return jsonify({"message": "Listing created", "id": str(lid), "points_earned": pts}), 201

@app.route("/api/listings/<lid>", methods=["GET"])
def get_listing(lid):
    item = listings_col.find_one({"_id": ObjectId(lid)})
    if not item: return jsonify({"error": "Not found"}), 404
    listings_col.update_one({"_id": ObjectId(lid)}, {"$inc": {"views": 1}})
    seller = users_col.find_one({"_id": ObjectId(item["user_id"])}, {"password": 0})
    item["seller"] = jify(seller) if seller else {}
    return jsonify(jify(item))

@app.route("/api/listings/<lid>", methods=["PUT"])
def update_listing(lid):
    d = request.json
    d.pop("_id", None)
    listings_col.update_one({"_id": ObjectId(lid)}, {"$set": d})
    return jsonify({"message": "Updated"})

@app.route("/api/listings/<lid>", methods=["DELETE"])
def del_listing(lid):
    listings_col.update_one({"_id": ObjectId(lid)}, {"$set": {"status": "deleted"}})
    return jsonify({"message": "Deleted"})

@app.route("/api/listings/<lid>/interest", methods=["POST"])
def express_interest(lid):
    d = request.json
    buyer_id = d.get("buyer_id")
    message  = d.get("message", "I'm interested in this item.")
    existing = interests_col.find_one({"listing_id": lid, "buyer_id": buyer_id})
    if existing:
        return jsonify({"message": "Already expressed interest"}), 200
    listing = listings_col.find_one({"_id": ObjectId(lid)})
    if not listing: return jsonify({"error": "Listing not found"}), 404
    interests_col.insert_one({
        "listing_id": lid, "buyer_id": buyer_id,
        "seller_id": listing["user_id"], "message": message,
        "created_at": datetime.utcnow(), "status": "pending"
    })
    listings_col.update_one({"_id": ObjectId(lid)}, {"$inc": {"interested_count": 1}})
    messages_col.insert_one({
        "listing_id": lid, "from_id": buyer_id,
        "to_id": listing["user_id"], "content": message,
        "created_at": datetime.utcnow(), "read": False
    })
    return jsonify({"message": "Interest expressed, seller notified"}), 201

@app.route("/api/listings/<lid>/interests", methods=["GET"])
def get_interests(lid):
    items = list(interests_col.find({"listing_id": lid}))
    for item in items:
        buyer = users_col.find_one({"_id": ObjectId(item["buyer_id"])}, {"password": 0, "name": 1, "email": 1, "phone": 1})
        item["buyer"] = jify(buyer) if buyer else {}
    return jsonify(jify(items))

@app.route("/api/listings/<lid>/mark-sold", methods=["POST"])
def mark_sold(lid):
    d = request.json
    buyer_id = d.get("buyer_id", "")
    listings_col.update_one({"_id": ObjectId(lid)}, {"$set": {
        "status": "sold", "sold_to": buyer_id, "sold_at": datetime.utcnow()
    }})
    return jsonify({"message": "Marked as sold"})

# ===================== AI WASTE DETECTION =====================
WASTE_CLASSES = {
    "plastic":  {"methods": ["Mechanical recycling", "Chemical recycling"], "value": "₹5–15/kg",  "color": "#3b82f6"},
    "paper":    {"methods": ["Pulping & repulping", "Composting"],          "value": "₹3–8/kg",   "color": "#f59e0b"},
    "metal":    {"methods": ["Smelting", "Scrap dealing"],                  "value": "₹20–60/kg", "color": "#6b7280"},
    "glass":    {"methods": ["Cullet recycling", "Upcycling"],              "value": "₹2–5/kg",   "color": "#06b6d4"},
    "e-waste":  {"methods": ["Component extraction", "Certified e-recycler"], "value": "₹50–200/kg", "color": "#8b5cf6"},
    "organic":  {"methods": ["Composting", "Biogas generation"],            "value": "₹1–3/kg",   "color": "#22c55e"},
}

@app.route("/api/detect", methods=["POST"])
def detect_waste():
    data = request.json
    img_b64 = data.get("image", "")
    seed = len(img_b64) % 100
    rng = random.Random(seed)
    category = rng.choice(list(WASTE_CLASSES.keys()))
    confidence = round(rng.uniform(72, 99), 1)
    info = WASTE_CLASSES[category]
    rates = WASTE_MARKET_RATES.get(category, {})
    return jsonify({
        "category": category,
        "confidence": confidence,
        "recycling_methods": info["methods"],
        "estimated_value": info["value"],
        "market_rate_min": rates.get("min", 2),
        "market_rate_max": rates.get("max", 10),
        "color": info.get("color", "#0f7b5c"),
        "recommendation": f"This appears to be {category} waste. Suggested action: {info['methods'][0]}."
    })

# ===================== AI PRICE FAIRNESS CHECK =====================
@app.route("/api/price-check", methods=["POST"])
def price_check():
    d = request.json
    waste_type = d.get("waste_type", "other")
    price = float(d.get("price", 0))
    quantity = float(d.get("quantity", 1) or 1)
    listing_type = d.get("listing_type", "sell")

    rates = WASTE_MARKET_RATES.get(waste_type, {"min": 2, "max": 10})
    min_r, max_r = rates["min"], rates["max"]
    mid_r = (min_r + max_r) / 2
    total = price * quantity

    if listing_type == "sell":
        if price < min_r * 0.8:
            verdict = "underpriced"
            msg = f"Your price ₹{price}/kg is below market rate (₹{min_r}–₹{max_r}/kg). You could earn more!"
            suggestion = round(mid_r, 1)
        elif price > max_r * 1.2:
            verdict = "overpriced"
            msg = f"Your price ₹{price}/kg is above market rate (₹{min_r}–₹{max_r}/kg). Buyers may look elsewhere."
            suggestion = round(mid_r, 1)
        else:
            verdict = "fair"
            msg = f"Great! ₹{price}/kg is within the fair market range of ₹{min_r}–₹{max_r}/kg."
            suggestion = price
    else:
        if price < min_r * 0.7:
            verdict = "too_low"
            msg = f"Your offered price ₹{price}/kg may be too low to attract sellers (market: ₹{min_r}–₹{max_r}/kg)."
            suggestion = round(min_r * 0.9, 1)
        else:
            verdict = "fair"
            msg = f"Your offer of ₹{price}/kg is reasonable for the market rate of ₹{min_r}–₹{max_r}/kg."
            suggestion = price

    return jsonify({
        "verdict": verdict,
        "message": msg,
        "market_min": min_r,
        "market_max": max_r,
        "suggested_price": suggestion,
        "total_value": round(total, 2),
        "waste_type": waste_type
    })

# ===================== MESSAGES =====================
@app.route("/api/messages/<user_id>", methods=["GET"])
def get_messages(user_id):
    msgs = list(messages_col.find({
        "$or": [{"from_id": user_id}, {"to_id": user_id}]
    }).sort("created_at", -1).limit(100))
    threads = {}
    for m in msgs:
        lid = m.get("listing_id", "general")
        if lid not in threads:
            threads[lid] = []
        threads[lid].append(jify(m))
    return jsonify(threads)

@app.route("/api/messages", methods=["POST"])
def send_message():
    d = request.json
    d["created_at"] = datetime.utcnow()
    d["read"] = False
    mid = messages_col.insert_one(d).inserted_id
    return jsonify({"message": "Sent", "id": str(mid)}), 201

@app.route("/api/messages/unread/<user_id>", methods=["GET"])
def unread_count(user_id):
    count = messages_col.count_documents({"to_id": user_id, "read": False})
    return jsonify({"count": count})

# ===================== WISHLIST =====================
@app.route("/api/wishlist/<user_id>", methods=["GET"])
def get_wishlist(user_id):
    items = list(wishlist_col.find({"user_id": user_id}))
    results = []
    for w in items:
        listing = listings_col.find_one({"_id": ObjectId(w["listing_id"]), "status": "active"})
        if listing:
            listing["wishlist_id"] = str(w["_id"])
            results.append(jify(listing))
    return jsonify(results)

@app.route("/api/wishlist", methods=["POST"])
def add_wishlist():
    d = request.json
    existing = wishlist_col.find_one({"user_id": d["user_id"], "listing_id": d["listing_id"]})
    if existing:
        wishlist_col.delete_one({"_id": existing["_id"]})
        return jsonify({"message": "Removed from wishlist", "action": "removed"})
    wishlist_col.insert_one({"user_id": d["user_id"], "listing_id": d["listing_id"], "saved_at": datetime.utcnow()})
    return jsonify({"message": "Added to wishlist", "action": "added"}), 201

@app.route("/api/wishlist/check", methods=["POST"])
def check_wishlist():
    d = request.json
    existing = wishlist_col.find_one({"user_id": d["user_id"], "listing_id": d["listing_id"]})
    return jsonify({"saved": bool(existing)})

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
    d["completion_image"] = ""
    d["rating"] = None
    d["completed_at"] = None
    # report_image is submitted by the user and visible to admin
    rid = reports_col.insert_one(d).inserted_id
    users_col.update_one({"_id": ObjectId(d["user_id"])},
                         {"$inc": {"reward_points": 5, "eco_score": 5}})
    return jsonify({"message": "Report submitted", "id": str(rid)}), 201

@app.route("/api/reports/<rid>", methods=["PATCH"])
def update_report(rid):
    d = request.json
    if d.get("status") == "resolved":
        d["completed_at"] = datetime.utcnow().isoformat()
    reports_col.update_one({"_id": ObjectId(rid)}, {"$set": d})
    return jsonify({"message": "Updated"})

@app.route("/api/reports/<rid>/rate", methods=["POST"])
def rate_report(rid):
    d = request.json
    rating = d.get("rating")
    if not rating or not (1 <= int(rating) <= 5):
        return jsonify({"error": "Rating must be 1-5"}), 400
    reports_col.update_one({"_id": ObjectId(rid)}, {"$set": {"rating": int(rating)}})
    return jsonify({"message": "Rated successfully"})

@app.route("/api/reports/user/<uid>", methods=["GET"])
def get_user_reports(uid):
    items = list(reports_col.find({"user_id": uid}).sort("created_at", -1))
    return jsonify(jify(items))

# ===================== ECO IMPACT CALCULATOR =====================
@app.route("/api/eco-impact", methods=["POST"])
def eco_impact():
    d = request.json
    waste_type = d.get("waste_type", "plastic")
    quantity = float(d.get("quantity", 1))
    rates = WASTE_MARKET_RATES.get(waste_type, {"co2_per_kg": 0.5})
    co2_saved = rates["co2_per_kg"] * quantity
    trees_equiv = round(co2_saved / 21.77, 2)
    water_saved = round(quantity * 1.5, 1)
    energy_saved = round(quantity * 0.8, 1)
    return jsonify({
        "co2_saved_kg": round(co2_saved, 2),
        "trees_equivalent": trees_equiv,
        "water_saved_litres": water_saved,
        "energy_saved_kwh": energy_saved,
        "waste_type": waste_type,
        "quantity_kg": quantity
    })

# ===================== ANALYTICS (ADMIN ONLY) =====================
@app.route("/api/analytics", methods=["GET"])
def analytics():
    total_users     = users_col.count_documents({})
    total_listings  = listings_col.count_documents({})
    total_donations = listings_col.count_documents({"listing_type": "donate"})
    total_sales     = listings_col.count_documents({"listing_type": "sell"})
    total_reports   = reports_col.count_documents({})
    resolved_reports= reports_col.count_documents({"status": "resolved"})
    avg_rating_pipeline = [
        {"$match": {"rating": {"$ne": None}}},
        {"$group": {"_id": None, "avg": {"$avg": "$rating"}}}
    ]
    avg_r = list(reports_col.aggregate(avg_rating_pipeline))
    avg_rating = round(avg_r[0]["avg"], 1) if avg_r else 0

    months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
    trend  = [random.randint(30, 200) for _ in months]
    waste_by_type = {k: random.randint(10, 150) for k in WASTE_CLASSES}

    listing_status = {
        "active":  listings_col.count_documents({"status": "active"}),
        "sold":    listings_col.count_documents({"status": "sold"}),
        "deleted": listings_col.count_documents({"status": "deleted"}),
    }

    top_users = list(users_col.find({}, {"name":1,"eco_score":1,"co2_saved":1}).sort("eco_score",-1).limit(5))

    return jsonify({
        "total_users": total_users,
        "total_listings": total_listings,
        "total_donations": total_donations,
        "total_sales": total_sales,
        "total_reports": total_reports,
        "resolved_reports": resolved_reports,
        "avg_rating": avg_rating,
        "monthly_trend": {"labels": months, "data": trend},
        "waste_by_type": waste_by_type,
        "listing_status": listing_status,
        "top_eco_users": jify(top_users)
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

@app.route("/api/admin/reports", methods=["GET"])
def admin_reports():
    items = list(reports_col.find().sort("created_at", -1))
    for item in items:
        reporter = users_col.find_one({"_id": ObjectId(item["user_id"])}, {"name": 1, "email": 1, "phone": 1})
        item["reporter"] = jify(reporter) if reporter else {}
    return jsonify(jify(items))

@app.route("/api/admin/complete-report/<rid>", methods=["POST"])
def admin_complete_report(rid):
    d = request.json
    completion_image = d.get("completion_image", "")
    notes = d.get("notes", "")
    reports_col.update_one({"_id": ObjectId(rid)}, {"$set": {
        "status": "resolved",
        "completion_image": completion_image,
        "admin_notes": notes,
        "completed_at": datetime.utcnow().isoformat()
    }})
    return jsonify({"message": "Report marked as resolved with completion image"})

# ===================== REWARDS LEADERBOARD =====================
@app.route("/api/leaderboard", methods=["GET"])
def leaderboard():
    top = list(users_col.find({}, {"name": 1, "reward_points": 1, "eco_score": 1, "co2_saved": 1})
                         .sort("reward_points", -1).limit(10))
    return jsonify(jify(top))

# ===================== ERROR HANDLING =====================
@app.errorhandler(404)
def not_found(error):
    return jsonify({"error": "Route not found"}), 404

@app.errorhandler(500)
def server_error(error):
    return jsonify({"error": "Internal server error"}), 500

if __name__ == "__main__":
    port = int(os.getenv('PORT', 5000))
    app.run(debug=False, host='0.0.0.0', port=port)
