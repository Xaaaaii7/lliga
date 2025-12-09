export async function run(supabase) {
    const SEASON = process.env.SEASON || '2025-26';
    console.log(`Starting: Economists (Points per Goal) (Season: ${SEASON})`);

    // Fetch matches
    const { data: matches } = await supabase
        .from('matches')
        .select('home_league_team_id, away_league_team_id, home_goals, away_goals')
        .eq('season', SEASON)
        .not('home_goals', 'is', null);

    if (!matches?.length) return;

    const data = new Map(); // id -> { points, goals }
    const ensure = (id) => { if (!data.has(id)) data.set(id, { p: 0, g: 0 }); return data.get(id); };

    matches.forEach(m => {
        const h = ensure(m.home_league_team_id);
        const a = ensure(m.away_league_team_id);

        h.g += m.home_goals;
        a.g += m.away_goals;

        if (m.home_goals > m.away_goals) h.p += 3;
        else if (m.home_goals < m.away_goals) a.p += 3;
        else { h.p += 1; a.p += 1; }
    });

    // Calculate Points / Goals ratio. Higher is better (more efficient).
    let maxEff = -1;
    let leaderId = null;

    data.forEach((val, id) => {
        if (val.g > 5) { // Min goals
            const eff = val.p / val.g;
            if (eff > maxEff) { maxEff = eff; leaderId = id; }
        }
    });

    if (!leaderId) return;

    const { data: t } = await supabase.from('league_teams').select('nickname').eq('id', leaderId).single();
    const name = t?.nickname || 'Unknown';
    const valFixed = maxEff.toFixed(2);

    await supabase.from('daily_curiosities').insert({
        fecha: new Date().toISOString().slice(0, 10),
        season: SEASON,
        tipo: 'team_points_per_goal',
        titulo: 'Economistas del gol',
        descripcion: `El equipo ${name} rentabiliza al máximo sus goles: obtiene ${valFixed} puntos por cada gol anotado.`,
        payload: { category: 'equipos', nickname: name, value: parseFloat(valFixed), badge: `img/${name.toLowerCase()}.png` }
    });
}
