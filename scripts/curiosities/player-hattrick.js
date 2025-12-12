export async function run(supabase, competitionId = null) {
    const SEASON = process.env.SEASON || '2025-26';
    console.log(`Starting Daily Curiosity: Player Hattrick (Season: ${SEASON}${competitionId ? `, Competition: ${competitionId}` : ''})`);

    // 1. Fetch matches from season or competition
    let matchesQuery = supabase
        .from('matches')
        .select('id');

    if (competitionId !== null) {
        matchesQuery = matchesQuery.eq('competition_id', competitionId);
    } else {
        matchesQuery = matchesQuery.eq('season', SEASON);
    }

    const { data: matches, error: mErr } = await matchesQuery;

    if (mErr) throw new Error(mErr.message);
    if (!matches?.length) return;

    const matchIds = matches.map(m => m.id);

    // 2. Fetch goals from these matches
    const { data: goals, error: gErr } = await supabase
        .from('goal_events')
        .select(`
      match_id,
      player_id,
      player:players (name),
      team:league_teams (nickname, display_name),
      match:matches (jornada)
    `)
        .in('match_id', matchIds)
        .eq('event_type', 'goal');

    if (gErr) throw new Error(gErr.message);
    if (!goals?.length) return;

    // 3. Group by match+player
    const agg = new Map(); // "matchId_playerId" -> count
    let maxGoals = 0;
    let bestKeys = [];

    goals.forEach(g => {
        if (!g.player_id) return;
        const key = `${g.match_id}_${g.player_id}`;
        const curr = (agg.get(key) || 0) + 1;
        agg.set(key, curr);

        if (curr > maxGoals) {
            maxGoals = curr;
            bestKeys = [key];
        } else if (curr === maxGoals) {
            bestKeys.push(key);
        }
    });

    if (maxGoals === 0) return;

    // 4. Pick random winner if tie
    const pickedKey = bestKeys[Math.floor(Math.random() * bestKeys.length)];
    const [mId, pId] = pickedKey.split('_');

    // Find info
    const exampleGoal = goals.find(g => g.match_id == mId && g.player_id == pId);
    const pName = exampleGoal.player.name;
    const tName = exampleGoal.team ? (exampleGoal.team.nickname || exampleGoal.team.display_name) : 'Su equipo';
    const jornada = exampleGoal.match.jornada;

    // 5. Message
    let title = '';
    let desc = '';

    if (maxGoals >= 3) {
        title = 'Hat-trick heroico';
        desc = `${pName} (${tName}) anotó ${maxGoals} goles en un solo partido esta temporada (Jornada ${jornada}).`;
    } else {
        title = 'Día inspirado';
        desc = `${pName} (${tName}) destacó con ${maxGoals} goles en la Jornada ${jornada}.`;
    }

    console.log(`Winner: ${pName} with ${maxGoals} goals`);

    const entry = {
        fecha: new Date().toISOString().slice(0, 10),
        season: SEASON,
        tipo: 'player_hattrick',
        titulo: title,
        descripcion: desc,
        payload: {
            category: 'jugadores',
            playerName: pName,
            teamName: tName,
            goals: maxGoals,
            jornada: jornada,
            badge: `img/jugadores/${(pName.toLowerCase().replace(/\s+/g, '-'))}.jpg`
        }
    };

    // Añadir competition_id si está disponible
    if (competitionId !== null) {
        entry.competition_id = competitionId;
    }

    await supabase.from('daily_curiosities').insert(entry);
}
