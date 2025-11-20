(async () => {
  const API_URL = "https://d39ra5ecf4.execute-api.eu-west-1.amazonaws.com/prod/live-channel";
  const PARENT_DOMAIN = "xaaaaii7.github.io";

  const container = document.getElementById("stream-container");
  if (!container) return;

  const setLoading = () => {
    container.innerHTML = `<p class="directo-status">Cargando stream...</p>`;
  };

  const setNoLive = () => {
    container.innerHTML = `
      <p class="directo-status">
        <span class="chip chip-ended">Sin directo ahora mismo</span><br>
        Ahora mismo ningún canal de la lliga está en directo 😴
      </p>
    `;
  };

  const setError = () => {
    container.innerHTML = `
      <p class="directo-status">
        No se ha podido cargar el stream.
      </p>
    `;
  };

  setLoading();

  try {
    const res = await fetch(API_URL, { cache: "no-store" });
    if (!res.ok) throw new Error("Error al llamar a la API");

    const data = await res.json();

    if (data && data.channel) {
      const ch = data.channel;

      container.innerHTML = `
        <div class="video-frame live-video-frame">
          <iframe
            class="video"
            src="https://player.twitch.tv/?channel=${encodeURIComponent(ch)}&parent=${encodeURIComponent(PARENT_DOMAIN)}"
            allowfullscreen
            loading="lazy"
            referrerpolicy="no-referrer-when-downgrade">
          </iframe>
        </div>
        <p class="directo-status">
          <span class="chip chip-live">EN DIRECTO</span>
          Canal: ${ch}
        </p>
      `;
    } else {
      setNoLive();
    }
  } catch (err) {
    console.error(err);
    setError();
  }
})();
