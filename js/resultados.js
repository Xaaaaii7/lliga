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
  const isNum = v => typeof v === 'number' && Number.isFinite(v);
  const norm = normalizeText || (s => String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9\s-]/g,'')
    .trim());
  const slug = slugify || (s => norm(s).replace(/\s+/g,'-'));
  const logoFor = logoPath || (name => `img/${slug(name)}.png`);

  // Helpers modal
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
    ciudadesConfig = await loadJSON('data/equipos_ciudades.json');
  } catch {
    ciudadesConfig = {};
  }

  // Cache meteo por ciudad (para no repetir peticiones)
  const weatherCache = new Map(); // key (city lower) -> { label, emoji }

  // Map weathercode (Open-Meteo) a categoría simple
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

  // Meteo a partir del NOMBRE de ciudad (usando geocoding + current_weather)
  const fetchWeatherForCity = async (cityName) => {
    if (!cityName) return null;
    const key = cityName.toLowerCase();

    if (weatherCache.has(key)) return weatherCache.get(key);

    try {
      // 1) Geocoding
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

      // 2) Tiempo actual
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

  // Dado un "equipo local" (o nombre clave), saca la ciudad desde tu JSON
  const getCityForKey = (keyName) => {
    if (!keyName) return null;
    return ciudadesConfig[keyName] || null;
  };

  const supabaseCfg = typeof getSupabaseConfig === 'function'
    ? getSupabaseConfig()
    : { url: '', anonKey: '', season: '' };
  const SUPABASE_URL = supabaseCfg.url || '';
  const SUPABASE_ANON_KEY = supabaseCfg.anonKey || '';
  const ACTIVE_SEASON = root?.dataset?.season || (typeof getActiveSeason === 'function' ? getActiveSeason() : '');

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || typeof getSupabaseClient !== 'function') {
    root.innerHTML = `<p class="hint">Configura SUPABASE_URL y SUPABASE_ANON_KEY antes de cargar los resultados.</p>`;
    return;
  }

  const teamNameFrom = (teamObj) => teamObj?.display_name?.trim() || teamObj?.nickname?.trim() || `Equipo ${teamObj?.id ?? ''}`.trim();

  const mapStatsRow = (row) => ({
    goles: row?.goals ?? null,
    posesion: row?.possession ?? null,
    tiros: row?.shots ?? null,
    tiros_a_puerta: row?.shots_on_target ?? null,
    faltas: row?.fouls ?? null,
    fueras_de_juego: row?.offsides ?? null,
    corners: row?.corners ?? null,
    tiros_libres: row?.free_kicks ?? null,
    pases: row?.passes ?? null,
    pases_completados: row?.passes_completed ?? null,
    centros: row?.crosses ?? null,
    pases_interceptados: row?.interceptions ?? null,
    entradas: row?.tackles ?? null,
    paradas: row?.saves ?? null,
    rojas: row?.red_cards ?? null
  });

  const fetchMatches = async () => {
    const supabase = await getSupabaseClient();
    let query = supabase
      .from('matches')
      .select(`
        id,season,round_id,match_date,match_time,home_goals,away_goals,stream_url,
        home:league_teams!matches_home_league_team_id_fkey(id,nickname,display_name),
        away:league_teams!matches_away_league_team_id_fkey(id,nickname,display_name)
      `)
      .order('round_id', { ascending: true })
      .order('match_date', { ascending: true });

    if (ACTIVE_SEASON) {
      query = query.eq('season', ACTIVE_SEASON);
    }

    return query; // devuelve { data, error }
  };

const fetchStats = async (matchIds = []) => {
  if (!matchIds.length) return { data: [] };
  const supabase = await getSupabaseClient();

  return supabase
    .from('match_team_stats')
    .select(`
      match_id,
      league_team_id,
      possession,
      shots,
      shots_on_target,
      goals,
      fouls,
      offsides,
      corners,
      free_kicks,
      passes,
      passes_completed,
      crosses,
      interceptions,
      tackles,
      saves,
      red_cards,
      team:league_teams!match_team_stats_league_team_id_fkey (
        id,
        nickname,
        display_name
      )
    `)
    .in('match_id', matchIds);
};



  root.innerHTML = `<p class="hint">Cargando resultados...</p>`;

  let matches = [];
  try {
    const { data, error } = await fetchMatches();
    if (error) throw error;
    matches = data || [];
  } catch (e) {
    root.innerHTML = `<p class="hint">No se pudieron cargar los partidos desde Supabase.</p>`;
    console.error(e);
    return;
  }

  if (!matches.length) {
    root.innerHTML = `<p class="hint">No hay partidos registrados todavía.</p>`;
    return;
  }

  const matchIds = matches.map(m => m.id);

  let statsRows = [];
  try {
    const { data, error } = await fetchStats(matchIds);
    if (error) throw error;
    statsRows = data || [];
  } catch (e) {
    console.warn('No se pudieron cargar estadísticas de Supabase', e);
    statsRows = [];
  }

  const statsIndex = {};
  statsRows.forEach(row => {
    const matchId = row?.match_id;
    if (!matchId) return;
    const tName = teamNameFrom(row?.team || {});
    if (!tName) return;
    statsIndex[matchId] ||= {};
    statsIndex[matchId][tName] = mapStatsRow(row);
  });

  // Construir jornadas a partir de matches
  const jornadasMap = new Map();
  const partidoMeta = {};
  matches.forEach((m, idx) => {
    const roundNum = Number(m.round_id);
    const numero = Number.isFinite(roundNum) && roundNum > 0 ? roundNum : (jornadasMap.size + 1);
    const jornada = jornadasMap.get(numero) || { numero, fecha: m.match_date, partidos: [] };
    if (!jornada.fecha && m.match_date) jornada.fecha = m.match_date;

    const localName = teamNameFrom(m.home || {});
    const visitName = teamNameFrom(m.away || {});

    const partido = {
      id: m.id || `J${numero}-P${idx+1}`,
      fecha: m.match_date,
      hora: m.match_time,
      local: localName,
      visitante: visitName,
      goles_local: isNum(m.home_goals) ? m.home_goals : null,
      goles_visitante: isNum(m.away_goals) ? m.away_goals : null,
      stream: m.stream_url || ''
    };

    jornada.partidos.push(partido);
    jornadasMap.set(numero, jornada);

    partidoMeta[partido.id] = {
      id: partido.id,
      jornada: numero,
      fechaJornada: jornada.fecha,
      fecha: partido.fecha || jornada.fecha,
      hora: partido.hora || '',
      local: partido.local,
      visitante: partido.visitante,
      goles_local: partido.goles_local,
      goles_visitante: partido.goles_visitante
    };
  });

  let jornadas = Array.from(jornadasMap.values()).sort((a,b)=>(a.numero || 0) - (b.numero || 0));

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

  // Render de tabla de estadísticas + cabecera
  const renderStats = (statsObj, meta) => {
  const equipos = Object.keys(statsObj || {});
  const hasStats = equipos.length === 2;

  // Nombres bonitos para mostrar (los que ya vienen bien de matches)
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
    // Claves internas del objeto stats (da igual el nombre real de la clave)
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

    // 👇 Aquí usamos siempre los nombres buenos, no las claves internas
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
  `;
};

  // Render de una jornada concreta (async por meteo)
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

    // Pre-cargar meteo para cada "clave" (usamos p.local como clave del JSON)
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

      // Chip de resultado global del partido
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

      const hasStats = !!statsIndex[pid];

      // Meteo
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

  // Navegación jornadas
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

  // Delegación: click en tarjeta de partido para abrir stats
  root.addEventListener('click', (e) => {
    const btn = e.target.closest?.('.partido-card');
    if (!btn) return;

    const id = btn.getAttribute('data-partido-id');
    if (!id) return;

    const meta  = partidoMeta[id];
    const stats = statsIndex[id];

    if (!stats && btn.dataset.noStats === '1') {
      return;
    }

    if (bodyEl) bodyEl.innerHTML = renderStats(stats, meta);
    if (titleEl && meta) {
      titleEl.textContent = `Estadísticas — ${meta.local} vs ${meta.visitante}`;
    }
    openModal();
  });

  // Primera carga: última jornada jugada
  await renderJornada(current);
  updateNav();
})();
