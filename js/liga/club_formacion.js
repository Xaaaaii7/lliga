// js/club_formacion.js
import {
  FORMATION_TEMPLATES,
  DEFAULT_SYSTEM,
  resolveClubIdFromNickname,
  loadSquadForClub,
  loadFormationForClub,
  saveFormationToDb
} from '../modules/formation.js';
import { getSupabaseConfig } from '../modules/supabase-client.js';

(async () => {
  const CLUB = window.CLUB_NAME;
  const root = document.getElementById("tab-formacion");

  if (!CLUB || !root) return;

  // ==========================
  //  ESTADO EN MEMORIA
  // ==========================
  let state = {
    clubId: null,
    squad: [],
    system: DEFAULT_SYSTEM,
    slots: new Map(), // slot_index -> player_id (o null)
    formationId: null,
    editMode: false,
    season: null // Storing season here for consistency
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
    //        const fieldEl = document.getElementById("formation-field"); // Not used directly here
    if (editBtn) {
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
      MC: "Mediocampo",
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
    const saveBtn = document.getElementById("formation-save-btn");

    if (cancelBtn) {
      cancelBtn.addEventListener("click", () => {
        state.editMode = false;
        renderFormationView();
      });
    }

    if (saveBtn) {
      saveBtn.addEventListener("click", () => {
        // Call exported save function
        saveFormationToDb(state.clubId, state.season, state.system, state.slots, state.formationId)
          .then(res => {
            if (!res.ok) {
              alert(res.msg || "Error al guardar");
              return;
            }
            if (res.formationId) state.formationId = res.formationId;
            state.editMode = false;
            alert(res.msg);
            renderFormationView();
          })
          .catch(err => {
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

    // We need the season to keep consistency in saves, can try to get it from modules but resolveClubIdFromNickname uses it internally.
    // We can get it from the config if needed or trust the module used it.
    // However, we need to pass 'season' to saveFormationToDb.
    // Let's use getSupabaseConfig from window.AppUtils for now as fallback or just re-fetch config.
    // Actually, we can import getSupabaseConfig from supabase-client.js
    // But let's check how resolveClubIdFromNickname gets it. It gets it internally.
    // I will assume for now we can get it similarly.

    const season = getSupabaseConfig().season;
    state.season = season;

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
