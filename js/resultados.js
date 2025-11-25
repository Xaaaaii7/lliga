(async () => {
  const root = document.getElementById('resultados');
  if (!root) return;

  // =========================
  // REFS MODAL
  // =========================
  const backdrop  = document.getElementById('stats-backdrop');
  const bodyEl    = document.getElementById('stats-body');
  const closeBtn  = document.getElementById('stats-close');
  const titleEl   = document.getElementById('stats-title');

  // =========================
  // HELPERS COMUNES
  // =========================
  const isNum = v => typeof v === 'number' && Number.isFinite(v);
  const norm = s => String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9\s-]/g,'')
    .trim();
  const slug = s => norm(s).replace(/\s+/g,'-');
  const logoPath = name => `img/${slug(name)}.png`;

  // =========================
  // MODAL
  // =========================
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

  closeModal(); // asegurar que arranca cerrado

  closeBtn?.addEventListener('click', closeModal);
  backdrop?.addEventListener('click', (e)=> {
    if (e.target === backdrop) closeModal();
  });
  document.addEventListener('keydown', (e)=> {
    if (e.key === 'Escape' && backdrop && !backdrop.hidden) closeModal();
  });

  // =========================
  // METEO (equipos_ciudades.json)
  // =========================
  let ciudadesConfig = {};
  try {
    ciudadesConfig = await loadJSON('data/equipos_ciudades.json');
  } catch {
    ciudadesConfig = {};
  }

  const weatherCache = new Map(); // city -> { label, emoji }

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

  const getCityForKey = (keyName) => {
    if (!keyName) return null;
    return ciudadesConfig[keyName] || null;
  };

  // =========================
  // CARGA DESDE SUPABASE
  // =========================
  const SEASON = '2025-26';

  async function loadFromSupabase() {
    if (!window.supabase) {
      throw new Error('window.supabase no está definido');
    }
    const supabase = window.supabase;

    // 1) Equipos
    const { data: teams, error: teamsErr } = await supabase
      .from('league_teams')
      .select('id, nickname');

    if (teamsErr) {
      console.error('Error cargando league_teams:', teamsErr);
      throw teamsErr;
    }

    const teamsById = new Map();
    (teams || []).forEach(t => {
      if (t && t.id != null) teamsById.set(t.id, t);
    });

    // 2) Partidos (matches)
    const { data: matches, error: matchesErr } = await supabase
      .from('matches')
      .select('*')
      .eq('season', SEASON)
      .order('round_id', { ascending: true })
      .order('match_date', { ascending: true })
      .order('match_time', { ascending: true });

    if (matchesErr) {
      console.error('Error cargando matches:', matchesErr);
      throw matchesErr;
    }

    const byRound = new Map(); // round_id -> array de partidos

    for (const m of matches || []) {
      const rd = m.round_id;
      if (rd == null) continue; // si alguna fila no tiene round_id, la ignoramos

      if (!byRound.has(rd)) byRound.set(rd, []);

      const homeTeam = teamsById.get(m.home_league_team_id);
      const awayTeam = teamsById.get(m.away_league_team_id);

      const localName = homeTeam?.nickname || 'Local';
      const visitName = awayTeam?.nickname || 'Visitante';

      let hora = null;
      if (m.match_time) {
        const t = String(m.match_time);
        hora = t.slice(0,5); // "HH:MM"
      }

      byRound.get(rd).push({
        id: m.id,
        local: localName,
        visitante: visitName,
        fecha: m.match_date || null,
        hora: hora,
        goles_local: (typeof m.home_goals === 'number' ? m.home_goals : null),
        goles_visitante: (typeof m.away_goals === 'number' ? m.away_goals : null),
        stream: m.stream_url || null
      });
    }

    // Construimos jornadas [{ numero, fecha, partidos }]
    const jornadas = Array.from(byRound.entries())
      .map(([roundId, partidos]) => {
        const fechas = partidos.map(p => p.fecha).filter(Boolean);
        let fecha_jornada = null;
        if (fechas.length) {
          // Como son YYYY-MM-DD, ordenar strings funciona
          fecha_jornada = fechas.sort()[0];
        }
        return { numero: roundId, fecha: fecha_jornada, partidos };
      })
      .sort((a, b) => a.numero - b.numero);

    // 3) Stats (match_team_stats)
    const { data: statsRows, error: statsErr } = await supabase
      .from('match_team_stats')
      .select('*');

    if (statsErr) {
      console.error('Error cargando match_team_stats:', statsErr);
      throw statsErr;
    }

    // statsIndex[match_id][nickname] = {...}
    const statsIndex = {};

    for (const row of statsRows || []) {
      const mid = row.match_id;
      const team = teamsById.get(row.league_team_id);
      const teamName = team?.nickname;
      if (!mid || !teamName) continue;

      if (!statsIndex[mid]) statsIndex[mid] = {};

      statsIndex[mid][teamName] = {
        posesion: row.possession ?? null,
        tiros: row.shots ?? null,
        tiros_a_puerta: row.shots_on_target ?? null,
        goles: row.goals ?? null,
        faltas: row.fouls ?? null,
        fueras_de_juego: row.offsides ?? null,
        corners: row.corners ?? null,
        tiros_libres: row.free_kicks ?? null,
        pases: row.passes ?? null,
        pases_completados: row.passes_completed ?? null,
        centros: row.crosses ?? null,
        pases_interceptados: row.interceptions ?? null,
        entradas: row.tackles ?? null,
        paradas: row.saves ?? null,
        rojas: row.red_cards ?? null
      };
    }

    return { jornadas, statsIndex };
  }

  // =========================
  // CARGA INICIAL
  // =========================
  let jornadas = [];
  let statsIndex = {};

  try {
    const data = await loadFromSupabase();
    jornadas = data.jornadas;
    statsIndex = data.statsIndex;
  } catch (e) {
    console.error('Error crítico cargando datos desde Supabase:', e);
    root.innerHTML = `<p class="hint">No se han podido cargar los resultados desde la base de datos.</p>`;
    return;
  }

  if (!Array.isArray(jornadas) || !jornadas.length) {
    root.innerHTML = `<p class="hint">No hay jornadas configuradas todavía.</p>`;
    return;
  }

  jornadas = [...jornadas].sort((a,b)=>(a.numero || 0) - (b.numero || 0));

  // Última jornada con al menos un resultado
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

  // Índice meta de partidos por id (para modal)
  const partidoMeta = {};
  jornadas.forEach(j => {
    (j.partidos || []).forEach((p, idx) => {
      const pid = p.id || `J${j.numero}-P${idx+1}`;
      partidoMeta[pid] = {
        id: pid,
        jornada: j.numero,
        fechaJornada: j.fecha,
        fecha: p.fecha || j.fecha,
        hora: p.hora || '',
        local: p.local,
        visitante: p.visitante,
        goles_local: p.goles_local,
        goles_visitante: p.goles_visitante
      };
    });
  });

  // =========================
  // CONTENEDOR NAV + JORNADA
  // =========================
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

  // =========================
  // RENDER STATS (modal)
  // =========================
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

  // =========================
  // RENDER DE UNA JORNADA
  // =========================
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
                  ${hasStats ? '' : 'data-no-stats="1"'}
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

  // =========================
  // NAV JORNADAS
  // =========================
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

  // =========================
  // CLICK EN PARTIDO → MODAL
  // =========================
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

  // =========================
  // PRIMERA CARGA
  // =========================
  await renderJornada(current);
  updateNav();
})();
