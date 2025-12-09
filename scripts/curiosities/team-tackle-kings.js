export async function run(supabase) {
    const SEASON = process.env.SEASON || '2025-26';
    console.log(`Starting: Tackle Kings (Season: ${SEASON})`);

    const { data: stats } = await supabase
        .from('match_team_stats')
        .select(`
      tackles,
      league_team_id,
      team:league_teams (nickname),
      match:matches!inner (season)
    `)
        .eq('match.season', SEASON);

    if (!stats?.length) return;

    const map = new Map();
    stats.forEach(r => {
        if (!r.league_team_id) return;
        if (!map.has(r.league_team_id)) map.set(r.league_team_id, { count: 0, matches: 0, name: r.team?.nickname });
        const e = map.get(r.league_team_id);
        e.count += (r.tackles || 0);
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

    await supabase.from('daily_curiosities').insert({
        fecha: new Date().toISOString().slice(0, 10),
        season: SEASON,
        tipo: 'team_tackle_kings',
        titulo: 'Guerreros',
        descripcion: `El equipo ${leader.name} realiza ${avgStr} entradas (tackles) por encuentro.`,
        payload: { category: 'estadisticas', nickname: leader.name, value: parseFloat(avgStr), badge: `img/${(leader.name || '').toLowerCase()}.png` }
    });
}
