 // =============================================
// SMART DRAINAGE WASTE MANAGEMENT - app.js
// =============================================

const API = "";  // same origin — Flask serves both

// ---- State ----
let currentUser = null;
let isAdmin = false;
let pickupMap = null;
let reportMap = null;
let pickupMarker = null;
let reportMarker = null;
let pickupLiveLat = null;
let pickupLiveLng = null;
let reportLiveLat = null;
let reportLiveLng = null;

// ---- DOM helpers ----
const $ = id => document.getElementById(id);
const show = id => { const el = $(id); if(el) el.style.display = "block"; };
const hide = id => { const el = $(id); if(el) el.style.display = "none"; };

function toast(msg, type = "success") {
  const t = $("toast");
  t.textContent = msg;
  t.className = "show" + (type === "error" ? " error" : "");
  setTimeout(() => t.className = "", 3000);
}

function setLoading(btnId, loading) {
  const btn = $(btnId);
  if (!btn) return;
  if (loading) { btn.dataset.orig = btn.innerHTML; btn.innerHTML = '<span class="loader"></span>'; btn.disabled = true; }
  else { btn.innerHTML = btn.dataset.orig || btn.innerHTML; btn.disabled = false; }
}

// ---- SPA Navigation ----
function navigate(page) {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(".nav-links button").forEach(b => b.classList.remove("active"));
  const pg = $(page + "Page");
  if (pg) pg.classList.add("active");
  const nb = document.querySelector(`[data-page="${page}"]`);
  if (nb) nb.classList.add("active");
  window.scrollTo(0, 0);
  
  const loaders = {
    marketplace: loadMarketplace,
    dashboard:   loadDashboard,
    rewards:     loadRewards,
    risk:        loadRisk,
    reports:     loadReports,
    analytics:   loadAnalytics,
    adminDash:   loadAdminDash,
  };
  if (loaders[page]) loaders[page]();
  
  if (page === 'pickup') {
    setTimeout(initPickupMap, 300);
  } else if (page === 'reports') {
    setTimeout(initReportMap, 300);
    loadReports();
  }
}

// ---- Auth Guard ----
function requireLogin(page) {
  if (!currentUser) { toast("Please login first", "error"); navigate("auth"); return false; }
  return true;
}

function updateNav() {
  const loggedInEl = $("userBadge");
  if (currentUser) {
    loggedInEl.style.display = "inline-block";
    loggedInEl.textContent = `🌿 ${currentUser.name} · ${currentUser.reward_points} pts`;
    $("logoutBtn").style.display = "inline-flex";
    $("loginNavBtn").style.display = "none";
  } else {
    loggedInEl.style.display = "none";
    $("logoutBtn").style.display = "none";
    $("loginNavBtn").style.display = "inline-flex";
  }
}

// =============================================
// AUTH
// =============================================
async function handleRegister() {
  const name = $("regName").value.trim();
  const email = $("regEmail").value.trim();
  const password = $("regPass").value;
  if (!name || !email || !password) return toast("Fill all fields", "error");
  setLoading("regBtn", true);
  const res = await fetch(`${API}/api/register`, {
    method: "POST", headers: {"Content-Type":"application/json"},
    body: JSON.stringify({ name, email, password })
  });
  setLoading("regBtn", false);
  const data = await res.json();
  if (res.ok) { toast("Registered! Please login."); switchAuthTab("login"); }
  else toast(data.error || "Error", "error");
}

async function handleLogin() {
  const email = $("loginEmail").value.trim();
  const password = $("loginPass").value;
  if (!email || !password) return toast("Fill all fields", "error");
  setLoading("loginBtn", true);
  const res = await fetch(`${API}/api/login`, {
    method: "POST", headers: {"Content-Type":"application/json"},
    body: JSON.stringify({ email, password })
  });
  setLoading("loginBtn", false);
  const data = await res.json();
  if (res.ok) {
    currentUser = data.user;
    updateNav();
    toast(`Welcome back, ${currentUser.name}!`);
    navigate("dashboard");
  } else toast(data.error || "Error", "error");
}

