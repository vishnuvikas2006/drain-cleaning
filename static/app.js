 // ============================================================
// SMART DRAINAGE WASTE MANAGEMENT — app.js (Enhanced v3 - Fixed Admin)
// ============================================================

const API = "";

// ─── State ─────────────────────────────────────────────────
let currentUser  = null;
let isAdmin      = false;

// Map instances
let reportMap    = null, reportMarker  = null;
let sellMap      = null, sellMarker    = null;
let buyMap       = null, buyMarker     = null;
let donateMap    = null, donateMarker  = null;

// Live coords per context
let liveCoords   = { sell: null, buy: null, report: null, donate: null };

// Marketplace state
let mktPage = 1, mktType = "", mktCat = "";

// Modal state
let activeListingId = null, activeReportId = null;
let currentRating   = 0;
let chatListingId   = null, chatPartnerId  = null;
let analyticsCharts = {};

// Price check debounce timers
let priceCheckTimers = {};

// ─── DOM helpers ───────────────────────────────────────────
const $ = id => document.getElementById(id);

function toast(msg, type = "success") {
  const t = $("toast");
  t.textContent = msg;
  t.className = "show" + (type === "error" ? " error" : "");
  clearTimeout(t._timer);
  t._timer = setTimeout(() => (t.className = ""), 3200);
}

function setLoading(btnId, loading) {
  const btn = $(btnId);
  if (!btn) return;
  if (loading) {
    btn.dataset.orig = btn.innerHTML;
    btn.innerHTML = '<span class="loader"></span> Loading…';
    btn.disabled = true;
  } else {
    btn.innerHTML = btn.dataset.orig || btn.innerHTML;
    btn.disabled = false;
  }
}

function openModal(id)  { $(id).classList.add("open"); }
function closeModal(id) { $(id).classList.remove("open"); }

// ─── SPA Navigation ────────────────────────────────────────
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
    reports:     () => { loadReports(); },
    analytics:   loadAnalytics,
    adminDash:   loadAdminDash,
    mylistings:  loadMyListings,
    myreports:   loadMyReports,
    messages:    loadMessageThreads,
    wishlist:    loadWishlist,
  };
  if (loaders[page]) loaders[page]();

  if (page === "sell")    setTimeout(() => initFormMap("sell"), 300);
  if (page === "donate")  setTimeout(() => initFormMap("donate"), 300);
  if (page === "buy")     setTimeout(() => initFormMap("buy"), 300);
  if (page === "reports") setTimeout(initReportMap, 300);
  if (page === "reports") loadReports();
}

function requireLogin() {
  if (!currentUser) { toast("Please login first", "error"); navigate("auth"); return false; }
  return true;
}

function updateNav() {
  const badge = $("userBadge");
  if (currentUser) {
    badge.style.display = "inline-block";
    badge.textContent = `🌿 ${currentUser.name} · ${currentUser.reward_points}pts`;
    $("logoutBtn").style.display   = "inline-flex";
    $("loginNavBtn").style.display = "none";
    $("msgNavBtn").style.display   = "inline-flex";
    checkUnreadMessages();
  } else {
    badge.style.display = "none";
    $("logoutBtn").style.display   = "none";
    $("loginNavBtn").style.display = "inline-flex";
    $("msgNavBtn").style.display   = "none";
  }
  const analyticsBtn = $("analyticsNavBtn");
  if (analyticsBtn) analyticsBtn.style.display = isAdmin ? "inline-flex" : "none";
  if (isAdmin) {
    $("analyticsAdminGate") && ($("analyticsAdminGate").style.display = "none");
    $("analyticsContent")   && ($("analyticsContent").style.display   = "block");
  }
}

async function checkUnreadMessages() {
  if (!currentUser) return;
  try {
    const res = await fetch(`${API}/api/messages/unread/${currentUser._id}`);
    const d = await res.json();
    const bubble = $("msgBubble");
    if (bubble) { bubble.style.display = d.count > 0 ? "flex" : "none"; bubble.textContent = d.count; }
  } catch {}
}

// ============================================================
// AUTH
// ============================================================
function toggleAdminSecret() {
  const role = $("regRole")?.value;
  const grp  = $("adminSecretGroup");
  if (grp) grp.style.display = role === "admin" ? "block" : "none";
}

async function handleRegister() {
  const name   = $("regName").value.trim();
  const email  = $("regEmail").value.trim();
  const phone  = $("regPhone").value.trim();
  const pass   = $("regPass").value;
  const role   = $("regRole")?.value || "user";
  const secret = $("adminSecret")?.value || "";
  if (!name || !email || !pass) return toast("Fill all required fields", "error");
  setLoading("regBtn", true);
  const res = await fetch(`${API}/api/register`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, password: pass, phone, role, admin_secret: secret })
  });
  setLoading("regBtn", false);
  const d = await res.json();
  if (res.ok) { toast("Registered! Please login."); switchAuthTab("login"); }
  else toast(d.error || "Error", "error");
}

async function handleLogin() {
  const email = $("loginEmail").value.trim();
  const pass  = $("loginPass").value;
  if (!email || !pass) return toast("Fill all fields", "error");
  setLoading("loginBtn", true);
  const res = await fetch(`${API}/api/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: pass })
  });
  setLoading("loginBtn", false);
  const d = await res.json();
  if (res.ok) {
    currentUser = d.user;
    updateNav();
    toast(`Welcome back, ${currentUser.name}!`);
    navigate("dashboard");
  } else toast(d.error || "Error", "error");
}

async function handleAdminLogin() {
  const u = $("adminUser").value.trim();
  const p = $("adminPass").value;
  const res = await fetch(`${API}/api/admin/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: u, password: p })
  });
  const d = await res.json();
  if (res.ok) {
    isAdmin = true;
    updateNav();
    toast("Admin logged in");
    navigate("adminDash");
  } else toast(d.error || "Error", "error");
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

// ============================================================
// DASHBOARD
// ============================================================
async function loadDashboard() {
  if (!currentUser) return;
  $("dashName").textContent = currentUser.name;
  $("dashPts").textContent  = currentUser.reward_points;
  $("dashEco").textContent  = currentUser.eco_score;
  $("dashCO2").textContent  = Math.round(currentUser.co2_saved || 0);
  try {
    const res = await fetch(`${API}/api/listings?limit=200`);
    const all = await res.json();
    const mine = (all.items || []).filter(l => l.user_id === currentUser._id);
    $("dashListings").textContent = mine.length;
  } catch {}
}

// ============================================================
// MARKETPLACE
// ============================================================
function setMktFilter(type, el) {
  mktType = type; mktCat = ""; mktPage = 1;
  document.querySelectorAll(".filter-chips .chip").forEach(c => c.classList.remove("active"));
  el.classList.add("active");
  loadMarketplace();
}

function setMktCat(cat, el) {
  mktCat = cat; mktPage = 1;
  document.querySelectorAll(".filter-chips .chip").forEach(c => c.classList.remove("active"));
  el.classList.add("active");
  loadMarketplace();
}

