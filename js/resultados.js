// resultados.js (con meteo + modal stats)
// Requisitos:
// - loadJSON disponible (common.js)
// - data/resultados.json
// - data/partidos_stats.json (opcional para modal)
// - data/team_cities.json  (para meteo por ciudad del local)

(async () => {
  const root = document.getElementById("resultados");
  if (!root) return;

  // -----------------------------
  // Helpers (CoreStats si existe)
  // -----------------------------
  const hasCore = typeof window.CoreStats !== "undefined";

  const isNum = hasCore
    ? CoreStats.isNum
    : (v) => typeof v === "number" && Number.isFinite(v);

  const norm = hasCore
    ? CoreStats.norm
    : (s) => String(s || "")
        .toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9\s-]/g, "")
        .trim();

  const slug = hasCore
    ? CoreStats.slug
    : (s) => norm(s).replace(/\s+/g, "-");

  const logoPath = (team) => `img/${slug(team)}.png`;

  // -----------------------------
  // Modal stats wiring
  // -----------------------------
  const statsBackdrop = document.getElementById("stats-backdrop");
  const statsCloseBtn = document.getElementById("stats-close");
  const statsTitleEl  = document.getElementById("stats-title");
  const statsBodyEl   = document.getElementById("stats-body");

  const openStatsModal = () => {
    if (!statsBackdrop) return;
    statsBackdrop.hidden = false;
    document.body.style.overflow = "hidden";
  };
  const closeStatsModal = () => {
    if (!statsBackdrop) return;
    statsBackdrop.hidden = true;
    document.body.style.overflow = "";
    if (statsTitleEl) statsTitleEl.textContent = "Estadísticas del partido";
    if (statsBodyEl) statsBodyEl.innerHTML = "";
  };

  statsCloseBtn?.addEventListener("click", closeStatsModal);
  statsBackdrop?.addEventListener("click", (e) => {
    if (e.target === statsBackdrop) closeStatsModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && statsBackdrop && !statsBackdrop.hidden) {
      closeStatsModal();
    }
  });

  // -----------------------------
  // Cargar datos
  // -----------------------------
  const jornadas = hasCore
    ? await CoreStats.getResultados().catch(() => [])
    : await loadJSON("data/resultados.json").catch(() => []);

  const statsIndex = hasCore
    ? await CoreStats.getStatsIndex().catch(() => ({}))
    : await loadJSON("data/partidos_stats.json").catch(() => ({}));

  if (!Array.isArray(jornadas) || !jornadas.length) {
    root.innerHTML = `<p class="muted" style="text-align:center">No hay jornadas todavía.</p>`;
    return;
  }

  // Orden seguro por jornada
  jornadas.sort((a, b) => (a.numero ?? a.jornada ?? 0) - (b.numero ?? b.jornada ?? 0));

  // -----------------------------
  // Render jornadas + partidos
  // -----------------------------
  root.innerHTML = jornadas.map(j => {
    const num      = j.numero ?? j.jornada ?? "";
    const fechaJ   = j.fecha || "";
    const partidos = j.partidos || [];

    const partidosHTML = partidos.map(p => {
      const gl = p.goles_local;
      const gv = p.goles_visitante;
      const jugado = isNum(gl) && isNum(gv);

      // id para stats
      const matchId = p.id ?? null;

      return `
        <article class="match-card"
                 data-local="${p.local || ""}"
                 data-match-id="${matchId ?? ""}">
          <header class="match-head">
            <span class="chip chip-jornada">J${num}</span>
            ${fechaJ ? `<span class="muted match-fecha">${fechaJ}</span>` : ""}
          </header>

          <div class="match-body">
            <div class="match-team match-team-local">
              <img class="match-logo"
                   src="${logoPath(p.local)}"
                   alt="Escudo ${p.local}"
                   onerror="this.style.visibility='hidden'">
              <span class="match-team-name">${p.local || "—"}</span>
            </div>

            <div class="match-score ${jugado ? "" : "muted"}">
              ${jugado ? `${gl} - ${gv}` : "vs"}
            </div>

            <div class="match-team match-team-visit">
              <img class="match-logo"
                   src="${logoPath(p.visitante)}"
                   alt="Escudo ${p.visitante}"
                   onerror="this.style.visibility='hidden'">
              <span class="match-team-name">${p.visitante || "—"}</span>
            </div>
          </div>

          <footer class="match-foot">
            <div class="match-weather muted">Meteo: …</div>
            ${p.hora ? `<div class="match-hora muted">${p.hora}</div>` : ""}
          </footer>
        </article>
      `;
    }).join("");

    return `
      <section class="jornada-block">
        <h2 class="jornada-title">Jornada ${num}</h2>
        <div class="match-grid">
          ${partidosHTML || `<p class="muted">Sin partidos</p>`}
        </div>
      </section>
    `;
  }).join("");

  // -----------------------------
  // Click tarjetas -> modal stats
  // -----------------------------
  function renderStatsModal(matchId, local, visitante) {
    const matchStats = matchId ? statsIndex?.[matchId] : null;
    if (!matchStats) {
      if (statsTitleEl) statsTitleEl.textContent = `${local} vs ${visitante}`;
      if (statsBodyEl) {
        statsBodyEl.innerHTML = `<p class="muted">No hay estadísticas para este partido.</p>`;
      }
      openStatsModal();
      return;
    }

    const equipos = Object.keys(matchStats);
    if (!equipos.length) {
      if (statsTitleEl) statsTitleEl.textContent = `${local} vs ${visitante}`;
      if (statsBodyEl) {
        statsBodyEl.innerHTML = `<p class="muted">Estadísticas vacías.</p>`;
      }
      openStatsModal();
      return;
    }

    // pinta tabla simple comparativa
    const eqA = equipos[0];
    const eqB = equipos[1] || null;
    const a = matchStats[eqA] || {};
    const b = eqB ? (matchStats[eqB] || {}) : null;

    const rows = [
      ["Posesión", a.posesion, b?.posesion],
      ["Tiros", a.tiros, b?.tiros],
      ["Tiros a puerta", a.tiros_a_puerta, b?.tiros_a_puerta],
      ["Pases", a.pases, b?.pases],
      ["Pases completados", a.pases_completados, b?.pases_completados],
      ["Entradas", a.entradas, b?.entradas],
      ["Faltas", a.faltas, b?.faltas],
      ["Goles", a.goles, b?.goles],
      ["Rojas", a.expulsiones ?? a.rojas ?? a.tarjetas_rojas, b?.expulsiones ?? b?.rojas ?? b?.tarjetas_rojas],
    ];

    if (statsTitleEl) statsTitleEl.textContent = `${eqA} vs ${eqB || "—"}`;

    if (statsBodyEl) {
      statsBodyEl.innerHTML = `
        <div class="stats-table-wrap">
          <table class="stats-table">
            <thead>
              <tr>
                <th>${eqA}</th>
                <th>Métrica</th>
                <th>${eqB || ""}</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map(([label, va, vb]) => `
                <tr>
                  <td>${va ?? "—"}</td>
                  <td class="muted">${label}</td>
                  <td>${vb ?? "—"}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      `;
    }

    openStatsModal();
  }

  document.querySelectorAll(".match-card").forEach(card => {
    card.addEventListener("click", () => {
      const matchId = card.dataset.matchId || null;
      const local = card.querySelector(".match-team-local .match-team-name")?.textContent || "";
      const visitante = card.querySelector(".match-team-visit .match-team-name")?.textContent || "";
      renderStatsModal(matchId, local, visitante);
    });
  });

  // =========================================================
  // METEO HOY POR CITY DEL LOCAL
  // =========================================================
  async function loadTeamCities() {
    const obj = await loadJSON("data/team_cities.json").catch(() => ({}));
    return (obj && typeof obj === "object") ? obj : {};
  }

  function getTodayISO() {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  // WMO -> 3 categorías
  function codeToCategory(code) {
    if (code == null) return null;

    // Nieve (71–77, 85–86)
    if ((code >= 71 && code <= 77) || code === 85 || code === 86) {
      return { label: "Nieve", icon: "❄️" };
    }

    // Lluvia/tormenta (51–67, 80–82, 95–99)
    if (
      (code >= 51 && code <= 67) ||
      (code >= 80 && code <= 82) ||
      (code >= 95 && code <= 99)
    ) {
      return { label: "Lluvia", icon: "🌧️" };
    }

    return { label: "Despejado", icon: "☀️" };
  }

  async function geocodeCity(city) {
    const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
    url.searchParams.set("name", city);
    url.searchParams.set("count", "1");
    url.searchParams.set("language", "en");
    url.searchParams.set("format", "json");

    const res = await fetch(url.toString());
    if (!res.ok) return null;
    const data = await res.json();
    const r = data?.results?.[0];
    if (!r) return null;

    return { lat: r.latitude, lon: r.longitude };
  }

  async function fetchWeatherToday(lat, lon) {
    const today = getTodayISO();

    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", lat);
    url.searchParams.set("longitude", lon);
    url.searchParams.set("daily", "weathercode");
    url.searchParams.set("timezone", "Europe/Madrid");
    url.searchParams.set("start_date", today);
    url.searchParams.set("end_date", today);

    const res = await fetch(url.toString());
    if (!res.ok) return null;
    const data = await res.json();

    const code = data?.daily?.weathercode?.[0];
    return Number.isFinite(code) ? code : null;
  }

  async function enrichMatchesWithTodayWeather() {
    const TEAM_CITY = await loadTeamCities();

    const cards = document.querySelectorAll(".match-card[data-local]");
    if (!cards.length) return;

    const geoCache = new Map();      // city -> coords
    const weatherCache = new Map();  // city -> code

    for (const card of cards) {
      const localTeam = card.dataset.local;
      const city = TEAM_CITY?.[localTeam];
      const target = card.querySelector(".match-weather");
      if (!target) continue;

      if (!city) {
        target.textContent = "Meteo: sin ciudad";
        continue;
      }

      try {
        let coords = geoCache.get(city);
        if (!coords) {
          coords = await geocodeCity(city);
          geoCache.set(city, coords);
        }
        if (!coords) throw new Error("no coords");

        let code = weatherCache.get(city);
        if (code === undefined) {
          code = await fetchWeatherToday(coords.lat, coords.lon);
          weatherCache.set(city, code);
        }

        const cat = codeToCategory(code);
        if (!cat) {
          target.textContent = `Meteo: sin datos · ${city}`;
        } else {
          target.innerHTML = `
            <span class="weather-pill weather-${cat.label.toLowerCase()}">
              ${cat.icon} ${cat.label} · ${city} (hoy)
            </span>
          `;
        }
      } catch (e) {
        target.textContent = `Meteo: sin datos · ${city}`;
      }
    }
  }

  enrichMatchesWithTodayWeather();

})();
