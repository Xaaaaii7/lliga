(async () => {
  // Carga resultados para calcular GF/GC por equipo
  const jornadas = await loadJSON('data/resultados.json').catch(() => null);
  if (!Array.isArray(jornadas)) return;

  // Normalizador
  const norm = s => String(s||'').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9\s-]/g,'').trim();

  // Acumuladores por equipo
  const teams = new Map(); // key norm -> stats
  const getTeam = (name) => {
    const k = norm(name);
    if (!teams.has(k)) teams.set(k, { nombre: name, pj:0, gf:0, gc:0 });
    return teams.get(k);
  };

  for (const j of jornadas) {
    for (const p of (j.partidos || [])) {
      if (!p.local || !p.visitante) continue;
      const gl = Number.isFinite(+p.goles_local) ? +p.goles_local : null;
      const gv = Number.isFinite(+p.goles_visitante) ? +p.goles_visitante : null;

      // Asegura aparición en tablas aunque no haya resultado aún
      const L = getTeam(p.local);
      const V = getTeam(p.visitante);

      if (gl === null || gv === null) continue; // pendiente

      L.pj++; V.pj++;
      L.gf += gl; L.gc += gv;
      V.gf += gv; V.gc += gl;
    }
  }

  const dg = t => t.gf - t.gc;
  const data = Array.from(teams.values());

  // Orden Pichichi: GF desc → DG desc → GC asc → nombre
  const pichichi = data.slice().sort((a,b)=>{
    if (b.gf !== a.gf) return b.gf - a.gf;
    const dA = dg(a), dB = dg(b);
    if (dA !== dB) return dB - dA;
    if (a.gc !== b.gc) return a.gc - b.gc; // menos GC mejor
    return a.nombre.localeCompare(b.nombre, 'es', {sensitivity:'base'});
  });

  // Orden Zamora: GC asc → DG desc → GF desc → nombre
  const zamora = data.slice().sort((a,b)=>{
    if (a.gc !== b.gc) return a.gc - b.gc;  // menos goles encajados
    const dA = dg(a), dB = dg(b);
    if (dA !== dB) return dB - dA;
    if (b.gf !== a.gf) return b.gf - a.gf;
    return a.nombre.localeCompare(b.nombre, 'es', {sensitivity:'base'});
  });

  // Render helpers
  const row = (t, i) => `
    <tr>
      <td>${i+1}</td>
      <td>${t.nombre}</td>
      <td>${t.pj}</td>
      <td>${t.gf}</td>
      <td>${t.gc}</td>
      <td>${dg(t)}</td>
    </tr>
  `;

  // Pinta tablas
  const tp = document.getElementById('tabla-pichichi');
  const tz = document.getElementById('tabla-zamora');
  if (tp) tp.innerHTML = pichichi.map(row).join(''); else console.warn('Falta #tabla-pichichi');
  if (tz) tz.innerHTML = zamora.map(row).join(''); else console.warn('Falta #tabla-zamora');
})();
