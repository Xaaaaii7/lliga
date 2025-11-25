(async () => {
  const root = document.getElementById('resultados');
  if (!root) return;

  // ─────────────────────────────────────
  // Supabase client
  // ─────────────────────────────────────
  const supa = window.supabase;
  if (!supa || typeof supa.from !== 'function') {
    root.innerHTML = `<p class="hint error">Error de configuración de Supabase en resultados.</p>`;
    return;
  }

  // Modal refs
  const backdrop  = document.getElementById('stats-backdrop');
  const bodyEl    = document.getElementById('stats-body');
  const closeBtn  = document.getElementById('stats-close');
  const titleEl   = document.getElementById('stats-title');

  // Helpers comunes
  const isNum = v => typeof v === 'number' && Number.isFinite(v);
  const norm = s => String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9\s-]/g,'')
    .trim();
  const slug = s => norm(s).replace(/\s+/g,'-');
  const logoPath = name => `img/${slug(name)}.png`;

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

  closeModal(); // por si acaso

  closeBtn?.addEventListener('click', closeModal);
  backdrop?.addEventListener('click', (e)=> {
    if (e.target === backdrop) closeModal();
  });
  document.addEventListener('keydown', (e)=> {
    if (e.key === 'Escape' && backdrop && !backdrop.hidden) closeModal();
  });

  // ─────────────────────────────────────
  // METEO: clave (nickname equipo) -> ciudad
  // ─────────────────────────────────────
  let ciudadesConfig = {};
  try {
    ciudadesConfig = await loadJSON('data/equipos_ciudades.json');
  } catch {
    ciudadesConfig = {};
  }

  const weatherCache = new Map(); // city lower -> { label, emoji }

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

      const meteoUrl =
        `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}&current_weather=true`;
      const meteoRes = await fetch(meteoUrl, { cache: 'no-store' });
      if (!meteoRes.ok) throw new Error(`Meteo HTTP ${meteoRes.status}`);
      const meteoData = await meteoRes.json();

      const cat = weatherCodeToCategory(meteoData?.current_weather?.weathercode);
      weatherCache.set(key, cat || null);
      return cat || null;
    } catch (e) {
      console.warn('Meteo error para ciudad', cityName, e);
      weatherCache.set(key, null);
      return null;
    }
  };

  const getCityForKey = (keyName) => {
    if (!keyName) return null;
    return ciudadesConfig[keyName] || null;
  };

  // ─────────────────────────────────────
  // Datos desde Supabase
  // ─────────────────────────────────────
  let jornadas = [];
  let partidoMeta = {};
  let statsIndex = {};
  let minJornada = 0;
  let maxJornada = 0;
  let lastPlayed = 0;

  async function loadFromSupabase() {
    // 1) league_teams (para mapear IDs -> nickname)
    const { data: leagueTeams, error: ltError } = await supa
      .from('league_teams')
      .select('id, nickname, season');

    if (ltError) {
      console.error('Error league_teams:', ltError);
      throw ltError;
    }

    // Filtramos solo la temporada actual (ajusta si hace falta)
    const season = '2025-26';
    const leagueTeamsFiltered = (leagueTeams || []).filter(t => t.season === season);
    const leagueTeamIndex = new Map();
    leagueTeamsFiltered.forEach(t => {
      leagueTeamIndex.set(t.id, t);
    });

    // 2) matches
    const { data: matches, error: mError } = await supa
      .from('matches')
      .select('id, season, round_id, home_league_team_id, away_league_team_id, match_date, match_time, home_goals, away_goals, stream_url')
      .eq('season', season)
      .order('round_id', { ascending: true })
      .order('match_date', { ascending: true, nullsFirst: false });

    if (mError) {
      console.error('Error matches:', mError);
      throw mError;
    }

    if (!matches || !matches.length) {
      root.innerHTML = `<p class="hint">No hay partidos configurados todavía.</p>`;
      return;
    }

    // 3) Stats por partido
    const matchIds = matches.map(m => m.id);
    let statsRows = [];
    if (matchIds.length) {
      const { data: stats, error: sError } = await supa
        .from('match_team_stats')
        .select('*')
        .in('match_id', matchIds);

      if (sError) {
        console.warn('Error match_team_stats, sigo sin stats:', sError);
        statsRows = [];
      } else {
        statsRows = stats || [];
      }
    }

    // Índice rápido
    const matchesIndex = new Map();
    matches.forEach(m => matchesIndex.set(m.id, m));

    // Construimos statsIndex en el mismo formato que tus JSON anteriores:
    // statsIndex[match_id][nickname] = { goles, posesion, tiros, ... }
    statsIndex = {};
    statsRows.forEach(r => {
      const nick = leagueTeamIndex.get(r.league_team_id)?.nickname || `Equipo ${r.league_team_id}`;
      if (!statsIndex[r.match_id]) statsIndex[r.match_id] = {};
      statsIndex[r.match_id][nick] = {
        goles:               r.goals,
        posesion:            r.possession,
        tiros:               r.shots,
        tiros_a_puerta:      r.shots_on_target,
        faltas:              r.fouls,
        fueras_de_juego:     r.offsides,
        corners:             r.corners,
        tiros_libres:        r.free_kicks,
        pases:               r.passes,
        pases_completados:   r.passes_completed,
        centros:             r.crosses,
        pases_interceptados: r.interceptions,
        entradas:            r.tackles,
        paradas:             r.saves,
        rojas:               r.red_cards
      };
    });

    // Agrupamos por "jornada" usando round_id como número de jornada
    const jornadaMap = new Map(); // round_id -> { numero, partidos: [] }

    matches.forEach(m => {
      const roundNum = m.round_id || 0;
      if (!jornadaMap.has(roundNum)) {
        jornadaMap.set(roundNum, { numero: roundNum, partidos: [] });
      }

      const homeLT = leagueTeamIndex.get(m.home_league_team_id);
      const awayLT = leagueTeamIndex.get(m.away_league_team_id);

      const localName  = homeLT?.nickname || 'Local';
      const visitName  = awayLT?.nickname || 'Visitante';

      const fecha = m.match_date || null;
      // match_time puede venir como 'HH:MM:SS' → lo recortamos a HH:MM
      const hora  = m.match_time ? String(m.match_time).slice(0,5) : '';

      jornadaMap.get(roundNum).partidos.push({
        id: m.id, // importante: usamos id de la tabla (ej. J1-P1)
        local: localName,
        visitante: visitName,
        fecha,
        hora,
        goles_local: m.home_goals,
        goles_visitante: m.away_goals,
        stream: m.stream_url || null
      });
    });

    jornadas = Array.from(jornadaMap.values())
      .sort((a,b) => (a.numero || 0) - (b.numero || 0));

    if (!jornadas.length) {
      root.innerHTML = `<p class="hint">No hay jornadas configuradas todavía.</p>`;
      return;
    }

    minJornada = Math.min(...jornadas.map(j => j.numero || 0));
    maxJornada = Math.max(...jornadas.map(j => j.numero || 0));

    // Índice meta para el modal
    partidoMeta = {};
    jornadas.forEach(j => {
      (j.partidos || []).forEach(p => {
        partidoMeta[p.id] = {
          id: p.id,
          jornada: j.numero,
          fechaJornada: null,
          fecha: p.fecha,
          hora: p.hora || '',
          local: p.local,
          visitante: p.visitante,
          goles_local: p.goles_local,
          goles_visitante: p.goles_visitante
        };
      });
    });

    // Última jornada con algún resultado cargado
    lastPlayed = 0;
    jornadas.forEach(j => {
      if ((j.partidos || []).some(p => isNum(p.goles_local) && isNum(p.goles_visitante))) {
        if (j.numero > lastPlayed) lastPlayed = j.numero;
      }
    });
    if (!lastPlayed) {
      lastPlayed = jornadas[jornadas.length - 1].numero;
    }
  }

  // ─────────────────────────────────────
  // Render de estadísticas (igual que antes)
  // ─────────────────────────────────────
  const renderStats = (statsObj, meta) => {
    const equipos = Object.keys(statsObj || {});
    const hasStats = equipos.length === 2;

    const localName  = meta?.local || (equipos[0] || 'Local');
    const visitName  = meta?.visitante || (equipos[1] || 'Visitante');

    const gl = isNum(meta?.goles_local)     ? meta.goles_local     : null;
    const gv = isNum(meta?.goles_visitante) ? meta.goles_visitante : null;
    const marcador = (gl !== null && gv !== null) ? `${gl} – ${gv}` : '-';

    const fechaTexto = meta?.fecha ? fmtDate(meta.fecha) : (meta?.fechaJornada ? fmtDate(meta.fechaJornada) : '');
    const horaTexto  = meta?.hora || '';
    const jTexto     = meta?.jornada ? `Jornada ${meta.jornada}` : '';

    const metaLine = [fechaTexto, horaTexto, jTexto].filter(Boolean).join(' · ');

    let tableHtml = '';
    let summaryHtml = '';

    if (!hasStats) {
      tableHtml = `<p class="hint">No hay estadísticas detalladas para este partido.</p>`;
    } else {
      const A = equipos[0];
      const B = equipos[1];
      const Adata = statsObj[A] || {};
      const Bdata = statsObj[B] || {};

      const get = (data, k) => (data && Object.prototype.hasOwnProperty.call(data, k)) ? data[k] : null;

      const ataqueKeys = ['goles','tiros','tiros_a_puerta'];
      const balonKeys  = ['posesion','pases','pases_completados','centros'];

      const buildKvList = (keys) => keys
        .filter(k => get(Adata,k) !== null || get(Bdata,k) !== null)
        .map(k => `
          <li>
            <span>${k.replace(/_/g,' ')}</span>
            <span>${get(Adata,k) ?? '—'} · ${get(Bdata,k) ?? '—'}</span>
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
        'goles','posesion','tiros','tiros_a_puerta','faltas',
        'fueras_de_juego','corners','tiros_libres','pases',
        'pases_completados','centros','pases_interceptados',
        'entradas','paradas'
      ];

      const rows = orden
        .filter(k => Adata.hasOwnProperty(k) || Bdata.hasOwnProperty(k))
        .map(k => `
          <tr>
            <th>${k.replace(/_/g,' ')}</th>
            <td>${Adata[k] ?? '—'}</td>
            <td>${Bdata[k] ?? '—'}</td>
          </tr>
        `).join('');

      tableHtml = `
        <table class="stats-table stats-table-modern">
          <thead>
            <tr>
              <th>Estadística</th>
              <th>${A}</th>
              <th>${B}</th>
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

  // ─────────────────────────────────────
  // Contenedor de navegación + bloque de jornada
  // ─────────────────────────────────────
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

  // ─────────────────────────────────────
  // Render de una jornada concreta
  // ─────────────────────────────────────
  const renderJornada = async (num) => {
    const j = jornadas.find(x => x.numero === num);
    if (!j) {
      jornadaWrap.innerHTML = `<p class="hint">No se ha encontrado la jornada ${num}.</p>`;
      return;
    }

    const labelParts = [`Jornada ${j.numero}`];
    if (labelEl) labelEl.textContent = labelParts.join(' · ');

    const partidos = j.partidos || [];
    if (!partidos.length) {
      jornadaWrap.innerHTML = `<p class="hint">Esta jornada no tiene partidos definidos.</p>`;
      return;
    }

    // Pre-cargar meteo para cada partido (clave = equipo local)
    const meteoArr = await Promise.all(
      partidos.map(p => {
        const cityName = getCityForKey(p.local);
        return cityName ? fetchWeatherForCity(cityName) : Promise.resolve(null);
      })
    );

    const cardsHtml = partidos.map((p, idx) => {
      const pid = p.id;
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

      const fechaHora = (p.fecha || p.hora)
        ? `<div class="fecha-hora">
             ${p.fecha ? fmtDate(p.fecha) : ''}
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
                  aria-label="Ver estadísticas del partido">
            <div class="result-teams">
              <div class="result-team-block">
                <img class="result-badge" src="${logoPath(p.local)}"
                     alt="Escudo ${p.local}"
                     onerror="this.style.visibility='hidden'">
                <span class="team-name">${p.local}</span>
              </div>
              <span class="result-score">${marcador}</span>
              <div class="result-team-block">
                <img class="result-badge" src="${logoPath(p.visitante)}"
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
  let current = 0;

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
    const stats = statsIndex[id] || null;

    if (!meta && !stats) {
      console.warn('No meta ni stats para partido', id);
      return;
    }

    if (bodyEl) bodyEl.innerHTML = renderStats(stats, meta);
    if (titleEl && meta) {
      titleEl.textContent = `Estadísticas — ${meta.local} vs ${meta.visitante}`;
    }
    openModal();
  });

  // ─────────────────────────────────────
  // Carga inicial
  // ─────────────────────────────────────
  try {
    await loadFromSupabase();
    if (!jornadas.length) return;
    current = lastPlayed || jornadas[0].numero;
    await renderJornada(current);
    updateNav();
  } catch (err) {
    console.error('Error crítico cargando datos desde Supabase:', err);
    root.innerHTML = `<p class="hint error">Error cargando resultados desde la base de datos.</p>`;
  }
})();
