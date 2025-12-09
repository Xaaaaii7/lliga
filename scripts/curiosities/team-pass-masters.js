export async function run(supabase) {
    const SEASON = process.env.SEASON || '2025-26';
    console.log(`Starting: Pass Masters (Season: ${SEASON})`);

    const { data: stats } = await supabase
        .from('match_team_stats')
        .select(`
      passes,
      passes_completed,
      league_team_id,
      team:league_teams (nickname),
      match:matches!inner (season)
    `)
        .eq('match.season', SEASON);

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

    await supabase.from('daily_curiosities').insert({
        fecha: new Date().toISOString().slice(0, 10),
        season: SEASON,
        tipo: 'team_pass_masters',
        titulo: 'Maestros del pase',
        descripcion: `El equipo ${leader.name} lidera la precisión de pase con un ${pctStr}.`,
        payload: { category: 'equipos', nickname: leader.name, value: maxPct, badge: `img/${(leader.name || '').toLowerCase()}.png` }
    });
}
