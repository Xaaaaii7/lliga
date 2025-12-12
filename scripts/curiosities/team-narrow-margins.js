export async function run(supabase, competitionId = null) {
    const SEASON = process.env.SEASON || '2025-26';
    console.log(`Starting: Narrow Margins (Season: ${SEASON}${competitionId ? `, Competition: ${competitionId}` : ''})`);

    let matchesQuery = supabase
        .from('matches')
        .select('home_league_team_id, away_league_team_id, home_goals, away_goals')
        .not('home_goals', 'is', null);

    if (competitionId !== null) {
        matchesQuery = matchesQuery.eq('competition_id', competitionId);
    } else {
        matchesQuery = matchesQuery.eq('season', SEASON);
    }

    const { data: matches } = await matchesQuery;

    if (!matches?.length) return;

    const map = new Map(); // id -> count
    const add = (id) => map.set(id, (map.get(id) || 0) + 1);

    matches.forEach(m => {
        const diff = Math.abs(m.home_goals - m.away_goals);
        if (diff === 1) {
            add(m.home_league_team_id);
            add(m.away_league_team_id);
        }
    });

    let max = -1;
    let leaderId = null;
    map.forEach((count, id) => { if (count > max) { max = count; leaderId = id; } });

    if (!leaderId) return;

    const { data: t } = await supabase.from('league_teams').select('nickname').eq('id', leaderId).single();
    const name = t?.nickname || 'Unknown';

    const entry = {
        fecha: new Date().toISOString().slice(0, 10),
        season: SEASON,
        tipo: 'team_narrow_margins',
        titulo: 'Al borde del infarto',
        descripcion: `El ${name} es el rey del suspense: ${max} de sus partidos se han decidido por un solo gol.`,
        payload: { category: 'estadisticas', nickname: name, value: max, badge: `img/${name.toLowerCase()}.png` }
    };

    if (competitionId !== null) {
        entry.competition_id = competitionId;
    }

    await supabase.from('daily_curiosities').insert(entry);
}
