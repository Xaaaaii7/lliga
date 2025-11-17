(async () => {
  const root = document.getElementById('jornada');
  if (!root) return;

  const jornadasRaw = await loadJSON('data/jornada.json').catch(() => null);
  if (!Array.isArray(jornadasRaw) || !jornadasRaw.length) {
    root.innerHTML = '<p style="text-align:center;color:#9fb3c8">No hay jornadas configuradas todavía.</p>';
    return;
  }

  // Helpers para slugs, escudos y fotos
  const norm = s => String(s||'')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9\s-]/g,'')
    .trim();

  const slug = s => norm(s).replace(/\s+/g,'-');

  const logoPath = eq => `img/${slug(eq)}.png`;
  const playerPhotoPath = nombre => `img/jugadores/${slug(nombre)}.jpg`;

  // Ordenamos por número de jornada (por si el JSON no viene ordenado)
  const jornadas = jornadasRaw.slice().sort((a,b) => (a.jornada || 0) - (b.jornada || 0));

  // Índice actual: última jornada por defecto
  let currentIndex = jornadas.length - 1;

  // Crear navegación de jornadas (◀ Jornada X ▶) encima del contenido
  const navWrap = document.createElement('div');
  navWrap.className = 'jornada-nav';
  navWrap.innerHTML = `
    <button id="prevJornada" class="nav-btn" type="button">◀</button>
    <span id="jornadaLabel" class="jornada-label chip"></span>
    <button id="nextJornada" class="nav-btn" type="button">▶</button>
  `;
  root.insertAdjacentElement('beforebegin', navWrap);

  const prevBtn = navWrap.querySelector('#prevJornada');
  const nextBtn = navWrap.querySelector('#nextJornada');
  const label   = navWrap.querySelector('#jornadaLabel');

  // Hero de ganador (si existe)
  function renderWinnerHero(j, num) {
    const poll = j.poll || {};
    const winnerName   = poll.winner;
    if (!winnerName) return '';

    const teamName     = poll.winner_team || poll.team || '';
    const detail       = poll.winner_detail;

    const fotoJugador  = playerPhotoPath(winnerName);
    const escudoTeam   = teamName ? logoPath(teamName) : null;

    return `
      <div class="jornada-winner-hero">
        <div class="jornada-winner-hero-card">
          <div class="jornada-winner-photo-wrapper">
            <img
              src="${fotoJugador}"
              alt="Foto de ${winnerName}"
              class="jornada-winner-photo"
              onerror="this.style.visibility='hidden'">
          </div>
          <div class="jornada-winner-info">
            <div class="jornada-winner-label">
              Ganador votación · Jornada ${num}
            </div>
            <h3 class="jornada-winner-name">${winnerName}</h3>

            ${teamName ? `
              <div class="jornada-winner-team">
                <div class="jornada-winner-team-inner">
                  ${escudoTeam ? `
                    <img
                      src="${escudoTeam}"
                      alt="Escudo ${teamName}"
                      class="jornada-winner-team-logo"
                      onerror="this.style.visibility='hidden'">
                  ` : ''}
                  <span class="jornada-winner-team-name">${teamName}</span>
                </div>
              </div>
            ` : ''}

            ${detail ? `
              <div class="jornada-winner-detail">
                ${detail}
              </div>
            ` : ''}
          </div>
        </div>
      </div>
    `;
  }

  const render = () => {
    const j = jornadas[currentIndex];
    if (!j) return;

    const num = j.jornada ?? (currentIndex + 1);
    if (label) label.textContent = `Jornada ${num}`;

    const hasWinner = !!j.poll?.winner;

    // Vídeo con marco
    const videoHtml = j.gol_youtube
      ? `
        <div class="video-frame">
          <iframe
            class="video"
            src="https://www.youtube.com/embed/${j.gol_youtube}"
            allowfullscreen
            loading="lazy"
            referrerpolicy="no-referrer-when-downgrade">
          </iframe>
        </div>
      `
      : '<p>Próximamente…</p>';

    // Encuesta: solo si NO hay ganador
    const pollHtml = (!hasWinner && j.poll?.embed_url)
      ? `
        <div class="poll-wrap">
          <h3 style="margin:16px 0 8px">Vota el mejor gol</h3>
          <div class="poll-frame">
            <iframe
              src="${j.poll.embed_url}"
              loading="lazy"
              referrerpolicy="no-referrer-when-downgrade"
              allowtransparency="true">
            </iframe>
          </div>
          <p class="poll-note">* Voto limitado por IP y navegador.</p>
        </div>
      `
      : '';

    // Hero de ganador (si hay winner en JSON)
    const winnerHeroHtml = hasWinner ? renderWinnerHero(j, num) : '';

    root.innerHTML = `
      <section class="jornada-bloque">
        <h2>Gol de la jornada ${num}</h2>
        ${videoHtml}
        ${pollHtml}
        ${winnerHeroHtml}
      </section>
    `;

    // Botones prev/next
    if (prevBtn) prevBtn.disabled = currentIndex <= 0;
    if (nextBtn) nextBtn.disabled = currentIndex >= jornadas.length - 1;
  };

  // Listeners navegación
  prevBtn?.addEventListener('click', () => {
    if (currentIndex > 0) {
      currentIndex--;
      render();
    }
  });
  nextBtn?.addEventListener('click', () => {
    if (currentIndex < jornadas.length - 1) {
      currentIndex++;
      render();
    }
  });

  // Render inicial (última jornada)
  render();
})();
