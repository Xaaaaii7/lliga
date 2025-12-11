(async () => {
  const grid = document.getElementById("clubs-grid");
  if (!grid) return;

  // Aseguramos que CoreStats esté cargado
  if (!window.CoreStats) {
    grid.innerHTML = `<p style="color:var(--muted)">No se pudo inicializar CoreStats.</p>`;
    return;
  }

  const { norm, slug } = CoreStats;

  // Cargamos jornadas desde CoreStats (Supabase + fallback JSON)
  const jornadas = await CoreStats.getResultados().catch(() => []);
  if (!Array.isArray(jornadas) || jornadas.length === 0) {
    grid.innerHTML = `<p style="color:var(--muted)">No hay datos de equipos aún.</p>`;
    return;
  }

  const logoPath = (name) => `img/${slug(name)}.png`;

  // Saca equipos desde las jornadas (igual que antes, pero usando datos del core)
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

  grid.innerHTML = equipos.map(eq => `
    <a class="club-card" href="club.html?team=${encodeURIComponent(eq)}" aria-label="Entrar a ${eq}">
      <div class="club-badge-wrap">
        <img class="club-badge" src="${logoPath(eq)}" alt="Escudo ${eq}"
             onerror="this.style.visibility='hidden'">
      </div>
      <div class="club-name">${eq}</div>
      <div class="club-cta">Ver club →</div>
    </a>
  `).join("");
})();
