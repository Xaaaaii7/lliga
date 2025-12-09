// js/club-videos.js
(async () => {
  const msgEl   = document.getElementById("videos-msg");
  const embedEl = document.getElementById("playlist-embed");

  if (!msgEl || !embedEl) {
    console.warn("[club-videos] No se han encontrado videos-msg o playlist-embed");
    return;
  }

  // 1) Leemos el equipo: preferimos el global CLUB_NAME y si no, querystring
  const params   = new URLSearchParams(location.search);
  const qsTeam   = params.get("team");
  const globalTeam = window.CLUB_NAME || null;
  const team = globalTeam || qsTeam;

  console.log("[club-videos] team (global/query):", { globalTeam, qsTeam, team });

  if (!team) {
    msgEl.textContent = "No se ha indicado equipo.";
    return;
  }

  const playlistName = `Liga Voll Damm - ${team}`;

  // 2) Preparamos acceso a Supabase
  const AppUtils = window.AppUtils || {};
  const getSupabaseClient = AppUtils.getSupabaseClient;

  if (typeof getSupabaseClient !== "function") {
    console.warn("[club-videos] No hay AppUtils.getSupabaseClient disponible");
    msgEl.innerHTML = `
      <p style="color:var(--muted)">
        No se ha podido cargar la playlist de <b>${team}</b> (Supabase no está disponible).
      </p>
    `;
    return;
  }

  let playlistId = null;

  try {
    const supabase = await getSupabaseClient();

    console.log("[club-videos] Lanzando query a Supabase para team:", team);

    const { data, error } = await supabase
      .from("users")
      .select("nickname, youtube_playlist_id")
      .ilike("nickname", team) // case-insensitive exact match
      .maybeSingle();

    console.log("[club-videos] Resultado Supabase:", { data, error });

    if (error) {
      console.warn("[club-videos] Error en query a Supabase:", error);
    } else if (data && data.youtube_playlist_id) {
      playlistId = data.youtube_playlist_id;
    }
  } catch (e) {
    console.warn("[club-videos] Excepción cargando playlist desde DB:", e);
  }

  // 3) Si no tenemos ID, mostramos mensaje
  if (!playlistId) {
    msgEl.innerHTML = `
      <p style="color:var(--muted)">
        No hay playlist configurada para <b>${team}</b>.
      </p>
    `;
    return;
  }

  // 4) Pintamos el embed
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
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowfullscreen>
        </iframe>
      </div>
    </div>
  `;
})();
