const API_URL = "https://d39ra5ecf4.execute-api.eu-west-1.amazonaws.com/prod/live-channel";
const PARENT_DOMAIN = "xaaaaii7.github.io";

// Llama a la Lambda y devuelve array de nicks en directo
async function fetchLiveChannels() {
  try {
    const res = await fetch(API_URL, { cache: "no-store" });
    if (!res.ok) {
      console.error("Error al llamar a la API:", res.status);
      return [];
    }

    const data = await res.json();
    if (!data || !Array.isArray(data.channels)) return [];
    return data.channels;
  } catch (e) {
    console.error("Error de red/API:", e);
    return [];
  }
}

// Pone un canal en el iframe principal
function setMainStream(channel) {
  const container = document.getElementById("main-stream");
  const statusEl  = document.getElementById("main-stream-status");
  if (!container) return;

  if (!channel) {
    container.innerHTML = "";
    if (statusEl) {
      statusEl.textContent = "Ahora mismo no hay ningún canal en directo.";
    }
    return;
  }

  container.innerHTML = `
    <div class="video-frame live-video-frame">
      <iframe
        class="video"
        src="https://player.twitch.tv/?channel=${encodeURIComponent(channel)}&parent=${encodeURIComponent(PARENT_DOMAIN)}"
        allowfullscreen
        loading="lazy"
        referrerpolicy="no-referrer-when-downgrade">
      </iframe>
    </div>
  `;

  if (statusEl) {
    statusEl.innerHTML = `
      <span class="chip chip-live">EN DIRECTO</span>
      Canal: ${channel}
    `;
  }
}

// Pinta el listado de otros canales y añade los listeners de click
function renderChannelsList(channels, currentChannel) {
  const listWrap = document.getElementById("streams-list");
  const aside    = document.getElementById("streams-list-wrapper");
  if (!listWrap) return;

  if (!channels.length) {
    listWrap.innerHTML = "";
    if (aside) aside.hidden = true;
    return;
  }

  if (aside) aside.hidden = channels.length <= 1;

  listWrap.innerHTML = channels.map(ch => `
    <button
      class="stream-card ${ch === currentChannel ? "active" : ""}"
      data-channel="${ch}"
      type="button"
    >
      <div class="stream-card-name">${ch}</div>
      <div class="stream-card-tag">Cambiar a este directo</div>
    </button>
  `).join("");

  listWrap.querySelectorAll(".stream-card").forEach(btn => {
    btn.addEventListener("click", () => {
      const ch = btn.dataset.channel;
      if (!ch) return;
      setMainStream(ch);
      // repintamos la lista para actualizar el "active"
      renderChannelsList(channels, ch);
    });
  });
}

// Inicialización
(async () => {
  const root = document.getElementById("stream-container");
  if (!root) return;

  // Montamos layout básico dentro de stream-container
  root.innerHTML = `
    <div class="stream-layout">
      <div class="stream-main">
        <h2>Directo de la lliga</h2>
        <p id="directo-loading" class="directo-status">Cargando directos...</p>
        <div id="main-stream"></div>
        <p id="main-stream-status" class="directo-status"></p>
      </div>
      <aside class="stream-list" id="streams-list-wrapper" hidden>
        <h3>Otros canales en directo</h3>
        <div id="streams-list"></div>
      </aside>
    </div>
  `;

  const loadingEl = document.getElementById("directo-loading");

  const liveChannels = await fetchLiveChannels();
  if (!liveChannels.length) {
    if (loadingEl) {
      loadingEl.innerHTML = `
        <span class="chip chip-ended">Sin directos ahora mismo</span><br>
        Ahora mismo ningún canal de la lliga está en directo 😴
      `;
    }
    setMainStream(null);
    renderChannelsList([], null);
    return;
  }

  if (loadingEl) loadingEl.remove();

  // Canal principal = primero en directo
  const mainChannel   = liveChannels[0];
  const otherChannels = liveChannels.slice(1);

  setMainStream(mainChannel);
  renderChannelsList(liveChannels, mainChannel);
})();
