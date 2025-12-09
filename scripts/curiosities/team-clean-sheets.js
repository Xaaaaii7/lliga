export async function run(supabase) {
    const SEASON = process.env.SEASON || '2025-26';
    console.log(`Starting Daily Curiosity: Clean Sheets (Season: ${SEASON})`);

    // matches where goals_against == 0
    // Easier: fetch all matches, iterate
    const { data: matches, error } = await supabase
        .from('matches')
        .select(`
      local_team_id,
      visitor_team_id,
      goles_local,
      goles_visitante,
      home:league_teams!matches_home_league_team_id_fkey (nickname, display_name),
      away:league_teams!matches_away_league_team_id_fkey (nickname, display_name)
    `)
        .eq('season', SEASON)
        .not('goles_local', 'is', null)
        .not('goles_visitante', 'is', null);

    if (error) throw new Error(error.message);
    if (!matches?.length) return;

    const map = new Map(); // id -> count

    const add = (id, name) => {
        if (!map.has(id)) map.set(id, { count: 0, name });
        map.get(id).count++;
    };

    matches.forEach(m => {
        // Local clean sheet if visitor goals == 0
        if (m.goles_visitante === 0) {
            add(m.local_team_id, m.home.nickname || m.home.display_name);
        }
        // Visitor clean sheet if local goals == 0
        if (m.goles_local === 0) {
            add(m.visitor_team_id, m.away.nickname || m.away.display_name);
        }
    });

    let max = -1;
    let leader = null;
    for (const t of map.values()) {
        if (t.count > max) { max = t.count; leader = t; }
    }

    if (!leader) return;

    console.log(`Leader: ${leader.name} with ${leader.count} clean sheets`);

    await supabase.from('daily_curiosities').insert({
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
    });
}