async function handleAdminLogin() {
  const u = $("adminUser").value.trim();
  const p = $("adminPass").value;
  const res = await fetch(`${API}/api/admin/login`, {
    method: "POST", headers: {"Content-Type":"application/json"},
    body: JSON.stringify({ username: u, password: p })
  });
  const data = await res.json();
  if (res.ok) { isAdmin = true; toast("Admin logged in"); navigate("adminDash"); }
  else toast(data.error || "Error", "error");
}

function handleLogout() {
  currentUser = null; isAdmin = false;
  updateNav();
  toast("Logged out");
  navigate("hero");
}

function switchAuthTab(tab) {
  document.querySelectorAll(".auth-tab").forEach(t => t.classList.toggle("active", t.dataset.tab === tab));
  $("registerForm").style.display = tab === "register" ? "block" : "none";
  $("loginForm").style.display    = tab === "login"    ? "block" : "none";
}

// =============================================
// DASHBOARD
// =============================================
async function loadDashboard() {
  if (!currentUser) return;
  $("dashName").textContent = currentUser.name;
  $("dashPts").textContent  = currentUser.reward_points;
  $("dashEco").textContent  = currentUser.eco_score;
  const res = await fetch(`${API}/api/listings`);
  const all = await res.json();
  const mine = all.filter(l => l.user_id === currentUser._id);
  $("dashListings").textContent = mine.length;
}

// =============================================
// GET LIVE LOCATION FUNCTION
// =============================================
function getLiveLocation(type) {
  const btn = $(`${type}LiveLocationBtn`);
  const statusDiv = $(`${type}LocationStatus`);
  const statusText = $(`${type}LocationStatusText`);
  const coordGroup = $(`${type}CoordinatesGroup`);
  const coordDisplay = $(`${type}CoordinatesDisplay`);
  const locInput = $(`${type}Loc`);
  const map = type === 'pickup' ? pickupMap : reportMap;
  
  if (!navigator.geolocation) {
    toast("Geolocation is not supported by your browser", "error");
    return;
  }
  
  // Update button state
  if (btn) {
    btn.disabled = true;
    btn.classList.remove('pulse');
    btn.innerHTML = '<i class="ti ti-loader"></i> Getting location...';
  }
  
  if (statusDiv) statusDiv.classList.add('active');
  if (statusText) statusText.textContent = '🔍 Detecting your location...';
  
  navigator.geolocation.getCurrentPosition(
    // Success callback
    (position) => {
      const { latitude, longitude, accuracy } = position.coords;
      console.log(`Live location acquired: ${latitude}, ${longitude} (accuracy: ${accuracy}m)`);
      
      // Store coordinates
      if (type === 'pickup') {
        pickupLiveLat = latitude;
        pickupLiveLng = longitude;
      } else {
        reportLiveLat = latitude;
        reportLiveLng = longitude;
      }
      
      // Update coordinates display
      if (coordGroup) coordGroup.style.display = 'block';
      if (coordDisplay) {
        coordDisplay.innerHTML = `Lat: ${latitude.toFixed(6)}<br>Lng: ${longitude.toFixed(6)}<br>Accuracy: ±${Math.round(accuracy)}m`;
      }
      
      // Update status
      if (statusDiv) statusDiv.classList.add('active');
      if (statusText) {
        statusText.innerHTML = `✅ Location found! Accuracy: ±${Math.round(accuracy)}m`;
      }
      
      // Get address from coordinates
      fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&addressdetails=1`)
        .then(response => response.json())
        .then(data => {
          const address = data.display_name || `${latitude}, ${longitude}`;
          if (locInput) locInput.value = address;
        })
        .catch(err => {
          console.error('Reverse geocoding error:', err);
          if (locInput) locInput.value = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
        });
      
      // Update map
      if (map && typeof L !== 'undefined') {
        map.setView([latitude, longitude], 17);
        
        // Remove existing marker
        const marker = type === 'pickup' ? pickupMarker : reportMarker;
        if (marker) map.removeLayer(marker);
        
        // Add new marker with live location icon
        const liveIcon = L.divIcon({
          html: `<div style="
            width: 20px; height: 20px;
            background: #667eea;
            border: 3px solid white;
            border-radius: 50%;
            box-shadow: 0 0 0 4px rgba(102, 126, 234, 0.3), 0 0 0 8px rgba(102, 126, 234, 0.15);
            animation: pulse 2s infinite;
          "></div>`,
          className: 'live-location-icon',
          iconSize: [20, 20],
          iconAnchor: [10, 10]
        });
        
        const newMarker = L.marker([latitude, longitude], { icon: liveIcon }).addTo(map);
        newMarker.bindPopup(`<strong>Your Live Location</strong><br>Accuracy: ±${Math.round(accuracy)}m`).openPopup();
        
        if (type === 'pickup') pickupMarker = newMarker;
        else reportMarker = newMarker;
      }
      
      // Reset button
      if (btn) {
        btn.disabled = false;
        btn.classList.add('pulse');
        btn.innerHTML = '<i class="ti ti-current-location" aria-hidden="true"></i> Get Live Location';
      }
      
      toast(`📍 Location updated! Accuracy: ±${Math.round(accuracy)}m`);
    },
    // Error callback
    (error) => {
      console.error('Geolocation error:', error);
      
      if (statusText) {
        switch(error.code) {
          case error.PERMISSION_DENIED:
            statusText.textContent = '❌ Location permission denied. Please allow location access.';
            toast("Location permission denied. Please enable GPS.", "error");
            break;
          case error.POSITION_UNAVAILABLE:
            statusText.textContent = '❌ Location unavailable. Check your GPS/internet.';
            toast("Location unavailable. Check GPS settings.", "error");
            break;
          case error.TIMEOUT:
            statusText.textContent = '❌ Location request timed out. Try again.';
            toast("Location request timed out. Please try again.", "error");
            break;
          default:
            statusText.textContent = '❌ Unknown error getting location.';
            toast("Error getting location.", "error");
        }
      }
      
      if (statusDiv) statusDiv.classList.remove('active');
      
      // Reset button
      if (btn) {
        btn.disabled = false;
        btn.classList.add('pulse');
        btn.innerHTML = '<i class="ti ti-current-location" aria-hidden="true"></i> Get Live Location';
      }
    },
    // Options
    {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0
    }
  );
}

