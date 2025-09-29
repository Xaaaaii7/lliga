(async () => {
  // ---------- Pichichi/Zamora por EQUIPO desde resultados.json ----------
  const jornadas = await loadJSON('data/resultados.json').catch(() => null);
  const norm = s => String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9\s-]/g,'').trim();
  const teams = new Map(); // norm -> {nombre,pj,gf,gc}
  const getTeam = name => { const k = norm(name); if (!teams.has(k)) teams.set(k, { nombre:name, pj:0, gf:0, gc:0 }); return teams.get(k); };

  if (Array.isArray(jornadas)) {
    for (const j of jornadas) for (const p of (j.partidos||[])) {
      if (!p.local || !p.visitante) continue;
      const L = getTeam(p.local), V = getTeam(p.visitante);

      // cuenta solo si hay números (null = pendiente)
      const isNum = v => typeof v === 'number' && Number.isFinite(v);
      const gl = isNum(p.goles_local) ? p.goles_local : null;
      const gv = isNum(p.goles_visitante) ? p.goles_visitante : null;
      if (gl === null || gv === null) continue;

      L.pj++; V.pj++;
      L.gf += gl; L.gc += gv;
      V.gf += gv; V.gc += gl;
    }
  }

  const dg = t => t.gf - t.gc;
  const equiposArr = Array.from(teams.values());

  // Orden Pichichi: GF desc → DG desc → GC asc → nombre
  const pichichiEq = equiposArr.slice().sort((a,b)=>
    (b.gf - a.gf) || ((dg(b)-dg(a))) || (a.gc - b.gc) ||
    a.nombre.localeCompare(b.nombre,'es',{sensitivity:'base'})
  );

  // Orden Zamora: GC asc → DG desc → GF desc → nombre
  const zamoraEq = equiposArr.slice().sort((a,b)=>
    (a.gc - b.gc) || ((dg(b)-dg(a))) || (b.gf - a.gf) ||
    a.nombre.localeCompare(b.nombre,'es',{sensitivity:'base'})
  );

  // Filas con promedios
  const gfPJ = t => t.pj > 0 ? (t.gf / t.pj).toFixed(2) : '—';
  const gcPJ = t => t.pj > 0 ? (t.gc / t.pj).toFixed(2) : '—';

  const rowPichichi = (t,i)=>`
    <tr>
      <td>${i+1}</td>
      <td>${t.nombre}</td>
      <td>${t.pj}</td>
      <td>${t.gf}</td>
      <td>${gfPJ(t)}</td>
    </tr>
  `;

  const rowZamora = (t,i)=>`
    <tr>
      <td>${i+1}</td>
      <td>${t.nombre}</td>
      <td>${t.pj}</td>
      <td>${t.gc}</td>
      <td>${gcPJ(t)}</td>
    </tr>
  `;

  const tp = document.getElementById('tabla-pichichi');
  const tz = document.getElementById('tabla-zamora');
  if (tp) tp.innerHTML = pichichiEq.map(rowPichichi).join('');
  if (tz) tz.innerHTML = zamoraEq.map(rowZamora).join('');

  // ---------- Lo demás (posesión/fair play/pases/tiros) queda igual ----------
  // ...
})();
