import { normalizeText } from './utils.js';
import { isNum } from './utils.js';
import { getResultados, getPenaltyMap } from './stats-data.js';

// Caché de clasificaciones por jornada / opciones
const _clasifCache = new Map(); // key: `${limit||'ALL'}|${useH2H?1:0}`

// Diferencia de goles
export const dg = e => e.gf - e.gc;

// --------------------------
// Clasificación con H2H
// --------------------------
export const computeClasificacion = async (hasta = null, opts = {}) => {
    const { useH2H = true } = opts;
    const jornadas = await getResultados();

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
        const k = normalizeText(name);
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
        const a = normalizeText(A), b = normalizeText(B);
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

    // 🔴 Aplicar sanciones si las tenemos
    const _penaltyByTeamNorm = getPenaltyMap();
    if (_penaltyByTeamNorm && _penaltyByTeamNorm.size) {
        for (const t of equipos) {
            const k = normalizeText(t.nombre);
            const pen = _penaltyByTeamNorm.get(k) || 0;

            t.pts_raw = t.pts;       // puntos por partidos (sin sanción)
            t.penalty_pts = pen;     // sanción
            t.pts = t.pts_raw - pen; // puntos finales

            if (t.pts < 0) t.pts = 0; // opcional: evitar negativos
        }
    }

    equipos.sort((A, B) => {
        if (B.pts !== A.pts) return B.pts - A.pts;

        // Desempate H2H
        if (useH2H) {
            const a = normalizeText(A.nombre), b = normalizeText(B.nombre);
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
export const computeClasificacionPorJornada = async (opts = {}) => {
    const jornadas = await getResultados();
    const tables = [];
    for (let j = 1; j <= jornadas.length; j++) {
        tables.push(await computeClasificacion(j, opts));
    }
    return tables;
};

// Totales GF/GC/PJ simples (por si lo quieres directo)
export const computeTeamTotals = async () => {
    const tabla = await computeClasificacion(null, { useH2H: false });
    return tabla.map(t => ({
        nombre: t.nombre, pj: t.pj, gf: t.gf, gc: t.gc
    }));
};
