export async function run(supabase, competitionId = null) {
    const SEASON = process.env.SEASON || '2025-26';
    console.log(`Starting: Home/Away Contrast (Season: ${SEASON}${competitionId ? `, Competition: ${competitionId}` : ''})`);

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

    const stats = new Map(); // id -> { homePts: 0, awayPts: 0, homeGames: 0, awayGames: 0 }
    const get = (id) => { if (!stats.has(id)) stats.set(id, { hp: 0, ap: 0, hg: 0, ag: 0 }); return stats.get(id); };

    matches.forEach(m => {
        const h = get(m.home_league_team_id);
        const a = get(m.away_league_team_id);
        h.hg++; a.ag++;

        if (m.home_goals > m.away_goals) h.hp += 3;
        else if (m.home_goals < m.away_goals) a.ap += 3;
        else { h.hp += 1; a.ap += 1; }
    });

    let maxDiff = -1;
    let leaderId = null;

    stats.forEach((val, id) => {
        // Basic normalization: Avg points per game home vs away
        if (val.hg > 0 && val.ag > 0) {
            const hAvg = val.hp / val.hg;
            const aAvg = val.ap / val.ag;
            const diff = Math.abs(hAvg - aAvg);
            if (diff > maxDiff) { maxDiff = diff; leaderId = id; }
        }
    });

    if (!leaderId) return;

    const { data: t } = await supabase.from('league_teams').select('nickname').eq('id', leaderId).single();
    const name = t?.nickname || 'Unknown';
    const valFixed = maxDiff.toFixed(2);

    const entry = {
        fecha: new Date().toISOString().slice(0, 10),
        season: SEASON,
        tipo: 'team_home_away_contrast',
        titulo: 'Dr. Jekyll y Mr. Hyde',
        descripcion: `El ${name} muestra la mayor diferencia de rendimiento local/visitante (${valFixed} puntos/partido de diferencia).`,
        payload: { category: 'estadisticas', nickname: name, value: parseFloat(valFixed), badge: `img/${name.toLowerCase()}.png` }
    };

    if (competitionId !== null) {
        entry.competition_id = competitionId;
    }

    await supabase.from('daily_curiosities').insert(entry);
}
