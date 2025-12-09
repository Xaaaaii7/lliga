export async function run(supabase) {
    const SEASON = process.env.SEASON || '2025-26';
    console.log(`Starting: Multi Team Scorer (Season: ${SEASON})`);

    // Who scored against the most unique opponents?
    const { data: goals } = await supabase
        .from('goal_events')
        .select(`
      player_id, 
      league_team_id,
      player:players(name),
      match:matches!inner (id, season, home_league_team_id, away_league_team_id)
    `)
        .eq('match.season', SEASON)
        .neq('event_type', 'own_goal');

    if (!goals?.length) return;

    const playerVictims = new Map(); // playerId -> Set(victimIds)
    const playerInfo = new Map();

    goals.forEach(g => {
        if (!g.player_id) return;

        // Determine victim
        let victimId = null;
        if (g.league_team_id === g.match.home_league_team_id) victimId = g.match.away_league_team_id;
        else victimId = g.match.home_league_team_id;

        if (!victimId) return;

        if (!playerVictims.has(g.player_id)) {
            playerVictims.set(g.player_id, new Set());
            playerInfo.set(g.player_id, g.player?.name || 'Unknown');
        }
        playerVictims.get(g.player_id).add(victimId);
    });

    let maxUnique = -1;
    let leaderId = null;

    playerVictims.forEach((set, id) => {
        if (set.size > maxUnique) { maxUnique = set.size; leaderId = id; }
    });

    if (!leaderId) return;

    const pName = playerInfo.get(leaderId);

    await supabase.from('daily_curiosities').insert({
        fecha: new Date().toISOString().slice(0, 10),
        season: SEASON,
        tipo: 'player_multi_team_scorer',
        titulo: 'Mercenario del gol',
        descripcion: `${pName} no hace distinciones: ha marcado gol a ${maxUnique} equipos diferentes esta temporada.`,
        payload: { category: 'jugadores', playerName: pName, value: maxUnique, badge: `img/jugadores/${pName.toLowerCase().replace(/\s+/g, '-')}.jpg` }
    });
}
