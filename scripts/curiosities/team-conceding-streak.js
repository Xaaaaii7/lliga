export async function run(supabase) {
    const SEASON = process.env.SEASON || '2025-26';
    console.log(`Starting: Conceding Streak (Season: ${SEASON})`);

    const { data: matches } = await supabase
        .from('matches')
        .select('home_league_team_id, away_league_team_id, home_goals, away_goals, match_date')
        .eq('season', SEASON)
        .order('match_date', { ascending: true });

    if (!matches?.length) return;

    const teamStreaks = new Map();
    const update = (id, conceded) => {
        if (!teamStreaks.has(id)) teamStreaks.set(id, { current: 0, max: 0 });
        const s = teamStreaks.get(id);
        if (conceded) {
            s.current++;
            if (s.current > s.max) s.max = s.current;
        } else {
            s.current = 0;
        }
    };

    matches.forEach(m => {
        if (m.home_goals === null) return;
        update(m.home_league_team_id, m.away_goals > 0);
        update(m.away_league_team_id, m.home_goals > 0);
    });

    let bestMax = -1;
    let leaderId = null;
    teamStreaks.forEach((val, key) => { if (val.max > bestMax) { bestMax = val.max; leaderId = key; } });

    if (!leaderId || bestMax < 3) return;

    const { data: t } = await supabase.from('league_teams').select('nickname').eq('id', leaderId).single();
    const name = t?.nickname || 'Unknown';

    await supabase.from('daily_curiosities').insert({
        fecha: new Date().toISOString().slice(0, 10),
        season: SEASON,
        tipo: 'team_conceding_streak',
        titulo: 'Defensa frágil',
        descripcion: `El equipo ${name} lleva ${bestMax} partidos seguidos encajando gol.`,
        payload: { category: 'estadisticas', nickname: name, value: bestMax, badge: `img/${name.toLowerCase()}.png` }
    });
}
