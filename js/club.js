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

  const norm = s => String(s||'').toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "").trim();

  const slug = s => norm(s).replace(/\s+/g, "-");

  const logoPath = (team) => `img/${slug(team)}.png`;

  document.getElementById("club-title").textContent = CLUB;
  document.getElementById("club-name").textContent  = CLUB;
  document.getElementById("club-banner-logo").src  = logoPath(CLUB);

  // --------------------------
  // Datos
  // --------------------------

  const resultados = await loadJSON("data/resultados.json").catch(() => []);
  const statsIndex = await loadJSON("data/partidos_stats.json").catch(()=>({}));

  // --------------------------
  // Obtener todos los partidos del equipo
  // --------------------------

  let partidosClub = [];

  for (const j of resultados) {
    for (const p of (j.partidos || [])) {
      if (p.local === CLUB || p.visitante === CLUB) {
        partidosClub.push({
          ...p,
          jornada: j.numero
        });
      }
    }
  }

  // --------------------------
  // Próximo partido (primero con goles null)
  // --------------------------

  const nextMatch = partidosClub.find(p =>
    p.goles_local == null || p.goles_visitante == null
  );

  // --------------------------
  // Último partido jugado
  // --------------------------

  const lastMatch = [...partidosClub].reverse().find(p =>
    p.goles_local != null && p.goles_visitante != null
  );

  // --------------------------
  // Crear mini clasificación (9 equipos centrando al club)
  // --------------------------

  function calcularClasificacion() {
    // igual que en clasificación.js pero más rápido/simplificado
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
        const L = p.local, V = p.visitante;
        if (!L || !V) continue;

        const gl = Number.isFinite(p.goles_local) ? p.goles_local : null;
        const gv = Number.isFinite(p.goles_visitante) ? p.goles_visitante : null;
        if (gl==null || gv==null) continue;

        const tL = getT(L);
        const tV = getT(V);

        tL.pj++; tV.pj++;
        tL.gf+=gl; tL.gc+=gv;
        tV.gf+=gv; tV.gc+=gl;

        if (gl>gv) { tL.g++; tL.pts+=3; tV.p++; }
        else if (gl<gv){ tV.g++; tV.pts+=3; tL.p++; }
        else { tL.e++; tV.e++; tL.pts++; tV.pts++; }
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
  const idxClub = fullClasif.findIndex(t=> t.nombre===CLUB);

  let mini = [];

  if (idxClub === -1) {
    mini = fullClasif.slice(0,9);
  } else {
    mini = fullClasif.slice(Math.max(0, idxClub-4), idxClub+5);
  }

  // --------------------------
  // Top scorer del club
  // --------------------------

  function topScorer() {
    const golesPorJugador = {}; // jugador → { goles, foto? }

    for (const matchId of Object.keys(statsIndex)) {
      const porEq = statsIndex[matchId];
      if (!porEq) continue;

      const equipoStats = porEq[CLUB];
      if (!equipoStats) continue;

      if (equipoStats.goleadores) {
        for (const j of equipoStats.goleadores) {
          if (!golesPorJugador[j]) golesPorJugador[j] = 0;
          golesPorJugador[j]++;
        }
      }
    }

    const arr = Object.entries(golesPorJugador)
      .map(([jug, g]) => ({jug, goles:g}))
      .sort((a,b)=>b.goles-a.goles);

    return arr[0] || null;
  }

  const goleador = topScorer();

  // --------------------------
  // TAB: RESUMEN
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
        <div class="club-date">${nextMatch.fecha || ""} ${nextMatch.hora || ""}</div>
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
        <thead>
          <tr><th>#</th><th>Equipo</th><th>Pts</th></tr>
        </thead>
        <tbody>
          ${mini.map((t,i)=>`
            <tr class="${t.nombre===CLUB ? "club-highlight" : ""}">
              <td>${fullClasif.findIndex(x=>x.nombre===t.nombre)+1}</td>
              <td>${t.nombre}</td>
              <td>${t.pts}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;

  const formacionHTML = `
    <div class="club-box">
      <h3>Formación</h3>
      <img class="club-formacion" src="img/formacion/${slug(CLUB)}.png" 
           onerror="this.style.display='none'">
    </div>
  `;

  const goleadorHTML = goleador ? `
    <div class="club-box">
      <h3>Máximo goleador</h3>
      <div class="club-player">
        <img class="club-player-photo" 
             src="img/jugadores/${slug(goleador.jug)}.jpg" 
             onerror="this.style.opacity='0'">
        <div class="club-player-info">
          <strong>${goleador.jug}</strong>
          <span>${goleador.goles} goles</span>
        </div>
      </div>
    </div>
  ` : `
    <div class="club-box"><h3>Máximo goleador</h3><p>Sin datos.</p></div>
  `;

  tabResumen.innerHTML = `
    <div class="club-grid">
      ${nextHTML}
      ${lastHTML}
      ${miniClasifHTML}
      ${formacionHTML}
      ${goleadorHTML}
    </div>
  `;

  // --------------------------
  // TAB: PLANTILLA
  // --------------------------
  document.getElementById("tab-plantilla").innerHTML = `
    <p style="color:var(--muted)">Aquí mostrará plantilla del equipo (puedo ayudarte si defines el JSON).</p>
  `;

  // --------------------------
  // TAB: STATS
  // --------------------------
  document.getElementById("tab-stats").innerHTML = `
    <p style="color:var(--muted)">Aquí saldrán estadísticas agregadas del equipo.</p>
  `;

  // --------------------------
  // TAB: VIDEOS
  // --------------------------
  document.getElementById("tab-videos").innerHTML = `
    <p style="color:var(--muted)">Integraremos vídeos de YouTube automáticamente con tags.</p>
  `;

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
