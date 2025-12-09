export async function run(supabase) {
    const SEASON = process.env.SEASON || '2025-26';
    console.log(`Starting Daily Curiosity: Most Scoring Team (Season: ${SEASON})`);

    // 1. Fetch matches with correct columns
    const { data: matches, error: matchesError } = await supabase
        .from('matches')
        .select(`
    id,
    home_league_team_id,
    away_league_team_id,
    home_goals,
    away_goals,
    status,
    season
  `)
        .eq('season', SEASON)
        .not('home_goals', 'is', null)
        .not('away_goals', 'is', null);

    if (matchesError) throw new Error(`Error fetching matches: ${matchesError.message}`);
    if (!matches || !matches.length) {
        console.log('No finished matches for this season.');
        return;
    }

    // 2. Fetch team info
    const { data: teams, error: teamsError } = await supabase
        .from('league_teams')
        .select('id, nickname, display_name');

    if (teamsError) throw new Error(`Error fetching teams: ${teamsError.message}`);
    const teamMap = new Map();
    teams.forEach(t => teamMap.set(t.id, t));

    // 3. Aggregate goals
    const stats = new Map();

    for (const m of matches) {
        const localId = m.home_league_team_id;
        const visitorId = m.away_league_team_id;
        const gLocal = m.home_goals;
        const gVisitante = m.away_goals;

        if (!stats.has(localId)) stats.set(localId, { goals: 0, matches: 0 });
        if (!stats.has(visitorId)) stats.set(visitorId, { goals: 0, matches: 0 });

        stats.get(localId).goals += gLocal;
        stats.get(localId).matches += 1;

        stats.get(visitorId).goals += gVisitante;
        stats.get(visitorId).matches += 1;
    }

    // 4. Find max scorer
    let maxGoals = -1;
    let leaderId = null;

    stats.forEach((val, key) => {
        if (val.goals > maxGoals) {
            maxGoals = val.goals;
            leaderId = key;
        }
    });

    if (!leaderId) {
        console.log('No goals stats.');
        return;
    }

    const leaderStats = stats.get(leaderId);
    const leaderTeam = teamMap.get(leaderId);
    const teamName = leaderTeam ? (leaderTeam.nickname || leaderTeam.display_name) : 'Unknown';

    console.log(`Leader: ${teamName} with ${leaderStats.goals} goals.`);

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

    if (insertError) throw new Error(`Error inserting: ${insertError.message}`);
    console.log('Inserted:', entry);
}
