export async function run(supabase) {
    const SEASON = process.env.SEASON || '2025-26';
    console.log(`Starting: Unique Scorers (Season: ${SEASON})`);

    // 1. Fetch goal events
    const { data: goals, error } = await supabase
        .from('goal_events')
        .select('league_team_id, player_id, team:league_teams(nickname), event_type')
        .eq('match.season', SEASON)
        .select(`
      league_team_id,
      player_id,
      event_type,
      team:league_teams (nickname),
      match:matches!inner (season)
    `)
        .eq('match.season', SEASON);

    if (error) throw new Error(error.message);
    if (!goals?.length) return;

    const map = new Map(); // teamId -> Set(playerIds)

    goals.forEach(g => {
        if (!g.league_team_id || !g.player_id) return;
        if (g.event_type === 'own_goal') return; // Own goals don't count for "scorers" of the team usually

        if (!map.has(g.league_team_id)) map.set(g.league_team_id, {
            players: new Set(),
            name: g.team?.nickname || 'Unknown'
        });

        map.get(g.league_team_id).players.add(g.player_id);
    });

    let max = -1;
    let leader = null;

    map.forEach((val) => {
        const count = val.players.size;
        if (count > max) {
            max = count;
            leader = { name: val.name, count };
        }
    });

    if (!leader) return;

    await supabase.from('daily_curiosities').insert({
        fecha: new Date().toISOString().slice(0, 10),
        season: SEASON,
        tipo: 'team_unique_scorers',
        titulo: 'Goles muy repartidos',
        descripcion: `El equipo ${leader.name} es el más coral: ha tenido ${leader.count} goleadores diferentes.`,
        payload: { category: 'equipos', nickname: leader.name, value: leader.count, badge: `img/${leader.name.toLowerCase()}.png` }
    });
}
