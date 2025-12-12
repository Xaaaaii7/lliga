import { getCompetitionFromURL, getCurrentCompetitionSlug, buildURLWithCompetition } from '../modules/competition-context.js';

(async () => {
  const grid = document.getElementById("clubs-grid");
  if (!grid) return;

  // Obtener contexto de competición
  let competitionSlug = getCompetitionFromURL();
  if (!competitionSlug) {
    try {
      competitionSlug = await getCurrentCompetitionSlug();
    } catch (e) {
      console.debug('No se pudo obtener competitionSlug:', e);
    }
  }

  // Aseguramos que CoreStats esté cargado
  if (!window.CoreStats) {
    grid.innerHTML = `<p style="color:var(--muted)">No se pudo inicializar CoreStats.</p>`;
    return;
  }

  const { norm, slug } = CoreStats;

  // Cargamos jornadas desde CoreStats (Supabase + fallback JSON)
  // Pasar competitionId si está disponible
  let competitionId = null;
  if (competitionSlug) {
    try {
      const { getCompetitionBySlug } = await import('../modules/competition-data.js');
      const competition = await getCompetitionBySlug(competitionSlug);
      if (competition) {
        competitionId = competition.id;
      }
    } catch (e) {
      console.debug('No se pudo obtener competitionId:', e);
    }
  }

  const jornadas = await CoreStats.getResultados(competitionId).catch(() => []);
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

  grid.innerHTML = equipos.map(eq => {
    // Construir URL con parámetro de competición si existe
    const clubUrl = buildURLWithCompetition('club.html', competitionSlug, { team: eq });
    return `
    <a class="club-card" href="${clubUrl}" aria-label="Entrar a ${eq}">
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
