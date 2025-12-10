(async () => {
  const root = document.getElementById('jornada');
  if (!root) return;

  // Import navigation helper
  const { createNavigationControls } = await import('./modules/navigation.js');

  // Helpers utilidades (loadJSON ya no es principal, usamos getSupabaseClient)
  const AppUtils = window.AppUtils || {};
  const { getSupabaseClient } = AppUtils;

  if (typeof getSupabaseClient !== 'function') {
    root.innerHTML = `
      <p style="text-align:center;color:#9fb3c8">
        Error de configuración: falta AppUtils.getSupabaseClient para cargar jornadas.
      </p>`;
    return;
  }

  // Carga de jornadas desde Supabase
  let jornadasCfg = [];
  try {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('jornadas_config')
      .select('*')
      .order('jornada', { ascending: true });

    if (error) throw error;

    // Mapear de estructura plana (DB) a estructura anidada (antiguo JSON)
    // para no romper la lógica de render existente
    jornadasCfg = (data || []).map(row => ({
      jornada: row.jornada,
      gol_youtube: row.gol_youtube,
      poll: {
        embed_url: row.poll_embed_url,
        winner: row.winner,
        winner_team: row.winner_team,
        winner_detail: row.winner_detail
      }
    }));

  } catch (err) {
    console.error("Error cargando jornadas desde Supabase:", err);
    root.innerHTML = '<p style="text-align:center;color:#9fb3c8">Error cargando las jornadas.</p>';
    return;
  }

  if (!Array.isArray(jornadasCfg) || !jornadasCfg.length) {
    root.innerHTML = '<p style="text-align:center;color:#9fb3c8">No hay jornadas configuradas todavía.</p>';
    return;
  }

  // Helpers de rutas (desde Core)
  const slug = CoreStats.slug;
  const logoPath = eq => `img/${slug(eq)}.png`;
  const playerPhotoPath = nombre => `img/jugadores/${slug(nombre)}.jpg`;

  // ==========================
  //   PRECALCULAR MVP JORNADA
  // ==========================
  const mvpPorJornada = Object.create(null);

  try {
    const nums = jornadasCfg
      .map(j => j.jornada)
      .filter(n => Number.isFinite(+n))
      .map(n => +n);

    const uniques = Array.from(new Set(nums));

    const results = await Promise.all(
      uniques.map(n => CoreStats.computeMvpPorJornada(n))
    );

    results.forEach(r => {
      if (r && r.jornada != null && r.winner) {
        mvpPorJornada[r.jornada] = r.winner;
      }
    });
  } catch (e) {
    console.warn("No se pudo calcular MVP por jornada:", e);
  }

  // ==========================
  //   ORDENAMOS jornadas cfg
  // ==========================
  const jornadas = jornadasCfg.slice().sort((a, b) =>
    (a.jornada || 0) - (b.jornada || 0)
  );
  let currentIndex = jornadas.length - 1; // última jornada por defecto

  // ==========================
  //   NAV jornadas ◀ Jx ▶
  // ==========================
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
  const label = navWrap.querySelector('#jornadaLabel');

  // ==========================
  //   HERO ganador votación
  // ==========================
  function renderWinnerHero(jCfg, num) {
    const poll = jCfg.poll || {};
    const winnerName = poll.winner;
    if (!winnerName) return '';

    const teamName = poll.winner_team || poll.team || '';
    const detail = poll.winner_detail;

    const fotoJugador = playerPhotoPath(winnerName);
    const escudoTeam = teamName ? logoPath(teamName) : null;

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
            <div class="jornada-winner-label">Ganador votación · Jornada ${num}</div>
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

            ${detail ? `<div class="jornada-winner-detail">${detail}</div>` : ''}
          </div>
        </div>
      </div>
    `;
  }

  // ==========================
  //   HERO MVP equipo jornada
  // ==========================
  function renderMvpHero(num) {
    const best = mvpPorJornada[num];
    if (!best) return '';

    const puntos = (best.mvpScore * 100).toFixed(1);
    const escudo = logoPath(best.nombre);

    return `
      <div class="jornada-mvp-hero">
        <div class="jornada-mvp-card">
          <div class="jornada-mvp-logo-wrap">
            <img
              src="${escudo}"
              alt="Escudo ${best.nombre}"
              class="jornada-mvp-logo"
              onerror="this.style.visibility='hidden'">
          </div>
          <div class="jornada-mvp-info">
            <div class="jornada-mvp-label">MVP equipo · Jornada ${num}</div>
            <div class="jornada-mvp-name">${best.nombre}</div>
            <div class="jornada-mvp-meta">
              GF ${best.gf} · GC ${best.gc} · Puntuación MVP: ${puntos}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // ==========================
  //   RENDER PRINCIPAL
  // ==========================
  const render = () => {
    const jCfg = jornadas[currentIndex];
    if (!jCfg) return;

    const num = jCfg.jornada ?? (currentIndex + 1);
    if (label) label.textContent = `Jornada ${num}`;

    const hasWinner = !!jCfg.poll?.winner;

    // Vídeo con marco
    const videoHtml = jCfg.gol_youtube
      ? `
        <div class="video-frame">
          <iframe
            class="video"
            src="https://www.youtube.com/embed/${jCfg.gol_youtube}"
            allowfullscreen
            loading="lazy"
            referrerpolicy="no-referrer-when-downgrade">
          </iframe>
        </div>
      `
      : '<p>Próximamente…</p>';

    // Poll solo si NO hay winner
    const pollHtml = (!hasWinner && jCfg.poll?.embed_url)
      ? `
        <div class="poll-wrap">
          <h3 style="margin:16px 0 8px">Vota el mejor gol</h3>
          <div class="poll-frame">
            <iframe
              src="${jCfg.poll.embed_url}"
              loading="lazy"
              referrerpolicy="no-referrer-when-downgrade"
              allowtransparency="true">
            </iframe>
          </div>
          <p class="poll-note">* Voto limitado por IP y navegador.</p>
        </div>
      `
      : '';

    const winnerHeroHtml = hasWinner ? renderWinnerHero(jCfg, num) : '';
    const mvpHeroHtml = renderMvpHero(num);

    root.innerHTML = `
      <section class="jornada-bloque">
        <h2>Gol de la jornada ${num}</h2>
        ${videoHtml}
        ${pollHtml}
        ${winnerHeroHtml}
        ${mvpHeroHtml}
      </section>
    `;

    if (prevBtn) prevBtn.disabled = currentIndex <= 0;
    if (nextBtn) nextBtn.disabled = currentIndex >= jornadas.length - 1;
  };

  // Create navigation controls
  createNavigationControls({
    prevBtn,
    nextBtn,
    labelEl: label,
    minValue: 0,
    maxValue: jornadas.length - 1,
    initialValue: jornadas.length - 1,
    onUpdate: (newValue) => {
      currentIndex = newValue;
      render();
    },
    formatLabel: (val) => `Jornada ${jornadas[val]?.jornada ?? val + 1}`
  });

  render(); // inicial
})();
