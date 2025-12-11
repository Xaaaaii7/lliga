import { queryTable, withErrorHandling } from '../modules/db-helpers.js';

const API_URL = "https://d39ra5ecf4.execute-api.eu-west-1.amazonaws.com/prod/live-channel";
const PARENT_DOMAIN = "xaaaaii7.github.io";

let CHANNEL_TEAM_MAP = {};

// CARGAR MAPPING CANAL → EQUIPO DESDE SUPABASE
async function loadChannelTeamMap() {
  const data = await withErrorHandling(
    () => queryTable('league_teams', `
      display_name,
      nickname,
      user:users!user_id(twitch_channel)
    `, { 
      useSeason: false,
      autoCompetitionId: false // Los directos pueden ser de cualquier competición
    }),
    {
      errorMessage: "Error cargando mapa de canales desde DB",
      fallback: null
    }
  );

  if (!data) {
    CHANNEL_TEAM_MAP = {};
    return;
  }

  const normalized = {};
  data.forEach(row => {
    const list = Array.isArray(row.user) ? row.user : [row.user];
    const user = list[0]; // La relación es 1:1 habitualmente

    if (user && user.twitch_channel) {
      const ch = String(user.twitch_channel).toLowerCase().trim();
      // Prioridad: display_name (equipo) > nickname (manager)
      const teamName = row.display_name || row.nickname;
      if (ch && teamName) {
        normalized[ch] = teamName;
      }
    }
  });

  CHANNEL_TEAM_MAP = normalized;
}

