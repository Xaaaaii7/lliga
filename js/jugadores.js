// Tabs
(function(){
  const tabBtns = document.querySelectorAll('.tabs button');
  const panels = document.querySelectorAll('.tab-panel');
  tabBtns.forEach(btn=> btn.addEventListener('click', ()=>{
    tabBtns.forEach(b=>b.classList.remove('active'));
    panels.forEach(p=>p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.tab).classList.add('active');
  }));
})();

(async () => {
  const data = await loadJSON('data/jugadores.json');

  // Soporta JSON por equipos
  const jugadores = Array.isArray(data.equipos)
    ? data.equipos.flatMap(eq => (eq.jugadores||[]).map(j => ({...j, equipo:eq.nombre})))
    : (data.jugadores||[]);

  const top = (arr, key, n=20) => arr.slice().sort((a,b)=> (b[key]||0)-(a[key]||0)).slice(0,n);

  // Pichichi
  document.getElementById('lista-pichichi').innerHTML = top(jugadores,'goles').map((j,i)=>
    `<li>${i+1}. ${j.nombre} (${j.equipo||''}) — ${j.goles||0} goles</li>`
  ).join('');

  // Zamora
  const MIN_PJ = data.parametros?.zamora_min_pj ?? 3;
  const porteros = jugadores.filter(j=> j.posicion==='POR' && (j.pj||0) >= MIN_PJ)
    .map(j=> ({...j, gc90: (j.gc||0)/Math.max(j.min||j.pj*50, 1)*90 }));
  document.getElementById('lista-zamora').innerHTML = top(porteros,'gc90').reverse().map((j,i)=>
    `<li>${i+1}. ${j.nombre} (${j.equipo||''}) — ${(j.gc90).toFixed(2)} GC/90</li>`
  ).join('');

  // Tarjetas
  document.getElementById('lista-amarillas').innerHTML = top(jugadores,'ta').map((j,i)=>
    `<li>${i+1}. ${j.nombre} (${j.equipo||''}) — ${j.ta||0} amarillas</li>`
  ).join('');
  document.getElementById('lista-rojas').innerHTML = top(jugadores,'tr').map((j,i)=>
    `<li>${i+1}. ${j.nombre} (${j.equipo||''}) — ${j.tr||0} rojas</li>`
  ).join('');

  // MVP
  document.getElementById('lista-mvp').innerHTML = top(jugadores,'mvp').map((j,i)=>
    `<li>${i+1}. ${j.nombre} (${j.equipo||''}) — ${j.mvp||0} MVPs</li>`
  ).join('');
})();
