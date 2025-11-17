(async () => {
  // URL TSV pública de Google Sheets
  const SHEET_TSV_URL =
    'https://docs.google.com/spreadsheets/d/e/2PACX-1vSg3OTDxmqj6wcbH8N7CUcXVexk9ZahUURCgtSS9JXSEsFPG15rUchwvI2zRulRr0hHSmGZOo_TAXRL/pub?gid=0&single=true&output=tsv';

  const msgEl   = document.getElementById('pichichi-msg');
  const tbody   = document.getElementById('tabla-pichichi-jug');
  const heroEl  = document.getElementById('pichichi-hero');

  if (!tbody) return;

  const setMsg = (t) => { if (msgEl) msgEl.textContent = t || ''; };

  // Normalizadores
  const norm = s => String(s||'')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9\s-]/g,'')
    .trim();

  const slug = s => norm(s).replace(/\s+/g,'-');

  const logoPath = eq => `img/${slug(eq)}.png`;

  // PARA LA FOTO DEL JUGADOR LÍDER:
  // Usa imágenes locales en: img/jugadores/<slug-del-jugador>.jpg
  // Ejemplo: "Leo Messi" -> img/jugadores/leo-messi.jpg
  const playerPhotoPath = nombre => `img/jugadores/${slug(nombre)}.jpg`;

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

  // Chip podio (top 3)
  const podiumChip = (i) => {
    if (i === 0) return '<span class="chip chip-podium chip-p1">TOP 1</span>';
    if (i === 1) return '<span class="chip chip-podium chip-p2">TOP 2</span>';
    if (i === 2) return '<span class="chip chip-podium chip-p3">TOP 3</span>';
    return '';
  };

  function renderHero(top) {
    if (!heroEl || !top) {
      if (heroEl) heroEl.innerHTML = '';
      return;
    }

    const golesPJ = gpp(top.goles, top.pj);
    const foto = playerPhotoPath(top.jugador);

    heroEl.innerHTML = `
      <div class="pichichi-hero-card">
        <div class="pichichi-hero-photo-wrapper">
          <img
            src="${foto}"
            alt="Foto de ${top.jugador}"
            class="pichichi-hero-photo"
            onerror="this.style.visibility='hidden'">
        </div>
        <div class="pichichi-hero-info">
          <div class="pichichi-hero-label">Líder Pichichi</div>
          <h2 class="pichichi-hero-name">${top.jugador}</h2>
          <div class="pichichi-hero-team">
            <span class="pichichi-hero-team-name">${top.equipo}</span>
          </div>
          <div class="pichichi-hero-stats">
            <div class="pichichi-hero-stat">
              <span class="stat-label">Goles</span>
              <span class="stat-value">${top.goles}</span>
            </div>
            <div class="pichichi-hero-stat">
              <span class="stat-label">PJ</span>
              <span class="stat-value">${top.pj}</span>
            </div>
            <div class="pichichi-hero-stat">
              <span class="stat-label">Goles / PJ</span>
              <span class="stat-value">${golesPJ.toFixed(2)}</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // --- Render tabla ---
  function render(rows) {
    // Mapear columnas esperadas de la hoja
    const fullData = rows.map(r => ({
      jugador: r["Jugador"] || '',
      equipo:  r["Equipo"]  || '',
      pj:      toNum(r["Partidos"]),
      goles:   toNum(r["Goles"])
    }))
    // Filtramos registros sin jugador/equipo o sin partidos
    .filter(r => r.jugador && r.equipo && r.pj > 0);

    // Orden: goles → g/pj → pj → jugador
    fullData.sort((a,b)=>{
      if (b.goles !== a.goles) return b.goles - a.goles;
      const ag = gpp(a.goles, a.pj), bg = gpp(b.goles, b.pj);
      if (bg !== ag) return bg - ag;
      if (b.pj !== a.pj) return b.pj - a.pj;
      return a.jugador.localeCompare(b.jugador, 'es', { sensitivity:'base' });
    });

    if (!fullData.length) {
      tbody.innerHTML = '';
      renderHero(null);
      setMsg('No hay datos de goleadores en la hoja.');
      return;
    }

    // Héroe = primer clasificado
    const top = fullData[0];
    renderHero(top);

    // Solo top 30 para la tabla
    const data = fullData.slice(0, 30);

    const rowsHtml = data.map((r,i)=>`
      <tr>
        <td class="jug-pos-cell">${i+1}${podiumChip(i)}</td>
        <td>${r.jugador}</td>
        <td class="team-cell">
          <img class="team-badge"
               src="${logoPath(r.equipo)}"
               alt="Escudo ${r.equipo}"
               onerror="this.style.visibility='hidden'">
          <span>${r.equipo}</span>
        </td>
        <td>${r.pj}</td>
        <td>${r.goles}</td>
        <td>${gpp(r.goles, r.pj).toFixed(2)}</td>
      </tr>
    `).join('');

    tbody.innerHTML = rowsHtml;

    const total = fullData.length;
    const shown = data.length;
    setMsg(`Mostrando top ${shown} goleadores (de ${total} registrados).`);
  }

  // --- Carga TSV ---
  try {
    const res = await fetch(SHEET_TSV_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const { rows } = parseTSV(text);
    render(rows);
  } catch (e) {
    console.error(e);
    setMsg('No se pudo cargar la hoja publicada. Revisa la URL TSV.');
  }
})();
