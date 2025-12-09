export async function run(supabase) {
    const SEASON = process.env.SEASON || '2025-26';
    console.log(`Starting: Scoring Consistency (Season: ${SEASON})`);

    const { data: matches } = await supabase
        .from('matches')
        .select('home_league_team_id, away_league_team_id, home_goals, away_goals')
        .eq('season', SEASON)
        .not('home_goals', 'is', null);

    if (!matches?.length) return;

    const stats = new Map(); // id -> { played: 0, scored: 0 }
    const ensure = (id) => { if (!stats.has(id)) stats.set(id, { p: 0, s: 0 }); return stats.get(id); };

    matches.forEach(m => {
        const h = ensure(m.home_league_team_id);
        const a = ensure(m.away_league_team_id);
        h.p++; a.p++;

        if (m.home_goals > 0) h.s++;
        if (m.away_goals > 0) a.s++;
    });

    let maxPct = -1;
    let leaderId = null;

    stats.forEach((val, id) => {
        if (val.p > 0) {
            const pct = val.s / val.p;
            // Tie-breaker: most played matches? or ignore
            if (pct > maxPct) { maxPct = pct; leaderId = id; }
        }
    });

    if (!leaderId) return;

    const { data: t } = await supabase.from('league_teams').select('nickname').eq('id', leaderId).single();
    const name = t?.nickname || 'Unknown';
    const pctStr = (maxPct * 100).toFixed(1) + '%';

    await supabase.from('daily_curiosities').insert({
        fecha: new Date().toISOString().slice(0, 10),
        season: SEASON,
        tipo: 'team_scoring_consistency',
        titulo: 'El valor seguro',
        descripcion: `El ${name} es el equipo más regular: ha marcado en el ${pctStr} de sus partidos.`,
        payload: { category: 'estadisticas', nickname: name, value: parseFloat(pctStr), badge: `img/${name.toLowerCase()}.png` }
    });
}
