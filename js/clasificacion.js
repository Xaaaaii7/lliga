(async () => {
  // Carga segura
  const clasifData = await loadJSON('data/clasificacion.json').catch(() => ({ equipos: [] }));
  let equipos = Array.isArray(clasifData.equipos) ? clasifData.equipos.slice() : [];

  // Coerción numérica
  const num = v => Number.isFinite(+v) ? +v : 0;
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

  // Diferencia de goles
  const dg = e => e.gf - e.gc;

  // Orden actual: Pts → DG → GF → nombre (alfabético)
  equipos.sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts;
    const dA = dg(a), dB = dg(b);
    if (dA !== dB) return dB - dA;
    if (b.gf !== a.gf) return b.gf - a.gf;
    return a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' });
  });

  // Render con columna DG incluida (coincide con tus <th>)
  const tbody = document.getElementById('tabla-clasificacion');
  if (!tbody) return console.error('Falta #tabla-clasificacion');
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
