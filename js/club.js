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

  // --------------------------
  // Helpers desde CoreStats
  // --------------------------
  const isNum = CoreStats.isNum;
  const norm  = CoreStats.norm;
  const slug  = CoreStats.slug;

  const logoPath       = (team) => `img/${slug(team)}.png`;
  const formationPath  = (team) => `img/formacion/${slug(team)}.png`;
  const playerPhotoPath= (nombre) => `img/jugadores/${slug(nombre)}.jpg`;
  const plantillaPath  = (team) => `data/plantillas/${slug(team)}.json`;

  // --------------------------
  // HERO
  // --------------------------
  document.getElementById("club-title").textContent = CLUB;
  document.getElementById("club-name").textContent  = CLUB;

  const bannerLogo = document.getElementById("club-banner-logo");
  bannerLogo.src = logoPath(CLUB);
  bannerLogo.onerror = () => bannerLogo.style.visibility = "hidden";

  // --------------------------
  // Datos base (core cache)
  // --------------------------
  const resultados = await CoreStats.getResultados();  // ya viene normalizado y cacheado
  const statsIndex = await CoreStats.getStatsIndex();  // (ahora no se usa aquí, pero futuro tab stats)

  // Orden por jornada por si acaso
  resultados.sort((a,b)=> (a.numero||0) - (b.numero||0));

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

  const countW = formResults.filter(r => r==="W").length;
  const countD = formResults.filter(r => r==="D").length;
  const countL = formResults.filter(r => r==="L").length;

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
  const fullClasif = await CoreStats.computeClasificacion(null, { useH2H:true });
  const idxClub = fullClasif.findIndex(t => norm(t.nombre) === norm(CLUB));

  // ---- Stats banner ----
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

  // Mini tabla 9 equipos
  let mini = [];
  if (idxClub === -1) mini = fullClasif.slice(0,9);
  else mini = fullClasif.slice(Math.max(0, idxClub-4), idxClub+5);

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
          ${mini.map(t=>{
            const pos = fullClasif.findIndex(x=> norm(x.nombre)===norm(t.nombre)) + 1;
            return `
              <tr class="${norm(t.nombre)===norm(CLUB) ? "club-highlight" : ""}">
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
  // TAB PLANTILLA (JSON local)
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
          <p class="muted">No hay jugadores en el JSON de plantilla.</p>
        </div>`;
      return;
    }

    const groups = {};
    for (const pl of squad) {
      const g = posGroup(pl.position);
      (groups[g] ||= []).push(pl);
    }

    Object.values(groups).forEach(arr =>
      arr.sort((a,b)=>
        String(a.position||"").localeCompare(String(b.position||""), "es", {sensitivity:"base"}) ||
        String(a.name||"").localeCompare(String(b.name||""), "es", {sensitivity:"base"})
      )
    );

    const groupOrder = ["Porteros","Defensas","Centrocampistas","Delanteros","Otros"];

    plantillaEl.innerHTML = `
      <div class="club-box club-plantilla-head" style="grid-column:span 12">
        <div class="club-plantilla-title">
          <h3>Plantilla</h3>
          ${coachName ? `<div class="coach-line">Entrenador: <strong>${coachName}</strong></div>` : ""}
        </div>
        <div class="squad-meta muted">${squad.length} jugadores</div>
      </div>

      ${groupOrder.filter(k=>groups[k]?.length).map(k=>{
        const players = groups[k];
        return `
          <div class="club-box club-plantilla-group" style="grid-column:span 12">
            <h4 class="plantilla-group-title">${k} <span class="muted">(${players.length})</span></h4>
            <div class="plantilla-grid">
              ${players.map(pl=>{
                const age = calcAge(pl.dateOfBirth);
                return `
                  <div class="plantilla-card">
                    <div class="plantilla-card-top">
                      <div class="plantilla-name">${pl.name || "—"}</div>
                      <div class="plantilla-pos muted">${pl.position || ""}</div>
                    </div>
                    <div class="plantilla-card-meta">
                      ${pl.nationality ? `<span class="pill">${pl.nationality}</span>` : ""}
                      ${age!=null ? `<span class="pill">${age} años</span>` : ""}
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

  try {
    const teamData = await loadJSON(plantillaPath(CLUB)).catch(()=>null);

    if (!teamData) {
      plantillaEl.innerHTML = `
        <div class="club-box" style="grid-column:span 12">
          <h3>Plantilla</h3>
          <p class="muted">
            No se encontró <code>${plantillaPath(CLUB)}</code>.
            Revisa nombre o ruta del JSON.
          </p>
        </div>`;
    } else {
      renderPlantilla(teamData);
    }
  } catch (e) {
    console.error("Error cargando plantilla:", e);
    plantillaEl.innerHTML = `
      <div class="club-box" style="grid-column:span 12">
        <h3>Plantilla</h3>
        <p class="muted">Error cargando la plantilla.</p>
      </div>`;
  }

  // --------------------------
  // TAB STATS / VIDEOS placeholders
  // --------------------------
  document.getElementById("tab-stats").innerHTML =
    `<div class="club-box" style="grid-column:span 12">
       <h3>Estadísticas</h3>
       <p class="muted">Aquí conectaremos stats de equipo (desde CoreStats).</p>
     </div>`;

  document.getElementById("tab-videos").innerHTML =
    `<div class="club-box" style="grid-column:span 12">
       <h3>Vídeos</h3>
       <p class="muted">Aquí meteremos la playlist automática del club.</p>
     </div>`;

  // --------------------------
  // Tabs click
  // --------------------------
  document.querySelectorAll(".tabs button").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tabs button").forEach(b=>b.classList.remove("active"));
      btn.classList.add("active");

      const t = btn.dataset.tab;
      document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
      document.getElementById("tab-" + t).classList.add("active");
    });
  });
})();
