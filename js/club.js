(async () => {

  // --------------------------
  // Helpers
  // --------------------------

  const CLUB = window.CLUB_NAME;
  if (!CLUB) {
    document.getElementById("club-root").innerHTML =
      "<p style='color:var(--muted)'>Equipo no especificado.</p>";
    return;
  }

  const isNum = v => typeof v === "number" && Number.isFinite(v);

  const norm = s => String(s||'').toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "").trim();

  const slug = s => norm(s).replace(/\s+/g, "-");

  const logoPath = (team) => `img/${slug(team)}.png`;
  const formationPath = (team) => `img/formacion/${slug(team)}.png`;
  const playerPhotoPath = (nombre) => `img/jugadores/${slug(nombre)}.jpg`;

  // --------------------------
  // HERO
  // --------------------------
  document.getElementById("club-title").textContent = CLUB;
  document.getElementById("club-name").textContent  = CLUB;

  const bannerLogo = document.getElementById("club-banner-logo");
  bannerLogo.src = logoPath(CLUB);
  bannerLogo.onerror = ()=> bannerLogo.style.visibility = "hidden";

  // --------------------------
  // Datos base
  // --------------------------
  const resultados = await loadJSON("data/resultados.json").catch(() => []);
  const statsIndex = await loadJSON("data/partidos_stats.json").catch(()=>({}));

  // Aseguramos orden por jornada
  resultados.sort((a,b)=> (a.numero||0) - (b.numero||0));

  // --------------------------
  // Obtener todos los partidos del equipo
  // --------------------------
  let partidosClub = [];

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
  // Próximo partido (primero sin resultado)
  // --------------------------
  const nextMatch = partidosClub.find(p =>
    p.goles_local == null || p.goles_visitante == null
  );

  // --------------------------
  // Último partido jugado
  // --------------------------
  const lastMatch = [...partidosClub].reverse().find(p =>
    isNum(p.goles_local) && isNum(p.goles_visitante)
  );

  // --------------------------
  // TEAM FORM (últimos 3 jugados)
  // --------------------------
  const playedMatches = partidosClub.filter(p =>
    isNum(p.goles_local) && isNum(p.goles_visitante)
  );

  const last3 = playedMatches.slice(-3); // últimos 3 partidos jugados

  const formResults = last3.map(p => {
    const clubIsLocal = norm(p.local) === norm(CLUB);
    const gl = p.goles_local, gv = p.goles_visitante;

    if (gl === gv) return "D"; // draw

    const clubWon = clubIsLocal ? (gl > gv) : (gv > gl);
    return clubWon ? "W" : "L";
  });

  const countW = formResults.filter(r=>r==="W").length;
  const countD = formResults.filter(r=>r==="D").length;
  const countL = formResults.filter(r=>r==="L").length;

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

  // ✅ Definimos el box aquí (ANTES de usarlo)
  const teamFormBox = `
    <div class="club-box">
      <h3>Team Form</h3>
      ${formHTML}
    </div>
  `;

  // --------------------------
  // Mini clasificación (9 equipos centrando al club)
  // --------------------------
  function calcularClasificacion() {
    const teams = new Map();
    const getT = (name) => {
      const k = norm(name);
      if (!teams.has(k)) {
        teams.set(k, { nombre:name, pj:0, g:0, e:0, p:0, gf:0, gc:0, pts:0 });
      }
      return teams.get(k);
    };

    for (const j of resultados) {
      for (const p of (j.partidos||[])) {
        if (!p.local || !p.visitante) continue;
        const gl = isNum(p.goles_local) ? p.goles_local : null;
        const gv = isNum(p.goles_visitante) ? p.goles_visitante : null;
        if (gl==null || gv==null) continue;

        const L = getT(p.local);
        const V = getT(p.visitante);

        L.pj++; V.pj++;
        L.gf+=gl; L.gc+=gv;
        V.gf+=gv; V.gc+=gl;

        if (gl>gv) { L.g++; L.pts+=3; V.p++; }
        else if (gl<gv){ V.g++; V.pts+=3; L.p++; }
        else { L.e++; V.e++; L.pts++; V.pts++; }
      }
    }

    const arr = Array.from(teams.values());
    arr.sort((A,B)=>{
      if (B.pts !== A.pts) return B.pts - A.pts;
      const dgA = A.gf-A.gc, dgB = B.gf-B.gc;
      if (dgB !== dgA) return dgB - dgA;
      if (B.gf !== A.gf) return B.gf - A.gf;
      return A.nombre.localeCompare(B.nombre);
    });
    return arr;
  }

  const fullClasif = calcularClasificacion();
  const idxClub = fullClasif.findIndex(t=> norm(t.nombre) === norm(CLUB));

  // ---- Stats generales para banner ----
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

  // Pintar en el banner (debajo del nombre)
  const descEl = document.getElementById("club-description");
  if (descEl) descEl.innerHTML = bannerStatsHTML;

  let mini = [];
  if (idxClub === -1) mini = fullClasif.slice(0,9);
  else mini = fullClasif.slice(Math.max(0, idxClub-4), idxClub+5);

  // --------------------------
  // TOP SCORER desde Google Sheet TSV (igual que pichichi)
  // --------------------------
  const SHEET_TSV_URL =
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vSg3OTDxmqj6wcbH8N7CUcXVexk9ZahUURCgtSS9JXSEsFPG15rUchwvI2zRulRr0hHSmGZOo_TAXRL/pub?gid=0&single=true&output=tsv";

  function parseTSV(text) {
    const lines = text.replace(/\r/g,'').split('\n').filter(l => l.trim().length);
    if (!lines.length) return { headers: [], rows: [] };
    const headers = lines[0].split('\t').map(h => h.trim());
    const rows = lines.slice(1).map(line => {
      const cols = line.split('\t');
      const obj = {};
      headers.forEach((h, i) => obj[h] = (cols[i] ?? '').trim());
      return obj;
    });
    return { headers, rows };
  }

  const toNum = (v) => {
    if (v == null || v === "") return 0;
    const n = parseFloat(String(v).replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  };

  let goleador = null;

  try {
    const res = await fetch(SHEET_TSV_URL, { cache:"no-store" });
    if (res.ok) {
      const txt = await res.text();
      const { rows } = parseTSV(txt);

      const jugadoresClub = rows.map(r => ({
        jugador: r["Jugador"] || "",
        equipo:  r["Equipo"]  || "",
        pj:      toNum(r["Partidos"]),
        goles:   toNum(r["Goles"])
      }))
      .filter(x => x.jugador && x.equipo && norm(x.equipo) === norm(CLUB))
      .sort((a,b)=> b.goles - a.goles || a.jugador.localeCompare(b.jugador,"es",{sensitivity:"base"}));

      goleador = jugadoresClub[0] || null;
    }
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
        <img src="${logoPath(nextMatch.local)}" class="club-mini-logo">
        <strong>${nextMatch.local}</strong>
        <span>vs</span>
        <strong>${nextMatch.visitante}</strong>
        <img src="${logoPath(nextMatch.visitante)}" class="club-mini-logo">
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
        <img src="${logoPath(lastMatch.local)}" class="club-mini-logo">
        <strong>${lastMatch.local}</strong>
        <span>${lastMatch.goles_local} - ${lastMatch.goles_visitante}</span>
        <strong>${lastMatch.visitante}</strong>
        <img src="${logoPath(lastMatch.visitante)}" class="club-mini-logo">
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
  // TABs placeholder (de momento)
  // --------------------------
    // --------------------------
  // TAB PLANTILLA (desde data/plantillas/<equipo>.json)
  // --------------------------

  const plantillaEl = document.getElementById("tab-plantilla");

  // Ruta del JSON de plantilla del club
  const plantillaPath = (team) => `data/plantillas/${slug(team)}.json`;

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
    const coachName = teamData?.coach?.name || [teamData?.coach?.firstName, teamData?.coach?.lastName].filter(Boolean).join(" ");
    const squad = Array.isArray(teamData?.squad) ? teamData.squad : [];

    if (!squad.length) {
      plantillaEl.innerHTML = `
        <div class="club-box" style="grid-column:span 12">
          <h3>Plantilla</h3>
          <p class="muted">No hay jugadores en el JSON de plantilla.</p>
        </div>`;
      return;
    }

    // Agrupar por líneas
    const groups = {};
    for (const pl of squad) {
      const g = posGroup(pl.position);
      (groups[g] ||= []).push(pl);
    }

    // Orden interno por posición -> nombre
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

  document.getElementById("tab-stats").innerHTML =
    `<div class="club-box" style="grid-column:span 12">
       <h3>Estadísticas</h3>
       <p class="muted">Aquí conectaremos stats de equipo.</p>
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
