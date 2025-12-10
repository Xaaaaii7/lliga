
import {
  isNum,
  normalizeText as norm,
  slugify as slug,
  logoPath
} from './modules/utils.js';

import {
  loadPlantillaFromDb,
  resolvePlaylistIdForClub,
  fetchPlaylistItemsRSS
} from './modules/club-data.js';

(async () => {
  // --------------------------
  // CLUB target
  // --------------------------
  const CLUB = window.CLUB_NAME;
  if (!CLUB) {
    document.getElementById("club-root").innerHTML =
      "<p style='color:var(--muted)'>Equipo no especificado.</p>";
    return;
  }

  // Helpers locales derivados de módulos (para compatibilidad de uso en el código)
  const formationPath = (team) => `img/formacion/${slug(team)}.png`;
  const playerPhotoPath = (nombre) => `img/jugadores/${slug(nombre)}.jpg`;

  // --------------------------
  // HERO
  // --------------------------
  document.getElementById("club-title").textContent = CLUB;
  document.getElementById("club-name").textContent = CLUB;

  const bannerLogo = document.getElementById("club-banner-logo");
  bannerLogo.src = logoPath(CLUB);
  bannerLogo.onerror = () => bannerLogo.style.visibility = "hidden";

  // --------------------------
  // Datos base (core cache)
  // Utilizamos window.CoreStats por ahora ya que no está modularizado
  // --------------------------
  const CoreStats = window.CoreStats || {
    getResultados: async () => [],
    getStatsIndex: async () => ({}),
    computeClasificacion: async () => [],
    getPichichiRows: async () => [],
    computePichichiPlayers: () => [],
    computeRankingsPorEquipo: async () => ({}),
    computeTeamTotals: async () => []
  };

  const resultados = await CoreStats.getResultados();
  await CoreStats.getStatsIndex(); // Ensure index is loaded if needed internally

  resultados.sort((a, b) => (a.numero || 0) - (b.numero || 0));

  // --------------------------
  // Partidos del club (cronológicos)
  // --------------------------
  const partidosClub = [];
  for (const j of resultados) {
    for (const p of (j.partidos || [])) {
      if (p.local === CLUB || p.visitante === CLUB) {
        partidosClub.push({
          ...p,
          jornada: j.numero,
          fecha_jornada: j.fecha
        });
      }
    }
  }

  // --------------------------
  // Próximo partido / último partido
  // --------------------------
  const nextMatch = partidosClub.find(p =>
    p.goles_local == null || p.goles_visitante == null
  );

  const lastMatch = [...partidosClub].reverse().find(p =>
    isNum(p.goles_local) && isNum(p.goles_visitante)
  );

  // --------------------------
  // TEAM FORM (últimos 3 jugados)
  // --------------------------
  const playedMatches = partidosClub.filter(p =>
    isNum(p.goles_local) && isNum(p.goles_visitante)
  );

  const last3 = playedMatches.slice(-3);

  const formResults = last3.map(p => {
    const clubIsLocal = norm(p.local) === norm(CLUB);
    const gl = p.goles_local, gv = p.goles_visitante;

    if (gl === gv) return "D";
    const clubWon = clubIsLocal ? (gl > gv) : (gv > gl);
    return clubWon ? "W" : "L";
  });

  const countW = formResults.filter(r => r === "W").length;
  const countD = formResults.filter(r => r === "D").length;
  const countL = formResults.filter(r => r === "L").length;

  const formRating = (() => {
    if (formResults.length < 3) return "NO DATA";
    if (countW === 3) return "🔥 ON FIRE";
    if (countW === 2) return "🟩 STRONG";
    if (countW === 1 && countL === 0) return "🟨 SOLID";
    if (countD === 3) return "⚪ STEADY";
    if (countW === 0 && countL === 1) return "🟧 SHAKY";
    if (countL === 2) return "🟥 BAD MOMENT";
    if (countL === 3) return "❄️ COLD";
    return "🟨 SOLID";
  })();

  const formHTML = (formResults.length)
    ? `
      <div class="club-form-row">
        ${formResults.map(r => `
          <span class="form-pill form-${r.toLowerCase()}">${r}</span>
        `).join("")}
      </div>
      <div class="club-form-rating">${formRating}</div>
    `
    : `<p class="muted">Aún no hay 3 partidos jugados.</p>`;

  const teamFormBox = `
    <div class="club-box">
      <h3>Team Form</h3>
      ${formHTML}
    </div>
  `;

  // --------------------------
  // Clasificación desde CoreStats (con H2H)
  // --------------------------
  const fullClasif = await CoreStats.computeClasificacion(null, { useH2H: true });
  const idxClub = fullClasif.findIndex(t => norm(t.nombre) === norm(CLUB));

  const clubRow = fullClasif.find(t => norm(t.nombre) === norm(CLUB));
  const clubPos = (idxClub >= 0) ? idxClub + 1 : "—";

  const bannerStatsHTML = clubRow ? `
    <div class="club-banner-stats">
      <div class="club-stat"><span class="label">Pos</span><span class="value">${clubPos}</span></div>
      <div class="club-stat"><span class="label">PJ</span><span class="value">${clubRow.pj}</span></div>
      <div class="club-stat"><span class="label">G</span><span class="value">${clubRow.g}</span></div>
      <div class="club-stat"><span class="label">E</span><span class="value">${clubRow.e}</span></div>
      <div class="club-stat"><span class="label">P</span><span class="value">${clubRow.p}</span></div>
      <div class="club-stat"><span class="label">GF</span><span class="value">${clubRow.gf}</span></div>
      <div class="club-stat"><span class="label">GC</span><span class="value">${clubRow.gc}</span></div>
      <div class="club-stat"><span class="label">Pts</span><span class="value">${clubRow.pts}</span></div>
    </div>
  ` : `<p class="club-banner-stats muted">Sin datos aún.</p>`;

  const descEl = document.getElementById("club-description");
  if (descEl) descEl.innerHTML = bannerStatsHTML;

  let mini = [];
  if (idxClub === -1) mini = fullClasif.slice(0, 9);
  else mini = fullClasif.slice(Math.max(0, idxClub - 4), idxClub + 5);

  // --------------------------
  // Máximo goleador del club desde TSV (CoreStats)
  // --------------------------
  let goleador = null;
  try {
    const rows = await CoreStats.getPichichiRows();
    const data = CoreStats.computePichichiPlayers(rows);
    const jugadoresClub = data.filter(x => norm(x.equipo) === norm(CLUB));
    goleador = jugadoresClub[0] || null;
  } catch (e) {
    console.warn("No se pudo cargar pichichi TSV para club:", e);
  }

  // --------------------------
  // TAB RESUMEN render
  // --------------------------
  const tabResumen = document.getElementById("tab-resumen");

  const nextHTML = nextMatch ? `
    <div class="club-box">
      <h3>Próximo partido</h3>
      <div class="club-match">
        <img src="${logoPath(nextMatch.local)}" class="club-mini-logo" onerror="this.style.visibility='hidden'">
        <strong>${nextMatch.local}</strong>
        <span>vs</span>
        <strong>${nextMatch.visitante}</strong>
        <img src="${logoPath(nextMatch.visitante)}" class="club-mini-logo" onerror="this.style.visibility='hidden'">
        <div class="club-date">${nextMatch.fecha || nextMatch.fecha_jornada || ""} ${nextMatch.hora || ""}</div>
      </div>
    </div>
  ` : `
    <div class="club-box"><h3>Próximo partido</h3><p>No hay partidos pendientes.</p></div>
  `;

  const lastHTML = lastMatch ? `
    <div class="club-box">
      <h3>Último partido</h3>
      <div class="club-match">
        <img src="${logoPath(lastMatch.local)}" class="club-mini-logo" onerror="this.style.visibility='hidden'">
        <strong>${lastMatch.local}</strong>
        <span>${lastMatch.goles_local} - ${lastMatch.goles_visitante}</span>
        <strong>${lastMatch.visitante}</strong>
        <img src="${logoPath(lastMatch.visitante)}" class="club-mini-logo" onerror="this.style.visibility='hidden'">
      </div>
    </div>
  ` : `
    <div class="club-box"><h3>Último partido</h3><p>No hay partidos jugados.</p></div>
  `;

  const miniClasifHTML = `
    <div class="club-box">
      <h3>Clasificación</h3>
      <table class="club-mini-table">
        <thead><tr><th>#</th><th>Equipo</th><th>Pts</th></tr></thead>
        <tbody>
          ${mini.map(t => {
    const pos = fullClasif.findIndex(x => norm(x.nombre) === norm(t.nombre)) + 1;
    return `
              <tr class="${norm(t.nombre) === norm(CLUB) ? "club-highlight" : ""}">
                <td>${pos}</td><td>${t.nombre}</td><td>${t.pts}</td>
              </tr>
            `;
  }).join("")}
        </tbody>
      </table>
    </div>
  `;

  const formacionHTML = `
    <div class="club-box">
      <h3>Formación</h3>
      <img class="club-formacion"
           src="${formationPath(CLUB)}"
           alt="Formación ${CLUB}"
           onerror="this.style.display='none'">
    </div>
  `;

  const goleadorHTML = goleador ? `
    <div class="club-box">
      <h3>Máximo goleador</h3>
      <div class="club-player">
        <img class="club-player-photo"
             src="${playerPhotoPath(goleador.jugador)}"
             alt="${goleador.jugador}"
             onerror="this.style.visibility='hidden'">
        <div class="club-player-info">
          <strong>${goleador.jugador}</strong>
          <span>${goleador.goles} goles</span>
          <small class="muted">${goleador.pj} PJ</small>
        </div>
      </div>
    </div>
  ` : `
    <div class="club-box"><h3>Máximo goleador</h3><p>Sin datos en pichichi.</p></div>
  `;

  tabResumen.innerHTML = `
    <div class="club-grid">
      ${nextHTML}
      ${lastHTML}
      ${teamFormBox}
      ${miniClasifHTML}
      ${formacionHTML}
      ${goleadorHTML}
    </div>
  `;

  // --------------------------
  // TAB PLANTILLA (Supabase)
  // --------------------------
  const plantillaEl = document.getElementById("tab-plantilla");

  const calcAge = (dob) => {
    if (!dob) return null;
    const d = new Date(dob);
    if (isNaN(d)) return null;
    const now = new Date();
    let age = now.getFullYear() - d.getFullYear();
    const m = now.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
    return age;
  };

  const posGroup = (pos) => {
    const p = (pos || "").toLowerCase();
    if (p.includes("goalkeeper") || p.includes("portero")) return "Porteros";
    if (p.includes("defence") || p.includes("back") || p.includes("centre-back") || p.includes("defensa")) return "Defensas";
    if (p.includes("midfield") || p.includes("medio") || p.includes("mid")) return "Centrocampistas";
    if (p.includes("offence") || p.includes("forward") || p.includes("wing") || p.includes("striker") || p.includes("delantero")) return "Delanteros";
    return "Otros";
  };

  const renderPlantilla = (teamData) => {
    const coachName =
      teamData?.coach?.name ||
      [teamData?.coach?.firstName, teamData?.coach?.lastName].filter(Boolean).join(" ");

    const squad = Array.isArray(teamData?.squad) ? teamData.squad : [];
    if (!squad.length) {
      plantillaEl.innerHTML = `
        <div class="club-box" style="grid-column:span 12">
          <h3>Plantilla</h3>
          <p class="muted">No hay jugadores configurados para este club.</p>
        </div>`;
      return;
    }

    const groups = {};
    for (const pl of squad) {
      const g = posGroup(pl.position);
      (groups[g] ||= []).push(pl);
    }

    Object.values(groups).forEach(arr =>
      arr.sort((a, b) =>
        String(a.position || "").localeCompare(String(b.position || ""), "es", { sensitivity: "base" }) ||
        String(a.name || "").localeCompare(String(b.name || ""), "es", { sensitivity: "base" })
      )
    );

    const groupOrder = ["Porteros", "Defensas", "Centrocampistas", "Delanteros", "Otros"];

    plantillaEl.innerHTML = `
      <div class="club-box club-plantilla-head" style="grid-column:span 12">
        <div class="club-plantilla-title">
          <h3>Plantilla</h3>
          ${coachName ? `<div class="coach-line">Entrenador: <strong>${coachName}</strong></div>` : ""}
        </div>
        <div class="squad-meta muted">${squad.length} jugadores</div>
      </div>

      ${groupOrder.filter(k => groups[k]?.length).map(k => {
      const players = groups[k];
      return `
          <div class="club-box club-plantilla-group" style="grid-column:span 12">
            <h4 class="plantilla-group-title">${k} <span class="muted">(${players.length})</span></h4>
            <div class="plantilla-grid">
              ${players.map(pl => {
        const age = calcAge(pl.dateOfBirth || pl.date_of_birth);
        return `
                  <div class="plantilla-card">
                    <div class="plantilla-card-top">
                      <div class="plantilla-name">${pl.name || "—"}</div>
                      <div class="plantilla-pos muted">${pl.position || ""}</div>
                    </div>
                    <div class="plantilla-card-meta">
                      ${pl.nationality ? `<span class="pill">${pl.nationality}</span>` : ""}
                      ${age != null ? `<span class="pill">${age} años</span>` : ""}
                    </div>
                  </div>
                `;
      }).join("")}
            </div>
          </div>
        `;
    }).join("")}
    `;
  };

  async function loadAndRenderPlantilla() {
    try {
      let teamData = null;

      try {
        const plantillaDb = await loadPlantillaFromDb(CLUB);
        if (plantillaDb && Array.isArray(plantillaDb.squad) && plantillaDb.squad.length) {
          teamData = {
            coach: null,              // ahora mismo no lo tenemos en BD
            squad: plantillaDb.squad  // misma estructura que antes usa renderPlantilla
          };
        }
      } catch (e) {
        console.warn("Error cargando plantilla desde Supabase:", e);
      }

      if (!teamData) {
        plantillaEl.innerHTML = `
          <div class="club-box" style="grid-column:span 12">
            <h3>Plantilla</h3>
            <p class="muted">
              No hay datos de plantilla en base de datos.
            </p>
          </div>`;
        return;
      }

      renderPlantilla(teamData);
    } catch (e) {
      console.error("Error cargando plantilla:", e);
      plantillaEl.innerHTML = `
        <div class="club-box" style="grid-column:span 12">
          <h3>Plantilla</h3>
          <p class="muted">Error cargando la plantilla.</p>
        </div>`;
    }
  }

  // Ejecutar carga de plantilla
  loadAndRenderPlantilla();


  // --------------------------
  // TAB STATS (usa CoreStats.computeRankingsPorEquipo)
  // --------------------------
  const tabStats = document.getElementById("tab-stats");

  try {
    const adv = await CoreStats.computeRankingsPorEquipo();
    const totals = await CoreStats.computeTeamTotals();

    const {
      raw = [],
      posMed,
      fair,
      passAcc,
      precisionTiro,
      conversionGol,
      combinedShot,
      efectRival,
      posesionTop = [],
      fairTop = [],
      passTop = [],
      shotTop = [],
      efectTop = []
    } = adv || {};

    const teamAdv = raw.find(t => norm(t.nombre) === norm(CLUB));
    const teamTot = totals.find(t => norm(t.nombre) === norm(CLUB)) || clubRow;

    if (!teamAdv || !teamTot) {
      tabStats.innerHTML = `
        <div class="club-box" style="grid-column:span 12">
          <h3>Estadísticas</h3>
          <p class="muted">No hay estadísticas agregadas para este club todavía.</p>
        </div>`;
    } else {
      const totalTeams = raw.length || fullClasif.length || 0;

      const fmtPct = v =>
        Number.isFinite(v) ? (v * 100).toFixed(1) + "%" : "—";
      const fmtNum = v =>
        Number.isFinite(v) ? v.toFixed(2) : "—";

      const rankOf = (arr) => {
        const idx = arr.findIndex(t => norm(t.nombre) === norm(CLUB));
        return idx >= 0 ? idx + 1 : null;
      };

      const posesionMedia = posMed(teamAdv);
      const pasesTotales = teamAdv.pases;
      const pasesComp = teamAdv.completados;
      const accPase = passAcc(teamAdv);
      const tirosTotales = teamAdv.tiros;
      const tirosPuerta = teamAdv.taPuerta;
      const golesTotales = teamAdv.goles;
      const precTiro = precisionTiro(teamAdv);
      const convGol = conversionGol(teamAdv);
      const combShot = combinedShot(teamAdv);
      const fairScore = fair(teamAdv);
      const efectDef = efectRival(teamAdv); // goles encajados / tiros a puerta rival

      const posRank = rankOf(posesionTop);
      const passRank = rankOf(passTop);
      const shotRank = rankOf(shotTop);
      const fairRank = rankOf(fairTop);
      const efectRank = rankOf(efectTop);

      tabStats.innerHTML = `
        <div class="club-grid club-stats-grid">
          <div class="club-box">
            <h3>Perfil general</h3>
            <p class="muted">Datos agregados de todos los partidos con estadísticas.</p>
            <ul class="kv kv-compact">
              <li><span>Partidos analizados</span><span>${teamAdv.pj}</span></li>
              <li><span>Goles a favor</span><span>${teamTot.gf}</span></li>
              <li><span>Goles en contra</span><span>${teamTot.gc}</span></li>
              <li><span>Diferencia de goles</span><span>${teamTot.gf - teamTot.gc}</span></li>
            </ul>
          </div>

          <div class="club-box">
            <h3>Posesión media</h3>
            <div class="stat-main">${fmtPct(posesionMedia)}</div>
            <p class="muted">
              ${posRank
          ? `Puesto ${posRank} de ${totalTeams} en posesión media.`
          : `Sin ranking disponible.`}
            </p>
          </div>

          <div class="club-box">
            <h3>Juego de pase</h3>
            <ul class="kv kv-compact">
              <li><span>Pases totales</span><span>${pasesTotales}</span></li>
              <li><span>Pases completados</span><span>${pasesComp}</span></li>
              <li><span>Precisión de pase</span><span>${fmtPct(accPase)}</span></li>
            </ul>
            <p class="muted">
              ${passRank
          ? `Puesto ${passRank} de ${totalTeams} en precisión de pase.`
          : `Sin ranking disponible.`}
            </p>
          </div>

          <div class="club-box">
            <h3>Peligro ofensivo</h3>
            <ul class="kv kv-compact">
              <li><span>Tiros totales</span><span>${tirosTotales}</span></li>
              <li><span>Tiros a puerta</span><span>${tirosPuerta}</span></li>
              <li><span>Goles</span><span>${golesTotales}</span></li>
              <li><span>Precisión de tiro</span><span>${fmtPct(precTiro)}</span></li>
              <li><span>Conversión a gol</span><span>${fmtPct(convGol)}</span></li>
              <li><span>Índice combinado</span><span>${fmtPct(combShot)}</span></li>
            </ul>
            <p class="muted">
              ${shotRank
          ? `Puesto ${shotRank} de ${totalTeams} en calidad de tiro.`
          : `Sin ranking disponible.`}
            </p>
          </div>

          <div class="club-box">
            <h3>Fair play</h3>
            <ul class="kv kv-compact">
              <li><span>Entradas</span><span>${teamAdv.entradas}</span></li>
              <li><span>Faltas</span><span>${teamAdv.faltas}</span></li>
              <li><span>Rojas</span><span>${teamAdv.rojas}</span></li>
              <li><span>Índice fair play</span><span>${fmtNum(fairScore)}</span></li>
            </ul>
            <p class="muted">
              ${fairRank
          ? `Puesto ${fairRank} de ${totalTeams} en fair play (más alto = mejor).`
          : `Sin ranking disponible.`}
            </p>
          </div>

          <div class="club-box">
            <h3>Eficacia defensiva</h3>
            <ul class="kv kv-compact">
              <li><span>Goles encajados</span><span>${teamAdv.golesEncajados}</span></li>
              <li><span>Tiros a puerta rival</span><span>${teamAdv.tirosRival}</span></li>
              <li><span>Goles / tiro rival</span><span>${fmtPct(efectDef)}</span></li>
            </ul>
            <p class="muted">
              ${efectRank
          ? `Puesto ${efectRank} de ${totalTeams} en solidez defensiva (más bajo = mejor).`
          : `Sin ranking disponible.`}
            </p>
          </div>
        </div>
      `;
    }
  } catch (e) {
    console.error("Error generando estadísticas de club:", e);
    tabStats.innerHTML =
      `<div class="club-box" style="grid-column:span 12">
         <h3>Estadísticas</h3>
         <p class="muted">No se pudieron calcular las estadísticas del club.</p>
       </div>`;
  }

  // --------------------------
  // TAB VIDEOS (playlist desde Supabase.users)
  // --------------------------
  const videosMsgEl = document.getElementById("videos-msg");
  const playlistEl = document.getElementById("playlist-embed");

  const setVideosMsg = (t) => { if (videosMsgEl) videosMsgEl.textContent = t || ""; };

  function renderVideosUI({ playlistId, items }) {
    if (!playlistEl) return;

    if (!items.length) {
      playlistEl.innerHTML = "";
      setVideosMsg("La playlist está vacía o no se pudieron leer los vídeos.");
      return;
    }

    const first = items[0];

    const playerHtml = `
      <div class="video-frame">
        <iframe
          id="club-playlist-player"
          class="video"
          src="https://www.youtube.com/embed/${first.videoId}?list=${playlistId}&playsinline=1"
          allowfullscreen
          loading="lazy"
          referrerpolicy="no-referrer-when-downgrade">
        </iframe>
      </div>
    `;

    const listHtml = `
      <div class="playlist-list">
        ${items.map((v, i) => `
          <button
            class="playlist-item ${i === 0 ? "active" : ""}"
            data-video-id="${v.videoId}">
            <img class="playlist-thumb" src="${v.thumb}" alt="">
            <div class="playlist-meta">
              <div class="playlist-title">${v.title}</div>
              <div class="playlist-sub muted">Vídeo ${i + 1}</div>
            </div>
          </button>
        `).join("")}
      </div>
    `;

    playlistEl.innerHTML = playerHtml + listHtml;

    const player = document.getElementById("club-playlist-player");
    const buttons = playlistEl.querySelectorAll(".playlist-item");

    buttons.forEach(btn => {
      btn.addEventListener("click", () => {
        const vid = btn.dataset.videoId;
        if (!vid || !player) return;

        buttons.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");

        player.src = `https://www.youtube.com/embed/${vid}?list=${playlistId}&playsinline=1`;
        player.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    });

    setVideosMsg("");
  }

  async function renderPlaylist() {
    if (!playlistEl) return;

    // 1) Intentar Supabase
    const playlistId = await resolvePlaylistIdForClub(CLUB);
    if (!playlistId) {
      setVideosMsg("No hay playlist asociada a este club en la base de datos.");
      playlistEl.innerHTML = "";
      return;
    }

    // 2) Cargar videos RSS
    try {
      setVideosMsg("Cargando vídeos...");
      const items = await fetchPlaylistItemsRSS(playlistId);
      renderVideosUI({ playlistId, items });
    } catch (e) {
      console.warn("Error leyendo RSS playlist:", e);
      setVideosMsg("No se pudieron cargar los vídeos (error RSS).");
      playlistEl.innerHTML = "";
    }
  }

  // Cargar playlist
  renderPlaylist();

  // --------------------------
  // Tabs click
  // --------------------------
  document.querySelectorAll(".tabs button").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tabs button").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      const t = btn.dataset.tab;
      document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
      document.getElementById("tab-" + t).classList.add("active");

      // Cargar playlist explícitamente si se hace click en videos, aunque ya se carga al inicio
      if (t === "videos" && playlistEl && !playlistEl.innerHTML) {
        renderPlaylist();
      }
    });
  });

})();
