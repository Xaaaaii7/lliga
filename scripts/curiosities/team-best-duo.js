export async function run(supabase) {
    const SEASON = process.env.SEASON || '2025-26';
    console.log(`Starting: Best Duo (Season: ${SEASON})`);

    // 1. Fetch goals
    const { data: goals } = await supabase
        .from('goal_events')
        .select(`
      league_team_id,
      player_id,
      player:players (name),
      team:league_teams (nickname),
      match:matches!inner (season)
    `)
        .eq('match.season', SEASON)
        .neq('event_type', 'own_goal'); // Exclude OGs

    if (!goals?.length) return;

    // 2. Aggregate per player
    const playerGoals = new Map(); // playerId -> { goals: 0, teamId, pName, tName }

    goals.forEach(g => {
        if (!g.player_id) return;
        if (!playerGoals.has(g.player_id)) {
            playerGoals.set(g.player_id, {
                goals: 0,
                teamId: g.league_team_id,
                pName: g.player?.name || 'Unknown',
                tName: g.team?.nickname || 'Team'
            });
        }
        playerGoals.get(g.player_id).goals++;
    });

    // 3. Group players by team
    const teamPlayers = new Map(); // teamId -> Array of players
    playerGoals.forEach(p => {
        if (!teamPlayers.has(p.teamId)) teamPlayers.set(p.teamId, []);
        teamPlayers.get(p.teamId).push(p);
    });

    // 4. Find best duo
    let maxDuoGoals = -1;
    let leader = null;

    teamPlayers.forEach((players) => {
        // Sort descending
        players.sort((a, b) => b.goals - a.goals);
        if (players.length >= 2) {
            const duoSum = players[0].goals + players[1].goals;
            if (duoSum > maxDuoGoals) {
                maxDuoGoals = duoSum;
                leader = {
                    tName: players[0].tName,
                    p1: players[0].pName,
                    p2: players[1].pName,
                    g1: players[0].goals,
                    g2: players[1].goals,
                    total: duoSum
                };
            }
        }
    });

    if (!leader) return;

    await supabase.from('daily_curiosities').insert({
        fecha: new Date().toISOString().slice(0, 10),
        season: SEASON,
        tipo: 'team_best_duo',
        titulo: 'Dupla Letal',
        descripcion: `La pareja ${leader.p1} (${leader.g1}) y ${leader.p2} (${leader.g2}) del ${leader.tName} suman ${leader.total} goles juntos.`,
        payload: { category: 'equipos', nickname: leader.tName, value: leader.total, badge: `img/${leader.tName.toLowerCase()}.png` }
    });
}
