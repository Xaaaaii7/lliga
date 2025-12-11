import { loadLeagueTeams } from './modules/db-helpers.js';
import { slugify } from './modules/utils.js';

(async () => {
  const root = document.getElementById('equipos');
  if (!root) return;

  try {
    // Usar el nuevo helper para cargar equipos
    const teams = await loadLeagueTeams({
      select: 'id, nickname, display_name, club:clubs(name)',
      orderByNickname: true
    });

    if (!teams || !teams.length) {
      root.innerHTML = '<p style="text-align:center;color:#9fb3c8">No hay equipos registrados para esta temporada.</p>';
      return;
    }

    root.innerHTML = `
      <section class="equipos-lista">
        <div class="team-grid">
          ${teams.map(t => {
      const name = t.nickname || t.display_name || (t.club && t.club.name) || 'Equipo';
      const link = `equipo.html?team=${encodeURIComponent(slugify(name))}`;
      const imgPath = `img/${slugify(name)}.png`;

      return `
              <a class="player-card" href="${link}">
                <div class="player-photo-wrapper" style="margin: 0 auto 10px; width: 80px; height: 80px;">
                   <img src="${imgPath}" alt="${name}" style="width:100%; height:100%; object-fit:contain;" onerror="this.style.visibility='hidden'">
                </div>
                <h4 style="text-align:center;">${name}</h4>
              </a>`;
    }).join('')}
        </div>
      </section>`;

  } catch (err) {
    console.error('Error cargando equipos:', err);
    root.innerHTML = '<p style="text-align:center;color:#9fb3c8">Error cargando los equipos.</p>';
  }
})();
