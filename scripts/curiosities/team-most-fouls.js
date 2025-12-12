export async function run(supabase, competitionId = null) {
    const SEASON = process.env.SEASON || '2025-26';
    console.log(`Starting Daily Curiosity: Team Most Fouls (Season: ${SEASON}${competitionId ? `, Competition: ${competitionId}` : ''})`);

    // 1. Fetch data from match_team_stats joined with matches and league_teams
    let statsQuery = supabase
        .from('match_team_stats')
        .select(`
      fouls,
      league_team_id,
      team:league_teams (nickname, display_name),
      match:matches!inner (season, competition_id)
    `)
        .not('fouls', 'is', null);

    if (competitionId !== null) {
        statsQuery = statsQuery.eq('match.competition_id', competitionId);
    } else {
        statsQuery = statsQuery.eq('match.season', SEASON);
    }

    const { data: stats, error } = await statsQuery;

    if (error) throw new Error(error.message);
    if (!stats || !stats.length) { console.log('No stats found'); return; }

    // 2. Aggregate
    const map = new Map(); // id -> { fouls, matches, name }
    stats.forEach(r => {
        if (!r.team) return;
        const id = r.league_team_id;
        if (!map.has(id)) map.set(id, {
            fouls: 0, matches: 0,
            name: r.team.nickname || r.team.display_name,
            id
        });
        const entry = map.get(id);
        entry.fouls += (r.fouls || 0);
        entry.matches += 1;
    });

    // 3. Find Max Average
    let maxAvg = -1;
    let leader = null;
    for (const t of map.values()) {
        if (t.matches > 0) {
            const avg = t.fouls / t.matches;
            if (avg > maxAvg) {
                maxAvg = avg;
                leader = t;
            }
        }
    }

    if (!leader) { console.log('No leader found'); return; }

    const avgFixed = maxAvg.toFixed(2);
    console.log(`Leader: ${leader.name} with ${avgFixed} fouls/match`);

    // 4. Insert
    const entry = {
        fecha: new Date().toISOString().slice(0, 10),
        season: SEASON,
        tipo: 'team_most_fouls',
        titulo: 'Equipo más leñero',
        descripcion: `El equipo ${leader.name} promedia ${avgFixed} faltas por partido.`,
        payload: {
            category: 'equipos',
            nickname: leader.name,
            value: parseFloat(avgFixed),
            total: leader.fouls,
            badge: `img/${(leader.name || 'default').toLowerCase()}.png`
        }
    };

    if (competitionId !== null) {
        entry.competition_id = competitionId;
    }

    await supabase.from('daily_curiosities').insert(entry);
}
