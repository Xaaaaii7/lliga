(async () => {
  let data = { jugadores: [] };
  try {
    const loaded = await loadJSON('data/konami_ids.json');
    if (loaded && Array.isArray(loaded.jugadores)) data = loaded;
  } catch { /* vacío */ }

  const body = document.getElementById('ids-body');
  if (!data.jugadores.length) {
    body.innerHTML = `<tr><td colspan="3" class="muted">No hay jugadores definidos.</td></tr>`;
    return;
  }

  body.innerHTML = data.jugadores.map(j => `
    <tr>
      <td>${j.equipo || ''}</td>
      <td>${j.nombre || ''}</td>
      <td>${j.konami_id ?? '—'}</td>
    </tr>
  `).join('');
})();
