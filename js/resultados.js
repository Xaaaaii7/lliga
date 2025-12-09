(async () => {
  const root = document.getElementById('resultados');
  if (!root) return;

  // Modal refs
  const backdrop = document.getElementById('stats-backdrop');
  const bodyEl = document.getElementById('stats-body');
  const closeBtn = document.getElementById('stats-close');
  const titleEl = document.getElementById('stats-title');

  // Helpers comunes
  const {

    fmtDate,
    normalizeText,
    slugify,
    logoPath,
    getSupabaseClient,
    getSupabaseConfig,
    getActiveSeason
  } = window.AppUtils || {};

  const CoreStats = window.CoreStats || {};
  const isNum = CoreStats.isNum || (v => typeof v === 'number' && Number.isFinite(v));

  const hasSupabase =
    typeof getSupabaseClient === 'function' &&
    typeof getSupabaseConfig === 'function';

  let _supaClient = null;
  const getSupa = async () => {
    if (!hasSupabase) return null;
    if (_supaClient) return _supaClient;
    _supaClient = await getSupabaseClient();
    return _supaClient;
  };

  const getActiveSeasonSafe = () => {
    const cfg = (typeof getSupabaseConfig === 'function') ? getSupabaseConfig() : {};
    const seasonCfg = cfg.season || '';
    const seasonFromFn = (typeof getActiveSeason === 'function') ? getActiveSeason() : '';
    return seasonFromFn || seasonCfg || '';
  };

  // Estado en memoria de goleadores por partido
  // matchId -> { meta, local:[], visitante:[], playersLocal:[], playersVisitante:[], playerMeta:{}, localManagerNick, visitManagerNick }
  const scorerState = {};

  const norm = normalizeText || (s => String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim());
  const slug = slugify || (s => norm(s).replace(/\s+/g, '-'));
  const logoFor = logoPath || (name => `img/${slug(name)}.png`);

  // Config subida de imágenes a S3 (ajusta el endpoint)
  const MATCH_UPLOAD = {
    enabled: true,
    presignEndpoint: 'https://d39ra5ecf4.execute-api.eu-west-1.amazonaws.com/prod/presign-match-upload'
  };

  // -----------------------------
  // Helpers modal
  // -----------------------------
  const openModal = () => {
    if (!backdrop) return;
    backdrop.hidden = false;
    document.body.style.overflow = 'hidden';
  };
  const closeModal = () => {
    if (!backdrop) return;
    backdrop.hidden = true;
    document.body.style.overflow = '';
    if (bodyEl) bodyEl.innerHTML = '';
    if (titleEl) titleEl.textContent = 'Estadísticas del partido';
  };

  // Cerrar siempre al cargar (por si el HTML quedó sin hidden)
  closeModal();

  // Listeners de cierre
  closeBtn?.addEventListener('click', closeModal);
  backdrop?.addEventListener('click', (e) => {
    if (e.target === backdrop) closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && backdrop && !backdrop.hidden) closeModal();
  });

  // -----------------------------
  // METEO: mapa clave -> ciudad (desde Supabase team_cities)
  // -----------------------------
  let ciudadesConfig = {};

  const loadCitiesMap = async () => {
    if (!hasSupabase) return;
    try {
      const supa = await getSupa();
      const { data, error } = await supa
        .from('team_cities')
        .select('nickname, city');

      if (!error && data) {
        data.forEach(row => {
          if (row.nickname && row.city) {
            ciudadesConfig[row.nickname] = row.city;
          }
        });
      }
    } catch (e) {
      console.warn('Error cargando team_cities:', e);
    }
  };

  // Disparamos la carga en paralelo (no bloqueante estricto, pero útil tenerla pronto)
  const citiesPromise = loadCitiesMap();

  const getCityForKey = (keyName) => {
    if (!keyName) return null;
    return ciudadesConfig[keyName] || null;
  };

  // Cache meteo por ciudad (para no repetir peticiones)
  const weatherCache = new Map(); // key (city lower) -> { label, emoji }

  const weatherCodeToCategory = (code) => {
    if (code == null) return null;
    const c = Number(code);

    if (c === 0) return { label: "Despejado", emoji: "☀️" };
    if ([1, 2, 3].includes(c)) return { label: "Nublado", emoji: "⛅" };
    if ([45, 48].includes(c)) return { label: "Niebla", emoji: "🌫️" };

    if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99].includes(c))
      return { label: "Lluvia", emoji: "🌧️" };

    if ([71, 73, 75, 77, 85, 86].includes(c))
      return { label: "Nieve", emoji: "❄️" };

    return { label: "Variable", emoji: "🌥️" };
  };

  const fetchWeatherForCity = async (cityName) => {
    if (!cityName) return null;
    const key = cityName.toLowerCase();

    if (weatherCache.has(key)) return weatherCache.get(key);

    try {
      const geoUrl =
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityName)}&count=1&language=es&format=json`;
      const geoRes = await fetch(geoUrl, { cache: 'no-store' });
      if (!geoRes.ok) throw new Error(`Geo HTTP ${geoRes.status}`);
      const geo = await geoRes.json();
      const loc = geo?.results?.[0];
      if (!loc) {
        weatherCache.set(key, null);
        return null;
      }

      const lat = loc.latitude;
      const lon = loc.longitude;

      const meteoUrl = `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}&current_weather=true`;
      const meteoRes = await fetch(meteoUrl, { cache: 'no-store' });
      if (!meteoRes.ok) throw new Error(`Meteo HTTP ${meteoRes.status}`);
      const meteoData = await meteoRes.json();

      const cat = weatherCodeToCategory(meteoData?.current_weather?.weathercode);
      if (cat) {
        weatherCache.set(key, cat);
        return cat;
      }
    } catch (e) {
      console.warn('Meteo error para ciudad', cityName, e);
    }

    weatherCache.set(key, null);
    return null;
  };

  // -----------------------------
  // Cargar datos desde CoreStats
  // -----------------------------
  root.innerHTML = `<p class="hint">Cargando resultados...</p>`;

  let jornadas = [];
  let statsIndex = {};
  let statsIndexReady = false;
  let statsIndexPromise = null;

  const ensureStatsIndex = async () => {
    if (statsIndexReady) return statsIndex;

    if (!statsIndexPromise) {
      statsIndexPromise = CoreStats.getStatsIndex()
        .then(idx => {
          statsIndex = idx || {};
          statsIndexReady = true;
          return statsIndex;
        })
        .catch(e => {
          console.warn('Error getStatsIndex (lazy):', e);
          statsIndex = {};
          statsIndexReady = true;
          return statsIndex;
        });
    }

    return statsIndexPromise;
  };

  try {
    jornadas = await CoreStats.getResultados();
  } catch (e) {
    console.error('Error getResultados:', e);
    jornadas = [];
  }

  if (!Array.isArray(jornadas) || !jornadas.length) {
    root.innerHTML = `<p class="hint">No se pudieron cargar los partidos.</p>`;
    return;
  }

  // Construir meta de partidos (para el modal)
  const jornadasMap = new Map();
  const partidoMeta = {};

  jornadas.forEach(j => {
    const numero = j.numero;
    const jornada = {
      numero,
      fecha: j.fecha,
      partidos: []
    };

    (j.partidos || []).forEach((p, idx) => {
      const pid = p.id || `J${numero}-P${idx + 1}`;
      const partido = {
        id: pid,
        fecha: p.fecha || j.fecha,
        hora: p.hora || '',
        local: p.local,
        visitante: p.visitante,
        goles_local: isNum(p.goles_local) ? p.goles_local : null,
        goles_visitante: isNum(p.goles_visitante) ? p.goles_visitante : null,
        stream: p.stream || '',

        // campos extra que vienen de CoreStats
        local_team_id: p.local_team_id || null,
        visitante_team_id: p.visitante_team_id || null,
        local_club_id: p.local_club_id || null,
        visitante_club_id: p.visitante_club_id || null,
        round_id: p.round_id || numero
      };

      jornada.partidos.push(partido);

      partidoMeta[pid] = {
        id: pid,
        jornada: numero,
        fechaJornada: j.fecha,
        fecha: partido.fecha,
        hora: partido.hora,
        local: partido.local,
        visitante: partido.visitante,
        goles_local: partido.goles_local,
        goles_visitante: partido.goles_visitante,
        local_team_id: partido.local_team_id,
        visitante_team_id: partido.visitante_team_id,
        local_club_id: partido.local_club_id,
        visitante_club_id: partido.visitante_club_id,
        round_id: partido.round_id
      };
    });

    jornadasMap.set(numero, jornada);
  });

  // Reordenamos jornadas (por si acaso)
  jornadas = Array.from(jornadasMap.values()).sort((a, b) => (a.numero || 0) - (b.numero || 0));

  // Buscar última jornada con al menos un resultado jugado
  let lastPlayed = 0;
  jornadas.forEach(j => {
    if ((j.partidos || []).some(p => isNum(p.goles_local) && isNum(p.goles_visitante))) {
      if (j.numero > lastPlayed) lastPlayed = j.numero;
    }
  });
  if (!lastPlayed) {
    lastPlayed = jornadas[jornadas.length - 1].numero;
  }

  const minJornada = Math.min(...jornadas.map(j => j.numero));
  const maxJornada = Math.max(...jornadas.map(j => j.numero));

  // Contenedor de navegación + bloque de jornada
  const navWrap = document.createElement('div');
  navWrap.className = 'jornada-nav resultados-nav';
  navWrap.innerHTML = `
    <button id="res-prev" class="nav-btn">◀</button>
    <span id="res-label" class="jornada-label chip"></span>
    <button id="res-next" class="nav-btn">▶</button>
  `;

  const jornadaWrap = document.createElement('div');
  jornadaWrap.id = 'jornada-contenido';
  jornadaWrap.className = 'resultados-jornada';

  root.innerHTML = '';
  root.appendChild(navWrap);
  root.appendChild(jornadaWrap);

  const labelEl = document.getElementById('res-label');
  const prevBtn = document.getElementById('res-prev');
  const nextBtn = document.getElementById('res-next');

  // -----------------------------
  // Goleadores: carga datos para un partido
  // -----------------------------
  const loadScorerStateForMatch = async (matchMeta) => {
    const matchId = matchMeta.id;
    if (!hasSupabase || !matchId) return null;

    if (scorerState[matchId]) return scorerState[matchId];

    const supa = await getSupa();
    if (!supa) return null;

    const season = getActiveSeasonSafe();
    const round = matchMeta.round_id || matchMeta.jornada || null;

    // IDs de equipo en la liga (league_teams.id)
    const localTeamId = matchMeta.local_team_id;
    const visitTeamId = matchMeta.visitante_team_id;

    // IDs de club (clubs.id) – puede que vengan de CoreStats o no
    let localClubId = matchMeta.local_club_id;
    let visitClubId = matchMeta.visitante_club_id;

    // Nicknames (managers) por lado
    let localManagerNick = '';
    let visitManagerNick = '';

    // Si no hay season o no tenemos league_team_id, no podemos seguir
    if (!season || !localTeamId || !visitTeamId) {
      console.warn('Scorers: faltan season o league_team_id', {
        season, localTeamId, visitTeamId, localClubId, visitClubId, matchMeta
      });
      return null;
    }

    // Siempre consultamos league_teams para nicknames y club_id
    const { data: teams, error: errTeams } = await supa
      .from('league_teams')
      .select('id, club_id, nickname')
      .eq('season', season)
      .in('id', [localTeamId, visitTeamId]);

    if (errTeams) {
      console.warn('Scorers: error cargando league_teams', errTeams);
      return null;
    }

    if (teams && teams.length) {
      for (const t of teams) {
        if (t.id === localTeamId) {
          if (!localClubId) {
            localClubId = t.club_id;
            matchMeta.local_club_id = localClubId;
          }
          localManagerNick = t.nickname || '';
        } else if (t.id === visitTeamId) {
          if (!visitClubId) {
            visitClubId = t.club_id;
            matchMeta.visitante_club_id = visitClubId;
          }
          visitManagerNick = t.nickname || '';
        }
      }
    }

    if (!localClubId || !visitClubId) {
      console.warn('Scorers: no se pudieron resolver club_ids', {
        season, localTeamId, visitTeamId, localClubId, visitClubId
      });
      return null;
    }

    // 1) Sacar membresías de jugadores de ambos clubes en esta temporada
    const { data: memberships, error: errMem } = await supa
      .from('player_club_memberships')
      .select(`
        player_id,
        club_id,
        season,
        from_round,
        to_round,
        is_current,
        player:players(id, name, position),
        club:clubs(id, name)
      `)
      .eq('season', season)
      .in('club_id', [localClubId, visitClubId]);

    if (errMem) {
      console.warn('Error cargando memberships jugadores:', errMem);
      return null;
    }

    const inRound = (m) => {
      if (!round) return true;
      if (m.is_current) return true;
      const fr = m.from_round;
      const tr = m.to_round;
      if (fr != null && fr > round) return false;
      if (tr != null && tr < round) return false;
      return true;
    };

    const filteredMem = (memberships || []).filter(inRound);

    const playerMeta = {};
    const allPlayerIds = new Set();

    filteredMem.forEach(m => {
      const pid = m.player_id;
      if (!pid) return;
      allPlayerIds.add(pid);
      if (!playerMeta[pid]) {
        playerMeta[pid] = {
          id: pid,
          name: (m.player && m.player.name) || `Jugador ${pid}`,
          position: (m.player && m.player.position) || '',
          clubId: m.club_id,
          clubName: (m.club && m.club.name) || ''
        };
      }
    });

    const playerIdList = Array.from(allPlayerIds);
    const goalsByPlayerSeason = {};

    if (playerIdList.length) {
      // 2) Total de goles por jugador en la temporada (para ordenar el select)
      const { data: evs, error: errEvs } = await supa
        .from('goal_events')
        .select(`
          player_id,
          event_type,
          match:matches(season)
        `)
        .eq('event_type', 'goal')
        .in('player_id', playerIdList)
        .eq('match.season', season);

      if (!errEvs && evs) {
        evs.forEach(ev => {
          const pid = ev.player_id;
          if (!pid) return;
          goalsByPlayerSeason[pid] = (goalsByPlayerSeason[pid] || 0) + 1;
        });
      }
    }

    const localPlayers = [];
    const visitPlayers = [];

    filteredMem.forEach(m => {
      const pid = m.player_id;
      if (!pid) return;
      const meta = playerMeta[pid];
      const base = {
        player_id: pid,
        name: meta.name,
        position: meta.position,
        clubName: meta.clubName,
        totalGoals: goalsByPlayerSeason[pid] || 0
      };
      if (m.club_id === localClubId) {
        localPlayers.push(base);
      } else if (m.club_id === visitClubId) {
        visitPlayers.push(base);
      }
    });

    const sortPlayers = (arr) => arr.sort((a, b) =>
      (b.totalGoals - a.totalGoals) ||
      a.name.localeCompare(b.name, 'es', { sensitivity: 'base' })
    );

    sortPlayers(localPlayers);
    sortPlayers(visitPlayers);

    // 3) Eventos de este partido para precargar goleadores
    const { data: matchEvents, error: errMatchEv } = await supa
      .from('goal_events')
      .select(`
        id,
        match_id,
        league_team_id,
        player_id,
        minute,
        event_type
      `)
      .eq('match_id', matchId)
      .eq('match_id', matchId)
      .in('event_type', ['goal', 'own_goal']);

    if (errMatchEv) {
      console.warn('Error cargando goal_events del partido:', errMatchEv);
    }

    const aggGoals = { local: {}, visitante: {} };
    const aggRed = { local: [], visitante: [] }; // Set of player_ids

    (matchEvents || []).forEach(ev => {
      const pid = ev.player_id;
      if (!pid) return;

      const side = (ev.league_team_id === localTeamId)
        ? 'local'
        : (ev.league_team_id === visitTeamId ? 'visitante' : null);
      if (!side) return;

      if (ev.event_type === 'goal') {
        aggGoals[side][pid] = (aggGoals[side][pid] || 0) + 1;
      } else if (ev.event_type === 'own_goal') {
        // OWN_GOAL_ID = -1
        const ogKey = -1;
        aggGoals[side][ogKey] = (aggGoals[side][ogKey] || 0) + 1;
      }
    });

    // 4) Cargar tarjetas rojas desde 'match_red_cards'
    const { data: redCardsEvents, error: errRed } = await supa
      .from('match_red_cards')
      .select('player_id, league_team_id')
      .eq('match_id', matchId);

    if (errRed) {
      console.warn('Error cargando match_red_cards:', errRed);
    }

    // override aggRed with fetched data
    (redCardsEvents || []).forEach(rc => {
      const pid = rc.player_id;
      if (rc.league_team_id === localTeamId) aggRed.local.push(pid);
      else if (rc.league_team_id === visitTeamId) aggRed.visitante.push(pid);
    });

    // empty dummy loop to match replacement
    [].forEach(() => {
    });

    // 5) Cargar lesiones desde 'match_injuries'
    const { data: injuryEvents, error: errInj } = await supa
      .from('match_injuries')
      .select('player_id, league_team_id')
      .eq('match_id', matchId);

    if (errInj) {
      console.warn('Error cargando match_injuries:', errInj);
    }

    const aggInj = { local: [], visitante: [] };
    (injuryEvents || []).forEach(ev => {
      const pid = ev.player_id;
      if (ev.league_team_id === localTeamId) aggInj.local.push(pid);
      else if (ev.league_team_id === visitTeamId) aggInj.visitante.push(pid);
    });

    const buildSideArr = (side) => {
      const out = [];
      const counts = aggGoals[side] || {};
      Object.keys(counts).forEach(pidStr => {
        const pid = Number(pidStr);
        const goals = counts[pidStr];
        // Handle Own Goal (pid = -1)
        let meta;
        if (pid === -1) {
          meta = { name: 'Gol en propia' };
        } else {
          meta = playerMeta[pid] || { name: `Jugador ${pid}` };
        }

        out.push({
          player_id: pid,
          name: meta.name,
          goals
        });
      });
      out.sort((a, b) =>
        (b.goals - a.goals) ||
        a.name.localeCompare(b.name, 'es', { sensitivity: 'base' })
      );
      return out;
    };

    const buildRedArr = (side) => {
      const out = [];
      const pids = aggRed[side] || [];
      const uniquePids = [...new Set(pids)];
      uniquePids.forEach(pid => {
        const meta = playerMeta[pid] || { name: `Jugador ${pid}` };
        out.push({
          player_id: pid,
          name: meta.name
        });
      });
      out.sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
      return out;
    };

    const buildInjuriesArr = (side) => {
      const out = [];
      const pids = aggInj[side] || [];
      const uniquePids = [...new Set(pids)];
      uniquePids.forEach(pid => {
        const meta = playerMeta[pid] || { name: `Jugador ${pid}` };
        out.push({
          player_id: pid,
          name: meta.name
        });
      });
      out.sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
      return out;
    };

    const state = {
      meta: {
        ...matchMeta,
        local_club_id: localClubId,
        visitante_club_id: visitClubId
      },
      local: buildSideArr('local'),
      visitante: buildSideArr('visitante'),
      redLocal: buildRedArr('local'),
      redVisitante: buildRedArr('visitante'),
      injuriesLocal: buildInjuriesArr('local'),
      injuriesVisitante: buildInjuriesArr('visitante'),
      playersLocal: localPlayers,
      playersVisitante: visitPlayers,
      playerMeta,
      goalsByPlayerSeason,
      localManagerNick,
      visitManagerNick
    };

    scorerState[matchId] = state;
    return state;
  };

  // -----------------------------
  // Goleadores: helpers de UI
  // -----------------------------
  const renderSideScorersList = (sectionEl, side, state) => {
    if (!sectionEl || !state) return;
    const listEl = sectionEl.querySelector(`.scorers-list[data-side="${side}"]`);
    if (!listEl) return;

    const arr = state[side] || [];
    if (!arr.length) {
      listEl.innerHTML = `<li class="scorer-empty">Ningún goleador registrado.</li>`;
      return;
    }

    listEl.innerHTML = arr.map(p => `
      <li class="scorer-item" data-player-id="${p.player_id}">
        <span class="scorer-name">${p.name}</span>
        <div class="scorer-controls">
          <button type="button" class="btn-minus-goal" data-player-id="${p.player_id}" data-side="${side}">−</button>
          <span class="scorer-goals">${p.goals}</span>
          <button type="button" class="btn-plus-goal" data-player-id="${p.player_id}" data-side="${side}">＋</button>
          <button type="button" class="btn-remove-scorer" data-player-id="${p.player_id}" data-side="${side}">✕</button>
        </div>
      </li>
    `).join('');
  };

  const renderScorersSummary = (sectionEl, state) => {
    if (!sectionEl || !state) return;

    const toBalls = (goals) => {
      const g = Number(goals) || 0;
      if (g <= 0) return '';
      if (g === 1) return '⚽';
      return `⚽ x${g}`;
    };

    const renderSide = (side) => {
      const listEl = sectionEl.querySelector(`.scorers-summary-list[data-side="${side}"]`);
      if (!listEl) return;

      const arr = state[side] || [];
      if (!arr.length) {
        listEl.innerHTML = `<li class="scorer-summary-empty">Sin goles registrados.</li>`;
        return;
      }

      const managerNick = side === 'local'
        ? (state.localManagerNick || '')
        : (state.visitManagerNick || '');

      listEl.innerHTML = arr.map(p => `
        <li class="scorer-summary-item">
          <span class="scorer-summary-balls">${toBalls(p.goals)}</span>
          <span class="scorer-summary-name">${p.name}</span>
          ${managerNick ? `<span class="scorer-summary-club">(${managerNick})</span>` : ''}
        </li>
      `).join('');
    };

    renderSide('local');
    renderSide('visitante');
  };

  const fillScorersSelects = (sectionEl, state) => {
    if (!sectionEl || !state) return;

    const fill = (side, players) => {
      const sel = sectionEl.querySelector(`select[data-side="${side}"]`);
      if (!sel) return;
      sel.innerHTML = `
        <option value="">Añadir goleador…</option>
        <option value="-1">Gol en propia</option>
        ${players.map(p => `
          <option value="${p.player_id}">
            ${p.name} (${p.totalGoals} gol${p.totalGoals === 1 ? '' : 'es'})
          </option>
        `).join('')}
      `;
    };

    fill('local', state.playersLocal || []);
    fill('visitante', state.playersVisitante || []);
  };

  const addGoalToState = (matchId, side, playerId) => {
    const state = scorerState[matchId];
    if (!state) return;

    // Check limit
    const limit = (side === 'local') ? state.meta.goles_local : state.meta.goles_visitante;
    const teamCols = state[side] || [];
    const currentTotal = teamCols.reduce((acc, p) => acc + p.goals, 0);

    // Permitir si limit es null/undefined (por si acaso), pero debería ser numérico
    if (typeof limit === 'number' && currentTotal >= limit) {
      alert(`No puedes añadir más goles. El ${side === 'local' ? 'Local' : 'Visitante'} tiene ${limit} goles en total.`);
      return;
    }

    const arr = state[side] || (state[side] = []);
    const pid = Number(playerId);
    let item = arr.find(x => x.player_id === pid);
    if (!item) {
      const meta = (pid === -1)
        ? { name: 'Gol en propia' }
        : (state.playerMeta[pid] || { name: `Jugador ${pid}` });
      item = { player_id: pid, name: meta.name, goals: 0 };
      arr.push(item);
    }
    item.goals += 1;
    arr.sort((a, b) =>
      (b.goals - a.goals) ||
      a.name.localeCompare(b.name, 'es', { sensitivity: 'base' })
    );
  };

  const changeGoalCount = (matchId, side, playerId, delta) => {
    const state = scorerState[matchId];
    if (!state) return;

    const arr = state[side] || (state[side] = []);
    const pid = Number(playerId);
    const idx = arr.findIndex(x => x.player_id === pid);
    if (idx === -1) return;

    if (delta > 0) {
      const limit = (side === 'local') ? state.meta.goles_local : state.meta.goles_visitante;
      const currentTotal = arr.reduce((acc, p) => acc + p.goals, 0);
      if (typeof limit === 'number' && currentTotal >= limit) {
        alert(`Límite de goles alcanzado (${limit}).`);
        return;
      }
    }

    arr[idx].goals += delta;
    if (arr[idx].goals <= 0) {
      arr.splice(idx, 1);
    } else {
      arr.sort((a, b) =>
        (b.goals - a.goals) ||
        a.name.localeCompare(b.name, 'es', { sensitivity: 'base' })
      );
    }
  };

  const removeScorer = (matchId, side, playerId) => {
    const state = scorerState[matchId];
    if (!state) return;
    const arr = state[side] || (state[side] = []);
    const pid = Number(playerId);
    const idx = arr.findIndex(x => x.player_id === pid);
    if (idx !== -1) arr.splice(idx, 1);
  };

  const saveScorersToSupabase = async (matchId) => {
    const state = scorerState[matchId];
    if (!state) return { ok: false, msg: 'No hay datos de goleadores' };

    const supa = await getSupa();
    if (!supa) return { ok: false, msg: 'Supabase no configurado' };

    const season = getActiveSeasonSafe();
    if (!season) return { ok: false, msg: 'Temporada activa no definida' };

    const meta = state.meta;
    const localTeamId = meta.local_team_id;
    const visitTeamId = meta.visitante_team_id;

    if (!localTeamId || !visitTeamId) {
      return { ok: false, msg: 'Faltan league_team_id en el partido' };
    }

    // 1) borrar eventos de gol existentes del partido
    const { error: errDel } = await supa
      .from('goal_events')
      .delete()
      .eq('match_id', matchId)
      .eq('match_id', matchId)
      .in('event_type', ['goal', 'own_goal']);

    if (errDel) {
      console.error('Error borrando goal_events:', errDel);
      return { ok: false, msg: 'No se pudieron borrar los eventos antiguos' };
    }

    // 2) preparar nuevos goal_events (uno por gol)
    const rows = [];

    const pushSide = (sideName, leagueTeamId) => {
      (state[sideName] || []).forEach(p => {
        for (let i = 0; i < p.goals; i++) {
          rows.push({
            match_id: matchId,
            league_team_id: leagueTeamId,
            player_id: (p.player_id === -1) ? null : p.player_id,
            minute: null,
            event_type: (p.player_id === -1) ? 'own_goal' : 'goal'
          });
        }
      });
    };

    pushSide('local', localTeamId);
    pushSide('visitante', visitTeamId);

    if (rows.length) {
      const { error: errIns } = await supa
        .from('goal_events')
        .insert(rows);

      if (errIns) {
        console.error('Error insertando goal_events:', errIns);
        return { ok: false, msg: 'No se pudieron guardar los goles del partido' };
      }
    }

    // A partir de aquí, la vista goleadores/pichichi se recalcula sola
    return { ok: true, msg: 'Goleadores guardados correctamente' };
  };

  const initScorersEditor = async (matchId, meta) => {
    if (!hasSupabase || !matchId || !meta) return;
    if (!bodyEl) return;

    const section = bodyEl.querySelector('.scorers-editor');
    if (!section) return;

    const statusEl = section.querySelector('.scorers-status');
    const saveBtn = section.querySelector('.btn-save-scorers');
    const editPanel = section.querySelector('.scorers-edit-panel');
    const toggleBtn = section.querySelector('.btn-toggle-scorers-edit');

    if (statusEl) statusEl.textContent = 'Cargando goleadores...';

    const state = await loadScorersStateSafe(matchId, meta);
    if (!state) {
      if (statusEl) statusEl.textContent = 'No se pudo cargar el editor de goleadores.';
      return;
    }

    // Rellenar selects, listas de edición y resumen "bonito"
    fillScorersSelects(section, state);
    renderSideScorersList(section, 'local', state);
    renderSideScorersList(section, 'visitante', state);
    renderScorersSummary(section, state);

    if (statusEl) statusEl.textContent = '';

    // Aseguramos que el panel de edición empieza oculto
    if (editPanel) {
      editPanel.hidden = true;
    }
    if (toggleBtn) {
      toggleBtn.textContent = 'Editar goleadores';
      toggleBtn.addEventListener('click', () => {
        if (!editPanel) return;
        const isHidden = editPanel.hidden;
        editPanel.hidden = !isHidden;
        toggleBtn.textContent = isHidden ? 'Cerrar edición' : 'Editar goleadores';
      });
    }

    // Botones + (añadir desde select)
    section.querySelectorAll('.btn-add-goal').forEach(btn => {
      btn.addEventListener('click', () => {
        const side = btn.getAttribute('data-side');
        const sel = section.querySelector(`select[data-side="${side}"]`);
        if (!sel) return;
        const value = sel.value;
        if (!value) return;
        addGoalToState(matchId, side, value);
        const st = scorerState[matchId];
        renderSideScorersList(section, side, st);
        renderScorersSummary(section, st);
      });
    });

    // Delegación en listas para + / - / eliminar
    section.addEventListener('click', (e) => {
      const target = e.target;
      const matchState = scorerState[matchId];
      if (!matchState) return;

      const btnPlus = target.closest && target.closest('.btn-plus-goal');
      const btnMinus = target.closest && target.closest('.btn-minus-goal');
      const btnRem = target.closest && target.closest('.btn-remove-scorer');

      if (btnPlus || btnMinus || btnRem) {
        e.preventDefault();
        const side = target.getAttribute('data-side') ||
          (target.closest('.scorers-col') && target.closest('.scorers-col').getAttribute('data-side'));
        const pid = target.getAttribute('data-player-id');
        if (!side || !pid) return;

        if (btnPlus) {
          changeGoalCount(matchId, side, pid, +1);
        } else if (btnMinus) {
          changeGoalCount(matchId, side, pid, -1);
        } else if (btnRem) {
          removeScorer(matchId, side, pid);
        }

        renderSideScorersList(section, 'local', matchState);
        renderSideScorersList(section, 'visitante', matchState);
        renderScorersSummary(section, matchState);
      }
    });

    // Guardar goleadores
    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        if (statusEl) statusEl.textContent = 'Guardando goleadores...';
        saveBtn.disabled = true;
        try {
          const res = await saveScorersToSupabase(matchId);
          if (statusEl) statusEl.textContent = res.msg || '';
          const st = scorerState[matchId];
          renderScorersSummary(section, st);
          if (editPanel && toggleBtn) {
            editPanel.hidden = true;
            toggleBtn.textContent = 'Editar goleadores';
          }
        } finally {
          saveBtn.disabled = false;
        }
      });
    }
  };

  // Wrapper para mantener compatibilidad si necesitas
  const loadScorersStateSafe = (matchId, meta) => {
    return loadScorerStateForMatch(meta);
  };
  // -----------------------------
  // Editor de tarjetas rojas
  // -----------------------------
  // -----------------------------
  // Editor de tarjetas rojas
  // -----------------------------
  const renderRedCardsList = (sectionEl, side, state) => {
    if (!sectionEl || !state) return;
    const listEl = sectionEl.querySelector(`.redcards-list[data-side="${side}"]`);
    if (!listEl) return;

    const arr = (side === 'local' ? state.redLocal : state.redVisitante) || [];
    if (!arr.length) {
      listEl.innerHTML = `<li class="scorer-empty">Sin tarjetas rojas.</li>`;
      return;
    }

    listEl.innerHTML = arr.map(p => `
      <li class="scorer-item" data-player-id="${p.player_id}">
        <span class="scorer-name">${p.name}</span>
        <button type="button" class="btn-remove-red" data-player-id="${p.player_id}" data-side="${side}">✕</button>
      </li>
    `).join('');
  };

  const fillRedCardsSelects = (sectionEl, state) => {
    if (!sectionEl || !state) return;

    const fill = (side, allPlayers, currentRedPlayers) => {
      const sel = sectionEl.querySelector(`select[data-side="${side}"]`);
      if (!sel) return;

      // Filtrar jugadores que YA tienen roja
      const currentIds = new Set(currentRedPlayers.map(p => p.player_id));
      const available = allPlayers.filter(p => !currentIds.has(p.player_id));

      sel.innerHTML = `
        <option value="">Añadir jug. con roja…</option>
        ${available.map(p => `
          <option value="${p.player_id}">${p.name}</option>
        `).join('')}
      `;
    };

    fill('local', state.playersLocal || [], state.redLocal || []);
    fill('visitante', state.playersVisitante || [], state.redVisitante || []);
  };

  const addRedCardToState = (matchId, side, playerId) => {
    const state = scorerState[matchId];
    if (!state) return;
    const arr = (side === 'local' ? state.redLocal : state.redVisitante);
    const pid = Number(playerId);
    if (arr.some(p => p.player_id === pid)) return; // Ya existe

    const meta = state.playerMeta[pid] || { name: `Jugador ${pid}` };
    arr.push({ player_id: pid, name: meta.name });
    // Sort
    arr.sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
  };

  const removeRedCardFromState = (matchId, side, playerId) => {
    const state = scorerState[matchId];
    if (!state) return;
    const arr = (side === 'local' ? state.redLocal : state.redVisitante);
    const pid = Number(playerId);
    const idx = arr.findIndex(x => x.player_id === pid);
    if (idx !== -1) arr.splice(idx, 1);
  };

  const saveRedCardsFull = async (matchId) => {
    const state = scorerState[matchId];
    if (!state) return { ok: false, msg: 'No hay datos' };

    const supa = await getSupa();
    if (!supa) return { ok: false, msg: 'Supabase no configurado' };

    const meta = state.meta;
    const localTeamId = meta.local_team_id;
    const visitTeamId = meta.visitante_team_id;

    if (!localTeamId || !visitTeamId) return { ok: false, msg: 'Faltan IDs de equipo' };

    // 1) Borrar rojas antiguas de ESTA tabla
    const { error: errDel } = await supa
      .from('match_red_cards')
      .delete()
      .eq('match_id', matchId);

    if (errDel) {
      console.error('Error borrando rojas de match_red_cards:', errDel);
      return { ok: false, msg: 'Error al limpiar rojas antiguas' };
    }

    // 2) Insertar nuevas en match_red_cards
    const rows = [];
    (state.redLocal || []).forEach(p => {
      rows.push({
        match_id: matchId,
        league_team_id: localTeamId,
        player_id: p.player_id
      });
    });
    (state.redVisitante || []).forEach(p => {
      rows.push({
        match_id: matchId,
        league_team_id: visitTeamId,
        player_id: p.player_id
      });
    });

    if (rows.length) {
      const { error: errIns } = await supa.from('match_red_cards').insert(rows);
      if (errIns) {
        console.error('Error insertando rojas en match_red_cards:', errIns);
        return { ok: false, msg: 'Error guardando detalle tarjetas' };
      }
    }

    // 3) Actualizar match_team_stats.red_cards (numérico)
    const lCount = (state.redLocal || []).length;
    const vCount = (state.redVisitante || []).length;

    const [resL, resV] = await Promise.all([
      supa.from('match_team_stats')
        .update({ red_cards: lCount })
        .eq('match_id', matchId)
        .eq('league_team_id', localTeamId),
      supa.from('match_team_stats')
        .update({ red_cards: vCount })
        .eq('match_id', matchId)
        .eq('league_team_id', visitTeamId)
    ]);

    if (resL.error || resV.error) {
      console.warn('Error actualizando contador rojas', resL.error, resV.error);
    }

    // 4) Actualizar suspensiones (siguiente partido)
    await Promise.all([
      saveSuspensionForMatch(matchId, localTeamId, state.redLocal.map(p => p.player_id), matchId),
      saveSuspensionForMatch(matchId, visitTeamId, state.redVisitante.map(p => p.player_id), matchId)
    ]);

    return { ok: true, msg: 'Tarjetas rojas y sanciones guardadas' };
  };

  const initRedCardsEditor = async (matchId, meta) => {
    if (!hasSupabase || !matchId || !meta) return;
    if (!bodyEl) return;

    const section = bodyEl.querySelector('.redcards-editor');
    if (!section) return;

    const statusEl = section.querySelector('.redcards-status');
    const saveBtn = section.querySelector('.btn-save-redcards');

    // We already loaded data in scorerState (reused as matchState)
    // Wait for it if it's not ready? usually initScorersEditor triggered it.
    // Let's call loadScorerStateForMatch again, it returns cached promise/obj if existing
    const state = await loadScorerStateForMatch(meta);
    if (!state) {
      if (statusEl) statusEl.textContent = 'Error cargando datos.';
      return;
    }

    const refreshUI = () => {
      fillRedCardsSelects(section, state);
      renderRedCardsList(section, 'local', state);
      renderRedCardsList(section, 'visitante', state);
    };

    refreshUI();

    // Event Listeners

    // Add buttons
    section.querySelectorAll('.btn-add-red').forEach(btn => {
      btn.addEventListener('click', () => {
        const side = btn.getAttribute('data-side');
        const sel = section.querySelector(`select[data-side="${side}"]`);
        if (!sel) return;
        const val = sel.value;
        if (!val) return;
        addRedCardToState(matchId, side, val);
        refreshUI();
      });
    });

    // Remove buttons (delegated)
    section.addEventListener('click', (e) => {
      const target = e.target;
      const btnRem = target.closest && target.closest('.btn-remove-red');
      if (btnRem) {
        e.preventDefault();
        const side = btnRem.getAttribute('data-side');
        const pid = btnRem.getAttribute('data-player-id');
        if (side && pid) {
          removeRedCardFromState(matchId, side, pid);
          refreshUI();
        }
      }
    });

    // Save
    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        if (statusEl) statusEl.textContent = 'Guardando...';
        saveBtn.disabled = true;
        try {
          const res = await saveRedCardsFull(matchId);
          if (statusEl) statusEl.textContent = res.msg || '';
        } finally {
          saveBtn.disabled = false;
        }
      });
    }
  };

  // -----------------------------
  // Editor de lesiones
  // -----------------------------
  const renderInjuriesList = (sectionEl, side, state) => {
    if (!sectionEl || !state) return;
    const listEl = sectionEl.querySelector(`.injuries-list[data-side="${side}"]`);
    if (!listEl) return;

    const arr = (side === 'local' ? state.injuriesLocal : state.injuriesVisitante) || [];
    if (!arr.length) {
      listEl.innerHTML = `<li class="scorer-empty">Sin lesiones.</li>`;
      return;
    }

    listEl.innerHTML = arr.map(p => `
      <li class="scorer-item" data-player-id="${p.player_id}">
        <span class="scorer-name">${p.name}</span>
        <button type="button" class="btn-remove-injury" data-player-id="${p.player_id}" data-side="${side}">✕</button>
      </li>
    `).join('');
  };

  const fillInjuriesSelects = (sectionEl, state) => {
    if (!sectionEl || !state) return;

    const fill = (side, allPlayers, currentInjured) => {
      const sel = sectionEl.querySelector(`select[data-side="${side}"]`);
      if (!sel) return;

      const currentIds = new Set(currentInjured.map(p => p.player_id));
      const available = allPlayers.filter(p => !currentIds.has(p.player_id));

      sel.innerHTML = `
        <option value="">Añadir lesionado…</option>
        ${available.map(p => `
          <option value="${p.player_id}">${p.name}</option>
        `).join('')}
      `;
    };

    fill('local', state.playersLocal || [], state.injuriesLocal || []);
    fill('visitante', state.playersVisitante || [], state.injuriesVisitante || []);
  };

  const addInjuryToState = (matchId, side, playerId) => {
    const state = scorerState[matchId];
    if (!state) return;
    const arr = (side === 'local' ? state.injuriesLocal : state.injuriesVisitante);
    const pid = Number(playerId);
    if (arr.some(p => p.player_id === pid)) return;

    const meta = state.playerMeta[pid] || { name: `Jugador ${pid}` };
    arr.push({ player_id: pid, name: meta.name });
    arr.sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
  };

  const removeInjuryFromState = (matchId, side, playerId) => {
    const state = scorerState[matchId];
    if (!state) return;
    const arr = (side === 'local' ? state.injuriesLocal : state.injuriesVisitante);
    const pid = Number(playerId);
    const idx = arr.findIndex(x => x.player_id === pid);
    if (idx !== -1) arr.splice(idx, 1);
  };

  const saveInjuriesFull = async (matchId) => {
    const state = scorerState[matchId];
    if (!state) return { ok: false, msg: 'No hay datos' };

    const supa = await getSupa();
    if (!supa) return { ok: false, msg: 'Supabase no configurado' };

    const meta = state.meta;
    const localTeamId = meta.local_team_id;
    const visitTeamId = meta.visitante_team_id;

    if (!localTeamId || !visitTeamId) return { ok: false, msg: 'Faltan IDs de equipo' };

    // 1) Borrar lesiones antiguas
    const { error: errDel } = await supa
      .from('match_injuries')
      .delete()
      .eq('match_id', matchId);

    if (errDel) {
      console.error('Error borrando match_injuries:', errDel);
      return { ok: false, msg: 'Error al limpiar lesiones antiguas' };
    }

    // 2) Insertar nuevas
    const rows = [];
    (state.injuriesLocal || []).forEach(p => {
      rows.push({
        match_id: matchId,
        league_team_id: localTeamId,
        player_id: p.player_id
      });
    });
    (state.injuriesVisitante || []).forEach(p => {
      rows.push({
        match_id: matchId,
        league_team_id: visitTeamId,
        player_id: p.player_id
      });
    });

    if (rows.length) {
      const { error: errIns } = await supa.from('match_injuries').insert(rows);
      if (errIns) {
        console.error('Error insertando match_injuries:', errIns);
        return { ok: false, msg: 'Error guardando lesiones' };
      }
    }

    // 3) Actualizar suspensiones (siguiente partido) con reason='injury'
    await Promise.all([
      saveSuspensionForMatch(matchId, localTeamId, state.injuriesLocal.map(p => p.player_id), matchId, 'injury'),
      saveSuspensionForMatch(matchId, visitTeamId, state.injuriesVisitante.map(p => p.player_id), matchId, 'injury')
    ]);

    return { ok: true, msg: 'Lesiones registradas correctamente' };
  };

  const initInjuriesEditor = async (matchId, meta) => {
    if (!hasSupabase || !matchId || !meta) return;
    if (!bodyEl) return;

    const section = bodyEl.querySelector('.injuries-editor');
    if (!section) return;

    const statusEl = section.querySelector('.injuries-status');
    const saveBtn = section.querySelector('.btn-save-injuries');

    const state = await loadScorerStateForMatch(meta);
    if (!state) {
      if (statusEl) statusEl.textContent = 'Error cargando datos.';
      return;
    }

    const refreshUI = () => {
      fillInjuriesSelects(section, state);
      renderInjuriesList(section, 'local', state);
      renderInjuriesList(section, 'visitante', state);
    };

    refreshUI();

    section.querySelectorAll('.btn-add-injury').forEach(btn => {
      btn.addEventListener('click', () => {
        const side = btn.getAttribute('data-side');
        const sel = section.querySelector(`select[data-side="${side}"]`);
        if (!sel) return;
        const val = sel.value;
        if (!val) return;
        addInjuryToState(matchId, side, val);
        refreshUI();
      });
    });

    section.addEventListener('click', (e) => {
      const target = e.target;
      const btnRem = target.closest && target.closest('.btn-remove-injury');
      if (btnRem) {
        e.preventDefault();
        const side = btnRem.getAttribute('data-side');
        const pid = btnRem.getAttribute('data-player-id');
        if (side && pid) {
          removeInjuryFromState(matchId, side, pid);
          refreshUI();
        }
      }
    });

    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        if (statusEl) statusEl.textContent = 'Guardando...';
        saveBtn.disabled = true;
        try {
          const res = await saveInjuriesFull(matchId);
          if (statusEl) statusEl.textContent = res.msg || '';
        } finally {
          saveBtn.disabled = false;
        }
      });
    }
  };

  // -----------------------------
  // Render de tabla de estadísticas + cabecera
  // statsObj viene de CoreStats.getStatsIndex()[matchId]
  // -----------------------------
  const renderStats = (statsObj, meta) => {
    const equipos = Object.keys(statsObj || {});
    const hasStats = equipos.length === 2;

    const localName = meta?.local || (equipos[0] || 'Local');
    const visitName = meta?.visitante || (equipos[1] || 'Visitante');

    const gl = isNum(meta?.goles_local) ? meta.goles_local : null;
    const gv = isNum(meta?.goles_visitante) ? meta.goles_visitante : null;
    const marcador = (gl !== null && gv !== null) ? `${gl} – ${gv}` : '-';

    const fechaTexto = meta?.fecha
      ? fmtDate(meta.fecha)
      : (meta?.fechaJornada ? fmtDate(meta.fechaJornada) : '');
    const horaTexto = meta?.hora || '';
    const jTexto = meta?.jornada ? `Jornada ${meta.jornada}` : '';

    const metaLine = [fechaTexto, horaTexto, jTexto].filter(Boolean).join(' · ');

    let tableHtml = '';
    let summaryHtml = '';

    if (!hasStats) {
      tableHtml = `<p class="hint">No hay estadísticas detalladas para este partido.</p>`;
    } else {
      const keyA = equipos[0];
      const keyB = equipos[1];
      const Adata = statsObj[keyA] || {};
      const Bdata = statsObj[keyB] || {};

      const get = (data, k) =>
        (data && Object.prototype.hasOwnProperty.call(data, k)) ? data[k] : null;

      const ataqueKeys = ['goles', 'tiros', 'tiros_a_puerta'];
      const balonKeys = ['posesion', 'pases', 'pases_completados', 'centros'];

      const buildKvList = (keys) => keys
        .filter(k => get(Adata, k) !== null || get(Bdata, k) !== null)
        .map(k => `
          <li>
            <span>${k.replace(/_/g, ' ')}</span>
            <span>${get(Adata, k) ?? '—'} · ${get(Bdata, k) ?? '—'}</span>
          </li>
        `).join('');

      const ataqueHtml = buildKvList(ataqueKeys);
      const balonHtml = buildKvList(balonKeys);

      if (ataqueHtml || balonHtml) {
        summaryHtml = `
          <div class="stats-summary cards-2col">
            ${ataqueHtml ? `
              <div class="card">
                <h3>Ataque</h3>
                <ul class="kv">
                  ${ataqueHtml}
                </ul>
              </div>
            ` : ''}
            ${balonHtml ? `
              <div class="card">
                <h3>Juego con balón</h3>
                <ul class="kv">
                  ${balonHtml}
                </ul>
              </div>
            ` : ''}
          </div>
        `;
      }

      const orden = [
        'goles', 'posesion', 'tiros', 'tiros_a_puerta', 'faltas',
        'fueras_de_juego', 'corners', 'tiros_libres', 'pases',
        'pases_completados', 'centros', 'pases_interceptados',
        'entradas', 'paradas', 'rojas'
      ];

      const rows = orden
        .filter(k => Adata.hasOwnProperty(k) || Bdata.hasOwnProperty(k))
        .map(k => `
          <tr>
            <th>${k.replace(/_/g, ' ')}</th>
            <td>${Adata[k] ?? '—'}</td>
            <td>${Bdata[k] ?? '—'}</td>
          </tr>
        `).join('');

      tableHtml = `
        <table class="stats-table stats-table-modern">
          <thead>
            <tr>
              <th>Estadística</th>
              <th>${localName}</th>
              <th>${visitName}</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      `;
    }

    const matchId = meta?.id || '';

    const redCardsEditorHtml =
      (hasSupabase && meta?.local_team_id && meta?.visitante_team_id && matchId)
        ? `
      <hr class="stats-divider" />
      <section class="redcards-editor" data-match-id="${matchId}">
        <h3>Tarjetas rojas</h3>
        <div class="scorers-columns">
          <div class="scorers-col" data-side="local">
            <h4>${localName}</h4>
            <ul class="scorers-list redcards-list" data-side="local"></ul>
            <div class="scorers-add">
              <select data-side="local">
                <option value="">Añadir jug. con roja…</option>
              </select>
              <button type="button" class="btn-add-red" data-side="local">＋</button>
            </div>
          </div>
          <div class="scorers-col" data-side="visitante">
            <h4>${visitName}</h4>
            <ul class="scorers-list redcards-list" data-side="visitante"></ul>
            <div class="scorers-add">
              <select data-side="visitante">
                <option value="">Añadir jug. con roja…</option>
              </select>
              <button type="button" class="btn-add-red" data-side="visitante">＋</button>
            </div>
          </div>
        </div>
        <div class="redcards-actions">
           <span class="redcards-status" aria-live="polite"></span>
           <button type="button" class="btn-save-redcards">Guardar rojas</button>
        </div>
      </section>
      `
        : '';

    const injuriesEditorHtml =
      (hasSupabase && meta?.local_team_id && meta?.visitante_team_id && matchId)
        ? `
      <hr class="stats-divider" />
      <section class="injuries-editor" data-match-id="${matchId}">
        <h3>Lesiones (Bajas próximo partido)</h3>
        <div class="scorers-columns">
          <div class="scorers-col" data-side="local">
            <h4>${localName}</h4>
            <ul class="scorers-list injuries-list" data-side="local"></ul>
            <div class="scorers-add">
              <select data-side="local">
                <option value="">Añadir lesionado…</option>
              </select>
              <button type="button" class="btn-add-injury" data-side="local">＋</button>
            </div>
          </div>
          <div class="scorers-col" data-side="visitante">
            <h4>${visitName}</h4>
            <ul class="scorers-list injuries-list" data-side="visitante"></ul>
            <div class="scorers-add">
              <select data-side="visitante">
                <option value="">Añadir lesionado…</option>
              </select>
              <button type="button" class="btn-add-injury" data-side="visitante">＋</button>
            </div>
          </div>
        </div>
        <div class="injuries-actions">
           <span class="injuries-status" aria-live="polite"></span>
           <button type="button" class="btn-save-injuries">Guardar lesiones</button>
        </div>
      </section>
      `
        : '';

    const scorersEditorHtml =
      (hasSupabase && meta?.local_team_id && meta?.visitante_team_id && matchId)
        ? `
      <hr class="stats-divider" />
      <section class="scorers-editor" data-match-id="${matchId}">
        <h3>Goleadores del partido</h3>

        <div class="scorers-summary-block">
          <div class="scorers-summary-columns">
            <div class="scorers-summary-side">
              <h5>${localName}</h5>
              <ul class="scorers-summary-list" data-side="local"></ul>
            </div>
            <div class="scorers-summary-side">
              <h5>${visitName}</h5>
              <ul class="scorers-summary-list" data-side="visitante"></ul>
            </div>
          </div>
        </div>

        <div class="scorers-edit-toggle">
          <button type="button" class="btn-toggle-scorers-edit">
            Editar goleadores
          </button>
          <span class="scorers-status" aria-live="polite"></span>
        </div>

        <div class="scorers-edit-panel" hidden>
          <p class="hint small">
            Usa los selectores para añadir o ajustar los goles de cada jugador.
          </p>
          <div class="scorers-columns">
            <div class="scorers-col" data-side="local">
              <h4>${localName}</h4>
              <ul class="scorers-list" data-role="list" data-side="local"></ul>
              <div class="scorers-add">
                <select data-role="select" data-side="local">
                  <option value="">Añadir goleador…</option>
                </select>
                <button type="button" class="btn-add-goal" data-side="local">＋</button>
              </div>
            </div>
            <div class="scorers-col" data-side="visitante">
              <h4>${visitName}</h4>
              <ul class="scorers-list" data-role="list" data-side="visitante"></ul>
              <div class="scorers-add">
                <select data-role="select" data-side="visitante">
                  <option value="">Añadir goleador…</option>
                </select>
                <button type="button" class="btn-add-goal" data-side="visitante">＋</button>
              </div>
            </div>
          </div>
          <div class="scorers-actions">
            <button type="button" class="btn-save-scorers">Guardar goleadores</button>
          </div>
        </div>
      </section>
      `
        : '';

    return `
      <div class="stats-header">
        <div class="stats-teams">
          <span class="stats-team-name">${localName}</span>
          <span class="stats-score">${marcador}</span>
          <span class="stats-team-name">${visitName}</span>
        </div>
        ${metaLine ? `<p class="stats-meta">${metaLine}</p>` : ''}
      </div>
      ${summaryHtml}
      ${tableHtml}
      ${redCardsEditorHtml}
      ${injuriesEditorHtml}
      ${scorersEditorHtml}
    `;
  };

  // -----------------------------
  // Render de una jornada concreta (meteo no bloqueante)
  // -----------------------------
  const renderJornada = async (num) => {
    const j = jornadas.find(x => x.numero === num);
    if (!j) {
      jornadaWrap.innerHTML = `<p class="hint">No se ha encontrado la jornada ${num}.</p>`;
      return;
    }

    const labelParts = [`Jornada ${j.numero}`];
    if (j.fecha) labelParts.push(fmtDate(j.fecha));
    if (labelEl) labelEl.textContent = labelParts.join(' · ');

    const partidos = j.partidos || [];
    if (!partidos.length) {
      jornadaWrap.innerHTML = `<p class="hint">Esta jornada no tiene partidos definidos.</p>`;
      return;
    }

    // 1) Pintamos las tarjetas SIN esperar a la meteo
    const cardsHtml = partidos.map((p, idx) => {
      const pid = p.id || `J${j.numero}-P${idx + 1}`;
      const gl = isNum(p.goles_local) ? p.goles_local : null;
      const gv = isNum(p.goles_visitante) ? p.goles_visitante : null;
      const marcador = (gl !== null && gv !== null) ? `${gl} – ${gv}` : '-';
      const jugado = (gl !== null && gv !== null);

      let chipText = '';
      let chipClass = '';
      if (jugado) {
        if (gl > gv) {
          chipText = 'Victoria local';
          chipClass = 'chip chip-pos';
        } else if (gl < gv) {
          chipText = 'Victoria visitante';
          chipClass = 'chip chip-neg';
        } else {
          chipText = 'Empate';
          chipClass = 'chip';
        }
      }
      const chipHTML = chipText
        ? `<span class="result-chip ${chipClass}">${chipText}</span>`
        : '';

      const fechaHora = (p.fecha || j.fecha || p.hora)
        ? `<div class="fecha-hora">
             ${p.fecha ? fmtDate(p.fecha) : (j.fecha ? fmtDate(j.fecha) : '')}
             ${p.hora ? ` · ${p.hora}` : ''}
           </div>`
        : '';

      const streamHTML = p.stream
        ? `<div class="result-stream">
             <a href="${p.stream}" target="_blank" rel="noopener noreferrer">
               🔴 Ver directo / VOD
             </a>
           </div>`
        : '';

      const uploadHTML = (!jugado && MATCH_UPLOAD.enabled)
        ? `<div class="result-upload">
             <button type="button"
                     class="upload-photo-btn"
                     data-partido-id="${pid}">
               Subir imagen
             </button>
           </div>`
        : '';

      const hasStats = true;

      // Placeholder meteo: texto neutro + data-city para actualizar luego
      const cityName = getCityForKey(p.local);
      const meteoPlaceholder = cityName
        ? `<div class="result-meteo muted"
                 data-city="${cityName}">
             Meteo cargando...
           </div>`
        : '';

      return `
        <article class="result-card ${jugado ? 'result-played' : 'result-pending'}">
          <button class="result-main partido-card"
                  data-partido-id="${pid}"
                  aria-label="Ver estadísticas del partido">
            <div class="result-teams">
              <div class="result-team-block">
                <img class="result-badge" src="${logoFor(p.local)}"
                     alt="Escudo ${p.local}"
                     onerror="this.style.visibility='hidden'">
                <span class="team-name">${p.local}</span>
              </div>
              <span class="result-score">${marcador}</span>
              <div class="result-team-block">
                <img class="result-badge" src="${logoFor(p.visitante)}"
                     alt="Escudo ${p.visitante}"
                     onerror="this.style.visibility='hidden'">
                <span class="team-name">${p.visitante}</span>
              </div>
            </div>
            ${fechaHora}
            ${meteoPlaceholder}
            <div class="result-status-line">
              <div class="result-status-left">
                <span class="result-status ${jugado ? 'played' : 'pending'}">
                  ${jugado ? 'Finalizado' : 'Pendiente'}
                </span>
                ${chipHTML}
              </div>
              ${hasStats ? '<span class="result-link">Ver estadísticas ▸</span>' : ''}
            </div>
          </button>
          ${streamHTML}
          ${uploadHTML}
        </article>
      `;
    }).join('');

    jornadaWrap.innerHTML = `
      <section class="jornada-bloque">
        <div class="results-grid">
          ${cardsHtml}
        </div>
      </section>
    `;

    // 2) Ahora sí, lanzamos las peticiones de meteo en segundo plano
    partidos.forEach((p, idx) => {
      const cityName = getCityForKey(p.local);
      if (!cityName) return;

      const pid = p.id || `J${j.numero}-P${idx + 1}`;
      const cardBtn = jornadaWrap.querySelector(`.partido-card[data-partido-id="${pid}"]`);
      if (!cardBtn) return;

      const meteoEl = cardBtn.querySelector('.result-meteo[data-city]');
      if (!meteoEl) return;

      fetchWeatherForCity(cityName)
        .then(cat => {
          // Si el usuario ha cambiado de jornada mientras tanto, no tocamos nada
          if (current !== num) return;

          if (!cat) {
            // Si no hay datos útiles, quitamos el bloque o lo dejamos vacío
            meteoEl.textContent = '';
            return;
          }

          meteoEl.textContent = `Meteo hoy en ${cityName}: ${cat.emoji} ${cat.label}`;
        })
        .catch(() => {
          // En error, simplemente dejamos el placeholder o lo vaciamos
        });
    });

    // 3) Cargamos sanciones (suspensiones) para mostrarlas en las tarjetas
    //    Esto se hace en paralelo, y cuando lleguen actualizamos el DOM
    if (hasSupabase && partidos.length > 0) {
      loadSuspensionsForMatches(partidos)
        .then(suspensionsMap => {
          if (current !== num) return;
          // suspensionsMap: matchId -> [{ playerName, teamName, reason... }]
          Object.keys(suspensionsMap).forEach(mId => {
            const cardBtn = jornadaWrap.querySelector(`.partido-card[data-partido-id="${mId}"]`);
            if (!cardBtn) return;
            const susList = suspensionsMap[mId];
            if (!susList || !susList.length) return;

            // Buscamos dónde inyectarlo. Por ejemplo antes de .result-status-line o dentro.
            // Vamos a crear un bloque .result-suspensions
            const statusLine = cardBtn.querySelector('.result-status-line');
            if (!statusLine) return;

            const div = document.createElement('div');
            div.className = 'result-suspensions';
            div.style.marginTop = '8px';
            div.style.fontSize = '0.8rem';
            div.style.color = '#ef4444'; // rojo suave

            const sancionados = susList.filter(s => s.reason === 'red_card' || !s.reason);
            const lesionados = susList.filter(s => s.reason === 'injury');

            let html = '';
            if (sancionados.length) {
              const names = sancionados.map(s => `${s.playerName} (${s.teamName})`).join(', ');
              html += `<div style="color:#ef4444"><strong>Sancionados:</strong> ${names}</div>`;
            }
            if (lesionados.length) {
              const names = lesionados.map(s => `${s.playerName} (${s.teamName})`).join(', ');
              html += `<div style="color:#f59e0b"><strong>Lesionados:</strong> ${names}</div>`;
            }
            div.innerHTML = html;

            statusLine.parentNode.insertBefore(div, statusLine.nextSibling);
          });
        })
        .catch(err => console.warn('Error loading suspensions', err));
    }
  };

  // -----------------------------
  // Helper: Sanciones (suspensiones)
  // -----------------------------
  const loadSuspensionsForMatches = async (partidos) => {
    const supa = await getSupa();
    if (!supa) return {};

    const matchIds = partidos.map(p => p.id).filter(Boolean);
    if (!matchIds.length) return {};

    const { data, error } = await supa
      .from('player_suspensions')
      .select(`
        match_id,
        reason,
        player:players(name),
        team:league_teams(nickname, display_name)
      `)
      .in('match_id', matchIds);

    if (error) {
      console.warn('Error fetching player_suspensions:', error);
      return {};
    }

    const map = {};
    (data || []).forEach(row => {
      const mid = row.match_id;
      const pName = row.player?.name || 'Jugador';
      const tName = row.team?.nickname || row.team?.display_name || 'Equipo';

      if (!map[mid]) map[mid] = [];
      map[mid].push({ playerName: pName, teamName: tName, reason: row.reason });
    });
    return map;
  };

  const getNextMatchForTeam = async (season, teamId, currentRoundId) => {
    const supa = await getSupa();
    if (!supa) return null;

    // Asumimos que round_id es numérico y secuencial
    const currentRoundNum = Number(currentRoundId);
    if (!isNum(currentRoundNum)) return null;

    const { data, error } = await supa
      .from('matches')
      .select('id, round_id')
      .eq('season', season)
      .or(`home_league_team_id.eq.${teamId},away_league_team_id.eq.${teamId}`)
      .gt('round_id', currentRoundNum)
      .order('round_id', { ascending: true })
      .limit(1)
      .single();

    if (error || !data) return null;
    return data.id;
  };

  const saveSuspensionForMatch = async (matchId, teamId, playerIds, originMatchId, reason = 'red_card') => {
    // 1. Borrar suspensiones previas generadas por este partido (originMatchId) para este equipo
    //    que ya no estén en la lista de playerIds (por si se quitó la roja/lesión).
    const supa = await getSupa();
    if (!supa) return;

    // Primero obtenemos las suspensiones actuales de este origen+equipo
    const { data: currentSus, error: errGet } = await supa
      .from('player_suspensions')
      .select('player_id')
      .eq('origin_match_id', originMatchId)
      .eq('league_team_id', teamId);

    if (errGet) {
      console.warn('Error reading current suspensions', errGet);
    }

    const currentPids = (currentSus || []).map(x => x.player_id);
    const newPidsSet = new Set(playerIds);

    // A eliminar: los que están en DB pero no en la nueva lista
    const toDelete = currentPids.filter(pid => !newPidsSet.has(pid));

    if (toDelete.length > 0) {
      await supa
        .from('player_suspensions')
        .delete()
        .eq('origin_match_id', originMatchId)
        .eq('league_team_id', teamId)
        .in('player_id', toDelete);
    }

    // A insertar: los que están en nueva lista pero no en DB
    const toInsert = playerIds.filter(pid => !currentPids.includes(pid));

    if (toInsert.length > 0) {
      // Buscar siguiente partido
      const meta = partidoMeta[originMatchId];
      if (!meta) return;

      const season = getActiveSeasonSafe();
      const currentRound = meta.round_id || meta.jornada;

      const nextMatchId = await getNextMatchForTeam(season, teamId, currentRound);
      if (!nextMatchId) {
        console.log('No next match found for suspension/injury for team', teamId);
        return;
      }

      const rows = toInsert.map(pid => ({
        player_id: pid,
        league_team_id: teamId,
        match_id: nextMatchId,
        origin_match_id: originMatchId,
        reason: reason
      }));

      const { error: errIns } = await supa
        .from('player_suspensions')
        .insert(rows);

      if (errIns) console.warn('Error inserting suspensions', errIns);
    }
  };


  // -----------------------------
  // Subida de imagen del partido -> S3 vía presigned URL
  // -----------------------------
  const requestUploadUrl = async (matchId, file) => {
    if (!MATCH_UPLOAD.enabled || !MATCH_UPLOAD.presignEndpoint) {
      throw new Error('Subida de imágenes no configurada');
    }

    const payload = {
      matchId,
      filename: file.name,
      contentType: file.type || 'image/jpeg'
    };

    const res = await fetch(MATCH_UPLOAD.presignEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      throw new Error(`Error solicitando URL de subida: HTTP ${res.status}`);
    }

    const data = await res.json();
    if (!data || !data.uploadUrl) {
      throw new Error('Respuesta sin uploadUrl');
    }

    return data.uploadUrl;
  };

  const uploadMatchImage = async (matchId, file, buttonEl) => {
    try {
      buttonEl.disabled = true;
      buttonEl.textContent = 'Subiendo...';

      const uploadUrl = await requestUploadUrl(matchId, file);

      const res = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': file.type || 'image/jpeg'
        },
        body: file
      });

      if (!res.ok) {
        throw new Error(`Error subiendo la imagen: HTTP ${res.status}`);
      }

      buttonEl.textContent = 'Imagen subida ✔';
      buttonEl.classList.add('upload-success');
    } catch (err) {
      console.error('Error al subir la imagen del partido', err);
      alert('No se ha podido subir la imagen. Inténtalo de nuevo.');
      buttonEl.disabled = false;
      buttonEl.textContent = 'Subir imagen';
    }
  };

  const handleUploadClick = (btn) => {
    const matchId = btn.getAttribute('data-partido-id');
    if (!matchId) return;

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';

    input.addEventListener('change', () => {
      const file = input.files && input.files[0];
      if (!file) return;
      uploadMatchImage(matchId, file, btn);
    });

    input.click();
  };

  // -----------------------------
  // Navegación jornadas
  // -----------------------------
  let current = lastPlayed;

  const updateNav = () => {
    if (prevBtn) prevBtn.disabled = current <= minJornada;
    if (nextBtn) nextBtn.disabled = current >= maxJornada;
  };

  prevBtn?.addEventListener('click', async () => {
    if (current > minJornada) {
      current--;
      await renderJornada(current);
      updateNav();
    }
  });

  nextBtn?.addEventListener('click', async () => {
    if (current < maxJornada) {
      current++;
      await renderJornada(current);
      updateNav();
    }
  });

  // Delegación: click en tarjeta de partido (stats) o botón "Subir imagen"
  root.addEventListener('click', async (e) => {
    const target = e.target;

    // 1) Botón "Subir imagen"
    const uploadBtn = target.closest?.('.upload-photo-btn');
    if (uploadBtn) {
      e.preventDefault();
      handleUploadClick(uploadBtn);
      return;
    }

    // 2) Tarjeta de partido
    const cardBtn = target.closest?.('.partido-card');
    if (!cardBtn) return;

    const id = cardBtn.getAttribute('data-partido-id');
    if (!id) return;

    const meta = partidoMeta[id];
    if (!meta || !bodyEl) return;

    // Pintamos algo rápido mientras se cargan las stats
    bodyEl.innerHTML = `<p class="hint">Cargando estadísticas...</p>`;
    if (titleEl) {
      titleEl.textContent = `Estadísticas — ${meta.local} vs ${meta.visitante}`;
    }
    openModal();

    // Lazy: cargamos statsIndex sólo ahora
    let stats = {};
    try {
      const idx = await ensureStatsIndex();
      stats = idx[id] || {};
    } catch (err) {
      console.warn('Error cargando stats para partido', id, err);
    }

    bodyEl.innerHTML = renderStats(stats, meta);

    if (meta.id) {
      void initScorersEditor(meta.id, meta);
      void initRedCardsEditor(meta.id, meta);
      void initInjuriesEditor(meta.id, meta);
    }
  });

  // Primera carga: última jornada jugada
  await renderJornada(current);
  updateNav();
})();
