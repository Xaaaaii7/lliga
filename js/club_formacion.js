// js/club_formacion.js
(async () => {
  const CLUB = window.CLUB_NAME;
  const root = document.getElementById("tab-formacion");

  if (!CLUB || !root) return;

  const AppUtils = window.AppUtils || {};
  const { getSupabaseClient, getSupabaseConfig } = AppUtils;

  if (typeof getSupabaseClient !== "function") {
    root.innerHTML = `
      <div class="club-box" style="grid-column:span 12">
        <h3>Formación</h3>
        <p class="muted">Supabase no está configurado para cargar la formación.</p>
      </div>`;
    return;
  }

  // ==========================
  //  PLANTILLAS DE SISTEMAS
  // ==========================
  // Cada sistema tiene 11 slots con: index, line (POR/DEF/MC/DEL), x%, y%
  const FORMATION_TEMPLATES = {
    "4-4-2": [
      // Portero
      { index: 0, line: "POR", x: 50, y: 90 },

      // Defensas (4)
      { index: 1, line: "DEF", x: 20, y: 72 },
      { index: 2, line: "DEF", x: 40, y: 75 },
      { index: 3, line: "DEF", x: 60, y: 75 },
      { index: 4, line: "DEF", x: 80, y: 72 },

      // Mediocampo (4)
      { index: 5, line: "MC", x: 25, y: 55 },
      { index: 6, line: "MC", x: 45, y: 50 },
      { index: 7, line: "MC", x: 65, y: 50 },
      { index: 8, line: "MC", x: 75, y: 55 },

      // Delanteros (2)
      { index: 9,  line: "DEL", x: 40, y: 30 },
      { index: 10, line: "DEL", x: 60, y: 30 }
    ],

    "4-3-3": [
      // Portero
      { index: 0, line: "POR", x: 50, y: 90 },

      // Defensas (4)
      { index: 1, line: "DEF", x: 20, y: 72 },
      { index: 2, line: "DEF", x: 40, y: 75 },
      { index: 3, line: "DEF", x: 60, y: 75 },
      { index: 4, line: "DEF", x: 80, y: 72 },

      // Mediocampo (3)
      { index: 5, line: "MC", x: 30, y: 55 },
      { index: 6, line: "MC", x: 50, y: 50 },
      { index: 7, line: "MC", x: 70, y: 55 },

      // Delanteros (3)
      { index: 8,  line: "DEL", x: 25, y: 30 },
      { index: 9,  line: "DEL", x: 50, y: 25 },
      { index: 10, line: "DEL", x: 75, y: 30 }
    ],

    "4-5-1": [
      // Portero
      { index: 0, line: "POR", x: 50, y: 90 },

      // Defensas (4)
      { index: 1, line: "DEF", x: 20, y: 72 },
      { index: 2, line: "DEF", x: 40, y: 75 },
      { index: 3, line: "DEF", x: 60, y: 75 },
      { index: 4, line: "DEF", x: 80, y: 72 },

      // Mediocampo (5)
      { index: 5, line: "MC", x: 20, y: 55 },
      { index: 6, line: "MC", x: 35, y: 50 },
      { index: 7, line: "MC", x: 50, y: 45 },
      { index: 8, line: "MC", x: 65, y: 50 },
      { index: 9, line: "MC", x: 80, y: 55 },

      // Delantero (1)
      { index: 10, line: "DEL", x: 50, y: 25 }
    ],

    "3-5-2": [
      // Portero
      { index: 0, line: "POR", x: 50, y: 90 },

      // Defensas (3)
      { index: 1, line: "DEF", x: 30, y: 75 },
      { index: 2, line: "DEF", x: 50, y: 72 },
      { index: 3, line: "DEF", x: 70, y: 75 },

      // Mediocampo (5)
      { index: 4, line: "MC", x: 20, y: 55 },
      { index: 5, line: "MC", x: 35, y: 50 },
      { index: 6, line: "MC", x: 50, y: 45 },
      { index: 7, line: "MC", x: 65, y: 50 },
      { index: 8, line: "MC", x: 80, y: 55 },

      // Delanteros (2)
      { index: 9,  line: "DEL", x: 40, y: 30 },
      { index: 10, line: "DEL", x: 60, y: 30 }
    ]
  };

  const DEFAULT_SYSTEM = "4-3-3";

  // ==========================
  //  HELPERS BD
  // ==========================
  const supabase = await getSupabaseClient();
  const cfg = (typeof getSupabaseConfig === "function") ? getSupabaseConfig() : {};
  const season = cfg?.season || null;

  async function resolveClubIdFromNickname(nickname) {
    if (!nickname) return null;

    let q = supabase
      .from("league_teams")
      .select("club_id, season, nickname")
      .ilike("nickname", nickname)
      .limit(1);

    if (season) q = q.eq("season", season);

    const { data, error } = await q;
    if (error) {
      console.warn("Error league_teams:", error);
      return null;
    }
    const row = data && data[0];
    return row?.club_id || null;
  }

  async function loadSquadForClub(clubId) {
    if (!clubId) return [];

    let q = supabase
      .from("player_club_memberships")
      .select(`
        player:players (
          id,
          name,
          position,
          nationality
        )
      `)
      .eq("club_id", clubId);

    if (season) q = q.eq("season", season);

    const { data, error } = await q;
    if (error) {
      console.warn("Error memberships:", error);
      return [];
    }

    const map = new Map();
    for (const row of data || []) {
      const p = row.player;
      if (!p || !p.id) continue;
      if (!map.has(p.id)) map.set(p.id, p);
    }
    return Array.from(map.values());
  }

  async function loadFormationForClub(clubId) {
    if (!clubId) return null;

    let q = supabase
      .from("formations")
      .select(`
        id,
        system,
        slots:formation_slots (
          slot_index,
          player_id
        )
      `)
      .eq("club_id", clubId)
      .limit(1);

    if (season) q = q.eq("season", season);

    const { data, error } = await q;
    if (error) {
      console.warn("Error formations:", error);
      return null;
    }

    const row = data && data[0];
    if (!row) return null;

    const slots = new Map();
    for (const s of (row.slots || [])) {
      slots.set(s.slot_index, s.player_id);
    }

    return {
      id: row.id,
      system: row.system || DEFAULT_SYSTEM,
      slots
    };
  }

  // ==========================
  //  ESTADO EN MEMORIA
  // ==========================
  let state = {
    clubId: null,
    squad: [],
    system: DEFAULT_SYSTEM,
    slots: new Map(),  // slot_index -> player_id (o null)
    formationId: null,
    editMode: false
  };

  function findPlayerName(playerId) {
    if (!playerId) return "";
    const p = state.squad.find(x => x.id === playerId);
    return p ? p.name : "";
  }

  // ==========================
  //  RENDER UI (modo lectura)
  // ==========================
  function renderFormationView() {
    const system = state.system || DEFAULT_SYSTEM;
    const template = FORMATION_TEMPLATES[system] || FORMATION_TEMPLATES[DEFAULT_SYSTEM];

    const slotsHtml = template.map(slot => {
      const playerId = state.slots.get(slot.index);
      const name = findPlayerName(playerId) || "";
      const label = name || slot.line; // si no hay jugador, se ve POR/DEF/MC/DEL

      return `
        <button
          class="club-formation-slot"
          data-slot="${slot.index}"
          style="top:${slot.y}%;left:${slot.x}%"
        >
          <div>${label}</div>
        </button>
      `;
    }).join("");

    const systemsOptions = Object.keys(FORMATION_TEMPLATES)
      .map(sys => `<option value="${sys}" ${sys === system ? "selected" : ""}>${sys}</option>`)
      .join("");

    root.innerHTML = `
      <div class="club-box" style="grid-column:span 12">
        <h3>Formación</h3>

        <div class="club-formation-wrapper">
          <div class="club-formation-field" id="formation-field">
            <img src="img/campo-vertical.png" alt="Campo" class="club-formation-bg">
            ${slotsHtml}
          </div>

          <div class="club-formation-meta">
            <div class="club-formation-meta-row">
              <div class="club-formation-system">
                Sistema: <span id="formation-system-label">${system}</span>
              </div>
              <div class="club-formation-actions">
                <button type="button" id="formation-edit-btn">
                  Editar formación
                </button>
              </div>
            </div>
            <div class="club-formation-meta-row">
              <span class="club-formation-hint">
                Vista actual basada en la plantilla guardada para este equipo.
              </span>
            </div>
          </div>
        </div>
      </div>
    `;

    // De momento sólo conectamos el botón de editar (modo lectura)
    const editBtn = document.getElementById("formation-edit-btn");
    const fieldEl = document.getElementById("formation-field");
    if (editBtn && fieldEl) {
      editBtn.addEventListener("click", () => {
        // Aquí en el siguiente paso activaremos el modo edición
        // (select de sistema + asignar jugadores + guardar)
        fieldEl.classList.add("club-formation-edit");
        // Por ahora solo cambiamos el texto del botón para que veas que engancha
        editBtn.textContent = "Modo edición (pendiente implementar guardar)";
      });
    }
  }

  // ==========================
  //  INIT
  // ==========================
  try {
    root.innerHTML = `
      <div class="club-box" style="grid-column:span 12">
        <h3>Formación</h3>
        <p class="muted">Cargando formación del club…</p>
      </div>
    `;

    const clubId = await resolveClubIdFromNickname(CLUB);
    if (!clubId) {
      root.innerHTML = `
        <div class="club-box" style="grid-column:span 12">
          <h3>Formación</h3>
          <p class="muted">
            No se pudo resolver el <code>club_id</code> para <strong>${CLUB}</strong>.
          </p>
        </div>
      `;
      return;
    }

    const [squad, formation] = await Promise.all([
      loadSquadForClub(clubId),
      loadFormationForClub(clubId)
    ]);

    state.clubId = clubId;
    state.squad = squad;

    if (formation) {
      state.system = formation.system || DEFAULT_SYSTEM;
      state.slots = formation.slots || new Map();
      state.formationId = formation.id;
    } else {
      // Si no hay nada en BD, arrancamos con sistema por defecto
      state.system = DEFAULT_SYSTEM;
      state.slots = new Map();
      state.formationId = null;
    }

    renderFormationView();
  } catch (e) {
    console.error("Error inicializando formación:", e);
    root.innerHTML = `
      <div class="club-box" style="grid-column:span 12">
        <h3>Formación</h3>
        <p class="muted">No se pudo cargar la formación del club.</p>
      </div>
    `;
  }
})();
