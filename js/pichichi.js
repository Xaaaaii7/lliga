(async () => {
  // ✅ URL TSV
  const SHEET_TSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSg3OTDxmqj6wcbH8N7CUcXVexk9ZahUURCgtSS9JXSEsFPG15rUchwvI2zRulRr0hHSmGZOo_TAXRL/pub?gid=0&single=true&output=tsv';

  const msg   = (t) => document.getElementById('pichichi-msg').textContent = t || '';
  const tbody = document.getElementById('tabla-pichichi-jug');
  const infoEl = document.getElementById('sheet-info');

  // ✅ CAPTURAR EL INPUT CORRECTO
  const maxPJInput = document.getElementById('max-pj');

  if (!tbody) return;

  // Normalizador para filename → img/<equipo>.png
  const norm = s => String(s||'')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9\s-]/g,'')
    .trim()
    .replace(/\s+/g,'-');

  const logoPath = eq => `img/${norm(eq)}.png`;

  // --- Parser TSV ---
  function parseTSV(text) {
    const lines = text.replace(/\r/g,'').split('\n').filter(l => l.trim().length);
    if (!lines.length) return { headers: [], rows: [] };
    const headers = lines[0].split('\t').map(h => h.trim());
    const rows = lines.slice(1).map(line => {
      const cols = line.split('\t');
      const obj = {};
      headers.forEach((h, i) => obj[h] = (cols[i] ?? '').trim());
      return obj;
    });
    return { headers, rows };
  }

  const toNum = (v) => {
    if (v == null || v === '') return 0;
    const n = parseFloat(String(v).replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  };

  const gpp = (g, pj) => pj > 0 ? (g / pj) : 0;

  // --- Render tabla ---
  function render(rows) {
    const maxPJ = Math.max(0, parseInt(maxPJInput.value || '9999', 10));

    const data = rows.map(r => ({
      jugador: r["Jugador"] || '',
      equipo:  r["Equipo"]  || '',
      pj:      toNum(r["Partidos"]),
      goles:   toNum(r["Goles"])
    }))
    .filter(r => r.jugador && r.equipo && r.pj <= maxPJ);

    // Orden: goles → g/pj → pj → nombre
    data.sort((a,b)=>{
      if (b.goles !== a.goles) return b.goles - a.goles;
      const ag = gpp(a.goles, a.pj), bg = gpp(b.goles, b.pj);
      if (bg !== ag) return bg - ag;
      if (b.pj !== a.pj) return b.pj - a.pj;
      return a.jugador.localeCompare(b.jugador, 'es', { sensitivity:'base' });
    });

    if (!data.length) {
      tbody.innerHTML = '';
      msg('No hay datos que cumplan el filtro.');
      return;
    }

    msg('');
    tbody.innerHTML = data.map((r,i)=>`
      <tr>
        <td>${i+1}</td>
        <td>${r.jugador}</td>

        <td class="team-cell">
          <img class="team-badge" src="${logoPath(r.equipo)}"
               alt="Escudo ${r.equipo}"
               onerror="this.style.visibility='hidden'">
          <span>${r.equipo}</span>
        </td>

        <td>${r.pj}</td>
        <td>${r.goles}</td>
        <td>${gpp(r.goles, r.pj).toFixed(2)}</td>
      </tr>
    `).join('');
  }

  // --- Carga TSV ---
  try {
    const res = await fetch(SHEET_TSV_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const { headers, rows } = parseTSV(text);

    infoEl.textContent = `Columnas detectadas: ${headers.join(', ')}`;
    render(rows);

    // ✅ Listener correcto
    maxPJInput.addEventListener('input', ()=> render(rows));
  } catch (e) {
    console.error(e);
    msg('No se pudo cargar la hoja publicada. Revisa la URL TSV.');
  }
})();
