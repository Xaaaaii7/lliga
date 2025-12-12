export async function run(supabase, competitionId = null) {
    const SEASON = process.env.SEASON || '2025-26';
    console.log(`Starting Daily Curiosity: Biggest Win (Season: ${SEASON}${competitionId ? `, Competition: ${competitionId}` : ''})`);

    // 1. Fetch matches
    let matchesQuery = supabase
        .from('matches')
        .select(`
    id,
    home_league_team_id,
    away_league_team_id,
    home_goals,
    away_goals,
    round_id
  `)
        .not('home_goals', 'is', null)
        .not('away_goals', 'is', null);

    if (competitionId !== null) {
        matchesQuery = matchesQuery.eq('competition_id', competitionId);
    } else {
        matchesQuery = matchesQuery.eq('season', SEASON);
    }

    const { data: matches, error: matchesError } = await matchesQuery;
    // NOTE: 'round_id' seems to be the column name instead of 'jornada' in schema provided earlier.
    // But let's check matches columns again if needed. The schema dump said 'round_id'.

    if (matchesError) throw new Error(`Error fetching matches: ${matchesError.message}`);
    if (!matches || !matches.length) {
        console.log('No matches.');
        return;
    }

    // 2. Fetch teams
    const { data: teams } = await supabase
        .from('league_teams')
        .select('id, nickname, display_name');

    const teamMap = new Map();
    (teams || []).forEach(t => teamMap.set(t.id, t));

    // 3. Find biggest diff
    let maxDiff = -1;
    let bestMatch = null;

    for (const m of matches) {
        const diff = Math.abs(m.home_goals - m.away_goals);
        if (diff > maxDiff) {
            maxDiff = diff;
            bestMatch = m;
        }
    }

    if (!bestMatch) {
        console.log('No valid match found.');
        return;
    }

    const localTeam = teamMap.get(bestMatch.home_league_team_id);
    const visitorTeam = teamMap.get(bestMatch.away_league_team_id);

    const localName = localTeam ? (localTeam.nickname || localTeam.display_name) : 'Local';
    const visitorName = visitorTeam ? (visitorTeam.nickname || visitorTeam.display_name) : 'Visitor';

    console.log(`Biggest win: ${localName} ${bestMatch.home_goals} - ${bestMatch.away_goals} ${visitorName} (Diff: ${maxDiff})`);

    const title = `Mayor Goleada`;
    // Use round_id as Jornada
    const description = `La mayor goleada de la temporada: ${localName} ${bestMatch.home_goals} - ${bestMatch.away_goals} ${visitorName} en la jornada ${bestMatch.round_id}.`;

    const payload = {
        category: 'partidos',
        matchId: bestMatch.id,
        localId: bestMatch.home_league_team_id,
        visitorId: bestMatch.away_league_team_id,
        localName,
        visitorName,
        localGoals: bestMatch.home_goals,
        visitorGoals: bestMatch.away_goals,
        diff: maxDiff,
        badge: localTeam ? `img/${(localTeam.nickname || 'default').toLowerCase()}.png` : ''
    };

    if (bestMatch.away_goals > bestMatch.home_goals) {
        payload.badge = visitorTeam ? `img/${(visitorTeam.nickname || 'default').toLowerCase()}.png` : '';
    }

    const today = new Date().toISOString().slice(0, 10);
    const entry = {
        fecha: today,
        season: SEASON,
        tipo: 'match_biggest_win',
        titulo: title,
        descripcion: description,
        payload: payload
    };

    if (competitionId !== null) {
        entry.competition_id = competitionId;
    }

    const { error: insertError } = await supabase
        .from('daily_curiosities')
        .insert(entry);

    if (insertError) throw new Error(`Error inserting: ${insertError.message}`);
    console.log('Inserted:', entry);
}
