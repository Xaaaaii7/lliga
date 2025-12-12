export async function run(supabase, competitionId = null) {
    const SEASON = process.env.SEASON || '2025-26';
    console.log(`Starting Daily Curiosity: Injuries (Season: ${SEASON}${competitionId ? `, Competition: ${competitionId}` : ''})`);

    try {
        // Correct table name is 'match_injuries' based on schema check
        let eventsQuery = supabase
            .from('match_injuries')
            .select(`
        id,
        league_team_id,
        match:matches!inner (season, competition_id),
        team:league_teams (nickname, display_name)
      `);

        if (competitionId !== null) {
            eventsQuery = eventsQuery.eq('match.competition_id', competitionId);
        } else {
            eventsQuery = eventsQuery.eq('match.season', SEASON);
        }

        const { data: events, error } = await eventsQuery;

        if (error) throw error;
        if (!events?.length) { console.log('No injuries found'); return; }

        const map = new Map();
        events.forEach(r => {
            const id = r.league_team_id;
            if (!id) return;
            if (!map.has(id)) map.set(id, { count: 0, name: r.team ? (r.team.nickname || r.team.display_name) : 'Equipo' });
            map.get(id).count++;
        });

        let max = -1;
        let leader = null;
        for (const t of map.values()) {
            if (t.count > max) { max = t.count; leader = t; }
        }

        if (!leader) return;

        console.log(`Leader: ${leader.name} with ${leader.count} injuries`);

        const entry = {
            fecha: new Date().toISOString().slice(0, 10),
            season: SEASON,
            tipo: 'team_most_injuries',
            titulo: 'Enfermería llena',
            descripcion: `El equipo ${leader.name} ha sufrido ${leader.count} lesiones esta temporada.`,
            payload: {
                category: 'estadisticas',
                nickname: leader.name,
                value: leader.count,
                badge: `img/${(leader.name || 'default').toLowerCase()}.png`
            }
        };

        if (competitionId !== null) {
            entry.competition_id = competitionId;
        }

        await supabase.from('daily_curiosities').insert(entry);

    } catch (err) {
        console.log('Skipping injuries task due to error:', err.message);
    }
}
