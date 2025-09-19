(async () => {
  const params = new URLSearchParams(location.search);
  const teamSlug = (params.get('team')||'').toLowerCase();
  const slug = s=>s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
                   .replace(/[^a-z0-9\\s-]/g,'').trim().replace(/\\s+/g,'-');

  const data = await loadJSON('data/jugadores.json');
  const equipos = Array.isArray(data.equipos)?data.equipos:[{nombre:'General',jugadores:data.jugadores||[]}];
  const equipo = equipos.find(e=>slug(e.nombre)===teamSlug)||equipos[0];

  const esquema = equipo.esquema||"4-4-2";
  let alineacion = Array.isArray(equipo.alineacion)&&equipo.alineacion.length
    ? equipo.alineacion : genAlineacionFromEsquema(esquema);
  alineacion = alineacion.map(p=>({...p,nombre:p.nombre||p.slot}));

  document.getElementById('team-title').textContent=equipo.nombre;
  const root=document.getElementById('team');
  root.innerHTML=`
    <section class="equipo-cabecera">
      ${equipo.logo?`<img src="${equipo.logo}" alt="${equipo.nombre}" style="width:96px;height:96px;border-radius:16px;object-fit:cover;">`:''}
      <h2>${equipo.nombre}</h2>
      ${equipo.colores?`<div class="meta">Colores: ${equipo.colores}</div>`:''}
      <div class="meta">Esquema: ${esquema}</div>
    </section>
    <div class="field">${alineacion.map(p=>{
      const top=(p.fila/6)*100,left=(p.col/5)*100;
      return `<div class="position" style="top:${top}%;left:${left}%">
                <div class="avatar"></div><div class="name">${p.nombre}</div>
              </div>`;
    }).join('')}</div>
    <h3 style="margin-top:16px">Plantilla</h3>
    <div class="team-grid" id="plantilla"></div>`;

  document.getElementById('plantilla').innerHTML=(equipo.jugadores||[]).map(j=>`
    <div class="player-card">
      <h4>${j.nombre}</h4>
      <div class="meta">${[j.posicion,j.dorsal?`#${j.dorsal}`:null].filter(Boolean).join(' ')}</div>
    </div>`).join('');
})();
