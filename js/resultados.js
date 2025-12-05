(async () => {
  const root = document.getElementById('resultados');
  if (!root) return;

  // Modal refs
  const backdrop  = document.getElementById('stats-backdrop');
  const bodyEl    = document.getElementById('stats-body');
  const closeBtn  = document.getElementById('stats-close');
  const titleEl   = document.getElementById('stats-title');

  // Helpers comunes
  const {
    loadJSON,
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
    if (bodyEl)  bodyEl.innerHTML = '';
    if (titleEl) titleEl.textContent = 'Estadísticas del partido';
  };

  // Cerrar siempre al cargar (por si el HTML quedó sin hidden)
  closeModal();

  // Listeners de cierre
  closeBtn?.addEventListener('click', closeModal);
  backdrop?.addEventListener('click', (e)=> {
    if (e.target === backdrop) closeModal();
  });
  document.addEventListener('keydown', (e)=> {
    if (e.key === 'Escape' && backdrop && !backdrop.hidden) closeModal();
  });

  // -----------------------------
  // METEO: mapa clave -> ciudad (tu JSON)
  // -----------------------------
  let ciudadesConfig = {};
  try {
    if (typeof loadJSON === 'function') {
      ciudadesConfig = await loadJSON('data/equipos_ciudades.json');
    }
  } catch {
    ciudadesConfig = {};
  }

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
    if ([1,2,3].includes(c)) return { label: "Nublado", emoji: "⛅" };
    if ([45,48].includes(c)) return { label: "Niebla", emoji: "🌫️" };

    if ([51,53,55,56,57,61,63,65,66,67,80,81,82,95,96,99].includes(c))
      return { label: "Lluvia", emoji: "🌧️" };

    if ([71,73,75,77,85,86].includes(c))
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
    const localTeamId  = matchMeta.local_team_id;
    const visitTeamId  = matchMeta.visitante_team_id;

    // IDs de club (clubs.id) – puede que vengan de CoreStats o no
    let localClubId    = matchMeta.local_club_id;
    let visitClubId    = matchMeta.visitante_club_id;

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
      .eq('event_type', 'goal');

    if (errMatchEv) {
      console.warn('Error cargando goal_events del partido:', errMatchEv);
    }

    const aggSide = { local: {}, visitante: {} };

    (matchEvents || []).forEach(ev => {
      const pid = ev.player_id;
      if (!pid) return;
      const side = (ev.league_team_id === localTeamId)
        ? 'local'
        : (ev.league_team_id === visitTeamId ? 'visitante' : null);
      if (!side) return;
      aggSide[side][pid] = (aggSide[side][pid] || 0) + 1;
    });

    const buildSideArr = (side) => {
      const out = [];
      const counts = aggSide[side] || {};
      Object.keys(counts).forEach(pidStr => {
        const pid = Number(pidStr);
        const goals = counts[pidStr];
        const meta = playerMeta[pid] || { name: `Jugador ${pid}` };
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

    const state = {
      meta: {
        ...matchMeta,
        local_club_id: localClubId,
        visitante_club_id: visitClubId
      },
      local: buildSideArr('local'),
      visitante: buildSideArr('visitante'),
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
    const arr = state[side] || (state[side] = []);
    const pid = Number(playerId);
    let item = arr.find(x => x.player_id === pid);
    if (!item) {
      const meta = state.playerMeta[pid] || { name: `Jugador ${pid}` };
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
      .eq('event_type', 'goal');

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
            player_id: p.player_id,
            minute: null,
            event_type: 'goal'
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

    const statusEl   = section.querySelector('.scorers-status');
    const saveBtn    = section.querySelector('.btn-save-scorers');
    const editPanel  = section.querySelector('.scorers-edit-panel');
    const toggleBtn  = section.querySelector('.btn-toggle-scorers-edit');

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

      const btnPlus  = target.closest && target.closest('.btn-plus-goal');
      const btnMinus = target.closest && target.closest('.btn-minus-goal');
      const btnRem   = target.closest && target.closest('.btn-remove-scorer');

      if (btnPlus || btnMinus || btnRem) {
        e.preventDefault();
        const side = target.getAttribute('data-side') ||
          (target.closest('.scorers-col') && target.closest('.scorers-col').getAttribute('data-side'));
        const pid  = target.getAttribute('data-player-id');
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
  // Render de tabla de estadísticas + cabecera
  // statsObj viene de CoreStats.getStatsIndex()[matchId]
  // -----------------------------
  const renderStats = (statsObj, meta) => {
    const equipos = Object.keys(statsObj || {});
    const hasStats = equipos.length === 2;

    const localName  = meta?.local || (equipos[0] || 'Local');
    const visitName  = meta?.visitante || (equipos[1] || 'Visitante');

    const gl = isNum(meta?.goles_local)     ? meta.goles_local     : null;
    const gv = isNum(meta?.goles_visitante) ? meta.goles_visitante : null;
    const marcador = (gl !== null && gv !== null) ? `${gl} – ${gv}` : '-';

    const fechaTexto = meta?.fecha
      ? fmtDate(meta.fecha)
      : (meta?.fechaJornada ? fmtDate(meta.fechaJornada) : '');
    const horaTexto  = meta?.hora || '';
    const jTexto     = meta?.jornada ? `Jornada ${meta.jornada}` : '';

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
      const balonKeys  = ['posesion', 'pases', 'pases_completados', 'centros'];

      const buildKvList = (keys) => keys
        .filter(k => get(Adata, k) !== null || get(Bdata, k) !== null)
        .map(k => `
          <li>
            <span>${k.replace(/_/g, ' ')}</span>
            <span>${get(Adata, k) ?? '—'} · ${get(Bdata, k) ?? '—'}</span>
          </li>
        `).join('');

      const ataqueHtml = buildKvList(ataqueKeys);
      const balonHtml  = buildKvList(balonKeys);

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
      ${scorersEditorHtml}
    `;
  };

  // -----------------------------
  // Render de una jornada concreta (async por meteo)
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

    const meteoArr = await Promise.all(
      partidos.map(p => {
        const cityName = getCityForKey(p.local);
        return cityName ? fetchWeatherForCity(cityName) : Promise.resolve(null);
      })
    );

    const cardsHtml = partidos.map((p, idx) => {
      const pid = p.id || `J${j.numero}-P${idx+1}`;
      const gl = isNum(p.goles_local)     ? p.goles_local     : null;
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

      const cityName   = getCityForKey(p.local);
      const meteo      = meteoArr[idx];
      const meteoHTML  = (meteo && cityName)
        ? `<div class="result-meteo muted">Meteo hoy en ${cityName}: ${meteo.emoji} ${meteo.label}</div>`
        : (meteo
            ? `<div class="result-meteo muted">Meteo hoy: ${meteo.emoji} ${meteo.label}</div>`
            : '');

      return `
        <article class="result-card ${jugado ? 'result-played' : 'result-pending'}">
          <button class="result-main partido-card"
                  data-partido-id="${pid}"
                  ${hasStats ? '' : 'data-no-stats="1"'}
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
            ${meteoHTML}
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
  }
});


  // Primera carga: última jornada jugada
  await renderJornada(current);
  updateNav();
})();
