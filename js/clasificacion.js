(async () => {
  const tbody = document.getElementById('tabla-clasificacion');
  if (!tbody) return;

  // Helper para mostrar mensaje en la tabla
  const showMsg = (txt) => {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;color:#9fb3c8;padding:14px">${txt}</td></tr>`;
  };

  // Aviso si se abre como file:// (fetch falla en local)
  if (location.protocol === 'file:') {
    showMsg('⚠️ Abre con un servidor local (p. ej. VS Code Live Server) para cargar clasificacion.json.');
  }

  // Carga segura (con logs)
  let clasifData = { equipos: [] };
  try {
    clasifData = await loadJSON('data/clasificacion.json');
  } catch (e) {
    console.error('[clasificacion] No se pudo cargar data/clasificacion.json', e);
    showMsg('No se pudo cargar la clasificación.');
    return;
  }

  // Coerción numérica
  const num = v => Number.isFinite(+v) ? +v : 0;

  let equipos = Array.isArray(clasifData.equipos) ? clasifData.equipos.slice() : [];
  equipos = equipos.map(e => ({
    nombre: String(e?.nombre ?? '').trim() || '—',
    pj:  num(e?.pj),
    g:   num(e?.g),
    e:   num(e?.e),
    p:   num(e?.p),
    gf:  num(e?.gf),
    gc:  num(e?.gc),
    pts: num(e?.pts)
  }));

  if (!equipos.length) {
    console.warn('[clasificacion] equipos[] vacío en clasificacion.json');
    showMsg('No hay datos de clasificación aún.');
    return;
  }

  const dg = e => e.gf - e.gc;

  // Orden: Pts → DG → GF → nombre
  equipos.sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts;
    const dA = dg(a), dB = dg(b);
    if (dA !== dB) return dB - dA;
    if (b.gf !== a.gf) return b.gf - a.gf;
    return a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' });
  });

  // Render
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
      <td>${dg(e)}</td>
      <td>${e.pts}</td>
    </tr>
  `).join('');
})();
