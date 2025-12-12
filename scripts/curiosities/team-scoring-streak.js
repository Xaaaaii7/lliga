export async function run(supabase, competitionId = null) {
    const SEASON = process.env.SEASON || '2025-26';
    console.log(`Starting: Scoring Streak (Season: ${SEASON}${competitionId ? `, Competition: ${competitionId}` : ''})`);

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
    const update = (id, scored) => {
        if (!teamStreaks.has(id)) teamStreaks.set(id, { current: 0, max: 0 });
        const s = teamStreaks.get(id);
        if (scored) {
            s.current++;
            if (s.current > s.max) s.max = s.current;
        } else {
            s.current = 0;
        }
    };

    matches.forEach(m => {
        if (m.home_goals === null) return;
        update(m.home_league_team_id, m.home_goals > 0);
        update(m.away_league_team_id, m.away_goals > 0);
    });

    let bestMax = -1;
    let leaderId = null;
    teamStreaks.forEach((val, key) => { if (val.max > bestMax) { bestMax = val.max; leaderId = key; } });

    if (!leaderId || bestMax < 3) return;

    const { data: t } = await supabase.from('league_teams').select('nickname').eq('id', leaderId).single();
    const name = t?.nickname || 'Unknown';

    const entry = {
        fecha: new Date().toISOString().slice(0, 10),
        season: SEASON,
        tipo: 'team_scoring_streak',
        titulo: 'Martillo Pilón',
        descripcion: `El equipo ${name} ha marcado gol en ${bestMax} partidos consecutivos.`,
        payload: { category: 'estadisticas', nickname: name, value: bestMax, badge: `img/${name.toLowerCase()}.png` }
    };

    if (competitionId !== null) {
        entry.competition_id = competitionId;
    }

    await supabase.from('daily_curiosities').insert(entry);
}
