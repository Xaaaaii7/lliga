
// function to run the logic
export async function run(supabase) {
    const SEASON = process.env.SEASON || '2025-26';
    console.log(`Starting Daily Curiosity: Most Scoring Team (Season: ${SEASON})`);

    // 1. Fetch all finished matches for the season
    // We assume "finished" means goals are not null.
    // We select only necessary fields.
    const { data: matches, error: matchesError } = await supabase
        .from('matches')
        .select(`
      id,
      local_team_id,
      visitor_team_id,
      goles_local,
      goles_visitante,
      status,
      season
    `)
        .eq('season', SEASON)
        .not('goles_local', 'is', null)
        .not('goles_visitante', 'is', null);

    if (matchesError) {
        throw new Error(`Error fetching matches: ${matchesError.message}`);
    }

    if (!matches || matches.length === 0) {
        console.log('No finished matches found for this season.');
        return;
    }

    console.log(`Found ${matches.length} matches.`);

    // 2. Fetch team info (map id -> nickname)
    const { data: teams, error: teamsError } = await supabase
        .from('league_teams')
        .select('id, nickname, display_name');

    if (teamsError) {
        throw new Error(`Error fetching teams: ${teamsError.message}`);
    }

    const teamMap = new Map();
    teams.forEach(t => {
        teamMap.set(t.id, t);
    });

    // 3. Aggregate goals
    const stats = new Map();
    // Map<teamId, { goals: number, matches: number }>

    for (const m of matches) {
        const localId = m.local_team_id;
        const visitorId = m.visitor_team_id;
        const gLocal = m.goles_local;
        const gVisitante = m.goles_visitante;

        // Init if needed
        if (!stats.has(localId)) stats.set(localId, { goals: 0, matches: 0 });
        if (!stats.has(visitorId)) stats.set(visitorId, { goals: 0, matches: 0 });

        const localStat = stats.get(localId);
        localStat.goals += gLocal;
        localStat.matches += 1;

        const visitorStat = stats.get(visitorId);
        visitorStat.goals += gVisitante;
        visitorStat.matches += 1;
    }

    // 4. Find the max scorer
    let maxGoals = -1;
    let leaderId = null;

    stats.forEach((val, key) => {
        if (val.goals > maxGoals) {
            maxGoals = val.goals;
            leaderId = key;
        }
    });

    if (!leaderId) {
        console.log('No goals stats to process.');
        return;
    }

    const leaderStats = stats.get(leaderId);
    const leaderTeam = teamMap.get(leaderId);
    const teamName = leaderTeam ? (leaderTeam.nickname || leaderTeam.display_name) : 'Unknown';

    console.log(`Leader: ${teamName} with ${leaderStats.goals} goals in ${leaderStats.matches} matches.`);

    // 5. Build payload and text
    const title = `Equipo más goleador`;
    const description = `El equipo ${teamName} es el equipo más goleador de la liga con ${leaderStats.goals} goles en ${leaderStats.matches} partidos.`;

    const payload = {
        category: 'equipos',
        nickname: teamName,
        teamId: leaderId,
        goals: leaderStats.goals,
        matches: leaderStats.matches,
        badge: leaderTeam ? `img/${(leaderTeam.nickname || 'default').toLowerCase()}.png` : ''
    };

    // 6. Insert into daily_curiosities
    const today = new Date().toISOString().slice(0, 10);

    const entry = {
        fecha: today,
        season: SEASON,
        tipo: 'team_most_goals',
        titulo: title,
        descripcion: description,
        payload: payload
    };

    const { error: insertError } = await supabase
        .from('daily_curiosities')
        .insert(entry);

    if (insertError) {
        throw new Error(`Error inserting curiosity: ${insertError.message}`);
    }

    console.log('Successfully inserted daily curiosity:', entry);
}
