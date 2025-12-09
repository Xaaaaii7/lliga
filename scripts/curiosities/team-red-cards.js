export async function run(supabase) {
    const SEASON = process.env.SEASON || '2025-26';
    console.log(`Starting Daily Curiosity: Red Cards (Season: ${SEASON})`);

    const { data: stats, error } = await supabase
        .from('match_team_stats')
        .select(`
      red_cards,
      league_team_id,
      team:league_teams (nickname, display_name),
      match:matches!inner (season)
    `)
        .eq('match.season', SEASON)
        .gt('red_cards', 0); // Optimization

    if (error) throw new Error(error.message);
    if (!stats?.length) { console.log('No red cards.'); return; }

    const map = new Map();
    stats.forEach(r => {
        const id = r.league_team_id;
        if (!map.has(id)) map.set(id, { count: 0, name: r.team.nickname || r.team.display_name });
        map.get(id).count += r.red_cards;
    });

    let max = -1;
    let leader = null;
    for (const t of map.values()) {
        if (t.count > max) { max = t.count; leader = t; }
    }

    if (!leader) return;

    console.log(`Leader: ${leader.name} with ${leader.count} red cards`);

    await supabase.from('daily_curiosities').insert({
        fecha: new Date().toISOString().slice(0, 10),
        season: SEASON,
        tipo: 'team_red_cards',
        titulo: 'Juego duro',
        descripcion: `El equipo ${leader.name} lidera el ranking de expulsiones con ${leader.count} tarjetas rojas.`,
        payload: {
            category: 'estadisticas',
            nickname: leader.name,
            value: leader.count,
            badge: `img/${(leader.name || 'default').toLowerCase()}.png`
        }
    });
}
