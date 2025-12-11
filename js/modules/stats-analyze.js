import { isNum, toNum } from './utils.js';
import { getStatsIndex, getResultados } from './stats-data.js';
import { computeClasificacion } from './stats-calc.js';

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

// --------------------------
// Rankings avanzados por equipo
// --------------------------
export const fair = (t) => {
    const ROJA_PESO = 5;
    return ((t.entradas || 0) + 1) /
        ((t.faltas || 0) + ROJA_PESO * (t.rojas || 0) + 1);
};

export const passAcc = (t) => t.pases > 0 ? (t.completados / t.pases) : NaN;

export const precisionTiro = (t) => t.tiros > 0 ? (t.taPuerta || 0) / t.tiros : NaN;

export const conversionGol = (t) => t.tiros > 0 ? (t.goles || 0) / t.tiros : NaN;

export const combinedShot = (t) => {
    const p = precisionTiro(t), c = conversionGol(t);
    return (!isNaN(p) && !isNaN(c)) ? (p + c) / 2 : NaN;
};

export const efectRival = (t) => t.tirosRival > 0 ? t.golesEncajados / t.tirosRival : NaN;

export const computeRankingsPorEquipo = async (competitionId = null) => {
    const statsIndex = await getStatsIndex(competitionId);

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

export const computePichichiPlayers = (rows) => {
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

export const computeMvpPorJornada = async (jornadaNumero) => {
    const jornadas = await getResultados();
    const statsIndex = await getStatsIndex();
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

    // Ponderación final (MVP)
    for (const t of teamsJ) {
        const sPich = getScore(scorePichichi, t);
        const sZam = getScore(scoreZamora, t);
        const sWin = getScore(scoreWin, t);
        const sPos = getScore(scorePos, t);
        const sPass = getScore(scorePass, t);
        const sFair = getScore(scoreFair, t);
        const sShot = getScore(scoreShot, t);
        const sDef = getScore(scoreDef, t);

        // Pesos originales de core-stats.old.js
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

    // Ordenar por mvpScore
    teamsJ.sort((a, b) => b.mvpScore - a.mvpScore);
    const winner = teamsJ[0];

    return {
        jornada: jornadaNumero,
        teams: teamsJ,
        winner
    };
};

export const computeMvpTemporada = async () => {
    const jornadas = await getResultados();
    const seasonMap = new Map();

    for (const j of jornadas) {
        const jNum = j.numero ?? j.jornada;
        if (!jNum) continue;

        const { teams } = await computeMvpPorJornada(jNum);
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

// ==========================
// TEAM OF THE MOMENT (3 equipos)
// ==========================
export const computeTeamsFormTop = async (limit = 3) => {
    const jornadas = await getResultados();
    if (!Array.isArray(jornadas) || !jornadas.length) return [];

    const porEquipo = new Map(); // nombre -> [{jornada, mvpScore, pj}]

    for (const j of jornadas) {
        const jNum = j.numero ?? j.jornada;
        if (!jNum) continue;

        const { teams } = await computeMvpPorJornada(jNum);
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
};

// ==========================
// GOLEADOR DEL MOMENTO
// ==========================
import { getSupabaseClient } from './supabase-client.js';
import { slugify } from './utils.js';

export const computeGoleadorMomento = async () => {
    const jornadas = await getResultados();
    if (!Array.isArray(jornadas) || !jornadas.length) {
        return { error: 'No hay jornadas todavía.' };
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
        return { error: 'Todavía no hay jornadas con partidos jugados.' };
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
        return { error: 'No hay partidos disputados en las últimas jornadas.' };
    }

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
        return { error: 'Error al leer los eventos de gol.' };
    }

    const eventos = data || [];
    if (!eventos.length) {
        return { error: 'No hay goles registrados en las jornadas seleccionadas.' };
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
        return { error: 'No hay jugadores con goles registrados en las jornadas seleccionadas.' };
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

    return {
        badgeLabel,
        ganador,
        top5,
        jNums
    };
};

/**
 * Compute matches history for a team up to a specific jornada
 * @param {Object[]} jornadas - Array of all matches
 * @param {number} hasta - limit jornada
 * @param {string} teamName 
 * @returns {Array} List of matches with result context
 */
export function computePartidosEquipo(jornadas, hasta, teamName) {
    const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
    const matches = [];
    for (let i = 0; i < hasta; i++) {
        const j = jornadas[i];
        if (!j) continue;
        for (const p of (j.partidos || [])) {
            if (!p.local || !p.visitante) continue;
            const gl = isNum(p.goles_local) ? p.goles_local : null;
            const gv = isNum(p.goles_visitante) ? p.goles_visitante : null;
            if (gl === null || gv === null) continue;

            if (p.local === teamName || p.visitante === teamName) {
                const isLocal = p.local === teamName;
                const gf = isLocal ? gl : gv;
                const gc = isLocal ? gv : gl;
                let result = 'E';
                if (gf > gc) result = 'V';
                else if (gf < gc) result = 'D';

                matches.push({
                    jornada: i + 1,
                    local: p.local,
                    visitante: p.visitante,
                    gl,
                    gv,
                    gf,
                    gc,
                    isLocal,
                    result
                });
            }
        }
    }
    return matches;
}

/**
 * Compute position history for a team
 * @param {number} hasta - limit jornada
 * @param {string} teamName 
 * @param {number|null} competitionId - ID de competición (opcional)
 * @returns {Promise<Array>} List of {jornada, pos, pts}
 */
export async function computePosicionesEquipo(hasta, teamName, competitionId = null) {
    const history = [];
    for (let jNum = 1; jNum <= hasta; jNum++) {
        const tabla = await computeClasificacion(jNum, { competitionId });
        const idx = tabla.findIndex(e => e.nombre === teamName);
        if (idx === -1) continue;
        history.push({
            jornada: jNum,
            pos: idx + 1,
            pts: tabla[idx].pts
        });
    }
    return history;
}

