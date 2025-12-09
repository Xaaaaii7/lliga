export async function run(supabase) {
    const SEASON = process.env.SEASON || '2025-26';
    console.log(`Starting Daily Curiosity: Least Conceded Team (Season: ${SEASON})`);

    // 1. Fetch matches with correct columns
    const { data: matches, error: matchesError } = await supabase
        .from('matches')
        .select(`
    id,
    home_league_team_id,
    away_league_team_id,
    home_goals,
    away_goals
  `)
        .eq('season', SEASON)
        .not('home_goals', 'is', null)
        .not('away_goals', 'is', null);

    if (matchesError) throw new Error(`Error fetching matches: ${matchesError.message}`);
    if (!matches || !matches.length) {
        console.log('No finished matches.');
        return;
    }

    // 2. Fetch teams
    const { data: teams, error: teamsError } = await supabase
        .from('league_teams')
        .select('id, nickname, display_name');

    if (teamsError) throw new Error(`Error fetching teams: ${teamsError.message}`);
    const teamMap = new Map();
    teams.forEach(t => teamMap.set(t.id, t));

    // 3. Aggregate conceded
    const stats = new Map();

    for (const m of matches) {
        const localId = m.home_league_team_id;
        const visitorId = m.away_league_team_id;
        const gLocal = m.home_goals;
        const gVisitante = m.away_goals;

        if (!stats.has(localId)) stats.set(localId, { conceded: 0, matches: 0 });
        if (!stats.has(visitorId)) stats.set(visitorId, { conceded: 0, matches: 0 });

        stats.get(localId).conceded += gVisitante;
        stats.get(localId).matches += 1;

        stats.get(visitorId).conceded += gLocal;
        stats.get(visitorId).matches += 1;
    }

    // 4. Find best ratio
    let bestRatio = Infinity;
    let leaderId = null;

    stats.forEach((val, key) => {
        if (val.matches > 0) {
            const ratio = val.conceded / val.matches;
            if (ratio < bestRatio) {
                bestRatio = ratio;
                leaderId = key;
            }
        }
    });

    if (!leaderId) {
        console.log('No valid stats.');
        return;
    }

    const leaderStats = stats.get(leaderId);
    const leaderTeam = teamMap.get(leaderId);
    const teamName = leaderTeam ? (leaderTeam.nickname || leaderTeam.display_name) : 'Unknown';

    const ratioFixed = bestRatio.toFixed(2);
    console.log(`Leader: ${teamName} with ${ratioFixed} conceded/match.`);

    const title = `Equipo menos goleado`;
    const description = `El equipo ${teamName} es el menos goleado con un promedio de ${ratioFixed} goles recibidos por partido.`;

    const payload = {
        category: 'equipos',
        nickname: teamName,
        teamId: leaderId,
        conceded: leaderStats.conceded,
        matches: leaderStats.matches,
        ratio: parseFloat(ratioFixed),
        badge: leaderTeam ? `img/${(leaderTeam.nickname || 'default').toLowerCase()}.png` : ''
    };

    const today = new Date().toISOString().slice(0, 10);
    const entry = {
        fecha: today,
        season: SEASON,
        tipo: 'team_least_conceded',
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
