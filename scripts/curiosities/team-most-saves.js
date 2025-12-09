export async function run(supabase) {
    const SEASON = process.env.SEASON || '2025-26';
    console.log(`Starting Daily Curiosity: Team Most Saves (Season: ${SEASON})`);

    const { data: stats, error } = await supabase
        .from('match_team_stats')
        .select(`
      saves,
      league_team_id,
      team:league_teams (nickname, display_name),
      match:matches!inner (season)
    `)
        .eq('match.season', SEASON)
        .not('saves', 'is', null);

    if (error) throw new Error(error.message);
    if (!stats?.length) { console.log('No stats'); return; }

    const map = new Map();
    stats.forEach(r => {
        if (!r.team) return;
        const id = r.league_team_id;
        if (!map.has(id)) map.set(id, { saves: 0, matches: 0, name: r.team.nickname || r.team.display_name });
        const e = map.get(id);
        e.saves += (r.saves || 0);
        e.matches++;
    });

    let maxAvg = -1;
    let leader = null;
    for (const t of map.values()) {
        if (t.matches > 0) {
            const avg = t.saves / t.matches;
            if (avg > maxAvg) { maxAvg = avg; leader = t; }
        }
    }

    if (!leader) return;

    const avgFixed = maxAvg.toFixed(2);
    console.log(`Leader: ${leader.name} with ${avgFixed} saves/match`);

    await supabase.from('daily_curiosities').insert({
        fecha: new Date().toISOString().slice(0, 10),
        season: SEASON,
        tipo: 'team_most_saves',
        titulo: 'El muro de la liga',
        descripcion: `El equipo ${leader.name} realiza ${avgFixed} paradas por partido de media.`,
        payload: {
            category: 'equipos',
            nickname: leader.name,
            value: parseFloat(avgFixed),
            total: leader.saves,
            badge: `img/${(leader.name || 'default').toLowerCase()}.png`
        }
    });
}