// =============================================
// OPENSTREETMAP FUNCTIONS
// =============================================

function initPickupMap() {
  if (typeof L === 'undefined') {
    console.error('Leaflet library not loaded');
    return;
  }
  
  const mapContainer = $('pickupMapContainer');
  if (!mapContainer) return;
  
  if (pickupMap) {
    setTimeout(() => pickupMap.invalidateSize(), 100);
    return;
  }
  
  pickupMap = L.map('pickupMapContainer').setView([14.4426, 79.9865], 13);
  
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19
  }).addTo(pickupMap);
  
  // If we already have live location coordinates, use them
  if (pickupLiveLat && pickupLiveLng) {
    pickupMap.setView([pickupLiveLat, pickupLiveLng], 17);
    const liveIcon = L.divIcon({
      html: `<div style="
        width: 20px; height: 20px;
        background: #667eea;
        border: 3px solid white;
        border-radius: 50%;
        box-shadow: 0 0 0 4px rgba(102, 126, 234, 0.3);
      "></div>`,
      className: 'live-location-icon',
      iconSize: [20, 20],
      iconAnchor: [10, 10]
    });
    pickupMarker = L.marker([pickupLiveLat, pickupLiveLng], { icon: liveIcon }).addTo(pickupMap);
    pickupMarker.bindPopup('Your Live Location').openPopup();
  }
  
  pickupMap.on('click', function(e) {
    if (pickupMarker) {
      pickupMap.removeLayer(pickupMarker);
    }
    pickupMarker = L.marker(e.latlng).addTo(pickupMap);
    
    const locInput = $('pickupLoc');
    if (locInput) {
      locInput.value = `${e.latlng.lat.toFixed(6)}, ${e.latlng.lng.toFixed(6)}`;
    }
    
    // Update coordinates display
    const coordDisplay = $('pickupCoordinatesDisplay');
    const coordGroup = $('pickupCoordinatesGroup');
    if (coordDisplay) coordDisplay.innerHTML = `Lat: ${e.latlng.lat.toFixed(6)}<br>Lng: ${e.latlng.lng.toFixed(6)}`;
    if (coordGroup) coordGroup.style.display = 'block';
    
    fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${e.latlng.lat}&lon=${e.latlng.lng}`)
      .then(response => response.json())
      .then(data => {
        if (data.display_name && locInput) {
          locInput.value = data.display_name;
          pickupMarker.bindPopup(data.display_name).openPopup();
        }
      })
      .catch(err => console.error('Reverse geocoding error:', err));
  });
  
  initLocationSearch('pickup');
  setTimeout(() => pickupMap.invalidateSize(), 200);
}

function initReportMap() {
  if (typeof L === 'undefined') return;
  
  const mapContainer = $('reportMapContainer');
  if (!mapContainer) return;
  
  if (reportMap) {
    setTimeout(() => reportMap.invalidateSize(), 100);
    return;
  }
  
  reportMap = L.map('reportMapContainer').setView([14.4426, 79.9865], 13);
  
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19
  }).addTo(reportMap);
  
  if (reportLiveLat && reportLiveLng) {
    reportMap.setView([reportLiveLat, reportLiveLng], 17);
    const liveIcon = L.divIcon({
      html: `<div style="
        width: 20px; height: 20px;
        background: #667eea;
        border: 3px solid white;
        border-radius: 50%;
        box-shadow: 0 0 0 4px rgba(102, 126, 234, 0.3);
      "></div>`,
      className: 'live-location-icon',
      iconSize: [20, 20],
      iconAnchor: [10, 10]
    });
    reportMarker = L.marker([reportLiveLat, reportLiveLng], { icon: liveIcon }).addTo(reportMap);
    reportMarker.bindPopup('Your Live Location').openPopup();
  }
  
  reportMap.on('click', function(e) {
    if (reportMarker) {
      reportMap.removeLayer(reportMarker);
    }
    reportMarker = L.marker(e.latlng).addTo(reportMap);
    
    const locInput = $('reportLoc');
    if (locInput) {
      locInput.value = `${e.latlng.lat.toFixed(6)}, ${e.latlng.lng.toFixed(6)}`;
    }
    
    const coordDisplay = $('reportCoordinatesDisplay');
    const coordGroup = $('reportCoordinatesGroup');
    if (coordDisplay) coordDisplay.innerHTML = `Lat: ${e.latlng.lat.toFixed(6)}<br>Lng: ${e.latlng.lng.toFixed(6)}`;
    if (coordGroup) coordGroup.style.display = 'block';
    
    fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${e.latlng.lat}&lon=${e.latlng.lng}`)
      .then(response => response.json())
      .then(data => {
        if (data.display_name && locInput) {
          locInput.value = data.display_name;
          reportMarker.bindPopup(data.display_name).openPopup();
        }
      })
      .catch(err => console.error('Reverse geocoding error:', err));
  });
  
  initLocationSearch('report');
  setTimeout(() => reportMap.invalidateSize(), 200);
}

function initLocationSearch(type) {
  const searchBtn = $(`${type}SearchBtn`);
  const searchInput = $(`${type}SearchInput`);
  const map = type === 'pickup' ? pickupMap : reportMap;
  
  if (!searchBtn || !searchInput || !map) return;
  
  const performSearch = () => {
    const query = searchInput.value.trim();
    if (!query) return;
    
    fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`)
      .then(response => response.json())
      .then(data => {
        if (data.length > 0) {
          const { lat, lon, display_name } = data[0];
          map.setView([lat, lon], 16);
          
          const marker = type === 'pickup' ? pickupMarker : reportMarker;
          if (marker) map.removeLayer(marker);
          
          const newMarker = L.marker([lat, lon]).addTo(map);
          newMarker.bindPopup(display_name).openPopup();
          
          if (type === 'pickup') pickupMarker = newMarker;
          else reportMarker = newMarker;
          
          const locInput = type === 'pickup' ? $('pickupLoc') : $('reportLoc');
          if (locInput) locInput.value = display_name;
          
          // Update coordinates display
          const coordDisplay = type === 'pickup' ? $('pickupCoordinatesDisplay') : $('reportCoordinatesDisplay');
          const coordGroup = type === 'pickup' ? $('pickupCoordinatesGroup') : $('reportCoordinatesGroup');
          if (coordDisplay) coordDisplay.innerHTML = `Lat: ${parseFloat(lat).toFixed(6)}<br>Lng: ${parseFloat(lon).toFixed(6)}`;
          if (coordGroup) coordGroup.style.display = 'block';
        } else {
          toast('Location not found', 'error');
        }
      })
      .catch(err => {
        console.error('Search error:', err);
        toast('Search failed', 'error');
      });
  };
  
  searchBtn.addEventListener('click', performSearch);
  searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') performSearch();
  });
}

