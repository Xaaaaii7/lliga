export async function run(supabase, competitionId = null) {
    const SEASON = process.env.SEASON || '2025-26';
    console.log(`Starting: Own Goals (Season: ${SEASON}${competitionId ? `, Competition: ${competitionId}` : ''})`);

    let goalsQuery = supabase
        .from('goal_events')
        .select(`
      player:players (name),
      team:league_teams (nickname),
      match:matches!inner (season, competition_id)
    `)
        .eq('event_type', 'own_goal');

    if (competitionId !== null) {
        goalsQuery = goalsQuery.eq('match.competition_id', competitionId);
    } else {
        goalsQuery = goalsQuery.eq('match.season', SEASON);
    }

    const { data: goals } = await goalsQuery;

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

    const entry = {
        fecha: new Date().toISOString().slice(0, 10),
        season: SEASON,
        tipo: 'player_own_goals',
        titulo: 'Mala suerte',
        descripcion: `El jugador ${leader.name} (${leader.team}) ha marcado ${leader.count} goles en propia puerta esta temporada.`,
        payload: { category: 'jugadores', playerName: leader.name, value: leader.count, badge: `img/jugadores/${leader.name.toLowerCase().replace(/\s+/g, '-')}.jpg` }
    };

    if (competitionId !== null) {
        entry.competition_id = competitionId;
    }

    await supabase.from('daily_curiosities').insert(entry);
}
