(async () => {
  const tbody   = document.getElementById('tabla-fit');
  const msgEl   = document.getElementById('fit-msg');
  const resumen = document.getElementById('resumen');
  const kInput  = document.getElementById('k-shrink');
  const confDen = document.getElementById('conf-den');
  const ordenEl = document.getElementById('orden');
  if (!tbody) return;

  const PRIM_PATH = document.body?.dataset?.primera;
  const SEG_PATH  = document.body?.dataset?.segunda;
  const showMsg = t => { if (msgEl) msgEl.textContent = t || ''; };

  // helpers
  const isNum = v => typeof v === 'number' && Number.isFinite(v);
  const norm  = s => String(s||'').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9\s-]/g,'').trim();

  // carga
  let jornadas = [];
  try { jornadas = await loadJSON('data/resultados.json'); } catch {}
  if (!Array.isArray(jornadas)) { showMsg('No se pudieron cargar resultados.json'); return; }

  let div1={}, div2={};
  try { div1 = await loadJSON(PRIM_PATH); } catch {}
  try { div2 = await loadJSON(SEG_PATH);  } catch {}
  const listaD1 = (div1?.equipos || []).map(String);
  const listaD2 = (div2?.equipos || []).map(String);

  const setD1 = new Set(listaD1.map(norm));
  const setD2 = new Set(listaD2.map(norm));

  // recolecta nombres de todos los jugadores/equipos
  const allTeams = new Set();
  for (const j of jornadas) for (const p of (j.partidos||[])) {
    if (p.local) allTeams.add(p.local);
    if (p.visitante) allTeams.add(p.visitante);
  }

  // función que suma Pts/GF/GC/PJ para un "equipo objetivo" vs rivales en un conjunto (D1 o D2)
  const acumVsSet = (equipo, setObj) => {
    const res = { pj:0, pts:0, gf:0, gc:0 };
    for (const j of jornadas) for (const p of (j.partidos||[])) {
      if (!p.local || !p.visitante) continue;
      if (!isNum(p.goles_local) || !isNum(p.goles_visitante)) continue;

      // partido donde participa "equipo"
      const esLocal = p.local === equipo;
      const esVisit = p.visitante === equipo;
      if (!esLocal && !esVisit) continue;

      // rival
      const rival = esLocal ? p.visitante : p.local;
      // SOLO cuenta si el rival pertenece al set de la división filtrada
      if (!setObj.has(norm(rival))) continue;

      const gf = esLocal ? p.goles_local : p.goles_visitante;
      const gc = esLocal ? p.goles_visitante : p.goles_local;

      res.pj++;
      res.gf += gf; res.gc += gc;
      res.pts += (gf>gc?3: gf===gc?1:0);
    }
    return res;
  };

  const gdpm = o => o.pj>0 ? (o.gf - o.gc)/o.pj : 0;
  const ppm  = o => o.pj>0 ? o.pts / o.pj : 0;

  function etiqueta(o, k=3, confDenom=6){
    // shrink
    const ppmD1s = (o.ptsD1 + 1.5*k) / (o.pjD1 + k);
    const ppmD2s = (o.ptsD2 + 1.5*k) / (o.pjD2 + k);
    const gap    = ppmD2s - ppmD1s;
    const conf   = Math.min((o.pjD1 + o.pjD2) / confDenom, 1);

    // umbrales (ajusta si quieres)
    const okD2  = (ppmD2s >= 1.7) && (o.gdpmD2 >= 0.3);
    const okD1  = (ppmD1s >= 1.0) || (o.gdpmD1 >= 0);
    const gapOk = (gap >= 0.3);
    const confOk= (conf >= 0.5);

    let label='', css='b-warn', score=0;

    if (okD2 && okD1 && gapOk && confOk) {
      label = 'Buen candidato a Segunda (apto para Primera)';
      css = 'b-ok'; score = 3;
    } else if (okD2 && !okD1 && confOk) {
      label = 'Dominante en Segunda, dudoso en Primera';
      css = 'b-warn'; score = 2;
    } else if (ppmD1s >= 1.5) {
      label = 'Listo para Primera';
      css = 'b-ok'; score = 4; // aun más alto
    } else {
      label = 'Frontera / Neutro';
      css = 'b-risk'; score = 1;
    }
    return { label, css, score, ppmD1s, ppmD2s, gap, conf };
  }

  function recompute(){
    const k    = Math.max(0, parseInt(kInput.value || '3', 10));
    const cden = Math.max(1, parseInt(confDen.value || '6', 10));

    const rows = [];
    for (const name of allTeams) {
      const vsD1 = acumVsSet(name, setD1);
      const vsD2 = acumVsSet(name, setD2);

      const o = {
        nombre: name,
        pjD1: vsD1.pj, ptsD1: vsD1.pts, gdpmD1: gdpm(vsD1),
        pjD2: vsD2.pj, ptsD2: vsD2.pts, gdpmD2: gdpm(vsD2),
      };
      const et = etiqueta(o, k, cden);
      rows.push({ ...o, ...et });
    }

    // ordenar
    const ord = ordenEl.value;
    rows.sort((a,b)=>{
      if (ord==='brecha') return (b.gap - a.gap) || a.nombre.localeCompare(b.nombre,'es',{sensitivity:'base'});
      if (ord==='d1')     return (b.ppmD1s - a.ppmD1s) || a.nombre.localeCompare(b.nombre,'es',{sensitivity:'base'});
      if (ord==='d2')     return (b.ppmD2s - a.ppmD2s) || a.nombre.localeCompare(b.nombre,'es',{sensitivity:'base'});
      if (ord==='nombre') return a.nombre.localeCompare(b.nombre,'es',{sensitivity:'base'});
      // por defecto score desc → brecha desc
      return (b.score - a.score) || (b.gap - a.gap) || a.nombre.localeCompare(b.nombre,'es',{sensitivity:'base'});
    });

    // pinta
    tbody.innerHTML = rows.map((r,i)=>`
      <tr>
        <td>${i+1}</td>
        <td>${r.nombre}</td>
        <td>${r.pjD1}</td>
        <td>${r.ppmD1s.toFixed(2)}</td>
        <td>${r.gdpmD1.toFixed(2)}</td>
        <td>${r.pjD2}</td>
        <td>${r.ppmD2s.toFixed(2)}</td>
        <td>${r.gdpmD2.toFixed(2)}</td>
        <td>${r.gap.toFixed(2)}</td>
        <td>${(r.conf*100).toFixed(0)}%</td>
        <td><span class="badge ${r.css}">${r.label}</span></td>
      </tr>
    `).join('');

    if (resumen) {
      resumen.textContent = `k=${k}, confianza= min((PJ_D1+PJ_D2)/${cden}, 1)`;
    }
    showMsg(rows.length ? '' : 'No hay datos.');
  }

  // init
  recompute();
  kInput.addEventListener('input', recompute);
  confDen.addEventListener('input', recompute);
  ordenEl.addEventListener('change', recompute);
})();
