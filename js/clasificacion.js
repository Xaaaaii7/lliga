(async () => {
  // Cargamos clasificación base y resultados para calcular directos
  const [clasifData, jornadas] = await Promise.all([
    loadJSON('data/clasificacion.json'),
    loadJSON('data/resultados.json').catch(()=>[])
  ]);

  const equipos = (clasifData?.equipos || []).slice();

  // Normalizador para claves (evita problemas con acentos/mayúsculas)
  const norm = s => String(s||'').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9\s-]/g,'').trim();

  // Índice de enfrentamientos directos acumulados a partir de resultados.json
  // h2h[a][b] = { gf: (de a vs b), gc: (de a vs b) }
  const h2h = {};
  const addH2H = (A, B, gfA, gfB) => {
    const a = norm(A), b = norm(B);
    if (!h2h[a]) h2h[a] = {};
    if (!h2h[a][b]) h2h[a][b] = { gf:0, gc:0 };
    h2h[a][b].gf += (gfA||0);
    h2h[a][b].gc += (gfB||0);
  };

  // Recorremos todas las jornadas/partidos y acumulamos goles
  for (const j of (jornadas||[])) {
    for (const p of (j.partidos||[])) {
      if (!p.local || !p.visitante) continue;
      const gl = Number.isFinite(+p.goles_local) ? +p.goles_local : 0;
      const gv = Number.isFinite(+p.goles_visitante) ? +p.goles_visitante : 0;
      addH2H(p.local, p.visitante, gl, gv);
      addH2H(p.visitante, p.local, gv, gl);
    }
  }

  const diff = e => (e.gf ?? 0) - (e.gc ?? 0);

  equipos.sort((a,b) => {
    // 1) Puntos
    if ((b.pts ?? 0) !== (a.pts ?? 0)) return (b.pts ?? 0) - (a.pts ?? 0);

    // 2) Mayor diferencia de goles en enfrentamientos entre ambos
    //const na = norm(a.nombre), nb = norm(b.nombre);
    //const ha = h2h[na]?.[nb]; // gf/gc de A vs B
    //const hb = h2h[nb]?.[na]; // gf/gc de B vs A (simétrico)
    //if (ha && hb) {
    //  const difA = (ha.gf||0) - (ha.gc||0);
    //  const difB = (hb.gf||0) - (hb.gc||0);
    //  if (difA !== difB) return difB - difA;
    //}

    // 3) Mayor diferencia de goles en todo el campeonato
    const dA = diff(a), dB = diff(b);
    if (dB !== dA) return dB - dA;

    // 4) Mayor número de goles a favor en todo el campeonato
    if ((b.gf ?? 0) !== (a.gf ?? 0)) return (b.gf ?? 0) - (a.gf ?? 0);

    // 5) Orden alfabético
    return a.nombre.localeCompare(b.nombre, 'es', { sensitivity:'base' });
  });

  // Render de la tabla (ajusta el selector a tu HTML)
  document.getElementById('tabla-clasificacion').innerHTML = equipos.map((e,i)=>`
    <tr>
      <td>${i+1}</td>
      <td>${e.nombre}</td>
      <td>${e.pj}</td>
      <td>${e.g}</td>
      <td>${e.e}</td>
      <td>${e.p}</td>
      <td>${e.gf}</td>
      <td>${e.gc}</td>
      <td>${e.pts}</td>
    </tr>
  `).join('');
})();