(async () => {
  const root = document.getElementById("stream-container");
  if (!root) return;

  // =========================
  //   Cargamos resultados
  // =========================
  const jornadasRes = await loadJSON("data/resultados.json").catch(() => null);

  // ==== helpers de nombres / escudos ====
  const { normalizeText, slugify, logoPath } = window.AppUtils || {};
  const norm = normalizeText || (s => String(s || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim());

  const slug = slugify || (s => norm(s).replace(/\s+/g, "-"));
  const logoFor = logoPath || (eq => eq ? `img/${slug(eq)}.png` : null);

  // =========================
  //   Layout base
  // =========================
  root.innerHTML = `
    <div class="stream-layout">
      <div class="stream-main">
        <h2>Directo de la lliga</h2>
        <p id="directo-loading" class="directo-status">Cargando directos...</p>
        <div id="main-stream"></div>
        <div id="main-stream-match"></div>
        <p id="main-stream-status" class="directo-status"></p>
      </div>
      <aside class="stream-list" id="streams-list-wrapper" hidden>
        <h3>Otros canales en directo</h3>
        <div id="streams-list"></div>
      </aside>
    </div>
  `;

  const loadingEl = document.getElementById("directo-loading");
  const matchContainer = document.getElementById("main-stream-match");

  // =========================
  //   API: canales en directo
  // =========================
  async function fetchLiveChannels() {
    try {
      const res = await fetch(API_URL, { cache: "no-store" });
      if (!res.ok) {
        console.error("Error al llamar a la API:", res.status);
        return [];
      }

      const data = await res.json();
      if (!data || !Array.isArray(data.channels)) return [];
      return data.channels;
    } catch (e) {
      console.error("Error de red/API:", e);
      return [];
    }
  }

  // =========================
  //   Buscar partido por equipo
  //   → primer partido sin resultado
  // =========================
  function findNextMatchForTeam(teamName) {
    if (!jornadasRes || !Array.isArray(jornadasRes)) return null;
    const targetNorm = norm(teamName);

    const jornadasOrdenadas = jornadasRes.slice().sort(
      (a, b) => (a.numero ?? a.jornada ?? 0) - (b.numero ?? b.jornada ?? 0)
    );

    for (const j of jornadasOrdenadas) {
      const jNum = j.numero ?? j.jornada ?? null;
      const jFecha = j.fecha;

      for (const p of (j.partidos || [])) {
        if (!p.local || !p.visitante) continue;

        if (norm(p.local) !== targetNorm && norm(p.visitante) !== targetNorm) continue;

        const glIsNum = typeof p.goles_local === "number" && Number.isFinite(p.goles_local);
        const gvIsNum = typeof p.goles_visitante === "number" && Number.isFinite(p.goles_visitante);

        // Partido sin resultado aún
        if (!glIsNum && !gvIsNum) {
          return {
            jNum,
            fecha: p.fecha || jFecha || null,
            hora: p.hora || null,
            local: p.local,
            visitante: p.visitante
          };
        }
      }
    }
    return null;
  }

  // =========================
  //   Render de bloque partido
  //   sensitivo a canal
  // =========================
  function renderMatchInfoForChannel(channel) {
    if (!matchContainer) return;
    matchContainer.innerHTML = "";

    if (!channel) return;

    const key = String(channel).toLowerCase();
    const teamName = CHANNEL_TEAM_MAP[key];
    if (!teamName) return;

    const match = findNextMatchForTeam(teamName);
    if (!match) return;

    const logoLocal = logoFor(match.local);
    const logoVisit = logoFor(match.visitante);

    const fechaTxt = match.fecha ? fmtDate(match.fecha) : "";
    const metaLine = (fechaTxt || match.hora)
      ? `${fechaTxt}${match.hora ? " · " + match.hora : ""}`
      : "";

    matchContainer.innerHTML = `
      <div class="directo-match-hero">
        <div class="directo-match-label">Próximo partido de este canal</div>
        <div class="directo-match-logos">
          <div class="directo-match-team">
            <div class="directo-match-logo-wrap">
              ${logoLocal ? `
                <img src="${logoLocal}" alt="Escudo ${match.local}"
                     onerror="this.style.visibility='hidden'">
              ` : ""}
            </div>
            <div class="directo-match-name">${match.local}</div>
          </div>
          <div class="directo-match-vs">VS</div>
          <div class="directo-match-team">
            <div class="directo-match-logo-wrap">
              ${logoVisit ? `
                <img src="${logoVisit}" alt="Escudo ${match.visitante}"
                     onerror="this.style.visibility='hidden'">
              ` : ""}
            </div>
            <div class="directo-match-name">${match.visitante}</div>
          </div>
        </div>
        ${metaLine || match.jNum ? `
          <div class="directo-match-meta">
            ${match.jNum ? `Jornada ${match.jNum}` : ""}${metaLine ? ` · ${metaLine}` : ""}
          </div>
        ` : ""}
      </div>
    `;
  }

  // =========================
  //   Player principal
  // =========================
  function setMainStream(channel) {
    const container = document.getElementById("main-stream");
    const statusEl = document.getElementById("main-stream-status");
    if (!container) return;

    if (!channel) {
      container.innerHTML = "";
      if (statusEl) {
        statusEl.textContent = "Ahora mismo no hay ningún canal en directo.";
      }
      renderMatchInfoForChannel(null);
      return;
    }

    container.innerHTML = `
      <div class="video-frame live-video-frame">
        <iframe
          class="video"
          src="https://player.twitch.tv/?channel=${encodeURIComponent(channel)}&parent=${encodeURIComponent(PARENT_DOMAIN)}"
          allowfullscreen
          loading="lazy"
          referrerpolicy="no-referrer-when-downgrade">
        </iframe>
      </div>
    `;

    if (statusEl) {
      statusEl.innerHTML = `
        <span class="chip chip-live">EN DIRECTO</span>
        Canal: ${channel}
      `;
    }

    renderMatchInfoForChannel(channel);
  }

  // =========================
  //   Lista lateral de canales
  // =========================
  function renderChannelsList(channels, currentChannel) {
    const listWrap = document.getElementById("streams-list");
    const aside = document.getElementById("streams-list-wrapper");
    if (!listWrap) return;

    if (!channels.length) {
      listWrap.innerHTML = "";
      if (aside) aside.hidden = true;
      return;
    }

    if (aside) aside.hidden = channels.length <= 1;

    listWrap.innerHTML = channels.map(ch => `
      <button
        class="stream-card ${ch === currentChannel ? "active" : ""}"
        data-channel="${ch}"
        type="button"
      >
        <div class="stream-card-name">${ch}</div>
        <div class="stream-card-tag">Cambiar a este directo</div>
      </button>
    `).join("");

    listWrap.querySelectorAll(".stream-card").forEach(btn => {
      btn.addEventListener("click", () => {
        const ch = btn.dataset.channel;
        if (!ch) return;
        setMainStream(ch);
        renderChannelsList(channels, ch);
      });
    });
  }

  // =========================
  //   Flujo principal
  // =========================

  // 1) Cargar mapping canal→equipo
  await loadChannelTeamMap();

  // 1a) Si no tenemos resultados, cargar para poder buscar próximo partido
  if (!jornadasRes || !jornadasRes.length) {
    if (window.CoreStats && typeof CoreStats.getResultados === 'function') {
      try {
        jornadasRes = await CoreStats.getResultados();
      } catch (e) {
        console.warn("No se pudieron cargar resultados desde CoreStats en directos.js", e);
      }
    }
  }

  // 2) Pedir canales en directo
  const liveChannels = await fetchLiveChannels();

  if (!liveChannels.length) {
    if (loadingEl) {
      loadingEl.innerHTML = `
        <span class="chip chip-ended">Sin directos ahora mismo</span><br>
        Ahora mismo ningún canal de la lliga está en directo 😴
      `;
    }
    setMainStream(null);
    renderChannelsList([], null);
    return;
  }

  if (loadingEl) loadingEl.remove();

  const mainChannel = liveChannels[0];
  setMainStream(mainChannel);
  renderChannelsList(liveChannels, mainChannel);
})();
