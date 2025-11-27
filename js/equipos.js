(async () => {
  const { slugify } = window.AppUtils || {};
  const slug = slugify || (s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\\u036f]/g,'')
                .replace(/[^a-z0-9\\s-]/g,'').trim().replace(/\\s+/g,'-'));
  const data = await loadJSON('data/jugadores.json');
  const root = document.getElementById('equipos');
  let equipos=Array.isArray(data.equipos)?data.equipos:[{nombre:'General'}];
  root.innerHTML=`
    <section class="equipos-lista">
      <div class="team-grid">
        ${equipos.map(eq=>{
          const link=`equipo.html?team=${encodeURIComponent(slug(eq.nombre))}`;
          return `<a class="player-card" href="${link}"><h4 style="text-align:center;">${eq.nombre}</h4></a>`;
        }).join('')}
      </div>
    </section>`;
})();
