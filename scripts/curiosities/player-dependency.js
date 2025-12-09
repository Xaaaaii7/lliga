export async function run(supabase) {
    const SEASON = process.env.SEASON || '2025-26';
    console.log(`Starting: Player Dependency (Season: ${SEASON})`);

    // 1. Fetch all goals (excluding OGs usually, as they aren't "scored by the team" in the same way, but debatable. 
    // Dependency usually means: Player Goals / Team Goals.
    // We'll count ALL goals for team total, and Player goals (non-OG) for player.
    const { data: goals } = await supabase
        .from('goal_events')
        .select(`
      league_team_id,
      player_id,
      event_type,
      player:players(name),
      team:league_teams(nickname),
      match:matches!inner (season)
    `)
        .eq('match.season', SEASON);

    if (!goals?.length) return;

    const teamTotals = new Map(); // teamId -> count
    const playerGoals = new Map(); // playerId -> { count, teamId, name, teamName }

    goals.forEach(g => {
        if (!g.league_team_id) return;

        // Total team goals (including penalties, maybe excluding OGs if they are credited to opponent? 
        // In our schema events usually linked to the team benefiting. 
        // Let's assume all events in goal_events with league_team_id X are goals FOR X.)
        const currentT = teamTotals.get(g.league_team_id) || 0;
        teamTotals.set(g.league_team_id, currentT + 1);

        if (g.event_type !== 'own_goal' && g.player_id) {
            if (!playerGoals.has(g.player_id)) {
                playerGoals.set(g.player_id, {
                    count: 0,
                    teamId: g.league_team_id,
                    name: g.player?.name || 'Unknown',
                    teamName: g.team?.nickname || 'Team'
                });
            }
            playerGoals.get(g.player_id).count++;
        }
    });

    let maxPct = -1;
    let leader = null;

    playerGoals.forEach(p => {
        const totalTeam = teamTotals.get(p.teamId) || 0;
        if (totalTeam > 5) { // Min sample
            const pct = p.count / totalTeam;
            if (pct > maxPct) {
                maxPct = pct;
                leader = { ...p, totalTeam };
            }
        }
    });

    if (!leader) return;
    const pctStr = (maxPct * 100).toFixed(1) + '%';

    await supabase.from('daily_curiosities').insert({
        fecha: new Date().toISOString().slice(0, 10),
        season: SEASON,
        tipo: 'player_dependency',
        titulo: 'Dependencia total',
        descripcion: `${leader.name} ha marcado el ${pctStr} de los goles de su equipo (${leader.count} de ${leader.totalTeam}).`,
        payload: { category: 'jugadores', playerName: leader.name, value: maxPct, badge: `img/jugadores/${leader.name.toLowerCase().replace(/\s+/g, '-')}.jpg` }
    });
}
