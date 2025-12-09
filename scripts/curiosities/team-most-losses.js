export async function run(supabase) {
    const SEASON = process.env.SEASON || '2025-26';
    console.log(`Starting: Most Losses (Season: ${SEASON})`);

    const { data: matches } = await supabase
        .from('matches')
        .select('home_league_team_id, away_league_team_id, home_goals, away_goals')
        .eq('season', SEASON)
        .not('home_goals', 'is', null);

    if (!matches?.length) return;

    const stats = new Map();
    const add = (id) => stats.set(id, (stats.get(id) || 0) + 1);

    matches.forEach(m => {
        if (m.home_goals < m.away_goals) add(m.home_league_team_id);
        else if (m.home_goals > m.away_goals) add(m.away_league_team_id);
    });

    let max = -1;
    let leaderId = null;
    stats.forEach((count, id) => { if (count > max) { max = count; leaderId = id; } });

    if (!leaderId) return;

    const { data: t } = await supabase.from('league_teams').select('nickname').eq('id', leaderId).single();
    const name = t?.nickname || 'Unknown';

    await supabase.from('daily_curiosities').insert({
        fecha: new Date().toISOString().slice(0, 10),
        season: SEASON,
        tipo: 'team_most_losses',
        titulo: 'Temporada difícil',
        descripcion: `El ${name} es el equipo con más derrotas de la liga (${max}).`,
        payload: { category: 'equipos', nickname: name, value: max, badge: `img/${name.toLowerCase()}.png` }
    });
}
