(async () => {
  const root = document.getElementById('jornada');
  if (!root) return;

  const jornadasRaw = await loadJSON('data/jornada.json').catch(() => null);
  if (!Array.isArray(jornadasRaw) || !jornadasRaw.length) {
    root.innerHTML = '<p style="text-align:center;color:#9fb3c8">No hay jornadas configuradas todavía.</p>';
    return;
  }

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

  const render = () => {
    const j = jornadas[currentIndex];
    if (!j) return;

    const num = j.jornada ?? (currentIndex + 1);
    if (label) label.textContent = `Jornada ${num}`;

    // Vídeo: marco chulo + iframe o "Próximamente"
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

    // Encuesta (solo si hay poll.embed_url)
    const pollHtml = j.poll?.embed_url
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

    // Ganador de la votación (opcional, se rellena en jornada.json)
    // Ejemplo en JSON:
    // "poll": { "embed_url": "...", "winner": "Nombre jugador", "winner_detail": "Equipo / gol minuto 80" }
    const winnerName   = j.poll?.winner;
    const winnerDetail = j.poll?.winner_detail;

    const winnerHtml = winnerName
      ? `
        <div class="poll-winner">
          <div class="poll-winner-label">Ganador votación</div>
          <div class="poll-winner-name">${winnerName}</div>
          ${winnerDetail ? `<div class="poll-winner-detail">${winnerDetail}</div>` : ''}
        </div>
      `
      : '';

    root.innerHTML = `
      <section class="jornada-bloque">
        <h2>Gol de la jornada ${num}</h2>
        ${videoHtml}
        ${pollHtml}
        ${winnerHtml}
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
