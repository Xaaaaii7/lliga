import { getSupabaseClient, getSupabaseConfig } from './supabase-client.js';

// ==========================
//  PLANTILLAS DE SISTEMAS
// ==========================
export const FORMATION_TEMPLATES = {
    "4-4-2": [
        { index: 0, line: "POR", x: 50, y: 90 },
        { index: 1, line: "DEF", x: 20, y: 72 },
        { index: 2, line: "DEF", x: 40, y: 75 },
        { index: 3, line: "DEF", x: 60, y: 75 },
        { index: 4, line: "DEF", x: 80, y: 72 },
        { index: 5, line: "MC", x: 25, y: 55 },
        { index: 6, line: "MC", x: 45, y: 50 },
        { index: 7, line: "MC", x: 65, y: 50 },
        { index: 8, line: "MC", x: 75, y: 55 },
        { index: 9, line: "DEL", x: 40, y: 30 },
        { index: 10, line: "DEL", x: 60, y: 30 }
    ],
    "4-3-3": [
        { index: 0, line: "POR", x: 50, y: 90 },
        { index: 1, line: "DEF", x: 20, y: 72 },
        { index: 2, line: "DEF", x: 40, y: 75 },
        { index: 3, line: "DEF", x: 60, y: 75 },
        { index: 4, line: "DEF", x: 80, y: 72 },
        { index: 5, line: "MC", x: 30, y: 55 },
        { index: 6, line: "MC", x: 50, y: 50 },
        { index: 7, line: "MC", x: 70, y: 55 },
        { index: 8, line: "DEL", x: 25, y: 30 },
        { index: 9, line: "DEL", x: 50, y: 25 },
        { index: 10, line: "DEL", x: 75, y: 30 }
    ],
    "4-5-1": [
        { index: 0, line: "POR", x: 50, y: 90 },
        { index: 1, line: "DEF", x: 20, y: 72 },
        { index: 2, line: "DEF", x: 40, y: 75 },
        { index: 3, line: "DEF", x: 60, y: 75 },
        { index: 4, line: "DEF", x: 80, y: 72 },
        { index: 5, line: "MC", x: 20, y: 55 },
        { index: 6, line: "MC", x: 35, y: 50 },
        { index: 7, line: "MC", x: 50, y: 45 },
        { index: 8, line: "MC", x: 65, y: 50 },
        { index: 9, line: "MC", x: 80, y: 55 },
        { index: 10, line: "DEL", x: 50, y: 25 }
    ],
    "3-5-2": [
        { index: 0, line: "POR", x: 50, y: 90 },
        { index: 1, line: "DEF", x: 30, y: 75 },
        { index: 2, line: "DEF", x: 50, y: 72 },
        { index: 3, line: "DEF", x: 70, y: 75 },
        { index: 4, line: "MC", x: 20, y: 55 },
        { index: 5, line: "MC", x: 35, y: 50 },
        { index: 6, line: "MC", x: 50, y: 45 },
        { index: 7, line: "MC", x: 65, y: 50 },
        { index: 8, line: "MC", x: 80, y: 55 },
        { index: 9, line: "DEL", x: 40, y: 30 },
        { index: 10, line: "DEL", x: 60, y: 30 }
    ]
};

export const DEFAULT_SYSTEM = "4-3-3";

// Clasificación de posición -> línea
export function groupFromPosition(pos) {
    const p = (pos || "").toLowerCase();
    if (p.includes("goalkeeper") || p.includes("portero") || p === "gk") return "POR";
    if (
        p.includes("defence") || p.includes("back") ||
        p.includes("centre-back") || p.includes("defensa") ||
        p === "cb" || p === "lb" || p === "rb"
    ) return "DEF";
    if (p.includes("midfield") || p.includes("medio") || p.includes("mid")) return "MC";
    if (
        p.includes("offence") || p.includes("forward") ||
        p.includes("wing") || p.includes("striker") ||
        p.includes("delantero")
    ) return "DEL";
    return null; // otros
}