async function loadMarketplace() {
  const search = $("mktSearch")?.value.trim() || "";
  const sort   = $("mktSort")?.value || "newest";
  const grid   = $("listingsGrid");
  if (!grid) return;
  grid.innerHTML = `<p style="color:var(--text-m);grid-column:1/-1">Loading listings…</p>`;

  let url = `${API}/api/listings?page=${mktPage}&sort=${sort}`;
  if (mktType) url += `&type=${mktType}`;
  if (mktCat)  url += `&category=${mktCat}`;
  if (search)  url += `&q=${encodeURIComponent(search)}`;

  const res  = await fetch(url);
  const data = await res.json();
  const items = data.items || [];

  if (!items.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><i class="ti ti-package"></i><p>No listings found. Be the first to post!</p></div>`;
    $("mktPagination").innerHTML = "";
    return;
  }

  const ICONS = { plastic:"♻️", paper:"📄", metal:"⚙️", glass:"🪟", "e-waste":"💻", organic:"🌱", other:"📦" };
  const TYPE_LABELS = { sell:"For Sale", donate:"Donate", buy:"Buy Request" };
  const TYPE_BADGE  = { sell:"badge-sell", donate:"badge-donate", buy:"badge-buy" };

  grid.innerHTML = items.map(l => {
    const icon = ICONS[l.waste_type] || "📦";
    const imgHtml = l.image
      ? `<img src="${l.image}" alt="${l.waste_type}" loading="lazy">`
      : `<span style="font-size:2.8rem">${icon}</span>`;
    const priceHtml = l.listing_type === "sell"
      ? `<div class="listing-price">₹${l.price || "?"}/kg</div>`
      : l.listing_type === "buy"
        ? `<div class="listing-price" style="color:#0d47a1">Up to ₹${l.price || "?"}/kg</div>`
        : `<div class="listing-price" style="color:#1b5e20">FREE</div>`;
    return `
    <div class="listing-card" onclick="viewListing('${l._id}')">
      <span class="listing-type-badge ${TYPE_BADGE[l.listing_type] || "badge-sell"}">${TYPE_LABELS[l.listing_type] || l.listing_type}</span>
      <div class="listing-img">${imgHtml}</div>
      <div class="listing-body">
        <div class="listing-title">${l.title || capitalize(l.waste_type) + " · " + l.quantity + "kg"}</div>
        ${priceHtml}
        <div class="listing-meta">
          <span><i class="ti ti-package" style="font-size:12px"></i> ${capitalize(l.waste_type)} · ${l.quantity || "?"}kg</span>
          <span><i class="ti ti-map-pin" style="font-size:12px"></i> ${l.location || "Not set"}</span>
        </div>
      </div>
      <div class="listing-footer">
        <span class="views-count"><i class="ti ti-eye" style="font-size:12px"></i> ${l.views || 0}</span>
        <span class="badge badge-green" style="font-size:.7rem">${l.interested_count || 0} interested</span>
        ${currentUser ? `<button class="wishlist-btn" onclick="event.stopPropagation();toggleWishlist('${l._id}',this)" title="Save"><i class="ti ti-heart"></i></button>` : ""}
      </div>
    </div>`;
  }).join("");

  const pages = data.pages || 1;
  if (pages > 1) {
    let pHtml = "";
    for (let i = 1; i <= pages; i++)
      pHtml += `<button class="page-btn${i === mktPage ? " active" : ""}" onclick="mktPage=${i};loadMarketplace()">${i}</button>`;
    $("mktPagination").innerHTML = pHtml;
  } else $("mktPagination").innerHTML = "";

  if (currentUser) checkWishlistStatuses(items.map(l => l._id));
}

async function checkWishlistStatuses(ids) {
  for (const id of ids) {
    try {
      const res = await fetch(`${API}/api/wishlist/check`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: currentUser._id, listing_id: id })
      });
      const d = await res.json();
      document.querySelectorAll(`.wishlist-btn`).forEach(btn => {
        if (btn.getAttribute("onclick")?.includes(id)) {
          btn.classList.toggle("saved", d.saved);
          btn.innerHTML = d.saved ? '<i class="ti ti-heart-filled"></i>' : '<i class="ti ti-heart"></i>';
        }
      });
    } catch {}
  }
}

async function viewListing(lid) {
  activeListingId = lid;
  $("modalBody").innerHTML = `<p style="color:var(--text-m)">Loading…</p>`;
  openModal("listingModal");

  const res = await fetch(`${API}/api/listings/${lid}`);
  const l = await res.json();
  const isOwner = currentUser && currentUser._id === l.user_id;
  const ICONS = { plastic:"♻️", paper:"📄", metal:"⚙️", glass:"🪟", "e-waste":"💻", organic:"🌱", other:"📦" };

  const imgHtml = l.image
    ? `<img src="${l.image}" alt="listing" style="width:100%;border-radius:10px;margin-bottom:1rem;max-height:260px;object-fit:cover">`
    : `<div style="background:var(--primary-light);border-radius:10px;padding:2.5rem;text-align:center;font-size:3rem;margin-bottom:1rem">${ICONS[l.waste_type] || "📦"}</div>`;

  const priceDisplay = l.listing_type === "donate" ? "<strong style='color:#1b5e20'>FREE</strong>"
    : `<strong style='color:var(--primary)'>₹${l.price || "?"}/kg</strong>`;

  const sellerInfo = l.seller ? `
    <div style="display:flex;align-items:center;gap:.7rem;padding:.85rem;background:var(--glass);border-radius:10px;margin:.8rem 0">
      <div style="width:38px;height:38px;border-radius:50%;background:var(--primary);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:.9rem">${(l.seller.name || "?")[0].toUpperCase()}</div>
      <div style="flex:1">
        <div style="font-weight:600;font-size:.88rem">${l.seller.name || "Unknown"}</div>
        <div style="font-size:.75rem;color:var(--text-m)">${l.seller.email || ""}</div>
      </div>
      ${l.seller.phone ? `<a href="tel:${l.seller.phone}" class="btn btn-secondary btn-sm"><i class="ti ti-phone"></i> Call</a>` : ""}
    </div>` : "";

  const mapSnippet = l.latitude && l.longitude
    ? `<div style="margin:.8rem 0"><a href="https://www.openstreetmap.org/?mlat=${l.latitude}&mlon=${l.longitude}" target="_blank" class="btn btn-secondary btn-sm"><i class="ti ti-map-pin"></i> View on Map</a></div>`
    : "";

  const actionBtns = isOwner
    ? `<div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-top:1rem">
        <button class="btn btn-secondary btn-sm" onclick="viewInterests('${lid}')"><i class="ti ti-users"></i> Buyers (${l.interested_count || 0})</button>
        <button class="btn btn-danger btn-sm" onclick="deleteListing('${lid}')"><i class="ti ti-trash"></i> sold out</button>
      </div>`
    : currentUser
      ? `<div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-top:1rem">
          <button class="btn btn-primary" onclick="expressInterest('${lid}')"><i class="ti ti-heart"></i> I'm Interested</button>
          <button class="btn btn-secondary" onclick="openChat('${lid}','${l.user_id}','${(l.seller || {}).name || "Seller"}')"><i class="ti ti-message"></i> Message</button>
          <button class="btn btn-secondary btn-sm" onclick="toggleWishlistModal('${lid}')"><i class="ti ti-bookmark"></i> Save</button>
         </div>`
      : `<button class="btn btn-primary" style="margin-top:.8rem;width:100%" onclick="closeModal('listingModal');navigate('auth')"><i class="ti ti-login"></i> Login to Contact</button>`;

  $("modalTitle").innerHTML = `${l.title || capitalize(l.waste_type) + " Listing"} <button class="modal-close-btn" onclick="closeModal('listingModal')"><i class="ti ti-x"></i></button>`;
  $("modalBody").innerHTML = `
    ${imgHtml}
    <div style="display:flex;gap:.5rem;margin-bottom:.8rem;flex-wrap:wrap">
      <span class="badge badge-green">${capitalize(l.waste_type)}</span>
      <span class="badge badge-blue">${l.quantity || "?"}kg</span>
      ${l.condition ? `<span class="badge badge-purple">${capitalize(l.condition)}</span>` : ""}
      <span class="badge ${l.status === "active" ? "badge-green" : "badge-red"}">${l.status}</span>
    </div>
    <div style="font-size:1.5rem;margin-bottom:.5rem">${priceDisplay}</div>
    <p style="color:var(--text-m);font-size:.88rem;line-height:1.7;margin-bottom:.6rem">${l.description || "No description provided."}</p>
    <div style="display:flex;gap:.5rem;flex-wrap:wrap;font-size:.8rem;color:var(--text-m)">
      <span><i class="ti ti-map-pin"></i> ${l.location || "N/A"}</span>
      <span><i class="ti ti-eye"></i> ${l.views || 0} views</span>
      <span><i class="ti ti-calendar"></i> ${formatDate(l.created_at)}</span>
    </div>
    ${mapSnippet}
    <div style="margin-top:.6rem"><strong style="font-size:.8rem;color:var(--text-m)">Seller</strong>${sellerInfo}</div>
    ${actionBtns}`;
}

async function toggleWishlist(lid, btnEl) {
  if (!requireLogin()) return;
  const res = await fetch(`${API}/api/wishlist`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: currentUser._id, listing_id: lid })
  });
  const d = await res.json();
  if (d.action === "added") {
    btnEl.classList.add("saved");
    btnEl.innerHTML = '<i class="ti ti-heart-filled"></i>';
    toast("💾 Saved to wishlist!");
  } else {
    btnEl.classList.remove("saved");
    btnEl.innerHTML = '<i class="ti ti-heart"></i>';
    toast("Removed from wishlist");
  }
}

async function toggleWishlistModal(lid) {
  if (!requireLogin()) return;
  const res = await fetch(`${API}/api/wishlist`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: currentUser._id, listing_id: lid })
  });
  const d = await res.json();
  toast(d.action === "added" ? "💾 Saved to wishlist!" : "Removed from wishlist");
}

async function loadWishlist() {
  if (!requireLogin()) return;
  const grid = $("wishlistGrid");
  grid.innerHTML = `<p style="color:var(--text-m)">Loading…</p>`;
  const res = await fetch(`${API}/api/wishlist/${currentUser._id}`);
  const items = await res.json();
  if (!items.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><i class="ti ti-heart"></i><p>No saved listings yet. Browse the market and save items you like!</p><button class="btn btn-primary btn-sm" style="margin-top:.8rem" onclick="navigate('marketplace')">Browse Market</button></div>`;
    return;
  }
  const ICONS = { plastic:"♻️", paper:"📄", metal:"⚙️", glass:"🪟", "e-waste":"💻", organic:"🌱", other:"📦" };
  grid.innerHTML = items.map(l => `
    <div class="listing-card" onclick="viewListing('${l._id}')">
      <div class="listing-img">${l.image ? `<img src="${l.image}" alt="">` : ICONS[l.waste_type] || "📦"}</div>
      <div class="listing-body">
        <div class="listing-title">${l.title || capitalize(l.waste_type)}</div>
        <div style="font-size:.8rem;color:var(--text-m)">${l.quantity || "?"}kg · ${l.location || "N/A"}</div>
        ${l.listing_type !== "donate" ? `<div style="font-family:'DM Mono',monospace;font-size:.9rem;color:var(--primary);font-weight:600;margin-top:.3rem">₹${l.price || "?"}/kg</div>` : `<div style="color:#1b5e20;font-weight:600;font-size:.9rem;margin-top:.3rem">FREE</div>`}
      </div>
      <div class="listing-footer">
        <button class="btn btn-danger btn-sm" onclick="event.stopPropagation();toggleWishlistModal('${l._id}');this.closest('.listing-card').remove()"><i class="ti ti-trash"></i> Remove</button>
      </div>
    </div>`).join("");
}

