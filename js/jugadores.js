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
  // Aplana jugadores por equipos
  const jugadores = Array.isArray(data.equipos)
    ? data.equipos.flatMap(eq => (eq.jugadores||[]).map(j => ({...j, equipo:eq.nombre})))
    : (data.jugadores||[]);

  const val = (x)=> x ?? 0;

  // Helpers
  const topBy = (arr, cmp) => arr.slice().sort(cmp);
  const row = (...cols) => `<tr>${cols.map(c=>`<td>${c}</td>`).join('')}</tr>`;
  const setBody = (id, html) => { document.getElementById(id).innerHTML = html; };

  // -------- PICHICHI --------
  const ordenPichichi = (a,b) =>
    val(b.goles)-val(a.goles) || val(b.mvp)-val(a.mvp) || val(a.min)-val(b.min);
  const pichichi = topBy(jugadores, ordenPichichi);
  setBody('tb-pichichi',
    pichichi.map((j,i)=> row(
      i+1, j.nombre, j.equipo, val(j.goles), val(j.pj), val(j.min)
    )).join('')
  );

  // -------- ZAMORA --------
  const MIN_PJ = data.parametros?.zamora_min_pj ?? 3;
  const porterosBase = jugadores.filter(j=> (j.posicion||'').toUpperCase()==='POR' && val(j.pj) >= MIN_PJ)
    .map(j => {
      const minutos = val(j.min) || (val(j.pj)*50); // fallback 50’ si no hay minutos
      const gc90 = minutos ? (val(j.gc)/minutos)*90 : Infinity;
      return {...j, minutos, gc90};
    });
  const zamora = topBy(porterosBase, (a,b)=> a.gc90 - b.gc90 || val(a.minutos)-val(b.minutos));
  setBody('tb-zamora',
    zamora.map((j,i)=> row(
      i+1, j.nombre, j.equipo, val(j.gc), val(j.pj), val(j.minutos), j.gc90.toFixed(2)
    )).join('')
  );

  // -------- TARJETAS --------
  const ordAmar = (a,b)=> val(b.ta)-val(a.ta) || val(b.tr)-val(a.tr) || val(a.min)-val(b.min);
  const ordRojas = (a,b)=> val(b.tr)-val(a.tr) || val(b.ta)-val(a.ta) || val(a.min)-val(b.min);
  const amarillas = topBy(jugadores, ordAmar).filter(j=> val(j.ta)>0);
  const rojas = topBy(jugadores, ordRojas).filter(j=> val(j.tr)>0);

  setBody('tb-amarillas',
    amarillas.map((j,i)=> row(i+1, j.nombre, j.equipo, val(j.ta), val(j.pj), val(j.min))).join('')
  );
  setBody('tb-rojas',
    rojas.map((j,i)=> row(i+1, j.nombre, j.equipo, val(j.tr), val(j.pj), val(j.min))).join('')
  );

  // -------- MVP --------
  const ordMvp = (a,b)=> val(b.mvp)-val(a.mvp) || val(b.goles)-val(a.goles) || val(a.min)-val(b.min);
  const mvp = topBy(jugadores, ordMvp).filter(j=> val(j.mvp)>0);
  setBody('tb-mvp',
    mvp.map((j,i)=> row(i+1, j.nombre, j.equipo, val(j.mvp), val(j.pj), val(j.min))).join('')
  );
})();