export async function resolveClubIdFromNickname(nickname) {
    if (!nickname) return null;
    const supabase = await getSupabaseClient();
    const cfg = getSupabaseConfig();
    const season = cfg?.season;

    let q = supabase
        .from("league_teams")
        .select("club_id, season, nickname")
        .ilike("nickname", nickname)
        .limit(1);

    if (season) q = q.eq("season", season);

    const { data, error } = await q;
    if (error) {
        console.warn("Error league_teams:", error);
        return null;
    }
    const row = data && data[0];
    return row?.club_id || null;
}

export async function loadSquadForClub(clubId) {
    if (!clubId) return [];
    const supabase = await getSupabaseClient();
    const cfg = getSupabaseConfig();
    const season = cfg?.season;

    let q = supabase
        .from("player_club_memberships")
        .select(`
        player:players (
          id,
          name,
          position,
          nationality
        )
      `)
        .eq("club_id", clubId);

    if (season) q = q.eq("season", season);

    const { data, error } = await q;
    if (error) {
        console.warn("Error memberships:", error);
        return [];
    }

    const map = new Map();
    for (const row of data || []) {
        const p = row.player;
        if (!p || !p.id) continue;
        if (!map.has(p.id)) {
            map.set(p.id, {
                ...p,
                line: groupFromPosition(p.position)
            });
        }
    }
    return Array.from(map.values());
}

export async function loadFormationForClub(clubId) {
    if (!clubId) return null;
    const supabase = await getSupabaseClient();
    const cfg = getSupabaseConfig();
    const season = cfg?.season;

    let q = supabase
        .from("formations")
        .select(`
        id,
        system,
        slots:formation_slots (
          slot_index,
          player_id
        )
      `)
        .eq("club_id", clubId)
        .limit(1);

    if (season) q = q.eq("season", season);

    const { data, error } = await q;
    if (error) {
        console.warn("Error formations:", error);
        return null;
    }

    const row = data && data[0];
    if (!row) return null;

    const slots = new Map();
    for (const s of (row.slots || [])) {
        slots.set(s.slot_index, s.player_id);
    }

    return {
        id: row.id,
        system: row.system || DEFAULT_SYSTEM,
        slots
    };
}

export async function saveFormationToDb(clubId, season, system, slotsMap, formationId = null) {
    if (!clubId) return { ok: false, msg: "Faltan datos (clubId)" };

    const template = FORMATION_TEMPLATES[system];
    if (!template) return { ok: false, msg: "Sistema de juego no válido" };

    const supabase = await getSupabaseClient();

    // 1) Upsert de formations
    let newFormationId = formationId;

    if (!newFormationId) {
        let ins = supabase.from("formations").insert({
            club_id: clubId,
            season: season,
            system: system
        }).select("id").single();

        const { data, error } = await ins;
        if (error) {
            console.error("Error insert formations:", error);
            return { ok: false, msg: "No se pudo crear la formación" };
        }
        newFormationId = data.id;
    } else {
        let upd = supabase.from("formations").update({
            system: system,
            season: season
        }).eq("id", newFormationId).select("id").single();

        const { data, error } = await upd;
        if (error) {
            console.error("Error update formations:", error);
            return { ok: false, msg: "No se pudo actualizar la formación" };
        }
        newFormationId = data.id;
    }

    // 2) Upsert de slots
    const rows = template.map(slot => ({
        formation_id: newFormationId,
        slot_index: slot.index,
        player_id: slotsMap.get(slot.index) || null
    }));

    const { error: slotsError } = await supabase
        .from("formation_slots")
        .upsert(rows, { onConflict: "formation_id,slot_index" });

    if (slotsError) {
        console.error("Error upsert formation_slots:", slotsError);
        return { ok: false, msg: "La formación se guardó parcialmente (error en slots)", formationId: newFormationId };
    }

    return { ok: true, msg: "Formación guardada", formationId: newFormationId };
}
