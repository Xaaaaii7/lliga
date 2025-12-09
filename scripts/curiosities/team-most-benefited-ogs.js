export async function run(supabase) {
    const SEASON = process.env.SEASON || '2025-26';
    console.log(`Starting: OG Beneficiaries (Season: ${SEASON})`);

    const { data: goals } = await supabase
        .from('goal_events')
        .select(`
      league_team_id,
      match:matches!inner (id, season, home_league_team_id, away_league_team_id)
    `)
        .eq('match.season', SEASON)
        .eq('event_type', 'own_goal');

    // goal_events with own_goal usually has 'league_team_id' of the SCORER (the one who messed up).
    // So the beneficiary is the opponent.

    const stats = new Map();
    const add = (id) => stats.set(id, (stats.get(id) || 0) + 1);

    if (!goals?.length) return;

    goals.forEach(g => {
        if (!g.league_team_id) return;
        // Determine opponent
        let beneficiary = null;
        if (g.league_team_id === g.match.home_league_team_id) beneficiary = g.match.away_league_team_id;
        else beneficiary = g.match.home_league_team_id;

        if (beneficiary) add(beneficiary);
    });

    let max = -1;
    let leaderId = null;
    stats.forEach((count, id) => { if (count > max) { max = count; leaderId = id; } });

    if (!leaderId) return;

    const { data: t } = await supabase.from('league_teams').select('nickname').eq('id', leaderId).single();
    const name = t?.nickname || 'Unknown';

    await supabase.from('daily_curiosities').insert({
        fecha: new Date().toISOString().slice(0, 10),
        season: SEASON,
        tipo: 'team_most_benefited_ogs',
        titulo: 'Regalos del rival',
        descripcion: `El ${name} es el equipo más beneficiado por goles en propia meta del rival (${max}).`,
        payload: { category: 'equipos', nickname: name, value: max, badge: `img/${name.toLowerCase()}.png` }
    });
}