async function expressInterest(lid) {
  if (!requireLogin()) return;
  const res = await fetch(`${API}/api/listings/${lid}/interest`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ buyer_id: currentUser._id, message: `Hi! I'm interested. Contact me at ${currentUser.email}` })
  });
  const d = await res.json();
  if (res.ok || res.status === 200) toast("✅ Interest expressed! Seller will see your contact.");
  else toast(d.message || d.error || "Error", "error");
}

async function viewInterests(lid) {
  $("interestsList").innerHTML = `<p style="color:var(--text-m)">Loading…</p>`;
  openModal("interestsModal");
  const res = await fetch(`${API}/api/listings/${lid}/interests`);
  const items = await res.json();
  if (!items.length) {
    $("interestsList").innerHTML = `<div class="empty-state"><i class="ti ti-users"></i><p>No one has expressed interest yet.</p></div>`;
    return;
  }
  $("interestsList").innerHTML = items.map(i => `
    <div class="interest-row">
      <div style="width:34px;height:34px;border-radius:50%;background:var(--primary);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:.85rem">${((i.buyer || {}).name || "?")[0].toUpperCase()}</div>
      <div style="flex:1">
        <div style="font-weight:600;font-size:.88rem">${(i.buyer || {}).name || "Unknown"}</div>
        <div style="font-size:.78rem;color:var(--text-m)">${i.message || ""}</div>
        <div style="font-size:.72rem;color:var(--text-d);margin-top:.2rem">${(i.buyer || {}).email || ""} · ${(i.buyer || {}).phone || ""}</div>
      </div>
      <div style="display:flex;gap:.3rem">
        ${(i.buyer || {}).phone ? `<a href="tel:${i.buyer.phone}" class="btn btn-secondary btn-sm"><i class="ti ti-phone"></i></a>` : ""}
        <button class="btn btn-primary btn-sm" onclick="openChat('${lid}','${i.buyer_id}','${(i.buyer || {}).name || "Buyer"}')"><i class="ti ti-message"></i></button>
      </div>
    </div>`).join("");
}

async function deleteListing(lid) {
  if (!confirm("Delete this listing?")) return;
  await fetch(`${API}/api/listings/${lid}`, { method: "DELETE" });
  toast("Listing deleted");
  closeModal("listingModal");
  loadMarketplace();
}

async function loadMyListings() {
  if (!requireLogin()) return;
  const res = await fetch(`${API}/api/listings?limit=200`);
  const data = await res.json();
  const items = (data.items || []).filter(l => l.user_id === currentUser._id);
  const grid = $("myListingsGrid");
  if (!items.length) {
    grid.innerHTML = `<div class="empty-state"><i class="ti ti-package"></i><p>No listings yet. <button class="btn btn-primary btn-sm" onclick="navigate('sell')" style="margin-left:.5rem">Post one</button></p></div>`;
    return;
  }
  const ICONS = { plastic:"♻️", paper:"📄", metal:"⚙️", glass:"🪟", "e-waste":"💻", organic:"🌱", other:"📦" };
  grid.innerHTML = `<div class="grid-3">${items.map(l => `
    <div class="listing-card" onclick="viewListing('${l._id}')">
      <div class="listing-img">${l.image ? `<img src="${l.image}" alt="">` : ICONS[l.waste_type] || "📦"}</div>
      <div class="listing-body">
        <div class="listing-title">${l.title || capitalize(l.waste_type)}</div>
        <div style="font-size:.8rem;color:var(--text-m)">${l.quantity || "?"}kg · ${l.location || "N/A"}</div>
        <div style="display:flex;gap:.4rem;margin-top:.5rem;flex-wrap:wrap">
          <span class="badge badge-green">${l.status}</span>
          <span class="badge badge-blue">${l.interested_count || 0} interested</span>
        </div>
      </div>
      <div class="listing-footer">
        <button class="btn btn-secondary btn-sm" onclick="event.stopPropagation();viewInterests('${l._id}')"><i class="ti ti-users"></i> Buyers</button>
        <button class="btn btn-danger btn-sm" onclick="event.stopPropagation();deleteListing('${l._id}')"><i class="ti ti-trash"></i></button>
      </div>
    </div>`).join("")}</div>`;
}

// ============================================================
// AI WASTE AUTO-DETECT FOR SELL/DONATE FORMS
// ============================================================
async function detectAndFill(formType) {
  const fileInput = $(formType + "Image");
  if (!fileInput || !fileInput.files[0]) return;
  const b64 = await toBase64(fileInput.files[0]);

  const resultDiv = $(formType + "DetectResult");
  const typeEl    = $(formType + "DetectType");
  const confEl    = $(formType + "DetectConf");
  if (resultDiv) {
    resultDiv.style.display = "flex";
    if (typeEl) typeEl.textContent = "Analysing…";
    if (confEl) confEl.textContent = "Please wait…";
  }

  try {
    const res  = await fetch(`${API}/api/detect`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: b64 })
    });
    const data = await res.json();

    const wtSelect = $(formType + "WasteType");
    if (wtSelect) {
      const options = Array.from(wtSelect.options).map(o => o.value);
      if (options.includes(data.category)) {
        wtSelect.value = data.category;
        if (formType === "sell" || formType === "buy") triggerPriceCheck(formType);
      }
    }

    const titleInput = $(formType + "Title");
    if (titleInput && !titleInput.value.trim()) {
      titleInput.value = capitalize(data.category) + " Waste";
    }

    if (typeEl) typeEl.textContent = `${capitalize(data.category)} detected · ${data.estimated_value}`;
    if (confEl) confEl.textContent = `Confidence: ${data.confidence}%`;
    if (resultDiv) {
      resultDiv.style.display = "flex";
      resultDiv.style.borderColor = data.color || "var(--accent)";
    }
    const valEl = $(formType + "DetectVal");
    if (valEl) valEl.textContent = data.estimated_value;

    toast(`🤖 AI detected: ${capitalize(data.category)} (${data.confidence}% confidence)`);
  } catch (e) {
    if (typeEl) typeEl.textContent = "Detection failed";
    if (confEl) confEl.textContent = "Could not analyse image";
  }
}

