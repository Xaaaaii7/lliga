export async function run(supabase, competitionId = null) {
    const SEASON = process.env.SEASON || '2025-26';
    console.log(`Starting: Interceptions (Season: ${SEASON}${competitionId ? `, Competition: ${competitionId}` : ''})`);

    let statsQuery = supabase
        .from('match_team_stats')
        .select(`
      interceptions,
      league_team_id,
      team:league_teams (nickname),
      match:matches!inner (season, competition_id)
    `);

    if (competitionId !== null) {
        statsQuery = statsQuery.eq('match.competition_id', competitionId);
    } else {
        statsQuery = statsQuery.eq('match.season', SEASON);
    }

    const { data: stats } = await statsQuery;

    if (!stats?.length) return;

    const map = new Map();
    stats.forEach(r => {
        if (!r.league_team_id) return;
        if (!map.has(r.league_team_id)) map.set(r.league_team_id, { count: 0, matches: 0, name: r.team?.nickname });
        const e = map.get(r.league_team_id);
        e.count += (r.interceptions || 0);
        e.matches++;
    });

    let maxAvg = -1;
    let leader = null;
    map.forEach(val => {
        if (val.matches > 0) {
            const avg = val.count / val.matches;
            if (avg > maxAvg) { maxAvg = avg; leader = val; }
        }
    });

    if (!leader) return;
    const avgStr = maxAvg.toFixed(2);

    const entry = {
        fecha: new Date().toISOString().slice(0, 10),
        season: SEASON,
        tipo: 'team_interception_masters',
        titulo: 'Lectores del juego',
        descripcion: `El equipo ${leader.name} intercepta ${avgStr} pases rivales por partido.`,
        payload: { category: 'estadisticas', nickname: leader.name, value: parseFloat(avgStr), badge: `img/${(leader.name || '').toLowerCase()}.png` }
    };

    if (competitionId !== null) {
        entry.competition_id = competitionId;
    }

    await supabase.from('daily_curiosities').insert(entry);
}
