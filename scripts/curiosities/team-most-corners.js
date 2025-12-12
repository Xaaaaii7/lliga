export async function run(supabase, competitionId = null) {
    const SEASON = process.env.SEASON || '2025-26';
    console.log(`Starting Daily Curiosity: Most Corners (Season: ${SEASON}${competitionId ? `, Competition: ${competitionId}` : ''})`);

    let statsQuery = supabase
        .from('match_team_stats')
        .select(`
      corners,
      league_team_id,
      team:league_teams (nickname, display_name),
      match:matches!inner (season, competition_id)
    `);

    if (competitionId !== null) {
        statsQuery = statsQuery.eq('match.competition_id', competitionId);
    } else {
        statsQuery = statsQuery.eq('match.season', SEASON);
    }

    const { data: stats, error } = await statsQuery;

    if (error) throw new Error(error.message);
    if (!stats?.length) return;

    const map = new Map();
    stats.forEach(r => {
        if (!r.team) return;
        const id = r.league_team_id;
        if (!map.has(id)) map.set(id, { corners: 0, matches: 0, name: r.team.nickname || r.team.display_name });
        const e = map.get(id);
        e.corners += (r.corners || 0);
        e.matches++;
    });

    let maxAvg = -1;
    let leader = null;

    for (const t of map.values()) {
        if (t.matches > 0) {
            const avg = t.corners / t.matches;
            if (avg > maxAvg) { maxAvg = avg; leader = t; }
        }
    }

    if (!leader) return;

    const avgFixed = maxAvg.toFixed(2);
    console.log(`Leader: ${leader.name} with ${avgFixed} corners/match`);

    const entry = {
        fecha: new Date().toISOString().slice(0, 10),
        season: SEASON,
        tipo: 'team_most_corners',
        titulo: 'Peligro a balón parado',
        descripcion: `El equipo ${leader.name} fuerza ${avgFixed} córners por partido.`,
        payload: {
            category: 'estadisticas',
            nickname: leader.name,
            value: parseFloat(avgFixed),
            badge: `img/${(leader.name || 'default').toLowerCase()}.png`
        }
    };

    if (competitionId !== null) {
        entry.competition_id = competitionId;
    }

    await supabase.from('daily_curiosities').insert(entry);
}