// ============================================================
// AI PRICE FAIRNESS CHECK
// ============================================================
function triggerPriceCheck(formType) {
  clearTimeout(priceCheckTimers[formType]);
  priceCheckTimers[formType] = setTimeout(() => runPriceCheck(formType), 700);
}

async function runPriceCheck(formType) {
  const waste_type = $(formType + "WasteType")?.value;
  const price      = parseFloat($(formType + "Price")?.value) || 0;
  const quantity   = parseFloat($(formType + "Qty")?.value)   || 0;
  const verdictDiv = $(formType + "PriceVerdict");
  if (!verdictDiv) return;
  if (!price || !quantity || !waste_type) { verdictDiv.innerHTML = ""; return; }

  try {
    const res  = await fetch(`${API}/api/price-check`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ waste_type, price, quantity, listing_type: formType })
    });
    const data = await res.json();
    const icons  = { fair:"✅", underpriced:"⚠️", overpriced:"❌", too_low:"⚠️" };
    const titles = { fair:"Fair Price", underpriced:"Underpriced", overpriced:"Overpriced", too_low:"Offer Too Low" };
    verdictDiv.innerHTML = `
      <div class="price-verdict ${data.verdict}">
        <span class="price-verdict-icon">${icons[data.verdict] || "ℹ️"}</span>
        <div class="price-verdict-body">
          <h5>${titles[data.verdict] || "Price Check"}</h5>
          <p>${data.message}</p>
          <div class="suggested">Market: ₹${data.market_min}–₹${data.market_max}/kg · Total: ₹${data.total_value} · Suggested: ₹${data.suggested_price}/kg</div>
        </div>
      </div>`;
  } catch {}
}

// ============================================================
// ADD LISTING (sell / donate / buy)
// ============================================================
async function handleAddListing(type) {
  if (!requireLogin()) return;

  let title, wt, qty, loc, desc, price, lat, lng;

  if (type === "sell") {
    title = $("sellTitle").value.trim();
    wt    = $("sellWasteType").value;
    qty   = $("sellQty").value;
    price = $("sellPrice").value;
    loc   = $("sellLoc").value.trim();
    desc  = $("sellDesc").value.trim();
    lat   = liveCoords.sell?.lat || (sellMarker ? sellMarker.getLatLng().lat : null);
    lng   = liveCoords.sell?.lng || (sellMarker ? sellMarker.getLatLng().lng : null);
  } else if (type === "donate") {
    title = $("donateTitle").value.trim();
    wt    = $("donateWasteType").value;
    qty   = $("donateQty").value;
    loc   = $("donateLoc").value.trim();
    desc  = $("donateDesc").value.trim();
    price = 0;
    lat   = liveCoords.donate?.lat || (donateMarker ? donateMarker.getLatLng().lat : null);
    lng   = liveCoords.donate?.lng || (donateMarker ? donateMarker.getLatLng().lng : null);
  } else {
    title = $("buyTitle").value.trim();
    wt    = $("buyWasteType").value;
    qty   = $("buyQty").value;
    price = $("buyPrice").value;
    loc   = $("buyLoc").value.trim();
    desc  = $("buyDesc").value.trim();
    lat   = liveCoords.buy?.lat || (buyMarker ? buyMarker.getLatLng().lat : null);
    lng   = liveCoords.buy?.lng || (buyMarker ? buyMarker.getLatLng().lng : null);
  }

  if (!qty || !loc) return toast("Fill quantity and location", "error");

  let imageData = "";
  if (type === "sell") {
    const si = $("sellImage");
    if (si && si.files[0]) imageData = await toBase64(si.files[0]);
  } else if (type === "donate") {
    const di = $("donateImage");
    if (di && di.files[0]) imageData = await toBase64(di.files[0]);
  }

  setLoading(`${type}Btn`, true);
  const res = await fetch(`${API}/api/listings`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: currentUser._id, title, waste_type: wt,
      quantity: qty, location: loc, description: desc,
      listing_type: type, price, image: imageData,
      latitude: lat, longitude: lng,
      condition: type === "sell" ? ($("sellCondition")?.value || "") : ""
    })
  });
  setLoading(`${type}Btn`, false);
  const d = await res.json();
  if (res.ok) {
    currentUser.reward_points = (currentUser.reward_points || 0) + d.points_earned;
    updateNav();
    toast(`✅ Listed! +${d.points_earned} points earned`);
    ["sellTitle","sellQty","sellPrice","sellLoc","sellDesc",
     "donateTitle","donateQty","donateLoc","donateDesc",
     "buyTitle","buyQty","buyPrice","buyLoc","buyDesc"].forEach(id => { if ($(id)) $(id).value = ""; });
    navigate("marketplace");
  } else toast(d.error || "Error", "error");
}

// ============================================================
// MAP FUNCTIONS
// ============================================================
function initFormMap(type) {
  // type: "sell" | "buy" | "donate"
  const containerId = `${type}MapContainer`;
  const el = $(containerId);
  if (!el) return;

  let mapVar = type === "sell" ? sellMap : type === "buy" ? buyMap : donateMap;
  if (mapVar) { setTimeout(() => mapVar.invalidateSize(), 100); return; }

  const map = L.map(containerId).setView([14.4426, 79.9865], 13);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19
  }).addTo(map);

  if (type === "sell")   sellMap   = map;
  else if (type === "buy") buyMap  = map;
  else                   donateMap = map;

  map.on("click", e => {
    let markerVar = type === "sell" ? sellMarker : type === "buy" ? buyMarker : donateMarker;
    if (markerVar) map.removeLayer(markerVar);
    const m = L.marker(e.latlng).addTo(map);
    if (type === "sell")       sellMarker   = m;
    else if (type === "buy")   buyMarker    = m;
    else                       donateMarker = m;
    $(type + "Loc").value = `${e.latlng.lat.toFixed(6)}, ${e.latlng.lng.toFixed(6)}`;
    updateCoordDisplay(type, e.latlng.lat, e.latlng.lng);
    fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${e.latlng.lat}&lon=${e.latlng.lng}`)
      .then(r => r.json()).then(d => {
        if (d.display_name) { $(type + "Loc").value = d.display_name; m.bindPopup(d.display_name).openPopup(); }
      }).catch(() => {});
  });

  initMapSearch(type, map);
  setTimeout(() => map.invalidateSize(), 200);
}

function initMapSearch(type, map) {
  const searchBtn   = $(`${type}SearchBtn`);
  const searchInput = $(`${type}SearchInput`);
  if (!searchBtn || !searchInput) return;

  const doSearch = () => {
    const q = searchInput.value.trim();
    if (!q) return;
    fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=5`)
      .then(r => r.json())
      .then(data => {
        if (!data.length) { toast("Location not found", "error"); return; }
        const { lat, lon, display_name } = data[0];
        map.setView([lat, lon], 16);
        let markerVar = type === "sell" ? sellMarker : type === "buy" ? buyMarker : donateMarker;
        if (markerVar) map.removeLayer(markerVar);
        const m = L.marker([lat, lon]).addTo(map);
        m.bindPopup(display_name).openPopup();
        if (type === "sell")       sellMarker   = m;
        else if (type === "buy")   buyMarker    = m;
        else                       donateMarker = m;
        $(type + "Loc").value = display_name;
        updateCoordDisplay(type, parseFloat(lat), parseFloat(lon));
      })
      .catch(() => toast("Search failed", "error"));
  };

  searchBtn.addEventListener("click", doSearch);
  searchInput.addEventListener("keypress", e => { if (e.key === "Enter") doSearch(); });
}

function updateCoordDisplay(type, lat, lng) {
  const el = $(`${type}CoordDisplay`);
  if (el) {
    el.style.display = "block";
    el.innerHTML = `Lat: ${lat.toFixed(6)}<br>Lng: ${lng.toFixed(6)}`;
  }
}

