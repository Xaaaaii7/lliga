// js/index.js
(async () => {
  const CoreStats = window.CoreStats || {};
  const AppUtils = window.AppUtils || {};
  const {
    loadJSON,
    getSupabaseClient,
    getSupabaseConfig
  } = AppUtils;

  const isNum = CoreStats.isNum || (v => typeof v === 'number' && Number.isFinite(v));
  const slug = CoreStats.slug || (s => String(s || '').toLowerCase().replace(/\s+/g, '-'));

  // ==========================
  // HERO NOTICIAS DESTACADAS
  // ==========================
  async function renderHeroNews() {
    const hero = document.getElementById('home-hero-slider');
    if (!hero) return;

    if (typeof loadJSON !== 'function') {
      hero.innerHTML = '<p class="muted">No está configurado AppUtils.loadJSON.</p>';
      return;
    }

    const noticias = await loadJSON('data/noticias.json').catch(() => []);
    const lista = Array.isArray(noticias) ? noticias : [];

    // asumo que hay una propiedad "destacada" booleana
    let destacadas = lista.filter(n => n.destacada);
    if (!destacadas.length) destacadas = lista.slice(0, 5);
    if (!destacadas.length) {
      hero.innerHTML = '<p class="muted">No hay noticias destacadas todavía.</p>';
      return;
    }

    hero.innerHTML = destacadas.map((n, idx) => {
      const activo = idx === 0 ? ' is-active' : '';
      const img = n.imagen || n.image || '';
      const url = n.url || (n.slug ? `noticia_${n.slug}.html` : '#');
      const fecha = n.fecha || '';
      const titulo = n.titulo || n.title || 'Noticia';
      const subtitulo = n.subtitulo || n.subtitle || '';

      return `
        <article class="hero-slide${activo}" data-idx="${idx}">
          ${img ? `<div class="hero-slide-img" style="background-image:url('${img}')"></div>` : ''}
          <div class="hero-slide-content">
            <span class="hero-slide-date">${fecha}</span>
            <h3><a href="${url}">${titulo}</a></h3>
            ${subtitulo ? `<p>${subtitulo}</p>` : ''}
          </div>
        </article>
      `;
    }).join('');

    // rotación simple
    const slides = Array.from(hero.querySelectorAll('.hero-slide'));
    if (slides.length <= 1) return;

    let current = 0;
    setInterval(() => {
      slides[current].classList.remove('is-active');
      current = (current + 1) % slides.length;
      slides[current].classList.add('is-active');
    }, 8000);
  }

  // ==========================
  // CLASIFICACIÓN TOP 10
  // ==========================
  async function renderClasificacionTop10() {
    const box = document.querySelector('#home-table-top10 .box-body');
    if (!box) return;

    box.innerHTML = '<p class="muted">Cargando clasificación…</p>';

    try {
      const tabla = await CoreStats.computeClasificacion(null, { useH2H: true });
      const top10 = tabla.slice(0, 10);

      if (!top10.length) {
        box.innerHTML = '<p class="muted">No hay partidos todavía.</p>';
        return;
      }

      const rows = top10.map((t, idx) => `
        <tr>
          <td class="pos">${idx + 1}</td>
          <td class="team">
            <img src="img/${slug(t.nombre)}.png" alt="${t.nombre}" class="team-logo">
            <span>${t.nombre}</span>
          </td>
          <td class="pj">${t.pj}</td>
          <td class="pts">${t.pts}</td>
          <td class="dg">${(t.gf - t.gc)}</td>
        </tr>
      `).join('');

      box.innerHTML = `
        <table class="tabla tabla-compact">
          <thead>
            <tr>
              <th>#</th>
              <th>Equipo</th>
              <th>PJ</th>
              <th>Pts</th>
              <th>DG</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      `;
    } catch (e) {
      console.error('Error clasificación top10:', e);
      box.innerHTML = '<p class="muted">Error cargando la clasificación.</p>';
    }
  }

  // ==========================
  // TEAM OF THE MOMENT (3 equipos)
  // Basado en MVP por jornada:
  // - miramos todas las jornadas
  // - para cada equipo, cogemos sus últimas 3 apariciones
  // - ordenamos por media de mvpScore, y como desempate: más PJ en esos 3 partidos
  // ==========================
  async function computeTeamsFormTop(limit = 3) {
    const jornadas = await CoreStats.getResultados();
    if (!Array.isArray(jornadas) || !jornadas.length) return [];

    const porEquipo = new Map(); // nombre -> [{jornada, mvpScore, pj}]

    for (const j of jornadas) {
      const jNum = j.numero ?? j.jornada;
      if (!jNum) continue;

      const { teams } = await CoreStats.computeMvpPorJornada(jNum);
      for (const t of (teams || [])) {
        const arr = porEquipo.get(t.nombre) || [];
        arr.push({
          jornada: jNum,
          mvpScore: t.mvpScore || 0,
          pj: t.pj || 0
        });
        porEquipo.set(t.nombre, arr);
      }
    }

    const ranking = [];
    porEquipo.forEach((arr, name) => {
      if (!arr.length) return;
      arr.sort((a, b) => a.jornada - b.jornada);
      const last3 = arr.slice(-3);
      const n = last3.length;
      if (!n) return;

      const sumScore = last3.reduce((acc, x) => acc + (x.mvpScore || 0), 0);
      const pjTotal = last3.reduce((acc, x) => acc + (x.pj || 0), 0);
      const avgScore = sumScore / n;
      const lastJornada = last3[last3.length - 1].jornada;

      ranking.push({
        nombre: name,
        avgScore,
        pjTotal,
        lastJornada
      });
    });

    ranking.sort((a, b) =>
      (b.avgScore - a.avgScore) ||
      (b.pjTotal - a.pjTotal) ||
      (b.lastJornada - a.lastJornada) ||
      a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' })
    );

    return ranking.slice(0, limit);
  }

  async function renderTeamForm() {
    const box = document.querySelector('#home-team-form .box-body');
    if (!box) return;

    box.innerHTML = '<p class="muted">Calculando forma de los equipos…</p>';

    try {
      const top3 = await computeTeamsFormTop(3);
      if (!top3.length) {
        box.innerHTML = '<p class="muted">Aún no hay datos suficientes de forma.</p>';
        return;
      }

      const rows = top3.map((t, idx) => `
        <tr>
          <td class="pos">${idx + 1}</td>
          <td class="team">
            <img src="img/${slug(t.nombre)}.png" alt="${t.nombre}" class="team-logo">
            <span>${t.nombre}</span>
          </td>
          <td class="pj">PJ (últimos 3): ${t.pjTotal}</td>
          <td class="score">Media MVP: ${t.avgScore.toFixed(3)}</td>
        </tr>
      `).join('');

      box.innerHTML = `
        <table class="tabla tabla-compact">
          <tbody>
            ${rows}
          </tbody>
        </table>
        <p class="muted small">
          Basado en la puntuación MVP de las últimas 3 jornadas que ha disputado cada equipo
          (más partidos recientes jugados = mejor desempate).
        </p>
      `;
    } catch (e) {
      console.error('Error team form:', e);
      box.innerHTML = '<p class="muted">Error calculando el team form.</p>';
    }
  }

  // ==========================
  // MINI PICHICHI (TOP 6)
  // ==========================
  async function renderPichichiMini() {
    const box = document.querySelector('#home-pichichi-mini .box-body');
    if (!box) return;

    box.innerHTML = '<p class="muted">Cargando pichichi…</p>';

    try {
      const rows = await CoreStats.getPichichiRows();
      const full = CoreStats.computePichichiPlayers(rows);
      const top6 = full.slice(0, 6);

      if (!top6.length) {
        box.innerHTML = '<p class="muted">Todavía no hay goleadores registrados.</p>';
        return;
      }

      const trs = top6.map((p, idx) => `
        <tr>
          <td class="pos">${idx + 1}</td>
          <td class="jugador">
            <img src="img/jugadores/${slug(p.jugador)}.jpg" alt="${p.jugador}" class="player-photo">
            <div>
              <div class="player-name">${p.jugador}</div>
              <div class="player-team">${p.equipo}</div>
            </div>
          </td>
          <td class="pj">${p.pj}</td>
          <td class="goles">${p.goles}</td>
        </tr>
      `).join('');

      box.innerHTML = `
        <table class="tabla tabla-compact">
          <thead>
            <tr>
              <th>#</th>
              <th>Jugador</th>
              <th>PJ</th>
              <th>G</th>
            </tr>
          </thead>
          <tbody>
            ${trs}
          </tbody>
        </table>
      `;
    } catch (e) {
      console.error('Error pichichi mini:', e);
      box.innerHTML = '<p class="muted">Error cargando los goleadores.</p>';
    }
  }

  // ==========================
  // MVP JORNADA ACTUAL
  // ==========================
  async function renderMvpJornada() {
    const box = document.querySelector('#home-mvp-jornada .box-body');
    if (!box) return;

    box.innerHTML = '<p class="muted">Buscando última jornada disputada…</p>';

    try {
      const jornadas = await CoreStats.getResultados();
      if (!jornadas.length) {
        box.innerHTML = '<p class="muted">No hay jornadas todavía.</p>';
        return;
      }

      let lastJ = null;
      for (let i = jornadas.length - 1; i >= 0; i--) {
        const j = jornadas[i];
        const partidos = j.partidos || [];
        const hasPlayed = partidos.some(p =>
          isNum(p.goles_local) && isNum(p.goles_visitante)
        );
        if (hasPlayed) {
          lastJ = j;
          break;
        }
      }

      if (!lastJ) {
        box.innerHTML = '<p class="muted">Todavía no hay jornadas con partidos jugados.</p>';
        return;
      }

      const jNum = lastJ.numero ?? lastJ.jornada;
      const { winner, teams } = await CoreStats.computeMvpPorJornada(jNum);

      if (!winner) {
        box.innerHTML = `<p class="muted">No se pudo calcular el MVP de la jornada ${jNum}.</p>`;
        return;
      }

      const top3 = (teams || []).slice(0, 3);

      const rows = top3.map((t, idx) => `
        <tr>
          <td class="pos">${idx + 1}</td>
          <td class="team">
            <img src="img/${slug(t.nombre)}.png" alt="${t.nombre}" class="team-logo">
            <span>${t.nombre}</span>
          </td>
          <td class="score">${t.mvpScore.toFixed(3)}</td>
          <td class="pj">${t.pj} PJ</td>
        </tr>
      `).join('');

      box.innerHTML = `
        <div class="mvp-jornada-winner">
          <div class="mvp-jornada-badge">J${jNum}</div>
          <img src="img/${slug(winner.nombre)}.png" alt="${winner.nombre}" class="team-logo-lg">
          <div class="mvp-jornada-info">
            <h3>${winner.nombre}</h3>
            <p>Puntuación MVP: ${winner.mvpScore.toFixed(3)}</p>
          </div>
        </div>
        <table class="tabla tabla-compact mvp-jornada-top3">
          <thead>
            <tr>
              <th>#</th>
              <th>Equipo</th>
              <th>MVP</th>
              <th>PJ</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      `;
    } catch (e) {
      console.error('Error MVP jornada:', e);
      box.innerHTML = '<p class="muted">Error calculando el MVP de la jornada.</p>';
    }
  }

  // ==========================
  // MVPs TEMPORADA (TOP 3)
  // ==========================
  async function renderMvpTemporada() {
    const box = document.querySelector('#home-mvp-temporada .box-body');
    if (!box) return;

    box.innerHTML = '<p class="muted">Calculando ranking MVP temporada…</p>';

    try {
      const seasonArr = await CoreStats.computeMvpTemporada();
      const top3 = seasonArr.slice(0, 3);

      if (!top3.length) {
        box.innerHTML = '<p class="muted">Aún no hay datos de la temporada.</p>';
        return;
      }

      const rows = top3.map((s, idx) => `
        <tr>
          <td class="pos">${idx + 1}</td>
          <td class="team">
            <img src="img/${slug(s.nombre)}.png" alt="${s.nombre}" class="team-logo">
            <span>${s.nombre}</span>
          </td>
          <td class="score">${s.mvpAvg.toFixed(3)}</td>
          <td class="pj">${s.pj} PJ</td>
        </tr>
      `).join('');

      box.innerHTML = `
        <table class="tabla tabla-compact">
          <thead>
            <tr>
              <th>#</th>
              <th>Equipo</th>
              <th>MVP medio</th>
              <th>PJ</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      `;
    } catch (e) {
      console.error('Error MVP temporada:', e);
      box.innerHTML = '<p class="muted">Error calculando los MVPs de la temporada.</p>';
    }
  }

  // ==========================
  // CURIOSIDAD DEL DÍA
  // - lee data/curiosidades.json (array de { id?, texto })
  // - si no existe, muestra un texto por defecto
  // ==========================
  async function renderCuriosidad() {
    const box = document.querySelector('#home-curiosidad .box-body');
    if (!box) return;

    if (typeof loadJSON !== 'function') {
      box.innerHTML = '<p class="muted">Configura AppUtils.loadJSON para curiosidades.</p>';
      return;
    }

    try {
      const data = await loadJSON('data/curiosidades.json').catch(() => []);
      const lista = Array.isArray(data) ? data : [];

      if (!lista.length) {
        box.innerHTML = `
          <p>
            Añade curiosidades en <code>data/curiosidades.json</code> con un array
            de objetos <code>{ "texto": "..." }</code>.
          </p>
        `;
        return;
      }

      // selección por día (estable) usando la fecha
      const hoy = new Date();
      const idx = hoy.getDate() % lista.length;
      const item = lista[idx];
      const texto = item.texto || item.text || 'Curiosidad no disponible.';

      box.innerHTML = `<p>${texto}</p>`;
    } catch (e) {
      console.error('Error curiosidad:', e);
      box.innerHTML = '<p class="muted">No se pudo cargar la curiosidad.</p>';
    }
  }

  // ==========================
  // FORMACIÓN DEL DÍA (solo vista)
  // - elige un equipo aleatorio de la clasificación
  // - carga su formación desde Supabase (igual lógica que club_formacion pero read-only)
  // ==========================
  const FORMATION_TEMPLATES = {
    "4-4-2": [
      { index: 0, line: "POR", x: 50, y: 90 },
      { index: 1, line: "DEF", x: 20, y: 72 },
      { index: 2, line: "DEF", x: 40, y: 75 },
      { index: 3, line: "DEF", x: 60, y: 75 },
      { index: 4, line: "DEF", x: 80, y: 72 },
      { index: 5, line: "MC",  x: 25, y: 55 },
      { index: 6, line: "MC",  x: 45, y: 50 },
      { index: 7, line: "MC",  x: 65, y: 50 },
      { index: 8, line: "MC",  x: 75, y: 55 },
      { index: 9, line: "DEL", x: 40, y: 30 },
      { index: 10,line: "DEL", x: 60, y: 30 }
    ],
    "4-3-3": [
      { index: 0, line: "POR", x: 50, y: 90 },
      { index: 1, line: "DEF", x: 20, y: 72 },
      { index: 2, line: "DEF", x: 40, y: 75 },
      { index: 3, line: "DEF", x: 60, y: 75 },
      { index: 4, line: "DEF", x: 80, y: 72 },
      { index: 5, line: "MC",  x: 30, y: 55 },
      { index: 6, line: "MC",  x: 50, y: 50 },
      { index: 7, line: "MC",  x: 70, y: 55 },
      { index: 8, line: "DEL", x: 25, y: 30 },
      { index: 9, line: "DEL", x: 50, y: 25 },
      { index: 10,line: "DEL", x: 75, y: 30 }
    ],
    "4-5-1": [
      { index: 0, line: "POR", x: 50, y: 90 },
      { index: 1, line: "DEF", x: 20, y: 72 },
      { index: 2, line: "DEF", x: 40, y: 75 },
      { index: 3, line: "DEF", x: 60, y: 75 },
      { index: 4, line: "DEF", x: 80, y: 72 },
      { index: 5, line: "MC",  x: 20, y: 55 },
      { index: 6, line: "MC",  x: 35, y: 50 },
      { index: 7, line: "MC",  x: 50, y: 45 },
      { index: 8, line: "MC",  x: 65, y: 50 },
      { index: 9, line: "MC",  x: 80, y: 55 },
      { index: 10,line: "DEL", x: 50, y: 25 }
    ],
    "3-5-2": [
      { index: 0, line: "POR", x: 50, y: 90 },
      { index: 1, line: "DEF", x: 30, y: 75 },
      { index: 2, line: "DEF", x: 50, y: 72 },
      { index: 3, line: "DEF", x: 70, y: 75 },
      { index: 4, line: "MC",  x: 20, y: 55 },
      { index: 5, line: "MC",  x: 35, y: 50 },
      { index: 6, line: "MC",  x: 50, y: 45 },
      { index: 7, line: "MC",  x: 65, y: 50 },
      { index: 8, line: "MC",  x: 80, y: 55 },
      { index: 9, line: "DEL", x: 40, y: 30 },
      { index: 10,line: "DEL", x: 60, y: 30 }
    ]
  };
  const DEFAULT_SYSTEM = "4-3-3";

  function groupFromPosition(pos) {
    const p = (pos || "").toLowerCase();
    if (p.includes("goalkeeper") || p.includes("portero") || p === "gk") return "POR";
    if (
      p.includes("defence") || p.includes("back") ||
      p.includes("centre-back") || p.includes("defensa") ||
      p === "cb" || p === "lb" || p === "rb"
    ) return "DEF";
    if (p.includes("midfield") || p.includes("medio") || p.includes("mid")) return "MC";
    if (
      p.includes("offence") || p.includes("forward") ||
      p.includes("wing") || p.includes("striker") ||
      p.includes("delantero")
    ) return "DEL";
    return null;
  }

  async function resolveClubIdFromNickname(supabase, nickname, season) {
    if (!nickname) return null;
    let q = supabase
      .from("league_teams")
      .select("club_id, season, nickname")
      .ilike("nickname", nickname)
      .limit(1);

    if (season) q = q.eq("season", season);

    const { data, error } = await q;
    if (error) {
      console.warn("Error league_teams:", error);
      return null;
    }
    const row = data && data[0];
    return row?.club_id || null;
  }

  async function loadSquadForClub(supabase, clubId, season) {
    if (!clubId) return [];
    let q = supabase
      .from("player_club_memberships")
      .select(`
        player:players (
          id,
          name,
          position,
          nationality
        )
      `)
      .eq("club_id", clubId);

    if (season) q = q.eq("season", season);

    const { data, error } = await q;
    if (error) {
      console.warn("Error memberships:", error);
      return [];
    }

    const map = new Map();
    for (const row of data || []) {
      const p = row.player;
      if (!p || !p.id) continue;
      if (!map.has(p.id)) {
        map.set(p.id, {
          ...p,
          line: groupFromPosition(p.position)
        });
      }
    }
    return Array.from(map.values());
  }

  async function loadFormationForClub(supabase, clubId, season) {
    if (!clubId) return null;

    let q = supabase
      .from("formations")
      .select(`
        id,
        system,
        slots:formation_slots (
          slot_index,
          player_id
        )
      `)
      .eq("club_id", clubId)
      .limit(1);

    if (season) q = q.eq("season", season);

    const { data, error } = await q;
    if (error) {
      console.warn("Error formations:", error);
      return null;
    }

    const row = data && data[0];
    if (!row) return null;

    const slots = new Map();
    for (const s of (row.slots || [])) {
      slots.set(s.slot_index, s.player_id);
    }

    return {
      id: row.id,
      system: row.system || DEFAULT_SYSTEM,
      slots
    };
  }

  function renderFormationView(root, clubName, system, slots, squad) {
    const template = FORMATION_TEMPLATES[system] || FORMATION_TEMPLATES[DEFAULT_SYSTEM];

    const findPlayerName = (playerId) => {
      if (!playerId) return "";
      const p = squad.find(x => x.id === playerId);
      return p ? p.name : "";
    };

    const slotsHtml = template.map(slot => {
      const playerId = slots.get(slot.index);
      const name = findPlayerName(playerId) || "";
      const label = name || slot.line;
      return `
        <div
          class="club-formation-slot"
          style="top:${slot.y}%;left:${slot.x}%"
        >
          <div>${label}</div>
        </div>
      `;
    }).join("");

    root.innerHTML = `
      <div class="club-formation-wrapper">
        <div class="club-formation-field">
          <img src="img/campo-vertical.png" alt="Campo" class="club-formation-bg">
          ${slotsHtml}
        </div>
        <div class="club-formation-meta">
          <div class="club-formation-meta-row">
            <div class="club-formation-system">
              ${clubName} — Sistema: <strong>${system}</strong>
            </div>
          </div>
          <div class="club-formation-meta-row">
            <span class="club-formation-hint">
              Formación actual según la base de datos (solo lectura).
            </span>
          </div>
        </div>
      </div>
    `;
  }

  async function renderFormacionDia() {
    const box = document.querySelector('#home-formacion-dia .box-body');
    if (!box) return;

    if (typeof getSupabaseClient !== 'function') {
      box.innerHTML = '<p class="muted">Supabase no está configurado para cargar la formación.</p>';
      return;
    }

    box.innerHTML = '<p class="muted">Cargando formación aleatoria…</p>';

    try {
      const tabla = await CoreStats.computeClasificacion(null, { useH2H: false });
      if (!tabla.length) {
        box.innerHTML = '<p class="muted">No hay equipos para mostrar una formación.</p>';
        return;
      }

      // elegimos un equipo aleatorio entre los de la clasificación
      const randomIdx = Math.floor(Math.random() * tabla.length);
      const team = tabla[randomIdx];
      const clubName = team.nombre;

      const supabase = await getSupabaseClient();
      const cfg = typeof getSupabaseConfig === 'function' ? getSupabaseConfig() : {};
      const season = cfg?.season || null;

      const clubId = await resolveClubIdFromNickname(supabase, clubName, season);
      if (!clubId) {
        box.innerHTML = `
          <p class="muted">
            No se pudo resolver <code>club_id</code> para <strong>${clubName}</strong>.
          </p>
        `;
        return;
      }

      const [squad, formation] = await Promise.all([
        loadSquadForClub(supabase, clubId, season),
        loadFormationForClub(supabase, clubId, season)
      ]);

      if (!formation) {
        box.innerHTML = `
          <p class="muted">
            El club <strong>${clubName}</strong> aún no tiene formación guardada.
          </p>
        `;
        return;
      }

      renderFormationView(box, clubName, formation.system, formation.slots, squad);
    } catch (e) {
      console.error('Error formación del día:', e);
      box.innerHTML = '<p class="muted">No se pudo cargar la formación del día.</p>';
    }
  }

  // ==========================
  // INIT
  // ==========================
  await Promise.all([
    renderHeroNews(),
    renderClasificacionTop10(),
    renderTeamForm(),
    renderPichichiMini(),
    renderMvpJornada(),
    renderMvpTemporada(),
    renderCuriosidad(),
    renderFormacionDia()
  ]);
})();
