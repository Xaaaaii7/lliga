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
  // GOLEADOR DEL MOMENTO
  // ==========================
  async function renderGoleadorMomento() {
    const box = document.querySelector('#home-goleador-momento .box-body');
    if (!box) return;

    if (typeof getSupabaseClient !== 'function') {
      box.innerHTML = '<p class="muted">Supabase no está configurado para calcular el goleador del momento.</p>';
      return;
    }

    box.innerHTML = '<p class="muted">Buscando jornadas recientes…</p>';

    try {
      const jornadas = await CoreStats.getResultados();
      if (!Array.isArray(jornadas) || !jornadas.length) {
        box.innerHTML = '<p class="muted">Todavía no hay jornadas.</p>';
        return;
      }

      // 1) Buscar la última jornada con al menos un partido jugado
      let lastIndex = -1;
      for (let i = jornadas.length - 1; i >= 0; i--) {
        const j = jornadas[i];
        const partidos = j.partidos || [];
        const hasPlayed = partidos.some(p =>
          isNum(p.goles_local) && isNum(p.goles_visitante)
        );
        if (hasPlayed) {
          lastIndex = i;
          break;
        }
      }

      if (lastIndex === -1) {
        box.innerHTML = '<p class="muted">Todavía no hay jornadas con partidos jugados.</p>';
        return;
      }

      // 2) Cogemos esa jornada y las dos anteriores (si existen)
      const startIndex = Math.max(0, lastIndex - 2);
      const selectedJornadas = jornadas.slice(startIndex, lastIndex + 1);

      // Para el label (Jx–Jy)
      const jNums = selectedJornadas
        .map(j => j.numero ?? j.jornada)
        .filter(n => n != null)
        .sort((a, b) => a - b);

      const badgeLabel = (() => {
        if (!jNums.length) return 'Jornadas recientes';
        if (jNums.length === 1) return `J${jNums[0]}`;
        return `J${jNums[0]}–J${jNums[jNums.length - 1]}`;
      })();

      // 3) Sacar todos los match_id de partidos jugados en esas jornadas
      const matchIds = [];
      for (const j of selectedJornadas) {
        for (const p of (j.partidos || [])) {
          if (!isNum(p.goles_local) || !isNum(p.goles_visitante)) continue;
          if (!p.id) continue; // p.id viene de matches.id
          matchIds.push(p.id);
        }
      }

      if (!matchIds.length) {
        box.innerHTML = '<p class="muted">No hay partidos disputados en las últimas jornadas.</p>';
        return;
      }

      box.innerHTML = '<p class="muted">Calculando goleadores en las últimas jornadas…</p>';

      // 4) Leer goal_events de esos partidos
      const supabase = await getSupabaseClient();
      let q = supabase
        .from('goal_events')
        .select(`
          match_id,
          event_type,
          player:players (
            id,
            name
          ),
          team:league_teams (
            id,
            nickname,
            display_name
          )
        `)
        .in('match_id', matchIds)
        .eq('event_type', 'goal');

      const { data, error } = await q;
      if (error) {
        console.error('Error goal_events:', error);
        box.innerHTML = '<p class="muted">Error al leer los eventos de gol.</p>';
        return;
      }

      const eventos = data || [];
      if (!eventos.length) {
        box.innerHTML = `
          <p class="muted">
            No hay goles registrados en las jornadas seleccionadas.
          </p>
        `;
        return;
      }

      // 5) Agregar goles por jugador + nº de partidos (match_id distintos) en los que marca
      const byPlayer = new Map();
      for (const ev of eventos) {
        const player = ev.player;
        if (!player || !player.id) continue;

        const pid = player.id;
        let rec = byPlayer.get(pid);
        if (!rec) {
          const team = ev.team || {};
          const teamName =
            team.nickname ||
            team.display_name ||
            'Equipo';

          rec = {
            playerId: pid,
            nombre: player.name || 'Jugador',
            equipo: teamName,
            goles: 0,
            matchSet: new Set()   // partidos en los que ha marcado
          };
          byPlayer.set(pid, rec);
        }
        rec.goles += 1;
        if (ev.match_id) {
          rec.matchSet.add(ev.match_id);
        }
      }

      let lista = Array.from(byPlayer.values());
      if (!lista.length) {
        box.innerHTML = `
          <p class="muted">
            No hay jugadores con goles registrados en las jornadas seleccionadas.
          </p>
        `;
        return;
      }

      // Calculamos partidos del tramo (partidos con gol) para desempatar
      lista = lista.map(p => ({
        ...p,
        partidosTramo: p.matchSet.size || 1 // mínimo 1 para evitar 0
      }));

      // 6) Ordenar:
      //   1) más goles
      //   2) a igualdad de goles, MENOS partidos en el tramo
      //   3) nombre alfabético
      lista.sort((a, b) =>
        (b.goles - a.goles) ||
        (a.partidosTramo - b.partidosTramo) ||
        a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' })
      );

      const ganador = lista[0];
      const top5 = lista.slice(0, 5);

      const jornadasLabel = (() => {
        if (!jNums.length) return 'las últimas jornadas';
        if (jNums.length === 1) return `la jornada ${jNums[0]}`;
        return `las jornadas ${jNums[0]}–${jNums[jNums.length - 1]}`;
      })();

      const rows = top5.map((p, idx) => `
        <tr>
          <td class="pos">${idx + 1}</td>
          <td class="jugador">
            <img src="img/jugadores/${slug(p.nombre)}.jpg" alt="${p.nombre}" class="player-photo">
            <div>
              <div class="player-name">${p.nombre}</div>
              <div class="player-team">${p.equipo}</div>
            </div>
          </td>
          <td class="goles">${p.goles}</td>
        </tr>
      `).join('');

      box.innerHTML = `
        <div class="goleador-momento-winner">
          <div class="goleador-momento-badge">${badgeLabel}</div>
          <div class="goleador-momento-main">
            <img src="img/jugadores/${slug(ganador.nombre)}.jpg" alt="${ganador.nombre}" class="player-photo-lg">
            <div class="goleador-momento-info">
              <h3>${ganador.nombre}</h3>
              <p>
                ${ganador.goles} gol(es) en las ultimas 3 jornadas
                ${ganador.partidosTramo
          ? ` (en ${ganador.partidosTramo} partido${ganador.partidosTramo > 1 ? 's' : ''})`
          : ''
        }
              </p>
              <p class="muted small">${ganador.equipo}</p>
            </div>
          </div>
        </div>
        <table class="tabla tabla-compact goleador-momento-top">
          <thead>
            <tr>
              <th>#</th>
              <th>Jugador</th>
              <th>Goles</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      `;
    } catch (e) {
      console.error('Error goleador del momento:', e);
      box.innerHTML = '<p class="muted">Error calculando el goleador del momento.</p>';
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
  // CURIOSIDAD DEL DÍA (via Supabase: daily_curiosities)
  // ==========================
  async function renderCuriosidad() {
    const box = document.querySelector('#home-curiosidad .box-body');
    if (!box) return;

    if (typeof getSupabaseClient !== 'function') {
      box.innerHTML = '<p class="muted">Supabase no está configurado para curiosidades.</p>';
      return;
    }

    box.innerHTML = '<p class="muted">Cargando curiosidad…</p>';

    try {
      const supabase = await getSupabaseClient();
      const cfg = typeof getSupabaseConfig === 'function' ? getSupabaseConfig() : {};
      const season = cfg?.season || null;

      const hoyStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

      // 1) intento coger curiosidad de HOY para la season activa
      let query = supabase
        .from('daily_curiosities')
        .select('id, fecha, season, tipo, titulo, descripcion, payload, created_at')
        .eq('fecha', hoyStr)
        .order('created_at', { ascending: false })
        .limit(1);

      if (season) {
        query = query.eq('season', season);
      }

      let { data, error } = await query;
      if (error) {
        console.error('Error Supabase daily_curiosities (hoy):', error);
        throw error;
      }

      let row = (data && data[0]) || null;

      // 2) si hoy no hay, cojo la última curiosidad de la season
      if (!row) {
        let q2 = supabase
          .from('daily_curiosities')
          .select('id, fecha, season, tipo, titulo, descripcion, payload, created_at');

        if (season) {
          q2 = q2.eq('season', season);
        }

        const res2 = await q2
          .order('fecha', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(1);

        if (res2.error) {
          console.error('Error Supabase daily_curiosities (fallback):', res2.error);
          throw res2.error;
        }

        row = res2.data && res2.data[0] ? res2.data[0] : null;
      }

      if (!row) {
        box.innerHTML = `
          <p class="muted">
            Todavía no hay curiosidades generadas en <code>daily_curiosities</code>.
            Cuando la Lambda diaria empiece a insertar filas, aparecerán aquí.
          </p>`;
        return;
      }

      const {
        tipo,
        titulo,
        descripcion
      } = row;

      const payload = row.payload || {};

      // nickname / display_name del equipo
      const nickname = payload.nickname || payload.teamNickname || '';
      const displayName = payload.display_name || payload.teamLabel || nickname || '';

      // la imagen ideal es nickname.png
      let badge = payload.badge || '';
      if (!badge && nickname) {
        badge = `img/${slug(nickname.toLowerCase())}.png`;
      }

      // Derivar "categoría" a partir de tipo o payload.category
      const rawCategory =
        payload.category ||
        (typeof tipo === 'string' ? tipo.split('_')[0] : '');

      const categoriaLabel = (() => {
        const c = (rawCategory || '').toLowerCase();
        if (c === 'equipos' || c === 'equipo') return 'Equipos';
        if (c === 'partidos' || c === 'partido') return 'Partidos';
        if (c === 'jugadores' || c === 'jugador') return 'Jugadores';
        if (c === 'estadisticas' || c === 'stats') return 'Estadísticas';
        return 'Curiosidad';
      })();

      const categoriaClass =
        (rawCategory && rawCategory.toLowerCase()) || 'generica';

      // Badge (escudo) si lo tenemos
      const maybeBadge = badge
        ? `<div class="curio-badge-wrap">
             <img src="${badge}"
                  alt="${displayName}"
                  onerror="this.style.visibility='hidden'">
           </div>`
        : '';

      box.innerHTML = `
        <article class="curio-card curio-${categoriaClass}">
          <header class="curio-header">
            ${maybeBadge}
            <div class="curio-header-text">
              <span class="chip curio-chip">${categoriaLabel}</span>
              <h3 class="curio-title">${titulo}</h3>
            </div>
          </header>
          <p class="curio-desc">${descripcion}</p>
        </article>
      `;
    } catch (err) {
      console.error('Error cargando curiosidad del día:', err);
      box.innerHTML = `
        <p class="muted">
          No se ha podido cargar la curiosidad del día.  
          Revisa que la Lambda esté insertando datos en <code>daily_curiosities</code>.
        </p>`;
    }
  }

  // ==========================
  // FORMACIÓN DEL DÍA (solo vista)
  // ==========================
  const FORMATION_TEMPLATES = {
    "4-4-2": [
      { index: 0, line: "POR", x: 50, y: 90 },
      { index: 1, line: "DEF", x: 20, y: 72 },
      { index: 2, line: "DEF", x: 40, y: 75 },
      { index: 3, line: "DEF", x: 60, y: 75 },
      { index: 4, line: "DEF", x: 80, y: 72 },
      { index: 5, line: "MC", x: 25, y: 55 },
      { index: 6, line: "MC", x: 45, y: 50 },
      { index: 7, line: "MC", x: 65, y: 50 },
      { index: 8, line: "MC", x: 75, y: 55 },
      { index: 9, line: "DEL", x: 40, y: 30 },
      { index: 10, line: "DEL", x: 60, y: 30 }
    ],
    "4-3-3": [
      { index: 0, line: "POR", x: 50, y: 90 },
      { index: 1, line: "DEF", x: 20, y: 72 },
      { index: 2, line: "DEF", x: 40, y: 75 },
      { index: 3, line: "DEF", x: 60, y: 75 },
      { index: 4, line: "DEF", x: 80, y: 72 },
      { index: 5, line: "MC", x: 30, y: 55 },
      { index: 6, line: "MC", x: 50, y: 50 },
      { index: 7, line: "MC", x: 70, y: 55 },
      { index: 8, line: "DEL", x: 25, y: 30 },
      { index: 9, line: "DEL", x: 50, y: 25 },
      { index: 10, line: "DEL", x: 75, y: 30 }
    ],
    "4-5-1": [
      { index: 0, line: "POR", x: 50, y: 90 },
      { index: 1, line: "DEF", x: 20, y: 72 },
      { index: 2, line: "DEF", x: 40, y: 75 },
      { index: 3, line: "DEF", x: 60, y: 75 },
      { index: 4, line: "DEF", x: 80, y: 72 },
      { index: 5, line: "MC", x: 20, y: 55 },
      { index: 6, line: "MC", x: 35, y: 50 },
      { index: 7, line: "MC", x: 50, y: 45 },
      { index: 8, line: "MC", x: 65, y: 50 },
      { index: 9, line: "MC", x: 80, y: 55 },
      { index: 10, line: "DEL", x: 50, y: 25 }
    ],
    "3-5-2": [
      { index: 0, line: "POR", x: 50, y: 90 },
      { index: 1, line: "DEF", x: 30, y: 75 },
      { index: 2, line: "DEF", x: 50, y: 72 },
      { index: 3, line: "DEF", x: 70, y: 75 },
      { index: 4, line: "MC", x: 20, y: 55 },
      { index: 5, line: "MC", x: 35, y: 50 },
      { index: 6, line: "MC", x: 50, y: 45 },
      { index: 7, line: "MC", x: 65, y: 50 },
      { index: 8, line: "MC", x: 80, y: 55 },
      { index: 9, line: "DEL", x: 40, y: 30 },
      { index: 10, line: "DEL", x: 60, y: 30 }
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

    renderClasificacionTop10(),
    renderTeamForm(),
    renderGoleadorMomento(),
    renderPichichiMini(),
    renderMvpJornada(),
    renderMvpTemporada(),
    renderCuriosidad(),
    renderFormacionDia()
  ]);
})();
