export async function run(supabase, competitionId = null) {
    const SEASON = process.env.SEASON || '2025-26';
    console.log(`Starting: Top Half Killers (Season: ${SEASON}${competitionId ? `, Competition: ${competitionId}` : ''})`);

    // 1. Calculate Standings
    let matchesQuery = supabase
        .from('matches')
        .select('home_league_team_id, away_league_team_id, home_goals, away_goals')
        .not('home_goals', 'is', null);

    if (competitionId !== null) {
        matchesQuery = matchesQuery.eq('competition_id', competitionId);
    } else {
        matchesQuery = matchesQuery.eq('season', SEASON);
    }

    const { data: matches } = await matchesQuery;

    if (!matches?.length) return;

    const points = new Map();
    const getP = (id) => points.get(id) || 0;
    const addP = (id, p) => points.set(id, getP(id) + p);

    matches.forEach(m => {
        if (m.home_goals > m.away_goals) addP(m.home_league_team_id, 3);
        else if (m.home_goals < m.away_goals) addP(m.away_league_team_id, 3);
        else { addP(m.home_league_team_id, 1); addP(m.away_league_team_id, 1); }
    });

    const rankedIds = Array.from(points.keys()).sort((a, b) => points.get(b) - points.get(a));
    const halfSize = Math.ceil(rankedIds.length / 2);
    const topHalf = new Set(rankedIds.slice(0, halfSize));

    if (topHalf.size === 0) return;

    // 2. Count wins against top half
    const killerStats = new Map(); // id -> points against top half

    matches.forEach(m => {
        const h = m.home_league_team_id;
        const a = m.away_league_team_id;

        if (topHalf.has(a)) { // Home playing against top half
            if (m.home_goals > m.away_goals) killerStats.set(h, (killerStats.get(h) || 0) + 3);
            else if (m.home_goals === m.away_goals) killerStats.set(h, (killerStats.get(h) || 0) + 1);
        }
        if (topHalf.has(h)) { // Away playing against top half
            if (m.away_goals > m.home_goals) killerStats.set(a, (killerStats.get(a) || 0) + 3);
            else if (m.away_goals === m.home_goals) killerStats.set(a, (killerStats.get(a) || 0) + 1);
        }
    });

    let maxPts = -1;
    let leaderId = null;
    killerStats.forEach((p, id) => { if (p > maxPts) { maxPts = p; leaderId = id; } });

    if (!leaderId) return;

    const { data: t } = await supabase.from('league_teams').select('nickname').eq('id', leaderId).single();
    const name = t?.nickname || 'Unknown';

    const entry = {
        fecha: new Date().toISOString().slice(0, 10),
        season: SEASON,
        tipo: 'team_top_half_killer',
        titulo: 'Cazador de élite',
        descripcion: `El ${name} se crece ante los mejores: ha sumado ${maxPts} puntos contra rivales de la mitad superior de la tabla.`,
        payload: { category: 'equipos', nickname: name, value: maxPts, badge: `img/${name.toLowerCase()}.png` }
    };

    if (competitionId !== null) {
        entry.competition_id = competitionId;
    }

    await supabase.from('daily_curiosities').insert(entry);
}
