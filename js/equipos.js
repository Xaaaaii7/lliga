(async () => {
  const data = await loadJSON('data/jugadores.json');
  const root = document.getElementById('equipos');

  let equipos = [];
  if (Array.isArray(data.equipos)) equipos = data.equipos;
  else if (Array.isArray(data.jugadores)) equipos = [{ nombre: 'General', jugadores: data.jugadores }];

  const slug = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
                   .replace(/[^a-z0-9\s-]/g,'').trim().replace(/\s+/g,'-');

  root.innerHTML = equipos.map(eq => {
    const cards = (eq.jugadores||[]).map(j => {
      const linea1 = [j.posicion, j.dorsal?`#${j.dorsal}`:null].filter(Boolean).join(' ');
      const stats = [
        j.goles!=null?`⚽ ${j.goles}`:null,
        j.assists!=null?`🅰️ ${j.assists}`:null,
        j.ta!=null?`🟨 ${j.ta}`:null,
        j.tr!=null?`🟥 ${j.tr}`:null,
        j.mvp!=null?`⭐ ${j.mvp}`:null,
        j.gc!=null?`🛑 GC ${j.gc}`:null,
        j.pj!=null?`PJ ${j.pj}`:null,
        j.min!=null?`${j.min}’`:null
      ].filter(Boolean).join(' · ');
      return `
        <div class="player-card">
          <h4>${j.nombre}</h4>
          <div class="meta">${linea1}${linea1?' — ':''}${eq.nombre}</div>
          ${stats?`<div class="meta">${stats}</div>`:''}
        </div>`;
    }).join('');

    const link = `equipo.html?team=${encodeURIComponent(slug(eq.nombre))}`;
    return `
      <section class="equipo">
        <h2><a href="${link}">${eq.nombre}</a></h2>
        <div class="team-grid">${cards}</div>
        <p><a href="${link}">Ver página del equipo →</a></p>
      </section>`;
  }).join('');
})();
