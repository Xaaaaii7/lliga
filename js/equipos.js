(async () => {
  const data = await loadJSON('data/jugadores.json');
  const root = document.getElementById('equipos');

  // Obtén los equipos (formato nuevo por equipos o fallback al antiguo)
  let equipos = [];
  if (Array.isArray(data.equipos)) equipos = data.equipos;
  else if (Array.isArray(data.jugadores)) equipos = [{ nombre: 'General', jugadores: data.jugadores }];

  // slug URL-friendly
  const slug = s => s.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9\s-]/g,'').trim().replace(/\s+/g,'-');

  // SOLO cuadrados por equipo con nombre y enlace a su página. Sin info de jugadores.
  root.innerHTML = `
    <section class="equipos-lista">
      <div class="team-grid">
        ${equipos.map(eq => {
          const link = `equipo.html?team=${encodeURIComponent(slug(eq.nombre))}`;
          return `
            <a class="player-card" href="${link}" title="Ver ${eq.nombre}">
              <h4 style="margin:0 auto;text-align:center;">${eq.nombre}</h4>
            </a>
          `;
        }).join('')}
      </div>
    </section>
  `;
})();
