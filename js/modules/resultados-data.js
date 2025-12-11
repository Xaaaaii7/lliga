import { getSupabaseClient } from './supabase-client.js';
import { SUPABASE_CONFIG } from './config.js';

const CoreStats = window.CoreStats || {};

const scorerState = {};
let jornadas = [];
let partidoMeta = {};
let jornadasLoaded = false;

// -----------------------------
// Base Helpers
// -----------------------------

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

export const getSupa = async () => {
    return await getSupabaseClient();
};

export const getActiveSeasonSafe = () => {
    if (typeof SUPABASE_CONFIG !== 'undefined' && SUPABASE_CONFIG.season) return SUPABASE_CONFIG.season;
    const cfg = (window.AppUtils && window.AppUtils.getSupabaseConfig) ? window.AppUtils.getSupabaseConfig() : {};
    return cfg.season || '';
};

// -----------------------------
// METEO: mapa clave -> ciudad
// -----------------------------
let ciudadesConfig = {};

export const loadCitiesMap = async () => {
    try {
        const supa = await getSupa();
        if (!supa) return;
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

export const getCityForKey = (keyName) => {
    if (!keyName) return null;
    return ciudadesConfig[keyName] || null;
};

// -----------------------------
// CoreStats Helpers
// -----------------------------
let statsIndex = {};
let statsIndexReady = false;
let statsIndexPromise = null;

export const ensureStatsIndex = async () => {
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

export const getResultados = async () => {
    try {
        return await CoreStats.getResultados();
    } catch (e) {
        console.error('Error getResultados:', e);
        return [];
    }
};

// -----------------------------
// Match Data Loading
// -----------------------------

let lastCompetitionId = null;

export const loadAllMatches = async (competitionId = null) => {
    // Invalidar caché si cambia el competitionId
    if (jornadasLoaded && lastCompetitionId === competitionId) {
        return { jornadas, partidoMeta };
    }

    let rawJornadas = [];
    try {
        rawJornadas = await CoreStats.getResultados(competitionId);
    } catch (e) {
        console.error('Error getResultados:', e);
        rawJornadas = [];
    }

    if (!Array.isArray(rawJornadas)) rawJornadas = [];

    const jornadasMap = new Map();
    partidoMeta = {};

    rawJornadas.forEach(j => {
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

    jornadas = Array.from(jornadasMap.values()).sort((a, b) => (a.numero || 0) - (b.numero || 0));
    jornadasLoaded = true;
    lastCompetitionId = competitionId;

    return { jornadas, partidoMeta };
};

export const getJornadas = () => jornadas;
export const getPartidoMeta = (id) => partidoMeta[id];

// -----------------------------
// Scorer State Management
// -----------------------------
export const getScorerState = (matchId) => scorerState[matchId];

export const loadScorerStateForMatch = async (matchMeta) => {
    const matchId = matchMeta.id;
    if (!matchId) return null;

    if (scorerState[matchId]) return scorerState[matchId];

    const supa = await getSupa();
    if (!supa) return null;

    const season = getActiveSeasonSafe();
    const round = matchMeta.round_id || matchMeta.jornada || null;

    const localTeamId = matchMeta.local_team_id;
    const visitTeamId = matchMeta.visitante_team_id;

    let localClubId = matchMeta.local_club_id;
    let visitClubId = matchMeta.visitante_club_id;
    let localManagerNick = '';
    let visitManagerNick = '';

    if (!season || !localTeamId || !visitTeamId) {
        console.warn('Scorers: faltan season o league_team_id', {
            season, localTeamId, visitTeamId, localClubId, visitClubId, matchMeta
        });
        return null;
    }

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
        .in('event_type', ['goal', 'own_goal']);

    if (errMatchEv) {
        console.warn('Error cargando goal_events del partido:', errMatchEv);
    }

    const aggGoals = { local: {}, visitante: {} };
    const aggRed = { local: [], visitante: [] };

    (matchEvents || []).forEach(ev => {
        const pid = ev.player_id;
        if (!pid && ev.event_type !== 'own_goal') return;

        const side = (ev.league_team_id === localTeamId)
            ? 'local'
            : (ev.league_team_id === visitTeamId ? 'visitante' : null);
        if (!side) return;

        if (ev.event_type === 'goal') {
            aggGoals[side][pid] = (aggGoals[side][pid] || 0) + 1;
        } else if (ev.event_type === 'own_goal') {
            const ogKey = -1;
            aggGoals[side][ogKey] = (aggGoals[side][ogKey] || 0) + 1;
        }
    });

    const { data: redCardsEvents, error: errRed } = await supa
        .from('match_red_cards')
        .select('player_id, league_team_id')
        .eq('match_id', matchId);

    if (errRed) {
        console.warn('Error cargando match_red_cards:', errRed);
    }

    (redCardsEvents || []).forEach(rc => {
        const pid = rc.player_id;
        if (rc.league_team_id === localTeamId) aggRed.local.push(pid);
        else if (rc.league_team_id === visitTeamId) aggRed.visitante.push(pid);
    });

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
// Modifiers
// -----------------------------

export const addGoalToState = (matchId, side, playerId) => {
    const state = scorerState[matchId];
    if (!state) return { success: false };

    const limit = (side === 'local') ? state.meta.goles_local : state.meta.goles_visitante;
    const teamCols = state[side] || [];
    const currentTotal = teamCols.reduce((acc, p) => acc + p.goals, 0);

    if (typeof limit === 'number' && currentTotal >= limit) {
        return { success: false, error: `No puedes añadir más goles. El ${side === 'local' ? 'Local' : 'Visitante'} tiene ${limit} goles en total.` };
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
    return { success: true };
};

export const changeGoalCount = (matchId, side, playerId, delta) => {
    const state = scorerState[matchId];
    if (!state) return { success: false };

    const arr = state[side] || (state[side] = []);
    const pid = Number(playerId);
    const idx = arr.findIndex(x => x.player_id === pid);
    if (idx === -1) return { success: false };

    if (delta > 0) {
        const limit = (side === 'local') ? state.meta.goles_local : state.meta.goles_visitante;
        const currentTotal = arr.reduce((acc, p) => acc + p.goals, 0);
        if (typeof limit === 'number' && currentTotal >= limit) {
            return { success: false, error: `Límite de goles alcanzado (${limit}).` };
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
    return { success: true };
};

export const removeScorer = (matchId, side, playerId) => {
    const state = scorerState[matchId];
    if (!state) return;
    const arr = state[side] || (state[side] = []);
    const pid = Number(playerId);
    const idx = arr.findIndex(x => x.player_id === pid);
    if (idx !== -1) arr.splice(idx, 1);
};

export const addRedCardToState = (matchId, side, playerId) => {
    const state = scorerState[matchId];
    if (!state) return;
    const arr = (side === 'local' ? state.redLocal : state.redVisitante);
    const pid = Number(playerId);
    if (arr.some(p => p.player_id === pid)) return;

    const meta = state.playerMeta[pid] || { name: `Jugador ${pid}` };
    arr.push({ player_id: pid, name: meta.name });
    arr.sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
};

export const removeRedCardFromState = (matchId, side, playerId) => {
    const state = scorerState[matchId];
    if (!state) return;
    const arr = (side === 'local' ? state.redLocal : state.redVisitante);
    const pid = Number(playerId);
    const idx = arr.findIndex(x => x.player_id === pid);
    if (idx !== -1) arr.splice(idx, 1);
};

export const addInjuryToState = (matchId, side, playerId) => {
    const state = scorerState[matchId];
    if (!state) return;
    const arr = (side === 'local' ? state.injuriesLocal : state.injuriesVisitante);
    const pid = Number(playerId);
    if (arr.some(p => p.player_id === pid)) return;

    const meta = state.playerMeta[pid] || { name: `Jugador ${pid}` };
    arr.push({ player_id: pid, name: meta.name });
    arr.sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
};

export const removeInjuryFromState = (matchId, side, playerId) => {
    const state = scorerState[matchId];
    if (!state) return;
    const arr = (side === 'local' ? state.injuriesLocal : state.injuriesVisitante);
    const pid = Number(playerId);
    const idx = arr.findIndex(x => x.player_id === pid);
    if (idx !== -1) arr.splice(idx, 1);
};

// -----------------------------
// Suspension Logic
// -----------------------------

const getNextMatchForTeam = async (season, teamId, currentRoundId) => {
    const supa = await getSupa();
    if (!supa) return null;

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

const saveSuspensionForMatch = async (triggerMatchId, leagueTeamId, playerIds, reasonMatchId, type = 'red_card') => {
    const supa = await getSupa();
    if (!supa) return;

    const { data: currentSus, error: errGet } = await supa
        .from('player_suspensions')
        .select('player_id')
        .eq('origin_match_id', reasonMatchId)
        .eq('league_team_id', leagueTeamId);

    if (errGet) {
        console.warn('Error reading current suspensions', errGet);
    }

    const currentPids = (currentSus || []).map(x => x.player_id);
    const newPidsSet = new Set(playerIds);
    const toDelete = currentPids.filter(pid => !newPidsSet.has(pid));

    if (toDelete.length > 0) {
        await supa
            .from('player_suspensions')
            .delete()
            .eq('origin_match_id', reasonMatchId)
            .eq('league_team_id', leagueTeamId)
            .in('player_id', toDelete);
    }

    const toInsert = playerIds.filter(pid => !currentPids.includes(pid));

    if (toInsert.length > 0) {
        const meta = partidoMeta[triggerMatchId];
        if (!meta) return;

        const season = getActiveSeasonSafe();
        const currentRound = meta.round_id || meta.jornada;

        const nextMatchId = await getNextMatchForTeam(season, leagueTeamId, currentRound);
        if (!nextMatchId) {
            console.log('No next match found for suspension/injury for team', leagueTeamId);
            return;
        }

        const rows = toInsert.map(pid => ({
            player_id: pid,
            league_team_id: leagueTeamId,
            match_id: nextMatchId,
            origin_match_id: reasonMatchId,
            reason: type
        }));

        const { error: errIns } = await supa
            .from('player_suspensions')
            .insert(rows);

        if (errIns) console.warn('Error inserting suspensions', errIns);
    }
};

// -----------------------------
// DB Saving Functions
// -----------------------------

export const saveScorersToSupabase = async (matchId) => {
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

    const { error: errDel } = await supa
        .from('goal_events')
        .delete()
        .eq('match_id', matchId)
        .in('event_type', ['goal', 'own_goal']);

    if (errDel) {
        console.error('Error borrando goal_events:', errDel);
        return { ok: false, msg: 'No se pudieron borrar los eventos antiguos' };
    }

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

    return { ok: true, msg: 'Goleadores guardados correctamente' };
};

export const saveRedCardsFull = async (matchId) => {
    const state = scorerState[matchId];
    if (!state) return { ok: false, msg: 'No hay datos' };

    const supa = await getSupa();
    if (!supa) return { ok: false, msg: 'Supabase no configurado' };

    const meta = state.meta;
    const localTeamId = meta.local_team_id;
    const visitTeamId = meta.visitante_team_id;

    if (!localTeamId || !visitTeamId) return { ok: false, msg: 'Faltan IDs de equipo' };

    const { error: errDel } = await supa
        .from('match_red_cards')
        .delete()
        .eq('match_id', matchId);

    if (errDel) {
        console.error('Error borrando rojas de match_red_cards:', errDel);
        return { ok: false, msg: 'Error al limpiar rojas antiguas' };
    }

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

    await Promise.all([
        saveSuspensionForMatch(matchId, localTeamId, state.redLocal.map(p => p.player_id), matchId, 'red_card'),
        saveSuspensionForMatch(matchId, visitTeamId, state.redVisitante.map(p => p.player_id), matchId, 'red_card')
    ]);

    return { ok: true, msg: 'Tarjetas rojas y sanciones guardadas' };
};

export const saveInjuriesFull = async (matchId) => {
    const state = scorerState[matchId];
    if (!state) return { ok: false, msg: 'No hay datos' };

    const supa = await getSupa();
    if (!supa) return { ok: false, msg: 'Supabase no configurado' };

    const meta = state.meta;
    const localTeamId = meta.local_team_id;
    const visitTeamId = meta.visitante_team_id;

    if (!localTeamId || !visitTeamId) return { ok: false, msg: 'Faltan IDs de equipo' };

    const { error: errDel } = await supa
        .from('match_injuries')
        .delete()
        .eq('match_id', matchId);

    if (errDel) {
        console.error('Error borrando match_injuries:', errDel);
        return { ok: false, msg: 'Error al limpiar lesiones antiguas' };
    }

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

    await Promise.all([
        saveSuspensionForMatch(matchId, localTeamId, state.injuriesLocal.map(p => p.player_id), matchId, 'injury'),
        saveSuspensionForMatch(matchId, visitTeamId, state.injuriesVisitante.map(p => p.player_id), matchId, 'injury')
    ]);

    return { ok: true, msg: 'Lesiones registradas correctamente' };
};

export const loadSuspensionsForMatches = async (partidos) => {
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
