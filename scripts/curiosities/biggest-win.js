export async function run(supabase) {
    const SEASON = process.env.SEASON || '2025-26';
    console.log(`Starting Daily Curiosity: Biggest Win (Season: ${SEASON})`);

    // 1. Fetch matches
    const { data: matches, error: matchesError } = await supabase
        .from('matches')
        .select(`
      id,
      local_team_id,
      visitor_team_id,
      goles_local,
      goles_visitante,
      jornada
    `)
        .eq('season', SEASON)
        .not('goles_local', 'is', null)
        .not('goles_visitante', 'is', null);

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
        const diff = Math.abs(m.goles_local - m.goles_visitante);
        if (diff > maxDiff) {
            maxDiff = diff;
            bestMatch = m;
        }
    }

    if (!bestMatch) {
        console.log('No valid match found.');
        return;
    }

    const localTeam = teamMap.get(bestMatch.local_team_id);
    const visitorTeam = teamMap.get(bestMatch.visitor_team_id);

    const localName = localTeam ? (localTeam.nickname || localTeam.display_name) : 'Local';
    const visitorName = visitorTeam ? (visitorTeam.nickname || visitorTeam.display_name) : 'Visitor';

    console.log(`Biggest win: ${localName} ${bestMatch.goles_local} - ${bestMatch.goles_visitante} ${visitorName} (Diff: ${maxDiff})`);

    // 4. Payload
    const title = `Mayor Goleada`;
    const description = `La mayor goleada de la temporada: ${localName} ${bestMatch.goles_local} - ${bestMatch.goles_visitante} ${visitorName} en la jornada ${bestMatch.jornada}.`;

    const payload = {
        category: 'partidos',
        matchId: bestMatch.id,
        localId: bestMatch.local_team_id,
        visitorId: bestMatch.visitor_team_id,
        localName,
        visitorName,
        localGoals: bestMatch.goles_local,
        visitorGoals: bestMatch.goles_visitante,
        diff: maxDiff,
        badge: localTeam ? `img/${(localTeam.nickname || 'default').toLowerCase()}.png` : '' // Use local badge typically? Or maybe winner's badge?
    };

    // If local won, use local badge. If visitor won, use visitor badge.
    if (bestMatch.goles_visitante > bestMatch.goles_local) {
        payload.badge = visitorTeam ? `img/${(visitorTeam.nickname || 'default').toLowerCase()}.png` : '';
    }

    // 5. Insert
    const today = new Date().toISOString().slice(0, 10);
    const entry = {
        fecha: today,
        season: SEASON,
        tipo: 'match_biggest_win',
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
