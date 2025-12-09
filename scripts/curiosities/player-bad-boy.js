export async function run(supabase) {
    const SEASON = process.env.SEASON || '2025-26';
    console.log(`Starting: Player Bad Boy (Season: ${SEASON})`);

    // Using match_red_cards table is best if available, or if stats only gives team aggregate we can't find player.
    // We confirmed match_red_cards exists earlier.

    const { data: cards } = await supabase
        .from('match_red_cards') // Assuming this table links red cards to players
        .select('player_id, player:players(name), match:matches!inner(season)')
        .eq('match.season', SEASON);

    if (!cards?.length) {
        // try aggregating if match_red_cards is empty? 
        // or log error.
        console.log('No red card details found.');
        return;
    }

    const map = new Map();
    cards.forEach(c => {
        const name = c.player?.name || 'Unknown';
        map.set(name, (map.get(name) || 0) + 1);
    });

    let max = -1;
    let leader = null;
    map.forEach((count, name) => { if (count > max) { max = count; leader = name; } });

    if (!leader) return;

    await supabase.from('daily_curiosities').insert({
        fecha: new Date().toISOString().slice(0, 10),
        season: SEASON,
        tipo: 'player_bad_boy',
        titulo: 'El chico malo',
        descripcion: `${leader} ha sido expulsado ${max} veces esta temporada.`,
        payload: { category: 'jugadores', playerName: leader, value: max, badge: `img/jugadores/${leader.toLowerCase().replace(/\s+/g, '-')}.jpg` }
    });
}
