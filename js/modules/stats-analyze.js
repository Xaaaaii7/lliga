import { isNum, toNum } from './utils.js';
import { getStatsIndex, getResultados } from './stats-data.js';

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

export const computeRankingsPorEquipo = async () => {
    const statsIndex = await getStatsIndex();

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

        // Pesos
        // Goles y ganar pesan mucho (30%, 25%)
        // Juego (pase, posesión) ~ 15%
        // Efectividad (tiro, defensa) ~ 15%
        // Fair play ~ 5%
        // Esto es subjetivo, ajustable
        let finalScore =
            sWin * 2.0 +
            sPich * 1.5 +
            sZam * 1.0 +
            sShot * 1.0 +
            sDef * 1.0 +
            sPass * 0.8 +
            sPos * 0.5 +
            sFair * 0.5;

        t.mvpScore = finalScore;
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
