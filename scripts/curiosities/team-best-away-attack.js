export async function run(supabase, competitionId = null) {
    const SEASON = process.env.SEASON || '2025-26';
    console.log(`Starting: Best Away Attack (Season: ${SEASON}${competitionId ? `, Competition: ${competitionId}` : ''})`);

    let matchesQuery = supabase
        .from('matches')
        .select('away_league_team_id, away_goals')
        .not('away_goals', 'is', null);

    if (competitionId !== null) {
        matchesQuery = matchesQuery.eq('competition_id', competitionId);
    } else {
        matchesQuery = matchesQuery.eq('season', SEASON);
    }

    const { data: matches } = await matchesQuery;

    if (!matches?.length) return;

    const stats = new Map();

    matches.forEach(m => {
        const id = m.away_league_team_id;
        if (!stats.has(id)) stats.set(id, { goals: 0, matches: 0 });
        const s = stats.get(id);
        s.goals += m.away_goals;
        s.matches++;
    });

    let bestAvg = -1;
    let leaderId = null;

    stats.forEach((val, key) => {
        if (val.matches > 0) {
            const avg = val.goals / val.matches;
            if (avg > bestAvg) { bestAvg = avg; leaderId = key; }
        }
    });

    if (!leaderId) return;

    const { data: t } = await supabase.from('league_teams').select('nickname').eq('id', leaderId).single();
    const name = t?.nickname || 'Unknown';
    const valFixed = bestAvg.toFixed(2);

    const entry = {
        fecha: new Date().toISOString().slice(0, 10),
        season: SEASON,
        tipo: 'team_best_away_attack',
        titulo: 'Visitante peligroso',
        descripcion: `El ${name} promedia ${valFixed} goles por partido cuando juega fuera de casa.`,
        payload: { category: 'equipos', nickname: name, value: parseFloat(valFixed), badge: `img/${name.toLowerCase()}.png` }
    };

    if (competitionId !== null) {
        entry.competition_id = competitionId;
    }

    await supabase.from('daily_curiosities').insert(entry);
}