function getLiveLocation(type) {
  const locInput   = $(`${type}Loc`);
  const statusDiv  = $(`${type}LocationStatus`);
  const statusText = $(`${type}LocationStatusText`);
  const liveBtn    = $(`${type}LiveBtn`) || $(`${type}LiveLocationBtn`);
  const map = type === "sell" ? sellMap : type === "buy" ? buyMap : type === "donate" ? donateMap : reportMap;

  if (!navigator.geolocation) { toast("Geolocation not supported", "error"); return; }

  if (liveBtn) { liveBtn.disabled = true; liveBtn.innerHTML = '<span class="loader"></span> Locating…'; }
  if (statusText) statusText.textContent = "🔍 Detecting your location…";

  navigator.geolocation.getCurrentPosition(
    position => {
      const { latitude: lat, longitude: lng, accuracy } = position.coords;
      liveCoords[type] = { lat, lng };

      if (statusDiv)  statusDiv.classList.add("active");
      if (statusText) statusText.innerHTML = `✅ Location found! ±${Math.round(accuracy)}m`;

      if (type === "report") {
        const coordGroup = $("reportCoordinatesGroup");
        const coordDisp  = $("reportCoordinatesDisplay");
        if (coordGroup) coordGroup.style.display = "block";
        if (coordDisp)  coordDisp.innerHTML = `Lat: ${lat.toFixed(6)}<br>Lng: ${lng.toFixed(6)}`;
      } else {
        updateCoordDisplay(type, lat, lng);
      }

      fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1`)
        .then(r => r.json())
        .then(d => { if (locInput) locInput.value = d.display_name || `${lat}, ${lng}`; })
        .catch(() => { if (locInput) locInput.value = `${lat.toFixed(6)}, ${lng.toFixed(6)}`; });

      if (map && typeof L !== "undefined") {
        map.setView([lat, lng], 17);
        let markerVar = type === "sell" ? sellMarker : type === "buy" ? buyMarker : type === "donate" ? donateMarker : reportMarker;
        if (markerVar) map.removeLayer(markerVar);
        const liveIcon = L.divIcon({
          html: `<div style="width:20px;height:20px;background:#667eea;border:3px solid white;border-radius:50%;box-shadow:0 0 0 6px rgba(102,126,234,.25)"></div>`,
          className: "", iconSize: [20, 20], iconAnchor: [10, 10]
        });
        const m = L.marker([lat, lng], { icon: liveIcon }).addTo(map);
        m.bindPopup(`Your Location · ±${Math.round(accuracy)}m`).openPopup();
        if (type === "sell")        sellMarker   = m;
        else if (type === "buy")    buyMarker    = m;
        else if (type === "donate") donateMarker = m;
        else                        reportMarker = m;
      }

      if (liveBtn) { liveBtn.disabled = false; liveBtn.innerHTML = '<i class="ti ti-current-location"></i> Get Live Location'; }
      toast(`📍 Location updated! ±${Math.round(accuracy)}m`);
    },
    error => {
      const msgs = { 1: "Permission denied. Allow GPS.", 2: "Location unavailable.", 3: "Request timed out." };
      toast(msgs[error.code] || "Error getting location.", "error");
      if (statusText) statusText.textContent = "❌ " + (msgs[error.code] || "Unknown error");
      if (statusDiv)  statusDiv.classList.remove("active");
      if (liveBtn)    { liveBtn.disabled = false; liveBtn.innerHTML = '<i class="ti ti-current-location"></i> Get Live Location'; }
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
  );
}

function initReportMap() {
  if (typeof L === "undefined") return;
  const el = $("reportMapContainer");
  if (!el) return;
  if (reportMap) { setTimeout(() => reportMap.invalidateSize(), 100); return; }

  reportMap = L.map("reportMapContainer").setView([14.4426, 79.9865], 13);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', maxZoom: 19
  }).addTo(reportMap);

  reportMap.on("click", e => {
    if (reportMarker) reportMap.removeLayer(reportMarker);
    reportMarker = L.marker(e.latlng).addTo(reportMap);
    liveCoords.report = { lat: e.latlng.lat, lng: e.latlng.lng };
    $("reportLoc").value = `${e.latlng.lat.toFixed(6)}, ${e.latlng.lng.toFixed(6)}`;
    if ($("reportCoordinatesGroup")) $("reportCoordinatesGroup").style.display = "block";
    if ($("reportCoordinatesDisplay")) $("reportCoordinatesDisplay").innerHTML = `Lat: ${e.latlng.lat.toFixed(6)}<br>Lng: ${e.latlng.lng.toFixed(6)}`;
    fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${e.latlng.lat}&lon=${e.latlng.lng}`)
      .then(r => r.json()).then(d => {
        if (d.display_name) { $("reportLoc").value = d.display_name; reportMarker.bindPopup(d.display_name).openPopup(); }
      }).catch(() => {});
  });

  const sb = $("reportSearchBtn"), si = $("reportSearchInput");
  if (sb && si) {
    const doSearch = () => {
      const q = si.value.trim();
      if (!q) return;
      fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=5`)
        .then(r => r.json()).then(data => {
          if (!data.length) { toast("Location not found", "error"); return; }
          const { lat, lon, display_name } = data[0];
          reportMap.setView([lat, lon], 16);
          if (reportMarker) reportMap.removeLayer(reportMarker);
          reportMarker = L.marker([lat, lon]).addTo(reportMap);
          reportMarker.bindPopup(display_name).openPopup();
          liveCoords.report = { lat: parseFloat(lat), lng: parseFloat(lon) };
          $("reportLoc").value = display_name;
          if ($("reportCoordinatesGroup")) $("reportCoordinatesGroup").style.display = "block";
          if ($("reportCoordinatesDisplay")) $("reportCoordinatesDisplay").innerHTML = `Lat: ${parseFloat(lat).toFixed(6)}<br>Lng: ${parseFloat(lon).toFixed(6)}`;
        }).catch(() => toast("Search failed", "error"));
    };
    sb.addEventListener("click", doSearch);
    si.addEventListener("keypress", e => { if (e.key === "Enter") doSearch(); });
  }

  setTimeout(() => reportMap.invalidateSize(), 200);
}

// ============================================================
// AI WASTE DETECTION (standalone page)
// ============================================================
function initDropZone() {
  const dz = $("dropZone"), fi = $("fileInput");
  if (!dz || !fi) return;
  dz.addEventListener("click",    () => fi.click());
  dz.addEventListener("dragover", e  => { e.preventDefault(); dz.style.borderColor = "var(--accent)"; });
  dz.addEventListener("dragleave",() => { dz.style.borderColor = ""; });
  dz.addEventListener("drop",     e  => { e.preventDefault(); dz.style.borderColor = ""; if (e.dataTransfer.files[0]) processFile(e.dataTransfer.files[0]); });
  fi.addEventListener("change",   () => { if (fi.files[0]) processFile(fi.files[0]); });
}

async function processFile(file) {
  const b64 = await toBase64(file);
  const preview = $("imgPreview");
  preview.src = b64; preview.style.display = "block";
  $("aiResult").innerHTML = `<div class="card" style="text-align:center;padding:2rem"><span class="loader" style="width:28px;height:28px;border-width:3px;border-top-color:var(--primary);border-color:rgba(15,123,92,.2)"></span><p style="margin-top:.8rem;color:var(--text-m)">Analysing waste…</p></div>`;
  const res  = await fetch(`${API}/api/detect`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: b64 })
  });
  const data = await res.json();
  showAIResult(data);
}

function showAIResult(data) {
  $("aiResult").innerHTML = `
    <div class="ai-result-card">
      <div style="display:flex;gap:1.2rem;align-items:center;flex-wrap:wrap">
        <div style="text-align:center;min-width:80px">
          <div style="font-family:'DM Mono',monospace;font-size:2rem;font-weight:600;color:var(--primary)">${data.confidence}%</div>
          <div style="font-size:.7rem;color:var(--text-m);text-transform:uppercase;letter-spacing:.5px">Confidence</div>
        </div>
        <div style="flex:1">
          <h3 style="color:var(--primary);font-size:1.3rem;text-transform:capitalize;margin-bottom:.3rem">♻️ ${data.category}</h3>
          <p style="color:var(--text-m);font-size:.88rem;margin-bottom:.6rem">${data.recommendation}</p>
          <div class="pill-row">${data.recycling_methods.map(m => `<span class="badge badge-blue">${m}</span>`).join("")}</div>
        </div>
        <div class="card" style="text-align:center;padding:.85rem 1.1rem;border-color:var(--accent2)">
          <div style="color:var(--accent2);font-size:1.2rem;font-weight:700">${data.estimated_value}</div>
          <div style="font-size:.7rem;color:var(--text-m)">EST. VALUE/KG</div>
        </div>
      </div>
      <div style="margin-top:1rem;display:flex;gap:.5rem;flex-wrap:wrap">
        <button class="btn btn-primary btn-sm" onclick="navigate('sell')"><i class="ti ti-coin"></i> Sell This Waste</button>
        <button class="btn btn-secondary btn-sm" onclick="navigate('donate')"><i class="ti ti-gift"></i> Donate Instead</button>
      </div>
    </div>`;
}

// ============================================================
// REPORT IMAGE PREVIEW (report submission form)
// ============================================================
function previewReportImage() {
  const input   = $("reportImage");
  const preview = $("reportImagePreview");
  if (!input || !preview) return;
  if (input.files && input.files[0]) {
    const reader = new FileReader();
    reader.onload = e => {
      preview.src = e.target.result;
      preview.style.display = "block";
    };
    reader.readAsDataURL(input.files[0]);
  }
}

// ============================================================
// MESSAGING
// ============================================================
function openChat(lid, partnerId, partnerName) {
  chatListingId = lid; chatPartnerId = partnerId;
  $("chatHeader").textContent = `Chat about listing · with ${partnerName}`;
  loadChatMessages(lid, partnerId);
  openModal("messageModal");
}

async function loadChatMessages(lid, partnerId) {
  if (!currentUser) return;
  const res = await fetch(`${API}/api/messages/${currentUser._id}`);
  const threads = await res.json();
  const msgs = threads[lid] || [];
  const box = $("chatMessages");
  if (!msgs.length) { box.innerHTML = `<div class="empty-state" style="padding:2rem"><p>No messages yet. Start the conversation!</p></div>`; return; }
  box.innerHTML = msgs.reverse().map(m => {
    const isMine = m.from_id === currentUser._id;
    return `<div style="display:flex;flex-direction:column;align-items:${isMine ? "flex-end" : "flex-start"}">
      <div class="msg-bubble ${isMine ? "msg-out" : "msg-in"}">${m.content}</div>
      <div class="msg-time" style="text-align:${isMine ? "right" : "left"}">${formatTime(m.created_at)}</div>
    </div>`;
  }).join("");
  box.scrollTop = box.scrollHeight;
}

async function sendChatMsg() {
  if (!currentUser || !chatListingId || !chatPartnerId) return;
  const input = $("chatInput");
  const content = input.value.trim();
  if (!content) return;
  input.value = "";
  await fetch(`${API}/api/messages`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ listing_id: chatListingId, from_id: currentUser._id, to_id: chatPartnerId, content })
  });
  loadChatMessages(chatListingId, chatPartnerId);
}

async function loadMessageThreads() {
  if (!requireLogin()) return;
  const res = await fetch(`${API}/api/messages/${currentUser._id}`);
  const threads = await res.json();
  const div = $("messageThreads");
  const keys = Object.keys(threads);
  if (!keys.length) {
    div.innerHTML = `<div class="empty-state"><i class="ti ti-message-off"></i><p>No messages yet. Express interest in a listing to start chatting.</p></div>`;
    return;
  }
  div.innerHTML = keys.map(lid => {
    const msgs = threads[lid];
    const last = msgs[0];
    return `<div class="card" style="margin-bottom:.6rem;cursor:pointer" onclick="openChat('${lid}','${last.from_id === currentUser._id ? last.to_id : last.from_id}','Contact')">
      <div style="display:flex;gap:.8rem;align-items:center">
        <div style="width:40px;height:40px;border-radius:50%;background:var(--primary);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700">M</div>
        <div style="flex:1">
          <div style="font-weight:600;font-size:.88rem">Listing: ${lid.slice(-8)}</div>
          <div style="font-size:.8rem;color:var(--text-m);margin-top:.1rem">${last.content}</div>
        </div>
        <div style="font-size:.72rem;color:var(--text-d)">${formatTime(last.created_at)}</div>
      </div>
    </div>`;
  }).join("");
}

// ============================================================
// COMMUNITY REPORTS
// ============================================================
async function loadReports() {
  const res = await fetch(`${API}/api/reports`);
  const items = await res.json();
  const list = $("reportsList");
  if (!list) return;
  list.innerHTML = items.length ? items.map(r => `
    <div class="report-item">
      <div style="display:flex;gap:.7rem;align-items:flex-start">
        <span style="font-size:1.4rem">🚨</span>
        <div style="flex:1">
          <p style="font-weight:600;font-size:.9rem">${r.description}</p>
          ${r.report_image ? `<img src="${r.report_image}" class="report-img-preview" style="max-height:140px;margin-top:.4rem" alt="Issue photo">` : ""}
          <div class="report-meta">
            <span>📍 ${r.location || "N/A"}</span>
            <span>${formatDate(r.created_at)}</span>
            <span class="badge ${r.status === "resolved" ? "badge-green" : "badge-red"}">${r.status}</span>
            ${r.rating ? `<span>⭐ ${r.rating}/5</span>` : ""}
            ${r.latitude && r.longitude ? `<a href="https://www.openstreetmap.org/?mlat=${r.latitude}&mlon=${r.longitude}&zoom=17" target="_blank" class="btn btn-secondary btn-sm"><i class="ti ti-map-pin"></i> Map</a>` : ""}
          </div>
          ${r.status === "resolved" && r.completion_image ? `<div class="completion-img-wrap"><img src="${r.completion_image}" alt="Completion"><span class="completion-badge">✅ Resolved</span></div>` : ""}
        </div>
        ${isAdmin ? `<button class="btn btn-secondary btn-sm" onclick="openCompleteReportModal('${r._id}')"><i class="ti ti-check"></i> Complete</button>` : ""}
      </div>
    </div>`).join("") : `<div class="empty-state"><i class="ti ti-map-pin"></i><p>No reports yet.</p></div>`;
}

async function handleReport() {
  if (!requireLogin()) return;
  const desc = $("reportDesc").value.trim();
  const loc  = $("reportLoc").value.trim();
  const lat  = liveCoords.report?.lat || (reportMarker ? reportMarker.getLatLng().lat : null);
  const lng  = liveCoords.report?.lng || (reportMarker ? reportMarker.getLatLng().lng : null);
  if (!desc) return toast("Describe the issue", "error");

  // Capture optional report image
  let reportImageData = "";
  const rImgInput = $("reportImage");
  if (rImgInput && rImgInput.files[0]) {
    reportImageData = await toBase64(rImgInput.files[0]);
  }

  const res = await fetch(`${API}/api/reports`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: currentUser._id,
      description: desc,
      location: loc,
      latitude: lat,
      longitude: lng,
      report_image: reportImageData
    })
  });
  if (res.ok) {
    currentUser.reward_points = (currentUser.reward_points || 0) + 5;
    updateNav();
    toast("✅ Report submitted! +5 points");
    $("reportDesc").value = "";
    $("reportLoc").value  = "";
    const preview = $("reportImagePreview");
    if (preview) { preview.style.display = "none"; preview.src = ""; }
    if (rImgInput) rImgInput.value = "";
    liveCoords.report = null;
    if (reportMarker) { reportMap.removeLayer(reportMarker); reportMarker = null; }
    loadReports();
  }
}

async function loadMyReports() {
  if (!requireLogin()) return;
  const res = await fetch(`${API}/api/reports/user/${currentUser._id}`);
  const items = await res.json();
  const div = $("myReportsList");
  if (!items.length) {
    div.innerHTML = `<div class="empty-state"><i class="ti ti-file-report"></i><p>No reports yet.</p></div>`;
    return;
  }
  div.innerHTML = items.map(r => `
    <div class="card" style="margin-bottom:.8rem">
      <div style="display:flex;gap:.7rem;align-items:flex-start">
        <span style="font-size:1.4rem">🚨</span>
        <div style="flex:1">
          <p style="font-weight:600">${r.description}</p>
          ${r.report_image ? `<img src="${r.report_image}" class="report-img-preview" style="max-height:140px;margin-top:.4rem" alt="Your issue photo">` : ""}
          <div class="report-meta">
            <span>📍 ${r.location || "N/A"}</span>
            <span>${formatDate(r.created_at)}</span>
            <span class="badge ${r.status === "resolved" ? "badge-green" : "badge-red"}">${r.status}</span>
            ${r.latitude && r.longitude ? `<a href="https://www.openstreetmap.org/?mlat=${r.latitude}&mlon=${r.longitude}&zoom=17" target="_blank" class="btn btn-secondary btn-sm"><i class="ti ti-map-pin"></i> Map</a>` : ""}
          </div>
          ${r.admin_notes ? `<div style="font-size:.8rem;color:var(--text-m);margin-top:.4rem;padding:.4rem .6rem;background:var(--glass);border-radius:6px">📝 ${r.admin_notes}</div>` : ""}
          ${r.status === "resolved" && r.completion_image ? `
            <div class="completion-img-wrap" style="max-width:400px">
              <img src="${r.completion_image}" alt="Completion"><span class="completion-badge">✅ Resolved</span>
            </div>
            <div style="font-size:.78rem;color:var(--text-m);margin-top:.3rem">Completed: ${r.completed_at ? formatDate(r.completed_at) : "N/A"}</div>` : ""}
          ${r.status === "resolved" && !r.rating ? `
            <div style="margin-top:.8rem">
              <p style="font-size:.82rem;font-weight:600;margin-bottom:.4rem;color:var(--text-m)">Rate the resolution:</p>
              <div style="display:flex;gap:.5rem;align-items:center">
                ${[1,2,3,4,5].map(n => `<button class="btn btn-secondary btn-sm" onclick="quickRate('${r._id}',${n})">${"★".repeat(n)}</button>`).join("")}
              </div>
            </div>` : ""}
          ${r.rating ? `<div style="margin-top:.5rem;color:var(--accent2);font-size:.88rem">⭐ You rated: ${r.rating}/5</div>` : ""}
        </div>
      </div>
    </div>`).join("");
}

async function quickRate(rid, rating) {
  await fetch(`${API}/api/reports/${rid}/rate`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rating })
  });
  toast(`✅ Rated ${rating}/5 — thank you!`);
  loadMyReports();
}

function openCompleteReportModal(rid) {
  activeReportId = rid;
  $("completionNotes").value = "";
  $("completionPreview").innerHTML = "";
  openModal("completeReportModal");
}

async function submitCompletion() {
  if (!activeReportId) return;
  const imgInput = $("completionImageInput");
  let imgData = "";
  if (imgInput && imgInput.files[0]) {
    imgData = await toBase64(imgInput.files[0]);
    $("completionPreview").innerHTML = `<img src="${imgData}" style="width:100%;border-radius:8px;margin-top:.5rem;max-height:200px;object-fit:cover">`;
  }
  const notes = $("completionNotes").value.trim();
  const res = await fetch(`${API}/api/admin/complete-report/${activeReportId}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ completion_image: imgData, notes })
  });
  if (res.ok) {
    toast("✅ Report marked as resolved!");
    closeModal("completeReportModal");
    loadReports();
    if (isAdmin) loadAdminReports();
  } else toast("Error", "error");
}

