export async function run(supabase) {
    const SEASON = process.env.SEASON || '2025-26';
    console.log(`Starting: Giant Killers (Season: ${SEASON})`);

    // 1. Calculate Standings to find Top 3
    // Fetch matches
    const { data: matches, error: mErr } = await supabase
        .from('matches')
        .select('home_league_team_id, away_league_team_id, home_goals, away_goals')
        .eq('season', SEASON)
        .not('home_goals', 'is', null);

    if (mErr || !matches?.length) return;

    const points = new Map();
    const getP = (id) => points.get(id) || 0;
    const addP = (id, p) => points.set(id, getP(id) + p);

    matches.forEach(m => {
        if (m.home_goals > m.away_goals) addP(m.home_league_team_id, 3);
        else if (m.home_goals < m.away_goals) addP(m.away_league_team_id, 3);
        else { addP(m.home_league_team_id, 1); addP(m.away_league_team_id, 1); }
    });

    // Sort teams by points
    const sortedIds = Array.from(points.keys()).sort((a, b) => points.get(b) - points.get(a));
    const top3 = new Set(sortedIds.slice(0, 3)); // Top 3 IDs

    if (top3.size === 0) return;

    // 2. Find teams that beat any of Top 3
    const giantKillers = new Map(); // teamId -> count of wins against top 3

    matches.forEach(m => {
        const h = m.home_league_team_id;
        const a = m.away_league_team_id;

        // Home beats giant?
        if (top3.has(a) && m.home_goals > m.away_goals) {
            giantKillers.set(h, (giantKillers.get(h) || 0) + 1);
        }
        // Away beats giant?
        if (top3.has(h) && m.away_goals > m.home_goals) {
            giantKillers.set(a, (giantKillers.get(a) || 0) + 1);
        }
    });

    let maxKills = -1;
    let leaderId = null;

    giantKillers.forEach((count, id) => {
        // Avoid counting giants beating giants? Or is that strictly giant killing?
        // "Giant Killer" usually implies a smaller team. 
        // But for simplicity, we just look for most wins against top 3.
        if (count > maxKills) { maxKills = count; leaderId = id; }
    });

    if (!leaderId) return;

    const { data: team } = await supabase.from('league_teams').select('nickname').eq('id', leaderId).single();
    const name = team?.nickname || 'Unknown';

    await supabase.from('daily_curiosities').insert({
        fecha: new Date().toISOString().slice(0, 10),
        season: SEASON,
        tipo: 'team_giant_killers',
        titulo: 'Matagigantes',
        descripcion: `El equipo ${name} se creces ante los grandes: ha ganado ${maxKills} veces contra los 3 primeros clasificados.`,
        payload: { category: 'equipos', nickname: name, value: maxKills, badge: `img/${name.toLowerCase()}.png` }
    });
}
