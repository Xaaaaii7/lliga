(async () => {
  const msgEl = document.getElementById("videos-msg");
  const embedEl = document.getElementById("playlist-embed");
  if (!msgEl || !embedEl) return;

  // helper para leer query ?team=
  const params = new URLSearchParams(location.search);
  const team = params.get("team");
  if (!team) {
    msgEl.textContent = "No se ha indicado equipo.";
    return;
  }

  const playlistName = `Liga Voll Damm - ${team}`;

  // carga playlists.json
  // Carga desde Supabase
  let playlistId = null;
  const { getSupabaseClient } = window.AppUtils || {};

  if (getSupabaseClient) {
    try {
      const supabase = await getSupabaseClient();
      const season = (window.AppUtils && window.AppUtils.getActiveSeason)
        ? window.AppUtils.getActiveSeason()
        : (window.AppUtils.getSupabaseConfig().season || '');

      // Traer todos los equipos de la temporada con su user asociado
      let query = supabase
        .from("league_teams")
        .select(`
          nickname,
          display_name,
          user:users!user_id(youtube_playlist_id)
        `);

      if (season) {
        query = query.eq('season', season);
      }

      const { data, error } = await query;

      if (!error && data) {
        // Helper de slug local si no está en scope
        const slug = (window.AppUtils && window.AppUtils.slugify)
          ? window.AppUtils.slugify
          : (s => String(s).toLowerCase().replace(/\s+/g, '-'));

        const target = (team || '').toLowerCase();

        // Buscar coincidencia por slug de nickname O display_name
        const found = data.find(row => {
          const sNick = slug(row.nickname || '');
          const sDisp = slug(row.display_name || '');
          // Probamos match exacto del slug (ej: "milan" == "milan")
          return sNick === target || sDisp === target;
        });

        if (found && found.user) {
          // found.user puede ser array o objeto segun relacion
          const u = Array.isArray(found.user) ? found.user[0] : found.user;
          if (u && u.youtube_playlist_id) {
            playlistId = u.youtube_playlist_id;
          }
        }
      }
    } catch (e) {
      console.warn("Error cargando playlist desde DB:", e);
    }
  }

  // Si no tenemos ID, mostramos error (sin fallback a JSON)
  if (!playlistId) {
    msgEl.innerHTML = `
      <p style="color:var(--muted)">
        No hay playlist configurada para <b>${team}</b>.
      </p>
    `;
    return;
  }

  // Ya tenemos el ID, seguimos...
  // (Eliminamos la parte vieja de playlists[playlistName])



  // pinta embed de playlist
  msgEl.textContent = "";
  embedEl.innerHTML = `
    <div class="playlist-card">
      <div class="playlist-head">
        <div class="playlist-title">${playlistName}</div>
        <a class="playlist-link"
           href="https://www.youtube.com/playlist?list=${playlistId}"
           target="_blank" rel="noopener">
          Ver en YouTube →
        </a>
      </div>

      <div class="playlist-iframe-wrap">
        <iframe
          class="playlist-iframe"
          src="https://www.youtube.com/embed/videoseries?list=${playlistId}"
          title="${playlistName}"
          frameborder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowfullscreen>
        </iframe>
      </div>
    </div>
  `;
})();
