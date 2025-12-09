export async function run(supabase) {
    const SEASON = process.env.SEASON || '2025-26';
    console.log(`Starting: Match Most Goals (Season: ${SEASON})`);

    const { data: matches } = await supabase
        .from('matches')
        .select('id, home_league_team_id, away_league_team_id, home_goals, away_goals, round_id')
        .eq('season', SEASON)
        .not('home_goals', 'is', null);

    if (!matches?.length) return;

    let maxTotal = -1;
    let bestM = null;

    matches.forEach(m => {
        const total = m.home_goals + m.away_goals;
        if (total > maxTotal) {
            maxTotal = total;
            bestM = m;
        }
    });

    if (!bestM) return;

    // Fetch Team Names
    const { data: teams } = await supabase.from('league_teams').select('id, nickname').in('id', [bestM.home_league_team_id, bestM.away_league_team_id]);
    const hName = teams.find(t => t.id === bestM.home_league_team_id)?.nickname || 'Local';
    const aName = teams.find(t => t.id === bestM.away_league_team_id)?.nickname || 'Visitante';

    await supabase.from('daily_curiosities').insert({
        fecha: new Date().toISOString().slice(0, 10),
        season: SEASON,
        tipo: 'match_most_goals',
        titulo: 'Lluvia de goles',
        descripcion: `El duelo más goleador: ${hName} ${bestM.home_goals}-${bestM.away_goals} ${aName} (${maxTotal} goles).`,
        payload: {
            category: 'partidos',
            matchId: bestM.id,
            value: maxTotal,
            badge: `img/${hName.toLowerCase()}.png`
        }
    });
}
