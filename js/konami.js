(async () => {
  // Estructura base
  const defaultData = { jugadores: [] };

  // Carga JSON (si no existe, arranca vacío)
  let data = defaultData;
  try {
    const loaded = await loadJSON('data/konami_ids.json');
    if (loaded && Array.isArray(loaded.jugadores)) data = loaded;
  } catch { /* vacío */ }

  const body = document.getElementById('ids-body');
  const btnAdd = document.getElementById('add-row');
  const btnDl  = document.getElementById('download-json');

  const render = () => {
    if (!data.jugadores.length) {
      body.innerHTML = `<tr><td colspan="4" class="muted" style="text-align:center;padding:12px">No hay jugadores aún</td></tr>`;
      return;
    }
    body.innerHTML = data.jugadores.map((j, i) => `
      <tr data-i="${i}">
        <td><input type="text" value="${j.equipo ?? ''}" placeholder="Equipo"></td>
        <td><input type="text" value="${j.nombre ?? ''}" placeholder="Jugador"></td>
        <td><input type="text" value="${j.konami_id ?? ''}" placeholder="ID numérico"></td>
        <td style="width:1%"><button class="del">🗑️</button></td>
      </tr>
    `).join('');

    // Bind cambios
    body.querySelectorAll('tr').forEach(tr => {
      const i = +tr.dataset.i;
      const [eqInp, nomInp, idInp] = tr.querySelectorAll('input');

      const save = () => {
        data.jugadores[i].equipo = eqInp.value.trim();
        data.jugadores[i].nombre = nomInp.value.trim();
        const raw = idInp.value.trim();
        data.jugadores[i].konami_id = raw === '' ? null : raw; // dejamos string por si llevan guiones
      };
      eqInp.addEventListener('input', save);
      nomInp.addEventListener('input', save);
      idInp.addEventListener('input', save);

      tr.querySelector('.del').addEventListener('click', () => {
        data.jugadores.splice(i, 1);
        render();
      });
    });
  };

  btnAdd.addEventListener('click', () => {
    data.jugadores.push({ equipo: '', nombre: '', konami_id: null });
    render();
  });

  btnDl.addEventListener('click', () => {
    // Validación simple: duplicados jugador+equipo
    const seen = new Set();
    for (const j of data.jugadores) {
      const key = `${(j.equipo||'').toLowerCase()}@@${(j.nombre||'').toLowerCase()}`;
      if (seen.has(key)) {
        alert(`Duplicado: ${j.nombre} (${j.equipo})`);
        return;
      }
      seen.add(key);
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'konami_ids.json';
    a.click();
    URL.revokeObjectURL(a.href);
  });

  render();
})();