// =============================================
// MARKETPLACE
// =============================================
let activeMarketType = "all";
async function loadMarketplace(type = activeMarketType) {
  activeMarketType = type;
  const res = await fetch(`${API}/api/listings${type !== "all" ? "?type=" + type : ""}`);
  const items = await res.json();
  const grid = $("listingsGrid");
  if (items.length === 0) { grid.innerHTML = `<p style="color:var(--text-m);grid-column:1/-1">No listings yet.</p>`; return; }
  const ICONS = { plastic:"♻️", paper:"📄", metal:"⚙️", glass:"🪟", "e-waste":"💻", other:"📦" };
  grid.innerHTML = items.map(l => `
    <div class="card listing-card">
      <div class="waste-img">${l.image ? `<img src="${l.image}" alt="waste">` : ICONS[l.waste_type] || "♻️"}</div>
      <h4>${capitalize(l.waste_type)} · ${l.quantity || "?"}kg</h4>
      <div class="meta">
        <span>${l.listing_type === "donate" ? "🎁 Donate" : "💰 Sell"}</span>
        <span>📍 ${l.location || "Not set"}</span>
        ${l.price ? `<span>₹${l.price}/kg</span>` : ""}
      </div>
      <div style="display:flex;gap:.5rem;align-items:center">
        <span class="badge badge-green">${capitalize(l.waste_type)}</span>
        <span class="pill pill-active" style="margin-left:auto">${l.status}</span>
      </div>
    </div>`).join("");
}

