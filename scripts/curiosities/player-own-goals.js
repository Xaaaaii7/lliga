export async function run(supabase) {
    const SEASON = process.env.SEASON || '2025-26';
    console.log(`Starting: Own Goals (Season: ${SEASON})`);

    const { data: goals } = await supabase
        .from('goal_events')
        .select(`
      player:players (name),
      team:league_teams (nickname),
      match:matches!inner (season)
    `)
        .eq('match.season', SEASON)
        .eq('event_type', 'own_goal');

    // If no own goals, skip or fallback?
    if (!goals?.length) return;

    // Find player with most own goals
    const map = new Map();
    goals.forEach(g => {
        const pName = g.player?.name || 'Unknown';
        if (!map.has(pName)) map.set(pName, { count: 0, team: g.team?.nickname });
        map.get(pName).count++;
    });

    let max = -1;
    let leader = null;
    map.forEach((val, key) => {
        if (val.count > max) { max = val.count; leader = { name: key, ...val }; }
    });

    if (!leader) return;

    await supabase.from('daily_curiosities').insert({
        fecha: new Date().toISOString().slice(0, 10),
        season: SEASON,
        tipo: 'player_own_goals',
        titulo: 'Mala suerte',
        descripcion: `El jugador ${leader.name} (${leader.team}) ha marcado ${leader.count} goles en propia puerta esta temporada.`,
        payload: { category: 'jugadores', playerName: leader.name, value: leader.count, badge: `img/jugadores/${leader.name.toLowerCase().replace(/\s+/g, '-')}.jpg` }
    });
}
