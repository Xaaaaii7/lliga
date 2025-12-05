/* core-stats.js
   Núcleo único para cálculos de liga:
   - carga + caché de resultados.json / partidos_stats.json / TSV pichichi
   - clasificación con H2H (head-to-head) como desempate primario
   - rankings avanzados por equipo
   - MVP por jornada y MVP temporada (media de puntos)
*/

(function () {
  const CoreStats = {};

  // Intentamos coger helpers de Supabase si existen
  const AppUtils = window.AppUtils || {};
  const {
    getSupabaseClient,
    getSupabaseConfig,
    getActiveSeason,
    loadJSON,        // <- para el fallback a JSON local
  } = AppUtils;

  const hasSupabase =
    typeof getSupabaseClient === 'function' &&
    typeof getSupabaseConfig === 'function';

  // --------------------------
  // Helpers base
  // --------------------------
  const isNum = v => typeof v === "number" && Number.isFinite(v);

  const norm = s => String(s || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim();

  const slug = s => norm(s).replace(/\s+/g, "-");

  const toNum = (v) => {
    if (v == null || v === "") return 0;
    const n = parseFloat(String(v).replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  };

  // Normaliza % a 0..1
  const parsePct01 = v => {
    if (v == null) return null;
    if (typeof v === "string") {
      const n = parseFloat(v.replace(",", ".").replace("%", "").trim());
      if (!Number.isFinite(n)) return null;
      return n > 1 ? n / 100 : n;
    }
    const n = +v;
    if (!Number.isFinite(n)) return null;
    return n > 1 ? n / 100 : n;
  };

  const addNum = (o, k, v) => { o[k] += (Number.isFinite(+v) ? +v : 0); };

  const dg = e => e.gf - e.gc;

  // --------------------------
  // Carga + caché de datos
  // --------------------------
  let _resultadosCache = null;
  let _statsIndexCache = null;
  let _pichichiRowsCache = null;

  // Mapa interno de equipos por id de league_teams (para casar stats)
  let _teamMapCache = null;

  // Caché de clasificaciones por jornada / opciones
  const _clasifCache = new Map(); // key: `${limit||'ALL'}|${useH2H?1:0}`

  // --------------------------
  // Carga desde Supabase
  // --------------------------

  // Nombre de equipo a partir de objeto league_team + fallback id
  const teamNameFromObj = (teamObj = {}, fallbackId = null) => {
    let name =
      teamObj.nickname ||
      teamObj.display_name ||
      (teamObj.club && teamObj.club.name);

    if (!name && fallbackId != null && _teamMapCache && _teamMapCache.has(fallbackId)) {
      const fromMap = _teamMapCache.get(fallbackId);
      name =
        fromMap.nickname ||
        fromMap.display_name ||
        (fromMap.club && fromMap.club.name);
    }

    const fallbackLabel = fallbackId != null ? `Equipo ${fallbackId}` : 'Equipo';
    return (name || fallbackLabel).toString().trim();
  };

  // Mapea fila de match_team_stats a nuestro formato "partidos_stats.json"
  const mapStatsRowFromDb = (row) => ({
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

  // Carga jornadas desde Supabase.matches + league_teams
  const loadResultadosFromSupabase = async () => {
    const supaCfg = typeof getSupabaseConfig === 'function'
      ? getSupabaseConfig()
      : { season: '' };

    const seasonFromCfg = supaCfg.season || '';
    const activeSeason =
      (typeof getActiveSeason === 'function' && getActiveSeason()) ||
      seasonFromCfg ||
      '';

    const supabase = await getSupabaseClient();

    let query = supabase
      .from('matches')
      .select(`
        id,season,round_id,match_date,match_time,home_goals,away_goals,stream_url,
        home_league_team_id,away_league_team_id,
        home:league_teams!matches_home_league_team_id_fkey(
          id,nickname,display_name,club:clubs(id,name)
        ),
        away:league_teams!matches_away_league_team_id_fkey(
          id,nickname,display_name,club:clubs(id,name)
        )
      `)
      .order('round_id', { ascending: true })
      .order('match_date', { ascending: true });

    if (activeSeason) {
      query = query.eq('season', activeSeason);
    }

    const { data, error } = await query;
    if (error) throw error;

    const matches = data || [];
    if (!matches.length) return [];

    // Construimos teamMap interno por id de league_teams
    const teamMap = new Map();
    matches.forEach(m => {
      if (m.home) teamMap.set(m.home.id, m.home);
      if (m.away) teamMap.set(m.away.id, m.away);
    });
    _teamMapCache = teamMap;

    // Construimos jornadas como en resultados.json
    const jornadasMap = new Map();

    matches.forEach((m, idx) => {
      const roundNum = Number(m.round_id);
      const numero = Number.isFinite(roundNum) && roundNum > 0
        ? roundNum
        : (jornadasMap.size + 1);

      const jornada = jornadasMap.get(numero) || {
        numero,
        fecha: m.match_date,
        partidos: []
      };
      if (!jornada.fecha && m.match_date) jornada.fecha = m.match_date;

      const localName = teamNameFromObj(m.home || {}, m.home_league_team_id);
      const visitName = teamNameFromObj(m.away || {}, m.away_league_team_id);

      const partido = {
        id: m.id,
        fecha: m.match_date,
        hora: m.match_time,
        local: localName,
        visitante: visitName,
        goles_local: isNum(m.home_goals) ? m.home_goals : null,
        goles_visitante: isNum(m.away_goals) ? m.away_goals : null,
        stream: m.stream_url || '',
        local_team_id: m.home_league_team_id,
        visitante_team_id: m.away_league_team_id,
        local_club_id: (m.home && m.home.club && m.home.club.id) || null,
        visitante_club_id: (m.away && m.away.club && m.away.club.id) || null,
        round_id: m.round_id
      };

      jornada.partidos.push(partido);
      jornadasMap.set(numero, jornada);
    });

    const jornadas = Array
      .from(jornadasMap.values())
      .sort((a, b) => (a.numero || 0) - (b.numero || 0));

    _resultadosCache = jornadas;
    return jornadas;
  };

  // Carga índice de stats desde match_team_stats
  const loadStatsIndexFromSupabase = async () => {
    const supabase = await getSupabaseClient();

    // Nos aseguramos de tener teamMap cargado
    if (!_teamMapCache) {
      await CoreStats.getResultados();
    }
    const teamMap = _teamMapCache || new Map();

    const supaCfg = typeof getSupabaseConfig === 'function'
      ? getSupabaseConfig()
      : { season: '' };

    const seasonFromCfg = supaCfg.season || '';
    const activeSeason =
      (typeof getActiveSeason === 'function' && getActiveSeason()) ||
      seasonFromCfg ||
      '';

    // Si quieres filtrar por temporada, unimos con matches
    let query = supabase
      .from('match_team_stats')
      .select(`
        match_id,league_team_id,
        possession,shots,shots_on_target,goals,fouls,offsides,corners,free_kicks,
        passes,passes_completed,crosses,interceptions,tackles,saves,red_cards,
        match:matches(season)
      `);

    if (activeSeason) {
      query = query.eq('match.season', activeSeason);
    }

    const { data, error } = await query;
    if (error) throw error;

    const rows = data || [];
    const index = {};

    rows.forEach(row => {
      const matchId = row.match_id;
      const leagueTeamId = row.league_team_id;
      if (!matchId || leagueTeamId == null) return;

      const teamObj = teamMap.get(leagueTeamId) || {};
      const teamName = teamNameFromObj(teamObj, leagueTeamId);
      if (!teamName) return;

      index[matchId] ||= {};
      index[matchId][teamName] = mapStatsRowFromDb(row);
    });

    _statsIndexCache = index;
    return index;
  };

  // --------------------------
  // APIs públicas de carga
  // --------------------------
  CoreStats.getResultados = async () => {
    if (_resultadosCache) return _resultadosCache;

    // Si tenemos Supabase configurado, lo usamos
    if (hasSupabase) {
      try {
        const jornadas = await loadResultadosFromSupabase();
        _resultadosCache = Array.isArray(jornadas) ? jornadas : [];
        if (_resultadosCache.length) return _resultadosCache;
      } catch (e) {
        console.warn('Fallo cargando resultados desde Supabase, usando JSON local:', e);
      }
    }

    // Fallback a JSON local (si tienes AppUtils.loadJSON)
    if (typeof loadJSON === 'function') {
      const jornadas = await loadJSON("data/resultados.json").catch(() => []);
      _resultadosCache = Array.isArray(jornadas) ? jornadas : [];
    } else {
      _resultadosCache = [];
    }
    return _resultadosCache;
  };

  CoreStats.getStatsIndex = async () => {
    if (_statsIndexCache) return _statsIndexCache;

    // Intentamos con Supabase primero
    if (hasSupabase) {
      try {
        const idx = await loadStatsIndexFromSupabase();
        _statsIndexCache = idx && typeof idx === "object" ? idx : {};
        if (Object.keys(_statsIndexCache).length) return _statsIndexCache;
      } catch (e) {
        console.warn('Fallo cargando stats desde Supabase, usando JSON local:', e);
      }
    }

    // Fallback a JSON local
    if (typeof loadJSON === 'function') {
      const stats = await loadJSON("data/partidos_stats.json").catch(() => ({}));
      _statsIndexCache = stats && typeof stats === "object" ? stats : {};
    } else {
      _statsIndexCache = {};
    }
    return _statsIndexCache;
  };

    // --------------------------
  // Pichichi desde Supabase (con fallback a TSV)
  // --------------------------
  const SHEET_TSV_URL =
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vSg3OTDxmqj6wcbH8N7CUcXVexk9ZahUURCgtSS9JXSEsFPG15rUchwvI2zRulRr0hHSmGZOo_TAXRL/pub?gid=0&single=true&output=tsv";

  function parseTSV(text) {
    const lines = text.replace(/\r/g, "").split("\n").filter(l => l.trim().length);
    if (!lines.length) return { headers: [], rows: [] };
    const headers = lines[0].split("\t").map(h => h.trim());
    const rows = lines.slice(1).map(line => {
      const cols = line.split("\t");
      const obj = {};
      headers.forEach((h, i) => obj[h] = (cols[i] ?? "").trim());
      return obj;
    });
    return { headers, rows };
  }

  // Carga pichichi desde Supabase:
  // - base de jugadores en tabla "goleadores"
  // - goles / partidos desde "goal_events"
const loadPichichiFromSupabase = async () => {
  if (!hasSupabase) return [];

  const supaCfg = typeof getSupabaseConfig === 'function'
    ? getSupabaseConfig()
    : { season: '' };

  const seasonFromCfg = supaCfg.season || '';
  const activeSeason =
    (typeof getActiveSeason === 'function' && getActiveSeason()) ||
    seasonFromCfg ||
    '';

  const supabase = await getSupabaseClient();

  let query = supabase
    .from('goleadores') // la VIEW
    .select('season, player_id, jugador, manager, partidos, goles');

  if (activeSeason) {
    query = query.eq('season', activeSeason);
  }

  const { data, error } = await query;
  if (error) {
    console.warn('Error cargando pichichi desde vista goleadores:', error);
    return [];
  }

  if (!data || !data.length) return [];

  // Adaptamos al formato que espera computePichichiPlayers:
  // "Jugador", "Equipo", "Partidos", "Goles"
  const rows = data.map(r => ({
    "Jugador":   r.jugador || '',
    "Equipo":    r.manager || '',           // aquí usamos el nickname del manager
    "Partidos":  String(r.partidos ?? 0),   // partidos jugados por el manager
    "Goles":     String(r.goles ?? 0)
  }));

  return rows;
};


  CoreStats.getPichichiRows = async () => {
    if (_pichichiRowsCache) return _pichichiRowsCache;

    // 1) Intentamos Supabase
    if (hasSupabase) {
      try {
        const rowsDb = await loadPichichiFromSupabase();
        if (Array.isArray(rowsDb) && rowsDb.length) {
          _pichichiRowsCache = rowsDb;
          return _pichichiRowsCache;
        }
      } catch (e) {
        console.warn('Fallo cargando pichichi desde Supabase, intentaré TSV:', e);
      }
    }

    // 2) Fallback al TSV antiguo (por si acaso)
    try {
      const res = await fetch(SHEET_TSV_URL, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const txt = await res.text();
      const { rows } = parseTSV(txt);
      _pichichiRowsCache = Array.isArray(rows) ? rows : [];
      return _pichichiRowsCache;
    } catch (e) {
      console.warn('No se pudo cargar TSV pichichi:', e);
      _pichichiRowsCache = [];
      return _pichichiRowsCache;
    }
  };

  // Se mantiene computePichichiPlayers igual que lo tienes:
  CoreStats.computePichichiPlayers = (rows) => {
    const fullData = (rows || []).map(r => ({
      jugador: r["Jugador"] || "",
      equipo: r["Equipo"] || "",
      pj: toNum(r["Partidos"]),
      goles: toNum(r["Goles"])
    }))
      .filter(r => r.jugador && r.equipo && r.pj > 0);

    fullData.sort((a, b) => {
      if (b.goles !== a.goles) return b.goles - a.goles;
      const ag = a.pj > 0 ? a.goles / a.pj : 0;
      const bg = b.pj > 0 ? b.goles / b.pj : 0;
      if (bg !== ag) return bg - ag;
      if (b.pj !== a.pj) return b.pj - a.pj;
      return a.jugador.localeCompare(b.jugador, "es", { sensitivity: "base" });
    });

    return fullData;
  };

  // --------------------------
  // Clasificación con H2H
  // --------------------------
  CoreStats.computeClasificacion = async (hasta = null, opts = {}) => {
    const { useH2H = true } = opts;
    const jornadas = await CoreStats.getResultados();

    const limit = (hasta == null)
      ? jornadas.length
      : Math.max(0, Math.min(hasta, jornadas.length));

    // Cache simple en memoria para no recalcular siempre lo mismo
    const cacheKey = `${limit || 'ALL'}|${useH2H ? 1 : 0}`;
    if (_clasifCache.has(cacheKey)) {
      return _clasifCache.get(cacheKey);
    }

    const teams = new Map();
    const teamObj = (name) => {
      const k = norm(name);
      if (!teams.has(k)) {
        teams.set(k, {
          nombre: name, pj: 0, g: 0, e: 0, p: 0,
          gf: 0, gc: 0, pts: 0
        });
      }
      return teams.get(k);
    };

    // H2H acumulado por emparejamiento
    const h2h = {};
    const addH2H = (A, B, gfA, gfB) => {
      const a = norm(A), b = norm(B);
      (h2h[a] ||= {});
      (h2h[a][b] ||= { gf: 0, gc: 0 });
      h2h[a][b].gf += gfA;
      h2h[a][b].gc += gfB;
    };

    for (let i = 0; i < limit; i++) {
      const j = jornadas[i];
      for (const p of (j?.partidos || [])) {
        if (!p.local || !p.visitante) continue;

        const L = teamObj(p.local);
        const V = teamObj(p.visitante);

        const gl = isNum(p.goles_local) ? p.goles_local : null;
        const gv = isNum(p.goles_visitante) ? p.goles_visitante : null;
        if (gl === null || gv === null) continue;

        L.pj++; V.pj++;
        L.gf += gl; L.gc += gv;
        V.gf += gv; V.gc += gl;

        if (gl > gv) { L.g++; L.pts += 3; V.p++; }
        else if (gl < gv) { V.g++; V.pts += 3; L.p++; }
        else { L.e++; V.e++; L.pts++; V.pts++; }

        addH2H(p.local, p.visitante, gl, gv);
        addH2H(p.visitante, p.local, gv, gl);
      }
    }

    const equipos = Array.from(teams.values());

    equipos.sort((A, B) => {
      if (B.pts !== A.pts) return B.pts - A.pts;

      // Desempate H2H
      if (useH2H) {
        const a = norm(A.nombre), b = norm(B.nombre);
        const ha = h2h[a]?.[b], hb = h2h[b]?.[a];
        if (ha && hb) {
          const difA = (ha.gf || 0) - (ha.gc || 0);
          const difB = (hb.gf || 0) - (hb.gc || 0);
          if (difA !== difB) return difB - difA;
        }
      }

      const dA = dg(A), dB = dg(B);
      if (dA !== dB) return dB - dA;
      if (B.gf !== A.gf) return B.gf - A.gf;
      return A.nombre.localeCompare(B.nombre, "es", { sensitivity: "base" });
    });

    _clasifCache.set(cacheKey, equipos);
    return equipos;
  };

  // Por jornada (te devuelve un array de tablas)
  CoreStats.computeClasificacionPorJornada = async (opts = {}) => {
    const jornadas = await CoreStats.getResultados();
    const tables = [];
    for (let j = 1; j <= jornadas.length; j++) {
      tables.push(await CoreStats.computeClasificacion(j, opts));
    }
    return tables;
  };

  // Totales GF/GC/PJ simples (por si lo quieres directo)
  CoreStats.computeTeamTotals = async () => {
    const tabla = await CoreStats.computeClasificacion(null, { useH2H: false });
    return tabla.map(t => ({
      nombre: t.nombre, pj: t.pj, gf: t.gf, gc: t.gc
    }));
  };

  // --------------------------
  // Rankings avanzados por equipo
  // --------------------------
  const fair = (t) => {
    const ROJA_PESO = 5;
    return ((t.entradas || 0) + 1) /
      ((t.faltas || 0) + ROJA_PESO * (t.rojas || 0) + 1);
  };

  const passAcc = (t) => t.pases > 0 ? (t.completados / t.pases) : NaN;

  const precisionTiro = (t) => t.tiros > 0 ? (t.taPuerta || 0) / t.tiros : NaN;

  const conversionGol = (t) => t.tiros > 0 ? (t.goles || 0) / t.tiros : NaN;

  const combinedShot = (t) => {
    const p = precisionTiro(t), c = conversionGol(t);
    return (!isNaN(p) && !isNaN(c)) ? (p + c) / 2 : NaN;
  };

  const efectRival = (t) => t.tirosRival > 0 ? t.golesEncajados / t.tirosRival : NaN;

  CoreStats.computeRankingsPorEquipo = async () => {
    const statsIndex = await CoreStats.getStatsIndex();

    const agg = new Map();
    const teamAgg = (name) => {
      if (!agg.has(name)) agg.set(name, {
        nombre: name,
        pj: 0,
        posSum: 0, posCount: 0,
        faltas: 0, entradas: 0, pases: 0, completados: 0,
        tiros: 0, taPuerta: 0, goles: 0,
        rojas: 0,
        golesEncajados: 0,
        tirosRival: 0
      });
      return agg.get(name);
    };

    for (const matchId of Object.keys(statsIndex)) {
      const porEquipo = statsIndex[matchId] || {};
      const equiposPartido = Object.keys(porEquipo);

      for (const eqName of equiposPartido) {
        const te = porEquipo[eqName] || {};
        const a = teamAgg(eqName);

        const hasAny = [
          "posesion", "faltas", "entradas", "pases", "pases_completados",
          "tiros", "tiros_a_puerta", "goles", "expulsiones", "rojas", "tarjetas_rojas"
        ].some(k => te[k] !== undefined);

        if (hasAny) a.pj++;

        const pos = parsePct01(te.posesion);
        if (pos !== null) { a.posSum += pos; a.posCount++; }

        addNum(a, "faltas", te.faltas);
        addNum(a, "entradas", te.entradas);
        addNum(a, "pases", te.pases);
        addNum(a, "completados", te.pases_completados);
        addNum(a, "tiros", te.tiros);
        addNum(a, "taPuerta", te.tiros_a_puerta);
        addNum(a, "goles", te.goles);
        addNum(a, "rojas", te.expulsiones ?? te.rojas ?? te.tarjetas_rojas);

        const rivalName = equiposPartido.find(n => n !== eqName);
        if (rivalName) {
          const rivalStats = porEquipo[rivalName] || {};
          addNum(a, "golesEncajados", rivalStats.goles);
          addNum(a, "tirosRival", rivalStats.tiros_a_puerta);
        }
      }
    }

    const arr = Array.from(agg.values());

    const posMed = t => t.posCount > 0 ? (t.posSum / t.posCount) : NaN;

    const posesionTop = arr.filter(t => !isNaN(posMed(t))).sort((a, b) => posMed(b) - posMed(a));
    const fairTop = arr.slice().sort((a, b) => fair(b) - fair(a));
    const passTop = arr.filter(t => !isNaN(passAcc(t))).sort((a, b) => passAcc(b) - passAcc(a));
    const shotTop = arr.filter(t => !isNaN(combinedShot(t))).sort((a, b) => combinedShot(b) - combinedShot(a));
    const efectTop = arr.filter(t => !isNaN(efectRival(t))).sort((a, b) => efectRival(a) - efectRival(b));

    return {
      raw: arr,
      posMed,
      fair,
      passAcc,
      precisionTiro,
      conversionGol,
      combinedShot,
      efectRival,
      posesionTop,
      fairTop,
      passTop,
      shotTop,
      efectTop
    };
  };

  // --------------------------
  // MVP por jornada + temporada
  // --------------------------

  // ranking normalizado 0..1 por métrica
  const rankMetric = (teams, valueFn, { highIsBetter }) => {
    const list = teams
      .map(t => ({ t, v: valueFn(t) }))
      .filter(x => Number.isFinite(x.v));
    const map = Object.create(null);
    if (list.length === 0) return map;

    list.sort((a, b) => highIsBetter ? (b.v - a.v) : (a.v - b.v));

    if (list.length === 1) {
      map[list[0].t.nombre] = 1;
      return map;
    }

    const n = list.length;
    list.forEach((x, idx) => {
      const score = (n - 1 - idx) / (n - 1); // 1º ->1, último->0
      map[x.t.nombre] = score;
    });
    return map;
  };

  const getScore = (map, t) => {
    const v = map[t.nombre];
    return (v === undefined) ? 0.5 : v; // neutro si no hay dato
  };

  CoreStats.computeMvpPorJornada = async (jornadaNumero) => {
    const jornadas = await CoreStats.getResultados();
    const statsIndex = await CoreStats.getStatsIndex();
    const j = jornadas.find(x => x.numero === jornadaNumero || x.jornada === jornadaNumero) || jornadas[jornadaNumero - 1];
    if (!j) return { jornada: jornadaNumero, teams: [], winner: null };

    const partidos = j.partidos || [];
    const teamMap = new Map();

    const getT = (name) => {
      if (!teamMap.has(name)) {
        teamMap.set(name, {
          nombre: name,
          pj: 0,
          gf: 0,
          gc: 0,
          winScore: 0,

          posSum: 0, posCount: 0,
          faltas: 0, entradas: 0, pases: 0, completados: 0,
          tiros: 0, taPuerta: 0, goles: 0,
          rojas: 0,
          golesEncajados: 0,
          tirosRival: 0
        });
      }
      return teamMap.get(name);
    };

    // Recorremos partidos de la jornada
    for (const p of partidos) {
      if (!p.local || !p.visitante) continue;

      const L = getT(p.local);
      const V = getT(p.visitante);

      const gl = isNum(p.goles_local) ? p.goles_local : null;
      const gv = isNum(p.goles_visitante) ? p.goles_visitante : null;

      if (gl !== null && gv !== null) {
        L.pj++; V.pj++;
        L.gf += gl; L.gc += gv;
        V.gf += gv; V.gc += gl;

        // victoria/empate/derrota
        if (gl > gv) L.winScore += 1;
        else if (gl < gv) V.winScore += 1;
        else { L.winScore += 0.5; V.winScore += 0.5; }
      }

      // Stats avanzadas
      const matchStats = p.id ? statsIndex[p.id] : null;
      if (matchStats) {
        const equiposPartido = Object.keys(matchStats);
        for (const eqName of equiposPartido) {
          const te = matchStats[eqName] || {};
          const a = getT(eqName);

          const pos = parsePct01(te.posesion);
          if (pos !== null) { a.posSum += pos; a.posCount++; }

          addNum(a, "faltas", te.faltas);
          addNum(a, "entradas", te.entradas);
          addNum(a, "pases", te.pases);
          addNum(a, "completados", te.pases_completados);
          addNum(a, "tiros", te.tiros);
          addNum(a, "taPuerta", te.tiros_a_puerta);
          addNum(a, "goles", te.goles);
          addNum(a, "rojas", te.expulsiones ?? te.rojas ?? te.tarjetas_rojas);

          const rivalName = equiposPartido.find(n => n !== eqName);
          if (rivalName) {
            const rivalStats = matchStats[rivalName] || {};
            addNum(a, "golesEncajados", rivalStats.goles);
            addNum(a, "tirosRival", rivalStats.tiros_a_puerta);
          }
        }
      }
    }

    const teamsJ = Array.from(teamMap.values()).filter(t => t.pj > 0);
    if (!teamsJ.length) return { jornada: jornadaNumero, teams: [], winner: null };

    // Rankings por métrica (esta jornada)
    const scorePichichi = rankMetric(teamsJ, t => t.gf, { highIsBetter: true });
    const scoreZamora = rankMetric(teamsJ, t => t.gc, { highIsBetter: false });
    const scoreWin = rankMetric(teamsJ, t => t.winScore, { highIsBetter: true });
    const scorePos = rankMetric(teamsJ, t => t.posCount > 0 ? (t.posSum / t.posCount) : NaN, { highIsBetter: true });
    const scorePass = rankMetric(teamsJ, t => t.pases > 0 ? (t.completados / t.pases) : NaN, { highIsBetter: true });
    const scoreFair = rankMetric(teamsJ, t => fair(t), { highIsBetter: true });
    const scoreShot = rankMetric(teamsJ, t => combinedShot(t), { highIsBetter: true });
    const scoreDef = rankMetric(teamsJ, t => efectRival(t), { highIsBetter: false });

    // Ponderación final
    for (const t of teamsJ) {
      const sPich = getScore(scorePichichi, t);
      const sZam = getScore(scoreZamora, t);
      const sWin = getScore(scoreWin, t);
      const sPos = getScore(scorePos, t);
      const sPass = getScore(scorePass, t);
      const sFair = getScore(scoreFair, t);
      const sShot = getScore(scoreShot, t);
      const sDef = getScore(scoreDef, t);

      t.mvpScore = (
        0.20 * sPich +
        0.20 * sZam +
        0.20 * sWin +
        0.05 * sPos +
        0.05 * sPass +
        0.10 * sFair +
        0.10 * sShot +
        0.10 * sDef
      );
    }

    teamsJ.sort((a, b) => (b.mvpScore - a.mvpScore) || a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" }));
    const winner = teamsJ[0];

    return { jornada: jornadaNumero, teams: teamsJ, winner };
  };

  CoreStats.computeMvpTemporada = async () => {
    const jornadas = await CoreStats.getResultados();
    const seasonMap = new Map();

    for (const j of jornadas) {
      const jNum = j.numero ?? j.jornada;
      if (!jNum) continue;

      const { teams } = await CoreStats.computeMvpPorJornada(jNum);
      if (!teams.length) continue;

      for (const t of teams) {
        let season = seasonMap.get(t.nombre);
        if (!season) {
          season = {
            nombre: t.nombre,
            jornadas: 0,
            mvpSum: 0,
            pj: 0,
            gf: 0,
            gc: 0
          };
          seasonMap.set(t.nombre, season);
        }
        season.jornadas += 1;
        season.mvpSum += t.mvpScore;

        season.pj += t.pj;
        season.gf += t.gf;
        season.gc += t.gc;
      }
    }

    const seasonArr = Array.from(seasonMap.values());
    seasonArr.forEach(s => {
      s.mvpAvg = s.jornadas > 0 ? s.mvpSum / s.jornadas : 0;
    });

    seasonArr.sort((a, b) =>
      (b.mvpAvg - a.mvpAvg) ||
      a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" })
    );

    return seasonArr;
  };

  // --------------------------
  // Exports
  // --------------------------
  CoreStats.isNum = isNum;
  CoreStats.norm = norm;
  CoreStats.slug = slug;
  CoreStats.toNum = toNum;
  CoreStats.parsePct01 = parsePct01;
  CoreStats.dg = dg;

  CoreStats.fair = fair;
  CoreStats.passAcc = passAcc;
  CoreStats.precisionTiro = precisionTiro;
  CoreStats.conversionGol = conversionGol;
  CoreStats.combinedShot = combinedShot;
  CoreStats.efectRival = efectRival;

  window.CoreStats = CoreStats;
})();
