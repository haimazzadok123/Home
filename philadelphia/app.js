(function () {
  const state = {
    query: "",
    category: null,
    freeOnly: false,
    sort: "default",
  };

  const cardsEl = document.getElementById("cards");
  const countEl = document.getElementById("results-count");
  const searchEl = document.getElementById("search");
  const freeOnlyEl = document.getElementById("free-only");
  const sortEl = document.getElementById("sort-by");
  const filtersEl = document.getElementById("category-filters");

  function buildCategoryChips() {
    const allChip = document.createElement("button");
    allChip.className = "chip active";
    allChip.textContent = "הכל";
    allChip.dataset.category = "";
    filtersEl.appendChild(allChip);

    Object.entries(CATEGORIES).forEach(([key, cat]) => {
      const chip = document.createElement("button");
      chip.className = "chip";
      chip.textContent = `${cat.icon} ${cat.label}`;
      chip.dataset.category = key;
      filtersEl.appendChild(chip);
    });

    filtersEl.addEventListener("click", (e) => {
      const btn = e.target.closest(".chip");
      if (!btn) return;
      [...filtersEl.children].forEach((c) => c.classList.remove("active"));
      btn.classList.add("active");
      state.category = btn.dataset.category || null;
      render();
    });
  }

  function walkLabel(mins) {
    if (mins >= 999) return "רחוק מדי להליכה";
    return `🚶 ${mins} דק' הליכה`;
  }

  function transitLabel(mins) {
    if (mins >= 999) return "🚗 נדרש רכב";
    return `🚇 ${mins} דק' תחב״צ`;
  }

  function mapsUrl(place) {
    const dest = `${place.lat},${place.lng}`;
    return `https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=transit`;
  }

  function filteredPlaces() {
    let list = PLACES.filter((p) => {
      if (state.category && p.category !== state.category) return false;
      if (state.freeOnly && p.cost > 0) return false;
      if (state.query) {
        const q = state.query.toLowerCase();
        const haystack = `${p.name} ${p.desc} ${CATEGORIES[p.category].label}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });

    if (state.sort === "cost-asc") {
      list = list.slice().sort((a, b) => a.cost - b.cost);
    } else if (state.sort === "walk-asc") {
      list = list.slice().sort((a, b) => a.walk - b.walk);
    }
    return list;
  }

  function renderCard(place) {
    const cat = CATEGORIES[place.category];
    const el = document.createElement("article");
    el.className = "place-card";
    el.innerHTML = `
      <div class="top-row">
        <h3>${place.name}</h3>
        <span class="badge" style="background:${cat.color}">${cat.icon} ${cat.label}</span>
      </div>
      <p class="place-desc">${place.desc}</p>
      <div class="meta-row">
        <span class="cost-tag ${place.cost === 0 ? "free" : ""}">💵 ${place.costLabel}</span>
        <span>⏳ ${place.duration}</span>
      </div>
      <div class="meta-row">
        <span>${walkLabel(place.walk)}</span>
        <span>${transitLabel(place.transit)}</span>
      </div>
      <p class="tip">💡 ${place.tip}</p>
      <div class="card-actions">
        <a class="primary" target="_blank" rel="noopener" href="${mapsUrl(place)}">נווטו לשם</a>
        <a href="#map" data-focus="${place.id}">הצג במפה</a>
      </div>
    `;
    return el;
  }

  function render() {
    const list = filteredPlaces();
    cardsEl.innerHTML = "";
    if (list.length === 0) {
      const empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = "לא נמצאו אטרקציות תואמות — נסו לשנות את הסינון.";
      cardsEl.appendChild(empty);
    } else {
      list.forEach((p) => cardsEl.appendChild(renderCard(p)));
    }
    countEl.textContent = `מציג ${list.length} מתוך ${PLACES.length} אטרקציות`;
    updateMapMarkers(list);
  }

  cardsEl?.addEventListener("click", (e) => {
    const link = e.target.closest("[data-focus]");
    if (!link) return;
    e.preventDefault();
    const id = link.dataset.focus;
    focusMarker(id);
  });

  searchEl.addEventListener("input", (e) => {
    state.query = e.target.value.trim();
    render();
  });

  freeOnlyEl.addEventListener("change", (e) => {
    state.freeOnly = e.target.checked;
    render();
  });

  sortEl.addEventListener("change", (e) => {
    state.sort = e.target.value;
    render();
  });

  // --- Map ---
  let map;
  let markerLayer;
  const markerById = {};

  function initMap() {
    map = L.map("map", { scrollWheelZoom: false }).setView([CITY_HALL.lat, CITY_HALL.lng], 13);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(map);
    markerLayer = L.layerGroup().addTo(map);
  }

  function updateMapMarkers(list) {
    markerLayer.clearLayers();
    Object.keys(markerById).forEach((k) => delete markerById[k]);
    list.forEach((p) => {
      const cat = CATEGORIES[p.category];
      const marker = L.circleMarker([p.lat, p.lng], {
        radius: 9,
        color: cat.color,
        fillColor: cat.color,
        fillOpacity: 0.85,
        weight: 2,
      }).bindPopup(
        `<strong>${cat.icon} ${p.name}</strong><br>${p.costLabel}<br>${p.duration}`
      );
      marker.addTo(markerLayer);
      markerById[p.id] = marker;
    });
  }

  function focusMarker(id) {
    const marker = markerById[id];
    if (!marker || !map) return;
    map.setView(marker.getLatLng(), 15, { animate: true });
    marker.openPopup();
  }

  buildCategoryChips();
  initMap();
  render();
})();
