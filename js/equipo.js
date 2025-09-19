(async () => {
  const params = new URLSearchParams(location.search);
  const teamSlug = (params.get('team')||'').toLowerCase();
  const slug = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
                   .replace(/[^a-z0-9\s-]/g,'').trim().replace(/\s+/g,'-');

  const data = await loadJSON('data/jugadores.json');
  const equipos = Array.isArray(data.equipos) ? data.equipos : [{nombre:'General', jugadores:data.jugadores||[]}];
  const equipo = equipos.find(e => slug(e.nombre) === teamSlug) || equipos[0];

  document.getElementById('team-title').textContent = equipo.nombre;
  const root = document.getElementById('team');

  const header = `
    <section class="equipo-cabecera">
      ${equipo.logo ? `<img src="${equipo.logo}" alt="${equipo.nombre}" style="width:96px;height:96px;border-radius:16px;object-fit:cover;">` : ''}
      <h2>${equipo.nombre}</h2>
      ${equipo.colores ? `<div class="meta">Colores: ${equipo.colores}</div>`:''}
    </section>`;

  const plantilla = (equipo.jugadores||[]).map(j=>{
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
        <div class="meta">${linea1}</div>
        ${stats?`<div class="meta">${stats}</div>`:''}
      </div>`;
  }).join('');

  root.innerHTML = `
    ${header}
    <section>
      <h3>Plantilla</h3>
      <div class="team-grid">${plantilla}</div>
    </section>`;
})();
