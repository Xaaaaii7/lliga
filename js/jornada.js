(async () => {
  const j = await loadJSON('data/jornada.json');
  const root = document.getElementById('jornada');

  const esquema = j.esquema || "4-4-2";
  let alineacion = Array.isArray(j.alineacion)&&j.alineacion.length
    ? j.alineacion : genAlineacionFromEsquema(esquema);
  alineacion = alineacion.map(p=>({...p,nombre:p.nombre||p.slot}));

  const pct = (fila,col)=>({top:(fila/6)*100,left:(col/5)*100});
  const pos = alineacion.map(p=>{
    const {top,left}=pct(p.fila,p.col);
    return `<div class="position" style="top:${top}%;left:${left}%">
              <div class="avatar"></div><div class="name">${p.nombre}</div>
            </div>`;
  }).join('');

  root.innerHTML = `
    <section>
      <h2>Equipo de la jornada ${j.jornada} (${esquema})</h2>
      <div class="field">${pos}</div>
    </section>
    <section>
      <h2>Gol de la jornada</h2>
      ${j.gol_youtube?`<iframe class="video" src="https://www.youtube.com/embed/${j.gol_youtube}" allowfullscreen></iframe>`:'<p>Próximamente…</p>'}
    </section>
    <section>
      <h2>Mejor jugador</h2>
      <div class="player-card">
        <h4>${j.mej_jugador?.nombre||'—'}</h4>
        <div class="meta">${j.mej_jugador?.equipo||''}</div>
        ${j.mej_jugador?.motivo?`<p>${j.mej_jugador.motivo}</p>`:''}
      </div>
    </section>`;
})();
