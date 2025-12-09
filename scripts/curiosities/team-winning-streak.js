export async function run(supabase) {
    const SEASON = process.env.SEASON || '2025-26';
    console.log(`Starting: Winning Streak (Season: ${SEASON})`);

    const { data: matches } = await supabase
        .from('matches')
        .select('home_league_team_id, away_league_team_id, home_goals, away_goals, match_date')
        .eq('season', SEASON)
        .order('match_date', { ascending: true }); // Chronological order

    if (!matches?.length) return;

    const teamStreaks = new Map(); // id -> { current: 0, max: 0 }

    const update = (id, won) => {
        if (!teamStreaks.has(id)) teamStreaks.set(id, { current: 0, max: 0 });
        const s = teamStreaks.get(id);
        if (won) {
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
        update(h, m.home_goals > m.away_goals);
        update(a, m.away_goals > m.home_goals);
    });

    let bestMax = -1;
    let leaderId = null;
    teamStreaks.forEach((val, key) => {
        if (val.max > bestMax) { bestMax = val.max; leaderId = key; }
    });

    if (!leaderId || bestMax < 2) return; // Min streak 2

    const { data: t } = await supabase.from('league_teams').select('nickname').eq('id', leaderId).single();
    const name = t?.nickname || 'Unknown';

    await supabase.from('daily_curiosities').insert({
        fecha: new Date().toISOString().slice(0, 10),
        season: SEASON,
        tipo: 'team_winning_streak',
        titulo: 'Racha triunfal',
        descripcion: `El equipo ${name} logró encadenar ${bestMax} victorias consecutivas.`,
        payload: { category: 'equipos', nickname: name, value: bestMax, badge: `img/${name.toLowerCase()}.png` }
    });
}