async function handleAddListing(type) {
  if (!requireLogin()) return;
  const wt   = $(`${type}WasteType`).value;
  const qty  = $(`${type}Qty`).value;
  const loc  = $(`${type}Loc`).value;
  const desc = $(`${type}Desc`).value;
  const price = type === "sell" ? $("sellPrice")?.value : "";
  const imageInput = $(`${type}Image`);
  let imageData = "";
  if (imageInput && imageInput.files[0]) {
    imageData = await toBase64(imageInput.files[0]);
  }
  setLoading(`${type}Btn`, true);
  const res = await fetch(`${API}/api/listings`, {
    method: "POST", headers: {"Content-Type":"application/json"},
    body: JSON.stringify({ user_id: currentUser._id, waste_type: wt,
      quantity: qty, location: loc, description: desc,
      listing_type: type, price: price, image: imageData })
  });
  setLoading(`${type}Btn`, false);
  const data = await res.json();
  if (res.ok) {
    currentUser.reward_points += data.points_earned;
    updateNav();
    toast(`✅ Listed! +${data.points_earned} points earned`);
    [$(`${type}WasteType`),$(`${type}Qty`),$(`${type}Loc`),$(`${type}Desc`)].forEach(el => { if(el) el.value = ""; });
  } else toast(data.error || "Error", "error");
}

// =============================================
// AI WASTE DETECTION
// =============================================
function initDropZone() {
  const dz = $("dropZone");
  const fi = $("fileInput");
  dz.addEventListener("click", () => fi.click());
  dz.addEventListener("dragover", e => { e.preventDefault(); dz.classList.add("dragover"); });
  dz.addEventListener("dragleave", () => dz.classList.remove("dragover"));
  dz.addEventListener("drop", e => { e.preventDefault(); dz.classList.remove("dragover"); if(e.dataTransfer.files[0]) processFile(e.dataTransfer.files[0]); });
  fi.addEventListener("change", () => { if(fi.files[0]) processFile(fi.files[0]); });
}

async function processFile(file) {
  const b64 = await toBase64(file);
  const preview = $("imgPreview");
  preview.src = b64; preview.style.display = "block";
  const res = await fetch(`${API}/api/detect`, {
    method: "POST", headers: {"Content-Type":"application/json"},
    body: JSON.stringify({ image: b64 })
  });
  const data = await res.json();
  showAIResult(data);
}

