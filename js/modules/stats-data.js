import { getSupabaseClient, getSupabaseConfig, getActiveSeason } from './supabase-client.js';
import { normalizeText } from './utils.js';
import { teamNameFromObj } from './domain.js';
import { isNum } from './utils.js';

// Carga + caché de datos
let _resultadosCache = null;
let _resultadosCacheKey = null; // Guardar el competitionId usado en el caché
let _statsIndexCache = null;
let _statsIndexCacheKey = null; // Guardar el competitionId usado en el caché
let _pichichiRowsCache = null;
let _pichichiRowsCacheKey = null; // Guardar el competitionId usado en el caché

// Mapa interno de equipos por id de league_teams (para casar stats)
let _teamMapCache = null;
// Mapa de sanciones por nombre normalizado de equipo
let _penaltyByTeamNorm = null;

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
const loadResultadosFromSupabase = async (competitionId = null) => {
    const supaCfg = getSupabaseConfig() || { season: '' };
    const seasonFromCfg = supaCfg.season || '';
    const activeSeason = getActiveSeason() || seasonFromCfg || '';

    const supabase = await getSupabaseClient();

    let query = supabase
        .from('matches')
        .select(`
        id,season,round_id,match_date,match_time,home_goals,away_goals,stream_url,
        competition_id,
        home_league_team_id,away_league_team_id,
        home:league_teams!matches_home_league_team_id_fkey(
          id,nickname,display_name,penalty_points,penalty_reason,club:clubs(id,name)
        ),
        away:league_teams!matches_away_league_team_id_fkey(
          id,nickname,display_name,penalty_points,penalty_reason,club:clubs(id,name)
        )
      `)
        .order('round_id', { ascending: true })
        .order('match_date', { ascending: true });

    // Filtrar por competición si se proporciona
    if (competitionId) {
        query = query.eq('competition_id', competitionId);
    } else if (activeSeason) {
        // Si no hay competitionId, usar el filtro de temporada (compatibilidad hacia atrás)
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

    // Nuevo: mapa de sanciones por nombre normalizado
    const penaltyMap = new Map();

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

        const localName = teamNameFromObj(m.home || {}, m.home_league_team_id, _teamMapCache);
        const visitName = teamNameFromObj(m.away || {}, m.away_league_team_id, _teamMapCache);

        // 🔴 Nuevo: registrar sanciones por nombre normalizado
        const localPenalty = m.home && Number.isFinite(+m.home.penalty_points)
            ? +m.home.penalty_points
            : 0;
        const visitPenalty = m.away && Number.isFinite(+m.away.penalty_points)
            ? +m.away.penalty_points
            : 0;

        penaltyMap.set(normalizeText(localName), localPenalty);
        penaltyMap.set(normalizeText(visitName), visitPenalty);

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

    // 🔴 Guardamos el mapa de sanciones en caché global
    _penaltyByTeamNorm = penaltyMap;


    const jornadas = Array
        .from(jornadasMap.values())
        .sort((a, b) => (a.numero || 0) - (b.numero || 0));

    _resultadosCache = jornadas;
    return jornadas;
};

// Carga índice de stats desde match_team_stats
const loadStatsIndexFromSupabase = async (competitionId = null) => {
    const supabase = await getSupabaseClient();

    // Nos aseguramos de tener teamMap cargado
    if (!_teamMapCache) {
        await getResultados(competitionId);
    }
    const teamMap = _teamMapCache || new Map();

    const supaCfg = getSupabaseConfig() || { season: '' };
    const seasonFromCfg = supaCfg.season || '';
    const activeSeason = getActiveSeason() || seasonFromCfg || '';

    // Si quieres filtrar por temporada o competición, unimos con matches
    let query = supabase
        .from('match_team_stats')
        .select(`
        match_id,league_team_id,
        possession,shots,shots_on_target,goals,fouls,offsides,corners,free_kicks,
        passes,passes_completed,crosses,interceptions,tackles,saves,red_cards,
        match:matches(season,competition_id)
      `);

    // Filtrar por competición si se proporciona
    if (competitionId) {
        query = query.eq('match.competition_id', competitionId);
    } else if (activeSeason) {
        // Si no hay competitionId, usar el filtro de temporada (compatibilidad hacia atrás)
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
        const teamName = teamNameFromObj(teamObj, leagueTeamId, teamMap);
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
export const getResultados = async (competitionId = null) => {
    // Si el caché existe y es para el mismo competitionId, usarlo
    const cacheKey = competitionId || 'all';
    if (_resultadosCache && _resultadosCacheKey === cacheKey) {
        return _resultadosCache;
    }

    try {
        const jornadas = await loadResultadosFromSupabase(competitionId);
        const result = Array.isArray(jornadas) ? jornadas : [];
        // Guardar en caché con su clave
        _resultadosCache = result;
        _resultadosCacheKey = cacheKey;
        return result;
    } catch (e) {
        console.warn('Fallo cargando resultados desde Supabase:', e);
    }

    return [];
};

export const getStatsIndex = async (competitionId = null) => {
    // Si el caché existe y es para el mismo competitionId, usarlo
    const cacheKey = competitionId || 'all';
    if (_statsIndexCache && _statsIndexCacheKey === cacheKey) {
        return _statsIndexCache;
    }

    try {
        const idx = await loadStatsIndexFromSupabase(competitionId);
        const result = idx && typeof idx === "object" ? idx : {};
        // Guardar en caché con su clave
        _statsIndexCache = result;
        _statsIndexCacheKey = cacheKey;
        return result;
    } catch (e) {
        console.warn('Fallo cargando stats desde Supabase:', e);
    }

    return {};
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
const loadPichichiFromSupabase = async (competitionId = null) => {
    const supaCfg = getSupabaseConfig() || { season: '' };
    const seasonFromCfg = supaCfg.season || '';
    const activeSeason = getActiveSeason() || seasonFromCfg || '';

    const supabase = await getSupabaseClient();

    let query = supabase
        .from('goleadores') // la VIEW
        .select('season, player_id, jugador, manager, partidos, goles, competition_id');

    // Prioridad: competition_id sobre season
    if (competitionId !== null) {
        query = query.eq('competition_id', competitionId);
    } else if (activeSeason) {
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
        "Jugador": r.jugador || '',
        "Equipo": r.manager || '',           // aquí usamos el nickname del manager
        "Partidos": String(r.partidos ?? 0),   // partidos jugados por el EQUIPO (corregido)
        "Goles": String(r.goles ?? 0)
    }));

    return rows;
};


export const getPichichiRows = async (competitionId = null) => {
    // Si el caché existe y es para el mismo competitionId, usarlo
    const cacheKey = competitionId || 'all';
    if (_pichichiRowsCache && _pichichiRowsCacheKey === cacheKey) {
        return _pichichiRowsCache;
    }

    // 1) Intentamos Supabase
    try {
        const rowsDb = await loadPichichiFromSupabase(competitionId);
        if (Array.isArray(rowsDb) && rowsDb.length) {
            const result = rowsDb;
            // Guardar en caché con su clave
            _pichichiRowsCache = result;
            _pichichiRowsCacheKey = cacheKey;
            return result;
        }
    } catch (e) {
        console.warn('Fallo cargando pichichi desde Supabase, intentaré TSV:', e);
    }

    // 2) Fallback al TSV antiguo (por si acaso)
    try {
        const res = await fetch(SHEET_TSV_URL, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const txt = await res.text();
        const { rows } = parseTSV(txt);
        const result = Array.isArray(rows) ? rows : [];
        // Guardar en caché con su clave
        _pichichiRowsCache = result;
        _pichichiRowsCacheKey = cacheKey;
        return result;
    } catch (e) {
        console.warn('No se pudo cargar TSV pichichi:', e);
        const result = [];
        _pichichiRowsCache = result;
        _pichichiRowsCacheKey = cacheKey;
        return result;
    }
};

// Exportar sanciones para que stats-calc pueda usarlas
export function getPenaltyMap() {
    return _penaltyByTeamNorm;
}
