// resultados.js  (con meteo hoy por ciudad del local)
// Requisitos:
// 1) core-stats.js cargado antes (CoreStats global)
// 2) data/team_cities.json -> { "Chelsea":"London", "Real Betis":"Sevilla", ... }
// 3) Un contenedor en HTML: <div id="resultados-root"></div>

(async () => {
  const root = document.getElementById("resultados-root"); // <-- cambia si tu html usa otro id
  if (!root) return;

  // -----------------------------
  // Core helpers
  // -----------------------------
  const norm  = CoreStats.norm;
  const slug  = CoreStats.slug;
  const isNum = CoreStats.isNum;

  const logoPath = (team) => `img/${slug(team)}.png`;

  // -----------------------------
  // Cargar resultados
  // -----------------------------
  const jornadas = await CoreStats.getResultados().catch(() => []);
  if (!Array.isArray(jornadas) || !jornadas.length) {
    root.innerHTML = `<p class="muted" style="text-align:center">No hay jornadas todavía.</p>`;
    return;
  }

  // Orden seguro
  jornadas.sort((a,b)=> (a.numero ?? a.jornada ?? 0) - (b.numero ?? b.jornada ?? 0));

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

      return `
        <div class="match-card" data-local="${p.local || ""}">
          <div class="match-head">
            <span class="chip chip-jornada">J${num}</span>
            ${fechaJ ? `<span class="muted match-fecha">${fechaJ}</span>` : ""}
          </div>

          <div class="match-body">
            <div class="match-team match-team-local">
              <img class="match-logo"
                   src="${logoPath(p.local)}"
                   alt="Escudo ${p.local}"
                   onerror="this.style.visibility='hidden'">
              <span class="match-team-name">${p.local}</span>
            </div>

            <div class="match-score ${jugado ? "" : "muted"}">
              ${jugado ? `${gl} - ${gv}` : "vs"}
            </div>

            <div class="match-team match-team-visit">
              <img class="match-logo"
                   src="${logoPath(p.visitante)}"
                   alt="Escudo ${p.visitante}"
                   onerror="this.style.visibility='hidden'">
              <span class="match-team-name">${p.visitante}</span>
            </div>
          </div>

          <div class="match-foot">
            <div class="match-weather muted">Meteo: …</div>
            ${p.hora ? `<div class="match-hora muted">${p.hora}</div>` : ""}
          </div>
        </div>
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

  // =========================================================
  // METEO HOY POR CIUDAD DEL LOCAL
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

  // Mapeo WMO -> tus 3 categorías
  function codeToCategory(code) {
    if (code == null) return null;

    // Nieve (71–77, 85–86)
    if ((code >= 71 && code <= 77) || code === 85 || code === 86) {
      return { label: "Nieve", icon: "❄️" };
    }

    // Lluvia / tormenta (51–67, 80–82, 95–99)
    if (
      (code >= 51 && code <= 67) ||
      (code >= 80 && code <= 82) ||
      (code >= 95 && code <= 99)
    ) {
      return { label: "Lluvia", icon: "🌧️" };
    }

    // resto: despejado/nublado
    return { label: "Despejado", icon: "☀️" };
  }

  async function geocodeCity(city) {
    const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
    url.searchParams.set("name", city);
    url.searchParams.set("count", "1");
    url.searchParams.set("language", "en");
    url.searchParams.set("format", "json");

    const res = await fetch(url.toString());
    if (!res.ok) throw new Error("geocoding error");
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
    if (!res.ok) throw new Error("weather api error");
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
      const city = TEAM_CITY[localTeam];
      const target = card.querySelector(".match-weather");
      if (!target || !city) continue;

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
          target.textContent = "Meteo: sin datos";
        } else {
          target.innerHTML = `
            <span class="weather-pill weather-${cat.label.toLowerCase()}">
              ${cat.icon} ${cat.label} · ${city} (hoy)
            </span>
          `;
        }
      } catch (e) {
        target.textContent = "Meteo: sin datos";
      }
    }
  }

  // ejecutar tras render
  enrichMatchesWithTodayWeather();

})();
