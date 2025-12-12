export async function run(supabase, competitionId = null) {
    const SEASON = process.env.SEASON || '2025-26';
    console.log(`Starting: Pass Masters (Season: ${SEASON}${competitionId ? `, Competition: ${competitionId}` : ''})`);

    let statsQuery = supabase
        .from('match_team_stats')
        .select(`
      passes,
      passes_completed,
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
        if (!map.has(r.league_team_id)) map.set(r.league_team_id, { passes: 0, completed: 0, name: r.team?.nickname });
        const e = map.get(r.league_team_id);
        e.passes += (r.passes || 0);
        e.completed += (r.passes_completed || 0);
    });

    let maxPct = -1;
    let leader = null;

    map.forEach(val => {
        if (val.passes > 100) { // Min sample
            const pct = val.completed / val.passes;
            if (pct > maxPct) { maxPct = pct; leader = val; }
        }
    });

    if (!leader) return;

    const pctStr = (maxPct * 100).toFixed(1) + '%';

    const entry = {
        fecha: new Date().toISOString().slice(0, 10),
        season: SEASON,
        tipo: 'team_pass_masters',
        titulo: 'Maestros del pase',
        descripcion: `El equipo ${leader.name} lidera la precisión de pase con un ${pctStr}.`,
        payload: { category: 'equipos', nickname: leader.name, value: maxPct, badge: `img/${(leader.name || '').toLowerCase()}.png` }
    };

    if (competitionId !== null) {
        entry.competition_id = competitionId;
    }

    await supabase.from('daily_curiosities').insert(entry);
}
