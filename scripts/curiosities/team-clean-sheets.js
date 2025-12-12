export async function run(supabase, competitionId = null) {
    const SEASON = process.env.SEASON || '2025-26';
    console.log(`Starting Daily Curiosity: Clean Sheets (Season: ${SEASON}${competitionId ? `, Competition: ${competitionId}` : ''})`);

    // Fixed: goles_local -> home_goals, etc.
    let matchesQuery = supabase
        .from('matches')
        .select(`
      home_league_team_id,
      away_league_team_id,
      home_goals,
      away_goals,
      home:league_teams!matches_home_league_team_id_fkey (nickname, display_name),
      away:league_teams!matches_away_league_team_id_fkey (nickname, display_name)
    `)
        .not('home_goals', 'is', null)
        .not('away_goals', 'is', null);

    if (competitionId !== null) {
        matchesQuery = matchesQuery.eq('competition_id', competitionId);
    } else {
        matchesQuery = matchesQuery.eq('season', SEASON);
    }

    const { data: matches, error } = await matchesQuery;

    if (error) throw new Error(error.message);
    if (!matches?.length) return;

    const map = new Map();

    const add = (id, name) => {
        if (!map.has(id)) map.set(id, { count: 0, name });
        map.get(id).count++;
    };

    matches.forEach(m => {
        // Local clean sheet if visitor goals == 0
        if (m.away_goals === 0) {
            add(m.home_league_team_id, m.home.nickname || m.home.display_name);
        }
        // Visitor clean sheet if local goals == 0
        if (m.home_goals === 0) {
            add(m.away_league_team_id, m.away.nickname || m.away.display_name);
        }
    });

    let max = -1;
    let leader = null;
    for (const t of map.values()) {
        if (t.count > max) { max = t.count; leader = t; }
    }

    if (!leader) return;

    console.log(`Leader: ${leader.name} with ${leader.count} clean sheets`);

    const entry = {
        fecha: new Date().toISOString().slice(0, 10),
        season: SEASON,
        tipo: 'team_clean_sheets',
        titulo: 'Portería a cero',
        descripcion: `El equipo ${leader.name} ha mantenido su portería imbatida en ${leader.count} partidos.`,
        payload: {
            category: 'equipos',
            nickname: leader.name,
            value: leader.count,
            badge: `img/${(leader.name || 'default').toLowerCase()}.png`
        }
    };

    if (competitionId !== null) {
        entry.competition_id = competitionId;
    }

    await supabase.from('daily_curiosities').insert(entry);
}
