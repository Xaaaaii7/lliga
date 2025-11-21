(async () => {
  const grid = document.getElementById("clubs-grid");
  if (!grid) return;

  const jornadas = await loadJSON("data/resultados.json").catch(() => []);
  if (!Array.isArray(jornadas) || jornadas.length === 0) {
    grid.innerHTML = `<p style="color:var(--muted)">No hay datos de equipos aún.</p>`;
    return;
  }

  // helpers reutilizados
  const norm = s => String(s||'').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9\s-]/g,'').trim();
  const slug = s => norm(s).replace(/\s+/g,'-');
  const logoPath = (name) => `img/${slug(name)}.png`;

  // Saca equipos desde resultados.json
  const set = new Map();
  for (const j of jornadas) {
    for (const p of (j.partidos || [])) {
      if (p.local) set.set(norm(p.local), p.local);
      if (p.visitante) set.set(norm(p.visitante), p.visitante);
    }
  }

  const equipos = Array.from(set.values())
    .sort((a,b)=> a.localeCompare(b, "es", { sensitivity:"base" }));

  if (!equipos.length) {
    grid.innerHTML = `<p style="color:var(--muted)">No se detectaron equipos.</p>`;
    return;
  }

  grid.innerHTML = equipos.map(eq => {
    const s = slug(eq);
    return `
      <a class="club-card" href="club-${s}.html" aria-label="Entrar a ${eq}">
        <div class="club-badge-wrap">
          <img class="club-badge" src="${logoPath(eq)}" alt="Escudo ${eq}"
               onerror="this.style.visibility='hidden'">
        </div>
        <div class="club-name">${eq}</div>
        <div class="club-cta">Ver club →</div>
      </a>
    `;
  }).join("");
})();