function initStarRating() {
  const stars = document.querySelectorAll("#starRating span");
  stars.forEach(s => {
    s.addEventListener("mouseover", () => {
      const v = parseInt(s.dataset.v);
      stars.forEach((ss, i) => ss.classList.toggle("active", i < v));
    });
    s.addEventListener("mouseout", () => stars.forEach((ss, i) => ss.classList.toggle("active", i < currentRating)));
    s.addEventListener("click", () => {
      currentRating = parseInt(s.dataset.v);
      stars.forEach((ss, i) => ss.classList.toggle("active", i < currentRating));
      const labels = ["", "Poor", "Below average", "Average", "Good", "Excellent"];
      $("rateLabel").textContent = labels[currentRating];
    });
  });
}

async function submitRating() {
  if (!activeReportId || !currentRating) return toast("Select a rating", "error");
  await fetch(`${API}/api/reports/${activeReportId}/rate`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rating: currentRating })
  });
  toast(`✅ Rated ${currentRating}/5`);
  closeModal("rateModal"); currentRating = 0;
  loadMyReports();
}

// ============================================================
// REWARDS
// ============================================================
async function loadRewards() {
  if (!currentUser) return;
  $("rewardPts").textContent = currentUser.reward_points;
  $("rewardEco").textContent = currentUser.eco_score;
  $("rewardCO2").textContent = Math.round(currentUser.co2_saved || 0);
  $("rWasteSold").textContent    = Math.round(currentUser.total_waste_sold    || 0);
  $("rWasteDonated").textContent = Math.round(currentUser.total_waste_donated || 0);
  $("rCO2").textContent          = Math.round(currentUser.co2_saved           || 0);
  $("rTrees").textContent        = (Math.round((currentUser.co2_saved || 0) / 21.77 * 100) / 100).toFixed(1);

  const res = await fetch(`${API}/api/leaderboard`);
  const top = await res.json();
  $("leaderboard").innerHTML = top.map((u, i) => `
    <div class="lb-row">
      <span class="lb-rank">${["🥇","🥈","🥉"][i] || "#"+(i+1)}</span>
      <span class="lb-name">${u.name}</span>
      <span style="font-size:.75rem;color:var(--text-m)">🌿${u.eco_score||0} · CO₂ ${Math.round(u.co2_saved||0)}kg</span>
      <span class="lb-pts">${u.reward_points}pts</span>
    </div>`).join("") || `<div class="empty-state"><i class="ti ti-trophy"></i><p>No data yet.</p></div>`;
}

