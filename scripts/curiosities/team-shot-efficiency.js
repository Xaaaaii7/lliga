export async function run(supabase, competitionId = null) {
    const SEASON = process.env.SEASON || '2025-26';
    console.log(`Starting Daily Curiosity: Shot Efficiency (Season: ${SEASON}${competitionId ? `, Competition: ${competitionId}` : ''})`);

    let statsQuery = supabase
        .from('match_team_stats')
        .select(`
      shots,
      goals,
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
        if (!map.has(id)) map.set(id, { shots: 0, goals: 0, name: r.team.nickname || r.team.display_name });
        const e = map.get(id);
        e.shots += (r.shots || 0);
        e.goals += (r.goals || 0);
    });

    let maxEff = -1;
    let leader = null;

    for (const t of map.values()) {
        if (t.shots >= 10) { // Min 10 shots to be considered
            const eff = t.goals / t.shots;
            if (eff > maxEff) { maxEff = eff; leader = t; }
        }
    }

    if (!leader) return;

    const pct = (maxEff * 100).toFixed(1) + '%';
    console.log(`Leader: ${leader.name} with ${pct} conversion rate`);

    const entry = {
        fecha: new Date().toISOString().slice(0, 10),
        season: SEASON,
        tipo: 'team_shot_efficiency',
        titulo: 'Francotiradores',
        descripcion: `El equipo ${leader.name} tiene la mejor puntería: ${pct} de sus tiros acaban en gol.`,
        payload: {
            category: 'equipos',
            nickname: leader.name,
            value: maxEff,
            badge: `img/${(leader.name || 'default').toLowerCase()}.png`
        }
    };

    if (competitionId !== null) {
        entry.competition_id = competitionId;
    }

    await supabase.from('daily_curiosities').insert(entry);
}