function showAIResult(data) {
  const r = $("aiResult");
  r.style.display = "block";
  r.innerHTML = `
    <div class="card ai-result-card">
      <div style="display:flex;gap:1.5rem;align-items:center;flex-wrap:wrap">
        <div style="text-align:center">
          <div class="confidence-ring">${data.confidence}%</div>
          <div style="font-size:.75rem;color:var(--text-m)">CONFIDENCE</div>
        </div>
        <div style="flex:1">
          <h3 style="color:var(--primary);font-size:1.4rem;text-transform:capitalize">♻️ ${data.category}</h3>
          <p style="color:var(--text-m);margin:.4rem 0">${data.recommendation}</p>
          <div style="display:flex;gap:.6rem;flex-wrap:wrap;margin-top:.6rem">
            ${data.recycling_methods.map(m => `<span class="badge badge-blue">${m}</span>`).join("")}
          </div>
        </div>
        <div class="card" style="text-align:center;padding:1rem;min-width:120px">
          <div style="color:var(--warn);font-size:1.3rem;font-weight:900">💰 ${data.estimated_value}</div>
          <div style="font-size:.72rem;color:var(--text-m)">EST. VALUE/KG</div>
        </div>
      </div>
    </div>`;
}

// =============================================
// PICKUP REQUESTS
// =============================================
async function handlePickupRequest() {
  if (!requireLogin()) return;
  const loc   = $("pickupLoc").value.trim();
  const date  = $("pickupDate").value;
  const wtype = $("pickupWaste").value;
  
  let lat = pickupLiveLat || null;
  let lng = pickupLiveLng || null;
  if (pickupMarker && !lat) {
    const latlng = pickupMarker.getLatLng();
    lat = latlng.lat;
    lng = latlng.lng;
  }
  
  if (!loc || !date) return toast("Fill location & date", "error");
  setLoading("pickupBtn", true);
  const res = await fetch(`${API}/api/pickups`, {
    method: "POST", headers: {"Content-Type":"application/json"},
    body: JSON.stringify({ 
      user_id: currentUser._id, 
      user_name: currentUser.name, 
      location: loc, 
      pickup_date: date, 
      waste_type: wtype,
      latitude: lat,
      longitude: lng
    })
  });
  setLoading("pickupBtn", false);
  if (res.ok) { 
    toast("✅ Pickup request submitted!"); 
    $("pickupLoc").value = ""; 
    $("pickupDate").value = ""; 
    pickupLiveLat = null;
    pickupLiveLng = null;
    if (pickupMarker) {
      pickupMap.removeLayer(pickupMarker);
      pickupMarker = null;
    }
    loadMyPickups(); 
  }
}

async function loadMyPickups() {
  if (!currentUser) return;
  const res = await fetch(`${API}/api/pickups?user_id=${currentUser._id}`);
  const items = await res.json();
  const tbody = $("myPickupsTable");
  if (!tbody) return;
  tbody.innerHTML = items.length ? items.map(p => `
    <tr>
      <td>${p.waste_type || "General"}</td>
      <td>${p.location}</td>
      <td>${p.pickup_date}</td>
      <td><span class="pill pill-${p.status}">${p.status}</span></td>
      <td>
        ${p.latitude && p.longitude ? 
          `<a href="https://www.openstreetmap.org/?mlat=${p.latitude}&mlon=${p.longitude}" target="_blank" class="btn btn-secondary btn-sm">
            <i class="ti ti-map-pin"></i> View
          </a>` : '-'}
      </td>
    </tr>`).join("") : `<tr><td colspan="5" style="color:var(--text-m)">No requests yet.</td></tr>`;
}