// ============================================================
// ANALYTICS (ADMIN ONLY)
// ============================================================
async function loadAnalytics() {
  if (!isAdmin) {
    $("analyticsAdminGate") && ($("analyticsAdminGate").style.display = "block");
    $("analyticsContent")   && ($("analyticsContent").style.display   = "none");
    return;
  }
  $("analyticsAdminGate") && ($("analyticsAdminGate").style.display = "none");
  $("analyticsContent")   && ($("analyticsContent").style.display   = "block");

  const res = await fetch(`${API}/api/analytics`);
  const d = await res.json();
  $("aUsers").textContent     = d.total_users;
  $("aListings").textContent  = d.total_listings;
  $("aDonations").textContent = d.total_donations;
  $("aSales").textContent     = d.total_sales;
  $("aReports").textContent   = d.total_reports;
  $("aResolved").textContent  = d.resolved_reports;
  $("aRating").textContent    = d.avg_rating || "—";
  renderCharts(d);
}

function renderCharts(d) {
  Object.values(analyticsCharts).forEach(c => c.destroy());
  analyticsCharts = {};
  const PALETTE = ["#0f7b5c","#1dbf8a","#4ade80","#f5a623","#e24b4a","#3b82f6","#8b5cf6"];

  const tCtx = $("trendChart")?.getContext("2d");
  if (tCtx) analyticsCharts.trend = new Chart(tCtx, {
    type: "line",
    data: { labels: d.monthly_trend.labels, datasets: [{ label: "Waste Recycled (kg)", data: d.monthly_trend.data, borderColor: "#0f7b5c", backgroundColor: "rgba(15,123,92,.08)", fill: true, tension: .4, pointBackgroundColor: "#0f7b5c", pointRadius: 4 }] },
    options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
  });

  const wCtx = $("wasteChart")?.getContext("2d");
  if (wCtx) analyticsCharts.waste = new Chart(wCtx, {
    type: "doughnut",
    data: { labels: Object.keys(d.waste_by_type), datasets: [{ data: Object.values(d.waste_by_type), backgroundColor: PALETTE, borderWidth: 0 }] },
    options: { cutout: "58%", plugins: { legend: { position: "right" } } }
  });

  const lCtx = $("listingChart")?.getContext("2d");
  if (lCtx && d.listing_status) analyticsCharts.listing = new Chart(lCtx, {
    type: "bar",
    data: { labels: ["Active","Sold","Deleted"], datasets: [{ data: [d.listing_status.active, d.listing_status.sold, d.listing_status.deleted], backgroundColor: ["#1dbf8a","#0f7b5c","#e24b4a"], borderRadius: 6, borderWidth: 0 }] },
    options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
  });
}

