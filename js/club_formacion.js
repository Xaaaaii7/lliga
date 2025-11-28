// js/club_formacion.js
(async () => {
  const CLUB = window.CLUB_NAME;
  const root = document.getElementById("tab-formacion");

  if (!CLUB || !root) return;

  const AppUtils = window.AppUtils || {};
  const { getSupabaseClient, getSupabaseConfig } = AppUtils || {};

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
  const FORMATION_TEMPLATES = {
    "4-4-2": [
      { index: 0, line: "POR", x: 50, y: 90 },
      { index: 1, line: "DEF", x: 20, y: 72 },
      { index: 2, line: "DEF", x: 40, y: 75 },
      { index: 3, line: "DEF", x: 60, y: 75 },
      { index: 4, line: "DEF", x: 80, y: 72 },
      { index: 5, line: "MC",  x: 25, y: 55 },
      { index: 6, line: "MC",  x: 45, y: 50 },
      { index: 7, line: "MC",  x: 65, y: 50 },
      { index: 8, line: "MC",  x: 75, y: 55 },
      { index: 9, line: "DEL", x: 40, y: 30 },
      { index: 10,line: "DEL", x: 60, y: 30 }
    ],
    "4-3-3": [
      { index: 0, line: "POR", x: 50, y: 90 },
      { index: 1, line: "DEF", x: 20, y: 72 },
      { index: 2, line: "DEF", x: 40, y: 75 },
      { index: 3, line: "DEF", x: 60, y: 75 },
      { index: 4, line: "DEF", x: 80, y: 72 },
      { index: 5, line: "MC",  x: 30, y: 55 },
      { index: 6, line: "MC",  x: 50, y: 50 },
      { index: 7, line: "MC",  x: 70, y: 55 },
      { index: 8, line: "DEL", x: 25, y: 30 },
      { index: 9, line: "DEL", x: 50, y: 25 },
      { index: 10,line: "DEL", x: 75, y: 30 }
    ],
    "4-5-1": [
      { index: 0, line: "POR", x: 50, y: 90 },
      { index: 1, line: "DEF", x: 20, y: 72 },
      { index: 2, line: "DEF", x: 40, y: 75 },
      { index: 3, line: "DEF", x: 60, y: 75 },
      { index: 4, line: "DEF", x: 80, y: 72 },
      { index: 5, line: "MC",  x: 20, y: 55 },
      { index: 6, line: "MC",  x: 35, y: 50 },
      { index: 7, line: "MC",  x: 50, y: 45 },
      { index: 8, line: "MC",  x: 65, y: 50 },
      { index: 9, line: "MC",  x: 80, y: 55 },
      { index: 10,line: "DEL", x: 50, y: 25 }
    ],
    "3-5-2": [
      { index: 0, line: "POR", x: 50, y: 90 },
      { index: 1, line: "DEF", x: 30, y: 75 },
      { index: 2, line: "DEF", x: 50, y: 72 },
      { index: 3, line: "DEF", x: 70, y: 75 },
      { index: 4, line: "MC",  x: 20, y: 55 },
      { index: 5, line: "MC",  x: 35, y: 50 },
      { index: 6, line: "MC",  x: 50, y: 45 },
      { index: 7, line: "MC",  x: 65, y: 50 },
      { index: 8, line: "MC",  x: 80, y: 55 },
      { index: 9, line: "DEL", x: 40, y: 30 },
      { index: 10,line: "DEL", x: 60, y: 30 }
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

  // Clasificación de posición -> línea
  function groupFromPosition(pos) {
    const p = (pos || "").toLowerCase();
    if (p.includes("goalkeeper") || p.includes("portero") || p === "gk") return "POR";
    if (
      p.includes("defence") || p.includes("back") ||
      p.includes("centre-back") || p.includes("defensa") ||
      p === "cb" || p === "lb" || p === "rb"
    ) return "DEF";
    if (p.includes("midfield") || p.includes("medio") || p.includes("mid")) return "MC";
    if (
      p.includes("offence") || p.includes("forward") ||
      p.includes("wing") || p.includes("striker") ||
      p.includes("delantero")
    ) return "DEL";
    return null; // otros
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
      if (!map.has(p.id)) {
        map.set(p.id, {
          ...p,
          line: groupFromPosition(p.position)
        });
      }
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

  async function saveFormationToDb() {
    if (!state.clubId) return;

    const system = state.system || DEFAULT_SYSTEM;
    const template = FORMATION_TEMPLATES[system];
    if (!template) {
      alert("Sistema de juego no válido.");
      return;
    }

    // 1) Upsert de formations
    let formationId = state.formationId || null;

    if (!formationId) {
      let ins = supabase.from("formations").insert({
        club_id: state.clubId,
        season: season,
        system: system
      }).select("id").single();

      const { data, error } = await ins;
      if (error) {
        console.error("Error insert formations:", error);
        alert("No se pudo guardar la formación (insert).");
        return;
      }
      formationId = data.id;
    } else {
      let upd = supabase.from("formations").update({
        system: system,
        season: season
      }).eq("id", formationId).select("id").single();

      const { data, error } = await upd;
      if (error) {
        console.error("Error update formations:", error);
        alert("No se pudo guardar la formación (update).");
        return;
      }
      formationId = data.id;
    }

    // 2) Upsert de slots
    const rows = template.map(slot => ({
      formation_id: formationId,
      slot_index: slot.index,
      player_id: state.slots.get(slot.index) || null
    }));

    const { error: slotsError } = await supabase
      .from("formation_slots")
      .upsert(rows, { onConflict: "formation_id,slot_index" });

    if (slotsError) {
      console.error("Error upsert formation_slots:", slotsError);
      alert("La formación se guardó parcialmente (error en slots).");
      return;
    }

    // OK
    state.formationId = formationId;
    state.editMode = false;
    alert("Formación guardada.");
    renderFormationView();
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
  //  RENDER: VISTA NORMAL
  // ==========================
  function renderFormationView() {
    const system = state.system || DEFAULT_SYSTEM;
    const template = FORMATION_TEMPLATES[system] || FORMATION_TEMPLATES[DEFAULT_SYSTEM];

    const slotsHtml = template.map(slot => {
      const playerId = state.slots.get(slot.index);
      const name = findPlayerName(playerId) || "";
      const label = name || slot.line;

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
                Vista de la formación actual del equipo.
              </span>
            </div>
          </div>
        </div>
      </div>
    `;

    const editBtn = document.getElementById("formation-edit-btn");
    const fieldEl = document.getElementById("formation-field");
    if (editBtn && fieldEl) {
      editBtn.addEventListener("click", () => {
        state.editMode = true;
        renderFormationEdit();
      });
    }
  }

  // ==========================
  //  RENDER: MODO EDICIÓN
  // ==========================
  function renderFormationEdit() {
    const system = state.system || DEFAULT_SYSTEM;
    const template = FORMATION_TEMPLATES[system] || FORMATION_TEMPLATES[DEFAULT_SYSTEM];

    // Campo (igual que en vista normal)
    const slotsHtml = template.map(slot => {
      const playerId = state.slots.get(slot.index);
      const name = findPlayerName(playerId) || "";
      const label = name || slot.line;

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

    // Options de sistemas
    const systemsOptions = Object.keys(FORMATION_TEMPLATES)
      .map(sys => `<option value="${sys}" ${sys === system ? "selected" : ""}>${sys}</option>`)
      .join("");

    // Preparamos selects por línea (POR / DEF / MC / DEL)
    const groupsOrder = ["POR", "DEF", "MC", "DEL"];
    const groupLabels = {
      POR: "Portero",
      DEF: "Defensas",
      MC:  "Mediocampo",
      DEL: "Delanteros"
    };

const editorGroupsHtml = groupsOrder.map(line => {
  const lineSlots = template.filter(s => s.line === line);
  if (!lineSlots.length) return "";

  // 🔥 NUEVO: Todos los jugadores disponibles en todos los slots
  const eligiblePlayers = state.squad;

  const slotsHtml = lineSlots.map(slot => {
    const currentId = state.slots.get(slot.index) || "";
    const options = [
      `<option value="">(vacío)</option>`,
      ...eligiblePlayers.map(p => `
        <option value="${p.id}" ${String(p.id) === String(currentId) ? "selected" : ""}>
          ${p.name}
        </option>
      `)
    ].join("");

    return `
      <div class="club-formation-editor-slot">
        <span>${slot.line}</span>
        <select data-slot-index="${slot.index}">
          ${options}
        </select>
      </div>
    `;
  }).join("");

  return `
    <div class="club-formation-editor-group">
      <div class="club-formation-editor-group-title">${groupLabels[line] || line}</div>
      ${slotsHtml}
    </div>
  `;
}).join("");


    root.innerHTML = `
      <div class="club-box" style="grid-column:span 12">
        <h3>Formación</h3>

        <div class="club-formation-wrapper">
          <div class="club-formation-field club-formation-edit" id="formation-field">
            <img src="img/campo-vertical.png" alt="Campo" class="club-formation-bg">
            ${slotsHtml}
          </div>

          <div class="club-formation-editor">
            <div>
              <label for="formation-system-select">Sistema de juego</label>
              <select id="formation-system-select">
                ${systemsOptions}
              </select>
            </div>

            <div class="club-formation-editor-groups">
              ${editorGroupsHtml}
            </div>

            <div class="club-formation-actions">
              <button type="button" id="formation-cancel-btn">Cancelar</button>
              <button type="button" id="formation-save-btn">Guardar</button>
            </div>

            <p class="club-formation-hint">
              En móvil: selecciona el sistema arriba y asigna jugadores en los desplegables. El campo muestra una vista previa.
            </p>
          </div>
        </div>
      </div>
    `;

    // Eventos: cambio de sistema
    const systemSelect = document.getElementById("formation-system-select");
    if (systemSelect) {
      systemSelect.addEventListener("change", () => {
        const newSystem = systemSelect.value;
        if (!FORMATION_TEMPLATES[newSystem]) return;
        state.system = newSystem;
        // al cambiar sistema, reseteamos asignaciones (más simple)
        state.slots = new Map();
        renderFormationEdit();
      });
    }

    // Eventos: cambio de jugador en slot
    root.querySelectorAll("select[data-slot-index]").forEach(sel => {
      sel.addEventListener("change", () => {
        const slotIndex = Number(sel.getAttribute("data-slot-index"));
        const val = sel.value;
        if (!Number.isFinite(slotIndex)) return;
        if (!val) {
          state.slots.delete(slotIndex);
        } else {
          const playerId = Number(val);
          state.slots.set(slotIndex, playerId);
        }
        // solo actualizamos la vista de campo, para no perder focus de selects
        const fieldEl = document.getElementById("formation-field");
        if (fieldEl) {
          const system = state.system || DEFAULT_SYSTEM;
          const template = FORMATION_TEMPLATES[system] || FORMATION_TEMPLATES[DEFAULT_SYSTEM];
          const newSlotsHtml = template.map(slot => {
            const playerId = state.slots.get(slot.index);
            const name = findPlayerName(playerId) || "";
            const label = name || slot.line;
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
          fieldEl.innerHTML = `
            <img src="img/campo-vertical.png" alt="Campo" class="club-formation-bg">
            ${newSlotsHtml}
          `;
        }
      });
    });

    // Botones Guardar / Cancelar
    const cancelBtn = document.getElementById("formation-cancel-btn");
    const saveBtn   = document.getElementById("formation-save-btn");

    if (cancelBtn) {
      cancelBtn.addEventListener("click", () => {
        state.editMode = false;
        renderFormationView();
      });
    }

    if (saveBtn) {
      saveBtn.addEventListener("click", () => {
        saveFormationToDb().catch(err => {
          console.error("Error guardando formación:", err);
          alert("Error inesperado guardando la formación.");
        });
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
    state.squad  = squad;

    if (formation) {
      state.system      = formation.system || DEFAULT_SYSTEM;
      state.slots       = formation.slots || new Map();
      state.formationId = formation.id;
    } else {
      state.system      = DEFAULT_SYSTEM;
      state.slots       = new Map();
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