// =============================================
// COMMUNITY REPORTS
// =============================================
async function loadReports() {
  const res = await fetch(`${API}/api/reports`);
  const items = await res.json();
  const list = $("reportsList");
  if (!list) return;
  list.innerHTML = items.length ? items.map(r => `
    <div class="card" style="margin-bottom:.8rem">
      <div style="display:flex;gap:.8rem;align-items:flex-start">
        <span style="font-size:1.5rem">🚨</span>
        <div style="flex:1">
          <p style="font-weight:600">${r.description}</p>
          <div style="display:flex;gap:.8rem;margin-top:.4rem;flex-wrap:wrap">
            <span style="font-size:.78rem;color:var(--text-m)">📍 ${r.location || "N/A"}</span>
            <span style="font-size:.78rem;color:var(--text-m)">${formatDate(r.created_at)}</span>
            <span class="pill pill-${r.status}">${r.status}</span>
            ${r.latitude && r.longitude ? 
              `<a href="https://www.openstreetmap.org/?mlat=${r.latitude}&mlon=${r.longitude}" target="_blank" class="btn btn-secondary btn-sm">
                <i class="ti ti-map-pin"></i> View Map
              </a>` : ''}
          </div>
        </div>
        ${isAdmin ? `<button class="btn btn-secondary btn-sm" onclick="resolveReport('${r._id}')">Mark Resolved</button>` : ""}
      </div>
    </div>`).join("") : `<p style="color:var(--text-m)">No reports yet.</p>`;
}

async function handleReport() {
  if (!requireLogin()) return;
  const desc = $("reportDesc").value.trim();
  const loc  = $("reportLoc").value.trim();
  
  let lat = reportLiveLat || null;
  let lng = reportLiveLng || null;
  if (reportMarker && !lat) {
    const latlng = reportMarker.getLatLng();
    lat = latlng.lat;
    lng = latlng.lng;
  }
  
  if (!desc) return toast("Describe the issue", "error");
  const res = await fetch(`${API}/api/reports`, {
    method: "POST", headers: {"Content-Type":"application/json"},
    body: JSON.stringify({ 
      user_id: currentUser._id, 
      description: desc, 
      location: loc,
      latitude: lat,
      longitude: lng
    })
  });
  if (res.ok) {
    currentUser.reward_points += 5; updateNav();
    toast("✅ Report submitted! +5 points"); 
    $("reportDesc").value = ""; 
    $("reportLoc").value = "";
    reportLiveLat = null;
    reportLiveLng = null;
    if (reportMarker) {
      reportMap.removeLayer(reportMarker);
      reportMarker = null;
    }
    loadReports();
  }
}

async function resolveReport(id) {
  await fetch(`${API}/api/reports/${id}`, {
    method: "PATCH", headers: {"Content-Type":"application/json"},
    body: JSON.stringify({ status: "resolved" })
  });
  toast("Marked resolved"); loadReports();
}

// =============================================
// RISK PREDICTION
// =============================================
async function loadRisk() {
  const res = await fetch(`${API}/api/predictions`);
  const items = await res.json();
  const list = $("riskList");
  if (!list) return;
  list.innerHTML = items.map((r, i) => {
    const color = r.level === "HIGH" ? "var(--danger)" : r.level === "MEDIUM" ? "var(--warn)" : "var(--primary)";
    const pct = r.risk_score;
    return `<div class="card risk-card">
      <span style="font-size:1.3rem">${r.level === "HIGH" ? "🔴" : r.level === "MEDIUM" ? "🟡" : "🟢"}</span>
      <div style="flex:1">
        <div style="display:flex;justify-content:space-between;margin-bottom:.4rem">
          <span class="risk-area">${r.area}</span>
          <span class="risk-score" style="color:${color}">${r.risk_score}</span>
        </div>
        <div class="risk-bar-wrap"><div class="risk-bar" style="width:${pct}%;background:${color}"></div></div>
        <div style="font-size:.75rem;color:var(--text-m);margin-top:.3rem">${r.action}</div>
      </div>
    </div>`;
  }).join("");
}

// =============================================
// REWARDS
// =============================================
async function loadRewards() {
  if (!currentUser) return;
  $("rewardPts").textContent = currentUser.reward_points;
  $("rewardEco").textContent = currentUser.eco_score;
  const res = await fetch(`${API}/api/leaderboard`);
  const top = await res.json();
  $("leaderboard").innerHTML = top.map((u, i) => `
    <div class="rank-row">
      <span class="rank-num">${["🥇","🥈","🥉"][i] || "#"+(i+1)}</span>
      <span class="rank-name">${u.name}</span>
      <span class="rank-pts">🌿 ${u.reward_points} pts</span>
    </div>`).join("");
}

// =============================================
// ANALYTICS
// =============================================
let analyticsCharts = {};

