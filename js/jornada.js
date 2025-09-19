(async () => {
const j = await loadJSON('data/jornada.json');
const root = document.getElementById('jornada');
const once = `
<section>
<h2>Equipo de la jornada ${j.jornada}</h2>
<div class="team-grid">
${j.equipo.map(p=>`
<div class="player-card">
<h4>${p.nombre}</h4>
<div class="meta">${p.posicion} — ${p.equipo}</div>
${p.detalles?`<div>${p.detalles}</div>`:''}
</div>
`).join('')}
</div>
</section>
<section>
<h2>Gol de la jornada</h2>
${j.gol_youtube ? `<iframe class="video" src="https://www.youtube.com/embed/${j.gol_youtube}" allowfullscreen></iframe>` : '<p>Próximamente…</p>'}
</section>
<section>
<h2>Mejor jugador</h2>
<div class="player-card">
<h4>${j.mej_jugador?.nombre || '—'}</h4>
<div class="meta">${j.mej_jugador?.equipo || ''}</div>
${j.mej_jugador?.motivo ? `<p>${j.mej_jugador.motivo}</p>`:''}
</div>
</section>`;
root.innerHTML = once;
})();
