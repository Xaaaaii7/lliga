(async () => {
  const root = document.getElementById("resultados-root"); // o el id que uses
  if (!root) return;

  // -----------------------------
  // Core helpers (igual que tú)
  // -----------------------------
  const norm = CoreStats.norm;
  const slug = CoreStats.slug;
  const isNum = CoreStats.isNum;

  const logoPath = (team) => `img/${slug(team)}.png`;

  // -----------------------------
  // Render de resultados (TU CÓDIGO)
  // -----------------------------
  const jornadas = await CoreStats.getResultados().catch(() => []);
  if (!Array.isArray(jornadas)) return;

  // ... aquí tu render actual de tarjetas ...
  // Asegúrate de que cada tarjeta tenga:
  //   - data-local="Nombre Equipo Local"
  //   - un div .match-weather donde poner la meteo
  //
  // Ejemplo de card:
  // <div class="match-card" data-local="Chelsea">
  //    ...
  //    <div class="match-weather"></div>
  // </div>

  // === (tu render aquí) ===


  // =========================================================
  // METEO HOY POR CIUDAD DEL LOCAL (adaptado a tu JS)
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

  function codeToCategory(code) {
    if (code == null) return null;

    // Nieve (WMO: 71-77, 85-86)
    if ((code >= 71 && code <= 77) || code === 85 || code === 86) {
      return { label: "Nieve", icon: "❄️" };
    }

    // Lluvia / tormenta (51-67, 80-82, 95-99)
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

    // IMPORTANTE:
    // tus tarjetas deben tener .match-card[data-local]
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
          target.innerHTML = `<span class="weather-pill muted">Sin meteo</span>`;
        } else {
          target.innerHTML = `
            <span class="weather-pill weather-${cat.label.toLowerCase()}">
              ${cat.icon} ${cat.label} · ${city} (hoy)
            </span>
          `;
        }
      } catch (e) {
        target.innerHTML = `<span class="weather-pill muted">Sin meteo</span>`;
      }
    }
  }

  // Llamada final (después del render)
  enrichMatchesWithTodayWeather();

})();
