export async function run(supabase, competitionId = null) {
    const SEASON = process.env.SEASON || '2025-26';
    console.log(`Starting: Snoozefest (Season: ${SEASON}${competitionId ? `, Competition: ${competitionId}` : ''})`);

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

    const stats = new Map();
    const add = (id, g) => {
        if (!stats.has(id)) stats.set(id, { g: 0, m: 0 });
        const s = stats.get(id);
        s.g += g; s.m++;
    };

    matches.forEach(m => {
        const total = m.home_goals + m.away_goals;
        add(m.home_league_team_id, total);
        add(m.away_league_team_id, total);
    });

    let minAvg = Infinity;
    let leaderId = null;

    stats.forEach((val, id) => {
        if (val.m > 0) {
            const avg = val.g / val.m;
            if (avg < minAvg) { minAvg = avg; leaderId = id; }
        }
    });

    if (!leaderId) return;

    const { data: t } = await supabase.from('league_teams').select('nickname').eq('id', leaderId).single();
    const name = t?.nickname || 'Unknown';
    const valFixed = minAvg.toFixed(2);

    const entry = {
        fecha: new Date().toISOString().slice(0, 10),
        season: SEASON,
        tipo: 'team_snoozefest',
        titulo: 'Cerrojo Táctico',
        descripcion: `Los partidos del ${name} son muy cerrados: apenas ${valFixed} goles de media por encuentro.`,
        payload: { category: 'estadisticas', nickname: name, value: parseFloat(valFixed), badge: `img/${name.toLowerCase()}.png` }
    };

    if (competitionId !== null) {
        entry.competition_id = competitionId;
    }

    await supabase.from('daily_curiosities').insert(entry);
}
