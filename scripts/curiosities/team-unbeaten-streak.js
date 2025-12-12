export async function run(supabase, competitionId = null) {
    const SEASON = process.env.SEASON || '2025-26';
    console.log(`Starting: Unbeaten Streak (Season: ${SEASON}${competitionId ? `, Competition: ${competitionId}` : ''})`);

    let matchesQuery = supabase
        .from('matches')
        .select('home_league_team_id, away_league_team_id, home_goals, away_goals, match_date')
        .order('match_date', { ascending: true });

    if (competitionId !== null) {
        matchesQuery = matchesQuery.eq('competition_id', competitionId);
    } else {
        matchesQuery = matchesQuery.eq('season', SEASON);
    }

    const { data: matches } = await matchesQuery;

    if (!matches?.length) return;

    const teamStreaks = new Map();

    const update = (id, lost) => {
        if (!teamStreaks.has(id)) teamStreaks.set(id, { current: 0, max: 0 });
        const s = teamStreaks.get(id);
        if (!lost) {
            s.current++;
            if (s.current > s.max) s.max = s.current;
        } else {
            s.current = 0;
        }
    };

    matches.forEach(m => {
        if (m.home_goals === null) return;
        const h = m.home_league_team_id;
        const a = m.away_league_team_id;
        // Lost if scored less
        update(h, m.home_goals < m.away_goals);
        update(a, m.away_goals < m.home_goals);
    });

    let bestMax = -1;
    let leaderId = null;
    teamStreaks.forEach((val, key) => {
        if (val.max > bestMax) { bestMax = val.max; leaderId = key; }
    });

    if (!leaderId || bestMax < 3) return; // Min streak 3

    const { data: t } = await supabase.from('league_teams').select('nickname').eq('id', leaderId).single();
    const name = t?.nickname || 'Unknown';

    const entry = {
        fecha: new Date().toISOString().slice(0, 10),
        season: SEASON,
        tipo: 'team_unbeaten_streak',
        titulo: 'Invencibles',
        descripcion: `El equipo ${name} estuvo ${bestMax} partidos seguidos sin conocer la derrota.`,
        payload: { category: 'equipos', nickname: name, value: bestMax, badge: `img/${name.toLowerCase()}.png` }
    };

    if (competitionId !== null) {
        entry.competition_id = competitionId;
    }

    await supabase.from('daily_curiosities').insert(entry);
}
