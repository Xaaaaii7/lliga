export async function run(supabase) {
    const SEASON = process.env.SEASON || '2025-26';
    console.log(`Starting Daily Curiosity: Pitchichi Efficiency (Season: ${SEASON})`);

    const { data: rows, error } = await supabase
        .from('goleadores')
        .select('season, jugador, partidos, goles, manager')
        .eq('season', SEASON)
        .gte('partidos', 5); // Filter min 5 matches for relevance

    if (error) throw new Error(error.message);
    if (!rows?.length) { console.log('No scorers with >5 matches'); return; }

    let maxRatio = -1;
    let leader = null;

    rows.forEach(r => {
        const p = r.partidos || 0;
        const g = r.goles || 0;
        if (p > 0) {
            const ratio = g / p;
            if (ratio > maxRatio) {
                maxRatio = ratio;
                leader = r;
            }
        }
    });

    if (!leader) return;

    const ratioFixed = maxRatio.toFixed(2);
    const tName = leader.manager || 'Su equipo'; // 'manager' field holds team name in view

    console.log(`Leader: ${leader.jugador} with ${ratioFixed} goals/match`);

    await supabase.from('daily_curiosities').insert({
        fecha: new Date().toISOString().slice(0, 10),
        season: SEASON,
        tipo: 'player_efficiency',
        titulo: 'Goleador eficiente',
        descripcion: `${leader.jugador} (${tName}) tiene el mejor promedio: ${ratioFixed} goles por partido.`,
        payload: {
            category: 'jugadores',
            playerName: leader.jugador,
            teamName: tName,
            value: parseFloat(ratioFixed),
            badge: `img/jugadores/${(leader.jugador.toLowerCase().replace(/\s+/g, '-'))}.jpg`
        }
    });
}
