export async function run(supabase) {
    const SEASON = process.env.SEASON || '2025-26';
    console.log(`Starting: Fair Play Award (Season: ${SEASON})`);

    // 1. Fetch Stats
    const { data: stats } = await supabase
        .from('match_team_stats')
        .select(`
      fouls,
      red_cards,
      league_team_id,
      team:league_teams (nickname),
      match:matches!inner (season)
    `)
        .eq('match.season', SEASON);

    if (!stats?.length) return;

    const map = new Map();
    stats.forEach(r => {
        if (!r.league_team_id) return;
        if (!map.has(r.league_team_id)) map.set(r.league_team_id, { fouls: 0, reds: 0, matches: 0, name: r.team?.nickname });
        const e = map.get(r.league_team_id);
        e.fouls += (r.fouls || 0);
        e.reds += (r.red_cards || 0);
        e.matches++;
    });

    // Calculate Fair Play Score: (Fouls + 3 * Reds) / Matches
    // Lower is better
    let minScore = Infinity;
    let leader = null;

    map.forEach(val => {
        if (val.matches > 0) {
            const score = (val.fouls + (val.reds * 3)) / val.matches;
            if (score < minScore) { minScore = score; leader = val; }
        }
    });

    if (!leader) return;
    const scoreFixed = minScore.toFixed(2);

    await supabase.from('daily_curiosities').insert({
        fecha: new Date().toISOString().slice(0, 10),
        season: SEASON,
        tipo: 'team_fair_play',
        titulo: 'Juego Limpio',
        descripcion: `El equipo ${leader.name} es el más deportivo con una puntuación de Fair Play de ${scoreFixed} (Faltas + Rojas).`,
        payload: { category: 'estadisticas', nickname: leader.name, value: parseFloat(scoreFixed), badge: `img/${(leader.name || '').toLowerCase()}.png` }
    });
}
