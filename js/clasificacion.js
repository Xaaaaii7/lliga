(async () => {
  // Carga segura
  const clasifData = await loadJSON('data/clasificacion.json').catch(() => ({ equipos: [] }));
  let equipos = Array.isArray(clasifData.equipos) ? clasifData.equipos.slice() : [];

  // Normaliza/corrige tipos numéricos y strings
  const toNum = v => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };
  equipos = equipos.map(e => ({
    nombre: String(e?.nombre ?? '').trim() || '—',
    pj: toNum(e?.pj),
    g:  toNum(e?.g),
    e:  toNum(e?.e),
    p:  toNum(e?.p),
    gf: toNum(e?.gf),
    gc: toNum(e?.gc),
    pts:toNum(e?.pts)
  }));

  const diff = e => (e.gf - e.gc);

  // Orden: PTS → DIF general → GF → nombre
  equipos.sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts;
    const dA = diff(a), dB = diff(b);
    if (dA !== dB) return dB - dA;
    if (b.gf !== a.gf) return b.gf - a.gf;
    return a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' });
  });

  // Render seguro
  const tbody = document.getElementById('tabla-clasificacion');
  if (!tbody) {
    console.error('[clasificacion] Falta <tbody id="tabla-clasificacion"> en el HTML.');
    return;
  }

  tbody.innerHTML = equipos.map((e, i) => `
    <tr>
      <td>${i + 1}</td>
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

  // Debug opcional (ver en consola)
  console.table(equipos);
})();
