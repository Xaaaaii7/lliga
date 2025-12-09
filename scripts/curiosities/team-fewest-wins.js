export async function run(supabase) {
    const SEASON = process.env.SEASON || '2025-26';
    console.log(`Starting: Fewest Wins (Season: ${SEASON})`);

    const { data: teams } = await supabase.from('league_teams').select('id, nickname');
    const { data: matches } = await supabase
        .from('matches')
        .select('home_league_team_id, away_league_team_id, home_goals, away_goals')
        .eq('season', SEASON)
        .not('home_goals', 'is', null);

    if (!matches?.length) return;

    const wins = new Map();
    teams.forEach(t => wins.set(t.id, 0)); // init all with 0

    matches.forEach(m => {
        if (m.home_goals > m.away_goals) wins.set(m.home_league_team_id, wins.get(m.home_league_team_id) + 1);
        else if (m.away_goals > m.home_goals) wins.set(m.away_league_team_id, wins.get(m.away_league_team_id) + 1);
    });

    let min = Infinity;
    let leaderId = null;
    wins.forEach((count, id) => { if (count < min) { min = count; leaderId = id; } });

    const t = teams.find(x => x.id === leaderId);
    const name = t?.nickname || 'Unknown';

    await supabase.from('daily_curiosities').insert({
        fecha: new Date().toISOString().slice(0, 10),
        season: SEASON,
        tipo: 'team_fewest_wins',
        titulo: 'Se resiste el triunfo',
        descripcion: `El equipo ${name} es el que menos veces ha ganado esta temporada (${min}).`,
        payload: { category: 'equipos', nickname: name, value: min, badge: `img/${name.toLowerCase()}.png` }
    });
}
