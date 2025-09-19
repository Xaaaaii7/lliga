(async () => {
const jornadas = await loadJSON('data/resultados.json');
const root = document.getElementById('resultados');


jornadas.sort((a,b)=> a.numero - b.numero);


root.innerHTML = jornadas.map(j=>{
const partidos = j.partidos.map(p=>{
const youtube = p.youtube ? `<a href="${p.youtube}" target="_blank">YouTube</a>`: '';
const stream = p.stream ? `<a href="${p.stream}" target="_blank">Directo</a>`: '';
const videoLinks = [stream,youtube].filter(Boolean).join(' · ');
const marcador = (p.goles_local ?? '-') + ' - ' + (p.goles_visitante ?? '-');
return `
<div class="player-card">
<div><strong>${p.local}</strong> vs <strong>${p.visitante}</strong></div>
<div class="meta">${j.fecha ? fmtDate(j.fecha): ''} · ${videoLinks}</div>
<div style="font-size:1.25rem;margin-top:6px">${marcador}</div>
</div>`;
}).join('');


return `
<section class="jornada">
<h2>Jornada ${j.numero} ${j.fecha?`· <small>${fmtDate(j.fecha)}</small>`:''}</h2>
<div class="team-grid">${partidos}</div>
</section>`;
}).join('');
})();
