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
      const { data, error } = await supabase
        .from("users")
        .select("youtube_playlist_id")
        .ilike("nickname", team) // case-insensitive match con el nombre del equipo/manager
        .maybeSingle();

      if (!error && data) {
        playlistId = data.youtube_playlist_id;
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