// ============================================================
// ADMIN DASHBOARD
// ============================================================
async function loadAdminDash() {
  if (!isAdmin) return;
  // Load users into the full table
  const ures = await fetch(`${API}/api/admin/users`);
  const users = await ures.json();
  const tbody = $("adminUsersTable");
  if (tbody) {
    tbody.innerHTML = users.map((u, i) => `
      <tr>
        <td style="font-weight:600;color:var(--text-m)">${i + 1}</td>
        <td><strong>${u.name || "—"}</strong></td>
        <td style="font-size:.82rem">${u.email || "—"}</td>
        <td style="font-size:.82rem">${u.phone || "—"}</td>
        <td><span class="badge ${u.role === "admin" ? "badge-purple" : "badge-blue"}">${u.role || "user"}</span></td>
        <td><strong style="color:var(--primary)">${u.reward_points || 0}</strong></td>
        <td>${u.eco_score || 0}</td>
        <td>${Math.round(u.co2_saved || 0)} kg</td>
        <td style="font-size:.78rem;color:var(--text-m)">${formatDate(u.created_at)}</td>
      </tr>`).join("") || `<tr><td colspan="9" style="text-align:center;padding:2rem;color:var(--text-m)">No users found</td></tr>`;
  }
}

// ── ADMIN: Load reports into the proper HTML table ──────────
async function loadAdminReports() {
  const res = await fetch(`${API}/api/admin/reports`);
  const items = await res.json();
  const tbody = $("adminReportsTableBody");
  if (!tbody) return;

  if (!items.length) {
    tbody.innerHTML = `<tr><td colspan="11" style="text-align:center;padding:2.5rem;color:var(--text-m)"><i class="ti ti-map-pin" style="font-size:1.5rem;display:block;margin-bottom:.5rem;opacity:.4"></i>No reports submitted yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = items.map((r, i) => {
    const reporter = r.reporter || {};

    // Status badge
    const statusBadge = r.status === "resolved"
      ? `<span class="badge badge-green">✅ Resolved</span>`
      : `<span class="badge badge-red">🔴 Open</span>`;

    // Star rating
    const ratingHtml = r.rating
      ? `<span style="color:var(--accent2);font-weight:600">⭐ ${r.rating}/5</span>`
      : `<span style="color:var(--text-d);font-size:.78rem">Not rated</span>`;

    // User-submitted issue photo (report_image field)
    const issuePhotoHtml = r.report_image
      ? `<img
           src="${r.report_image}"
           class="report-thumb"
           alt="Issue"
           title="Click to enlarge"
           onclick="viewReportImage('${r.report_image.replace(/'/g, "\\'")}')"
         >`
      : `<div class="no-img">No<br>Photo</div>`;

    // Admin completion photo
    const completionHtml = r.completion_image
      ? `<div style="display:flex;flex-direction:column;gap:.3rem;align-items:flex-start">
           <img
             src="${r.completion_image}"
             class="report-thumb"
             alt="Completion"
             title="Completion photo – click to enlarge"
             onclick="viewReportImage('${r.completion_image.replace(/'/g, "\\'")}')"
           >
           ${r.admin_notes ? `<span style="font-size:.7rem;color:var(--text-m);max-width:130px;word-break:break-word" title="${r.admin_notes}">📝 ${r.admin_notes.length > 40 ? r.admin_notes.substring(0, 40) + "…" : r.admin_notes}</span>` : ""}
           ${r.completed_at ? `<span style="font-size:.68rem;color:var(--text-d)">${formatDate(r.completed_at)}</span>` : ""}
         </div>`
      : `<span style="color:var(--text-d);font-size:.78rem">—</span>`;

    // Location cell — show address + GPS coords
    let locationHtml = `<span style="color:var(--text-d);font-size:.78rem">—</span>`;
    if (r.location || (r.latitude && r.longitude)) {
      locationHtml = `<div style="max-width:160px">`;
      if (r.location) {
        const loc = r.location.length > 70 ? r.location.substring(0, 70) + "…" : r.location;
        locationHtml += `<div style="font-size:.78rem;line-height:1.4;margin-bottom:.3rem" title="${r.location}">${loc}</div>`;
      }
      if (r.latitude && r.longitude) {
        locationHtml += `<div style="font-family:'DM Mono',monospace;font-size:.68rem;color:var(--text-d);line-height:1.5">
          ${parseFloat(r.latitude).toFixed(5)},<br>${parseFloat(r.longitude).toFixed(5)}
        </div>`;
      }
      locationHtml += `</div>`;
    }

    // Map link
    const mapHtml = r.latitude && r.longitude
      ? `<a
           href="https://www.openstreetmap.org/?mlat=${r.latitude}&mlon=${r.longitude}&zoom=17"
           target="_blank"
           class="btn btn-secondary btn-sm"
           title="Open in OpenStreetMap"
         ><i class="ti ti-map-pin"></i> View</a>`
      : `<span style="color:var(--text-d);font-size:.75rem">No GPS</span>`;

    // Action button
    const actionBtn = r.status !== "resolved"
      ? `<button class="btn btn-success btn-sm" onclick="openCompleteReportModal('${r._id}')"><i class="ti ti-check"></i> Resolve</button>`
      : `<span class="badge badge-green" style="white-space:nowrap">✅ Done</span>`;

    return `
      <tr>
        <td style="font-weight:600;color:var(--text-m);text-align:center">${i + 1}</td>
        <td style="text-align:center">${issuePhotoHtml}</td>
        <td>
          <div style="max-width:190px;font-size:.82rem;line-height:1.5;color:var(--text)">${r.description || "—"}</div>
        </td>
        <td>
          <div style="min-width:110px">
            <div style="font-weight:600;font-size:.85rem">${reporter.name || "Unknown"}</div>
            <div style="font-size:.74rem;color:var(--text-m);margin-top:.1rem">${reporter.email || "—"}</div>
            ${reporter.phone ? `<div style="font-size:.74rem;color:var(--text-m)">${reporter.phone}</div>` : ""}
          </div>
        </td>
        <td>${locationHtml}</td>
        <td style="font-size:.78rem;color:var(--text-m);white-space:nowrap">${formatDate(r.created_at)}</td>
        <td>${statusBadge}</td>
        <td>${ratingHtml}</td>
        <td>${completionHtml}</td>
        <td>${mapHtml}</td>
        <td>${actionBtn}</td>
      </tr>`;
  }).join("");
}

// ── Open report image in full-screen modal ──────────────────
function viewReportImage(src) {
  const imgEl = $("imgViewSrc");
  if (imgEl) imgEl.src = src;
  openModal("imgViewModal");
}

// ── Admin tab switcher ──────────────────────────────────────
function showAdminTab(name, btn) {
  document.querySelectorAll("#adminDashPage .tab-content").forEach(t => t.classList.remove("active"));
  document.querySelectorAll("#adminDashPage .tab-btn").forEach(b => b.classList.remove("active"));
  const tab = $("adminTab-" + name);
  if (tab) tab.classList.add("active");
  btn.classList.add("active");
  if (name === "reports")   loadAdminReports();
  if (name === "users")     loadAdminDash();
  if (name === "analytics") navigate("analytics");
}

// ============================================================
// HELPERS
// ============================================================
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
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return iso; }
}

function formatTime(iso) {
  if (!iso) return "";
  try { return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }); }
  catch { return ""; }
}

// ============================================================
// INIT
// ============================================================
document.addEventListener("DOMContentLoaded", () => {
  initDropZone();
  initStarRating();
  navigate("hero");
  updateNav();

  // Completion image preview
  const cImgInput = $("completionImageInput");
  if (cImgInput) {
    cImgInput.addEventListener("change", async () => {
      if (cImgInput.files[0]) {
        const b64 = await toBase64(cImgInput.files[0]);
        $("completionPreview").innerHTML = `<img src="${b64}" style="width:100%;border-radius:8px;margin-top:.5rem;max-height:180px;object-fit:cover">`;
      }
    });
  }

  // Poll unread messages every 30s
  setInterval(() => { if (currentUser) checkUnreadMessages(); }, 30000);
});
