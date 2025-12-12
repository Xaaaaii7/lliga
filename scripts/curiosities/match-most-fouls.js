export async function run(supabase, competitionId = null) {
    const SEASON = process.env.SEASON || '2025-26';
    console.log(`Starting: Match Most Fouls (Season: ${SEASON}${competitionId ? `, Competition: ${competitionId}` : ''})`);

    let statsQuery = supabase
        .from('match_team_stats')
        .select(`
      fouls,
      match_id,
      match:matches!inner (season, competition_id)
    `);

    if (competitionId !== null) {
        statsQuery = statsQuery.eq('match.competition_id', competitionId);
    } else {
        statsQuery = statsQuery.eq('match.season', SEASON);
    }

    const { data: stats } = await statsQuery;

    if (!stats?.length) return;

    const matchFouls = new Map();
    stats.forEach(r => {
        if (!r.match_id) return;
        matchFouls.set(r.match_id, (matchFouls.get(r.match_id) || 0) + (r.fouls || 0));
    });

    let max = -1;
    let bestMId = null;
    matchFouls.forEach((count, id) => { if (count > max) { max = count; bestMId = id; } });

    if (!bestMId) return;

    const { data: match } = await supabase
        .from('matches')
        .select(`
      home:league_teams!matches_home_league_team_id_fkey(nickname), 
      away:league_teams!matches_away_league_team_id_fkey(nickname)
    `)
        .eq('id', bestMId)
        .single();

    const hName = match.home?.nickname || 'Local';
    const aName = match.away?.nickname || 'Visitor';

    const entry = {
        fecha: new Date().toISOString().slice(0, 10),
        season: SEASON,
        tipo: 'match_most_fouls',
        titulo: 'Juego interrumpido',
        descripcion: `El partido ${hName} vs ${aName} se detuvo constantemente: se pitaron ${max} faltas.`,
        payload: { category: 'partidos', matchId: bestMId, value: max, badge: `img/${hName.toLowerCase()}.png` }
    };

    if (competitionId !== null) {
        entry.competition_id = competitionId;
    }

    await supabase.from('daily_curiosities').insert(entry);
}
