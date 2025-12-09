export async function run(supabase) {
    const SEASON = process.env.SEASON || '2025-26';
    console.log(`Starting: Save Percentage (Season: ${SEASON})`);

    // We need Saves (From Stats) and Goals Conceded (Derived from matches or rival stats)
    // Approach: Aggregate match_team_stats for saves.
    // Aggregate matches for goals conceded.

    // 1. Saves
    const { data: stats } = await supabase
        .from('match_team_stats')
        .select('league_team_id, saves, match:matches!inner(season)')
        .eq('match.season', SEASON);

    if (!stats?.length) return;
    const teamSaves = new Map();
    stats.forEach(r => {
        if (!r.league_team_id) return;
        teamSaves.set(r.league_team_id, (teamSaves.get(r.league_team_id) || 0) + (r.saves || 0));
    });

    // 2. Conceded
    const { data: matches } = await supabase
        .from('matches')
        .select('home_league_team_id, away_league_team_id, home_goals, away_goals')
        .eq('season', SEASON)
        .not('home_goals', 'is', null);

    const teamConceded = new Map();
    matches.forEach(m => {
        teamConceded.set(m.home_league_team_id, (teamConceded.get(m.home_league_team_id) || 0) + m.away_goals);
        teamConceded.set(m.away_league_team_id, (teamConceded.get(m.away_league_team_id) || 0) + m.home_goals);
    });

    // 3. Calc
    let maxPct = -1;
    let leaderId = null;

    teamSaves.forEach((saves, id) => {
        const conceded = teamConceded.get(id) || 0;
        const shotsOnTargetFaced = saves + conceded; // Approx
        if (shotsOnTargetFaced > 10) { // Min sample
            const pct = saves / shotsOnTargetFaced;
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
        tipo: 'team_save_percentage',
        titulo: 'El Muro',
        descripcion: `El equipo ${name} tiene el mejor porcentaje de paradas de la liga: detiene el ${pctStr} de los tiros a puerta recibidos.`,
        payload: { category: 'estadisticas', nickname: name, value: parseFloat(pctStr), badge: `img/${name.toLowerCase()}.png` }
    });
}
