export async function run(supabase) {
    const SEASON = process.env.SEASON || '2025-26';
    console.log(`Starting Daily Curiosity: Highest Possession (Season: ${SEASON})`);

    // Fixed columns: local_team_id -> home_league_team_id, jornada -> round_id
    const { data: stats, error } = await supabase
        .from('match_team_stats')
        .select(`
      possession,
      league_team_id,
      match_id,
      team:league_teams (nickname, display_name),
      match:matches!inner (season, round_id, home_league_team_id, away_league_team_id)
    `)
        .eq('match.season', SEASON)
        .not('possession', 'is', null);

    if (error) throw new Error(error.message);
    if (!stats?.length) return;

    let maxPos = -1;
    let best = null;

    stats.forEach(r => {
        let val = r.possession;
        if (typeof val === 'string') val = parseFloat(val.replace('%', ''));
        else if (val <= 1) val = val * 100;

        if (val > maxPos) {
            maxPos = val;
            best = r;
        }
    });

    if (!best) return;

    const teamName = best.team ? (best.team.nickname || best.team.display_name) : 'Equipo';
    const pct = maxPos.toFixed(1) + '%';
    console.log(`Highest possession: ${teamName} with ${pct}`);

    await supabase.from('daily_curiosities').insert({
        fecha: new Date().toISOString().slice(0, 10),
        season: SEASON,
        tipo: 'match_highest_possession',
        titulo: 'Dominio absoluto',
        descripcion: `El equipo ${teamName} registró un ${pct} de posesión en la jornada ${best.match.round_id}.`,
        payload: {
            category: 'estadisticas',
            nickname: teamName,
            value: maxPos,
            matchId: best.match_id,
            badge: `img/${(teamName || 'default').toLowerCase()}.png`
        }
    });
}