async function loadAnalytics() {
  const res = await fetch(`${API}/api/analytics`);
  const d = await res.json();
  $("aUsers").textContent    = d.total_users;
  $("aListings").textContent = d.total_listings;
  $("aDonations").textContent= d.total_donations;
  $("aSales").textContent    = d.total_sales;
  $("aPickups").textContent  = d.total_pickups;
  $("aReports").textContent  = d.total_reports;
  renderCharts(d);
}

function renderCharts(d) {
  Object.values(analyticsCharts).forEach(c => c.destroy());
  analyticsCharts = {};

  const tCtx = $("trendChart")?.getContext("2d");
  if (tCtx) {
    analyticsCharts.trend = new Chart(tCtx, {
      type: "line",
      data: {
        labels: d.monthly_trend.labels,
        datasets: [{ label: "Waste Recycled (kg)", data: d.monthly_trend.data,
          borderColor: "#00e5a0", backgroundColor: "rgba(0,229,160,0.08)",
          fill: true, tension: 0.4, pointBackgroundColor: "#00e5a0", pointRadius: 4 }]
      }
    });
  }

  const wCtx = $("wasteChart")?.getContext("2d");
  if (wCtx) {
    const labels = Object.keys(d.waste_by_type);
    const vals   = Object.values(d.waste_by_type);
    const colors = ["#00e5a0","#00c8ff","#7bffc8","#ffb800","#ff4e6a","#a78bfa"];
    analyticsCharts.waste = new Chart(wCtx, {
      type: "doughnut",
      data: { labels, datasets: [{ data: vals, backgroundColor: colors, borderWidth: 0 }] },
      options: { cutout: "60%" }
    });
  }
}

// =============================================
// ADMIN DASHBOARD
// =============================================
async function loadAdminDash() {
  if (!isAdmin) return;
  const ures = await fetch(`${API}/api/admin/users`);
  const users = await ures.json();
  $("adminUsersTable").innerHTML = users.map(u => `
    <tr>
      <td>${u.name}</td>
      <td>${u.email}</td>
      <td style="color:var(--primary)">${u.reward_points}</td>
      <td>${formatDate(u.created_at)}</td>
    </tr>`).join("") || "<tr><td colspan='4'>No users</td></tr>";

  const pres = await fetch(`${API}/api/pickups`);
  const pickups = await pres.json();
  $("adminPickupsTable").innerHTML = pickups.map(p => `
    <tr>
      <td>${p.user_name || p.user_id}</td>
      <td>${p.location}</td>
      <td>${p.pickup_date}</td>
      <td><span class="pill pill-${p.status}">${p.status}</span></td>
      <td>
        <button class="btn btn-secondary btn-sm" onclick="updatePickup('${p._id}','approved')">Approve</button>
        <button class="btn btn-warn btn-sm" onclick="updatePickup('${p._id}','collected')">Collected</button>
        ${p.latitude && p.longitude ? 
          `<a href="https://www.openstreetmap.org/?mlat=${p.latitude}&mlon=${p.longitude}" target="_blank" class="btn btn-sm" style="background:#0f7b5c;color:white;">
            <i class="ti ti-map-pin"></i> Map
          </a>` : ''}
      </td>
    </tr>`).join("") || "<tr><td colspan='5'>No pickups</td></tr>";
}

async function updatePickup(id, status) {
  await fetch(`${API}/api/pickups/${id}`, {
    method: "PATCH", headers: {"Content-Type":"application/json"},
    body: JSON.stringify({ status })
  });
  toast("Status updated"); loadAdminDash();
}

function showAdminTab(name, btn) {
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  $('adminTab-'+name).classList.add('active');
  btn.classList.add('active');
}

// =============================================
// HELPERS
// =============================================
function toBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ""; }

function formatDate(iso) {
  if (!iso) return "-";
  try { return new Date(iso).toLocaleDateString("en-IN", { day:"2-digit", month:"short", year:"numeric" }); }
  catch { return iso; }
}

// =============================================
// INIT
// =============================================
document.addEventListener("DOMContentLoaded", () => {
  initDropZone();
  navigate("hero");
  updateNav();
  
  document.querySelectorAll(".fi").forEach((el, i) => {
    el.style.animationDelay = `${i * 1.1}s`;
  });
  
  document.querySelector('[data-page="pickup"]')?.addEventListener("click", () => {
    setTimeout(loadMyPickups, 200);
  });
});