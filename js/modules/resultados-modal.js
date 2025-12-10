import {
    fmtDate,
    isNum
} from './utils.js';

import {
    ensureStatsIndex,
    getScorerState,
    loadScorerStateForMatch,
    // Modifiers
    addGoalToState,
    changeGoalCount,
    removeScorer,
    addRedCardToState,
    removeRedCardFromState,
    addInjuryToState,
    removeInjuryFromState,
    // Savers
    saveScorersToSupabase,
    saveRedCardsFull,
    saveInjuriesFull,
    // Helpers
    getSupa
} from './resultados-data.js';

import { Modal } from './modal.js';

let statsModal = null;
let bodyEl = null;
let titleEl = null;

export const initModalRefs = (backdropId, closeId, bEl, tEl) => {
    bodyEl = bEl;
    titleEl = tEl;

    // Create modal using Modal class
    statsModal = new Modal(backdropId, closeId);

    // Set cleanup hook
    statsModal.onClose = () => {
        if (bodyEl) bodyEl.innerHTML = '';
        if (titleEl) titleEl.textContent = 'Estadísticas del partido';
    };
};

export const openModal = () => {
    statsModal?.open();
};

export const closeModal = () => {
    statsModal?.close();
};

// -----------------------------
// Render Stats Table
// -----------------------------
export const renderStats = async (matchId, meta) => {
    if (!bodyEl) return;

    // Quick loader
    bodyEl.innerHTML = `<p class="hint">Cargando estadísticas...</p>`;
    if (titleEl) {
        titleEl.textContent = `Estadísticas — ${meta.local} vs ${meta.visitante}`;
    }

    let statsObj = {};
    try {
        const idx = await ensureStatsIndex();
        statsObj = idx[matchId] || {};
    } catch (err) {
        console.warn('Error cargando stats para partido', matchId, err);
    }

    const equipos = Object.keys(statsObj || {});
    const hasStats = equipos.length === 2;

    const localName = meta?.local || (equipos[0] || 'Local');
    const visitName = meta?.visitante || (equipos[1] || 'Visitante');

    const gl = isNum(meta?.goles_local) ? meta.goles_local : null;
    const gv = isNum(meta?.goles_visitante) ? meta.goles_visitante : null;
    const marcador = (gl !== null && gv !== null) ? `${gl} – ${gv}` : '-';

    const fechaTexto = meta?.fecha
        ? fmtDate(meta.fecha)
        : (meta?.fechaJornada ? fmtDate(meta.fechaJornada) : '');
    const horaTexto = meta?.hora || '';
    const jTexto = meta?.jornada ? `Jornada ${meta.jornada}` : '';

    const metaLine = [fechaTexto, horaTexto, jTexto].filter(Boolean).join(' · ');

    let tableHtml = '';
    let summaryHtml = '';

    if (!hasStats) {
        tableHtml = `<p class="hint">No hay estadísticas detalladas para este partido.</p>`;
    } else {
        const keyA = equipos[0];
        const keyB = equipos[1];
        const Adata = statsObj[keyA] || {};
        const Bdata = statsObj[keyB] || {};

        const get = (data, k) =>
            (data && Object.prototype.hasOwnProperty.call(data, k)) ? data[k] : null;

        const ataqueKeys = ['goles', 'tiros', 'tiros_a_puerta'];
        const balonKeys = ['posesion', 'pases', 'pases_completados', 'centros'];

        const buildKvList = (keys) => keys
            .filter(k => get(Adata, k) !== null || get(Bdata, k) !== null)
            .map(k => `
          <li>
            <span>${k.replace(/_/g, ' ')}</span>
            <span>${get(Adata, k) ?? '—'} · ${get(Bdata, k) ?? '—'}</span>
          </li>
        `).join('');

        const ataqueHtml = buildKvList(ataqueKeys);
        const balonHtml = buildKvList(balonKeys);

        if (ataqueHtml || balonHtml) {
            summaryHtml = `
          <div class="stats-summary cards-2col">
            ${ataqueHtml ? `
              <div class="card">
                <h3>Ataque</h3>
                <ul class="kv">
                  ${ataqueHtml}
                </ul>
              </div>
            ` : ''}
            ${balonHtml ? `
              <div class="card">
                <h3>Juego con balón</h3>
                <ul class="kv">
                  ${balonHtml}
                </ul>
              </div>
            ` : ''}
          </div>
        `;
        }

        const orden = [
            'goles', 'posesion', 'tiros', 'tiros_a_puerta', 'faltas',
            'fueras_de_juego', 'corners', 'tiros_libres', 'pases',
            'pases_completados', 'centros', 'pases_interceptados',
            'entradas', 'paradas', 'rojas'
        ];

        const rows = orden
            .filter(k => Adata.hasOwnProperty(k) || Bdata.hasOwnProperty(k))
            .map(k => `
          <tr>
            <th>${k.replace(/_/g, ' ')}</th>
            <td>${Adata[k] ?? '—'}</td>
            <td>${Bdata[k] ?? '—'}</td>
          </tr>
        `).join('');

        tableHtml = `
        <table class="stats-table stats-table-modern">
          <thead>
            <tr>
              <th>Estadística</th>
              <th>${localName}</th>
              <th>${visitName}</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      `;
    }

    const supa = await getSupa();
    const hasSupabase = !!supa;

    const redCardsEditorHtml =
        (hasSupabase && meta?.local_team_id && meta?.visitante_team_id && matchId)
            ? `
      <hr class="stats-divider" />
      <section class="redcards-editor" data-match-id="${matchId}">
        <h3>Tarjetas rojas</h3>
        <div class="scorers-columns">
          <div class="scorers-col" data-side="local">
            <h4>${localName}</h4>
            <ul class="scorers-list redcards-list" data-side="local"></ul>
            <div class="scorers-add">
              <select data-side="local">
                <option value="">Añadir jug. con roja…</option>
              </select>
              <button type="button" class="btn-add-red" data-side="local">＋</button>
            </div>
          </div>
          <div class="scorers-col" data-side="visitante">
            <h4>${visitName}</h4>
            <ul class="scorers-list redcards-list" data-side="visitante"></ul>
            <div class="scorers-add">
              <select data-side="visitante">
                <option value="">Añadir jug. con roja…</option>
              </select>
              <button type="button" class="btn-add-red" data-side="visitante">＋</button>
            </div>
          </div>
        </div>
        <div class="redcards-actions">
           <span class="redcards-status" aria-live="polite"></span>
           <button type="button" class="btn-save-redcards">Guardar rojas</button>
        </div>
      </section>
      `
            : '';

    const injuriesEditorHtml =
        (hasSupabase && meta?.local_team_id && meta?.visitante_team_id && matchId)
            ? `
      <hr class="stats-divider" />
      <section class="injuries-editor" data-match-id="${matchId}">
        <h3>Lesiones (Bajas próximo partido)</h3>
        <div class="scorers-columns">
          <div class="scorers-col" data-side="local">
            <h4>${localName}</h4>
            <ul class="scorers-list injuries-list" data-side="local"></ul>
            <div class="scorers-add">
              <select data-side="local">
                <option value="">Añadir lesionado…</option>
              </select>
              <button type="button" class="btn-add-injury" data-side="local">＋</button>
            </div>
          </div>
          <div class="scorers-col" data-side="visitante">
            <h4>${visitName}</h4>
            <ul class="scorers-list injuries-list" data-side="visitante"></ul>
            <div class="scorers-add">
              <select data-side="visitante">
                <option value="">Añadir lesionado…</option>
              </select>
              <button type="button" class="btn-add-injury" data-side="visitante">＋</button>
            </div>
          </div>
        </div>
        <div class="injuries-actions">
           <span class="injuries-status" aria-live="polite"></span>
           <button type="button" class="btn-save-injuries">Guardar lesiones</button>
        </div>
      </section>
      `
            : '';

    const scorersEditorHtml =
        (hasSupabase && meta?.local_team_id && meta?.visitante_team_id && matchId)
            ? `
      <hr class="stats-divider" />
      <section class="scorers-editor" data-match-id="${matchId}">
        <h3>Goleadores del partido</h3>

        <div class="scorers-summary-block">
          <div class="scorers-summary-columns">
            <div class="scorers-summary-side">
              <h5>${localName}</h5>
              <ul class="scorers-summary-list" data-side="local"></ul>
            </div>
            <div class="scorers-summary-side">
              <h5>${visitName}</h5>
              <ul class="scorers-summary-list" data-side="visitante"></ul>
            </div>
          </div>
        </div>

        <div class="scorers-edit-toggle">
          <button type="button" class="btn-toggle-scorers-edit">
            Editar goleadores
          </button>
          <span class="scorers-status" aria-live="polite"></span>
        </div>

        <div class="scorers-edit-panel" hidden>
          <p class="hint small">
            Usa los selectores para añadir o ajustar los goles de cada jugador.
          </p>
          <div class="scorers-columns">
            <div class="scorers-col" data-side="local">
              <h4>${localName}</h4>
              <ul class="scorers-list" data-role="list" data-side="local"></ul>
              <div class="scorers-add">
                <select data-role="select" data-side="local">
                  <option value="">Añadir goleador…</option>
                </select>
                <button type="button" class="btn-add-goal" data-side="local">＋</button>
              </div>
            </div>
            <div class="scorers-col" data-side="visitante">
              <h4>${visitName}</h4>
              <ul class="scorers-list" data-role="list" data-side="visitante"></ul>
              <div class="scorers-add">
                <select data-role="select" data-side="visitante">
                  <option value="">Añadir goleador…</option>
                </select>
                <button type="button" class="btn-add-goal" data-side="visitante">＋</button>
              </div>
            </div>
          </div>
          <div class="scorers-actions">
            <button type="button" class="btn-save-scorers">Guardar goleadores</button>
          </div>
        </div>
      </section>
      `
            : '';

    bodyEl.innerHTML = `
      <div class="stats-header">
        <div class="stats-teams">
          <span class="stats-team-name">${localName}</span>
          <span class="stats-score">${marcador}</span>
          <span class="stats-team-name">${visitName}</span>
        </div>
        ${metaLine ? `<p class="stats-meta">${metaLine}</p>` : ''}
      </div>
      ${summaryHtml}
      ${tableHtml}
      ${redCardsEditorHtml}
      ${injuriesEditorHtml}
      ${scorersEditorHtml}
    `;

    if (matchId) {
        if (scorersEditorHtml) void initScorersEditor(matchId, meta);
        if (redCardsEditorHtml) void initRedCardsEditor(matchId, meta);
        if (injuriesEditorHtml) void initInjuriesEditor(matchId, meta);
    }
};

// -----------------------------
// Editors Helpers (DOM manipulation)
// -----------------------------

// --- Scorers ---

const renderSideScorersList = (sectionEl, side, state) => {
    if (!sectionEl || !state) return;
    const listEl = sectionEl.querySelector(`.scorers-list[data-side="${side}"]`);
    if (!listEl) return;

    const arr = state[side] || [];
    if (!arr.length) {
        listEl.innerHTML = `<li class="scorer-empty">Ningún goleador registrado.</li>`;
        return;
    }

    listEl.innerHTML = arr.map(p => `
      <li class="scorer-item" data-player-id="${p.player_id}">
        <span class="scorer-name">${p.name}</span>
        <div class="scorer-controls">
          <button type="button" class="btn-minus-goal" data-player-id="${p.player_id}" data-side="${side}">−</button>
          <span class="scorer-goals">${p.goals}</span>
          <button type="button" class="btn-plus-goal" data-player-id="${p.player_id}" data-side="${side}">＋</button>
          <button type="button" class="btn-remove-scorer" data-player-id="${p.player_id}" data-side="${side}">✕</button>
        </div>
      </li>
    `).join('');
};

const renderScorersSummary = (sectionEl, state) => {
    if (!sectionEl || !state) return;

    const toBalls = (goals) => {
        const g = Number(goals) || 0;
        if (g <= 0) return '';
        if (g === 1) return '⚽';
        return `⚽ x${g}`;
    };

    const renderSide = (side) => {
        const listEl = sectionEl.querySelector(`.scorers-summary-list[data-side="${side}"]`);
        if (!listEl) return;

        const arr = state[side] || [];
        if (!arr.length) {
            listEl.innerHTML = `<li class="scorer-summary-empty">Sin goles registrados.</li>`;
            return;
        }

        const managerNick = side === 'local'
            ? (state.localManagerNick || '')
            : (state.visitManagerNick || '');

        listEl.innerHTML = arr.map(p => `
        <li class="scorer-summary-item">
          <span class="scorer-summary-balls">${toBalls(p.goals)}</span>
          <span class="scorer-summary-name">${p.name}</span>
          ${managerNick ? `<span class="scorer-summary-club">(${managerNick})</span>` : ''}
        </li>
      `).join('');
    };

    renderSide('local');
    renderSide('visitante');
};

const fillScorersSelects = (sectionEl, state) => {
    if (!sectionEl || !state) return;

    const fill = (side, players) => {
        const sel = sectionEl.querySelector(`select[data-side="${side}"]`);
        if (!sel) return;
        sel.innerHTML = `
        <option value="">Añadir goleador…</option>
        <option value="-1">Gol en propia</option>
        ${players.map(p => `
          <option value="${p.player_id}">
            ${p.name} (${p.totalGoals} gol${p.totalGoals === 1 ? '' : 'es'})
          </option>
        `).join('')}
      `;
    };

    fill('local', state.playersLocal || []);
    fill('visitante', state.playersVisitante || []);
};

const initScorersEditor = async (matchId, meta) => {
    if (!bodyEl) return;
    const section = bodyEl.querySelector('.scorers-editor');
    if (!section) return;

    const statusEl = section.querySelector('.scorers-status');
    const saveBtn = section.querySelector('.btn-save-scorers');
    const editPanel = section.querySelector('.scorers-edit-panel');
    const toggleBtn = section.querySelector('.btn-toggle-scorers-edit');

    if (statusEl) statusEl.textContent = 'Cargando goleadores...';

    const state = await loadScorerStateForMatch(meta);
    if (!state) {
        if (statusEl) statusEl.textContent = 'No se pudo cargar el editor de goleadores.';
        return;
    }

    fillScorersSelects(section, state);
    renderSideScorersList(section, 'local', state);
    renderSideScorersList(section, 'visitante', state);
    renderScorersSummary(section, state);

    if (statusEl) statusEl.textContent = '';

    if (editPanel) editPanel.hidden = true;
    if (toggleBtn) {
        toggleBtn.textContent = 'Editar goleadores';
        toggleBtn.addEventListener('click', () => {
            if (!editPanel) return;
            const isHidden = editPanel.hidden;
            editPanel.hidden = !isHidden;
            toggleBtn.textContent = isHidden ? 'Cerrar edición' : 'Editar goleadores';
        });
    }

    section.querySelectorAll('.btn-add-goal').forEach(btn => {
        btn.addEventListener('click', () => {
            const side = btn.getAttribute('data-side');
            const sel = section.querySelector(`select[data-side="${side}"]`);
            if (!sel) return;
            const value = sel.value;
            if (!value) return;

            const res = addGoalToState(matchId, side, value);
            if (res.success) {
                const st = getScorerState(matchId);
                renderSideScorersList(section, side, st);
                renderScorersSummary(section, st);
            } else {
                alert(res.error || 'No se pudo añadir gol');
            }
        });
    });

    section.addEventListener('click', (e) => {
        const target = e.target;
        const matchState = getScorerState(matchId);
        if (!matchState) return;

        const btnPlus = target.closest && target.closest('.btn-plus-goal');
        const btnMinus = target.closest && target.closest('.btn-minus-goal');
        const btnRem = target.closest && target.closest('.btn-remove-scorer');

        if (btnPlus || btnMinus || btnRem) {
            e.preventDefault();
            const side = target.getAttribute('data-side') ||
                (target.closest('.scorers-col') && target.closest('.scorers-col').getAttribute('data-side'));
            const pid = target.getAttribute('data-player-id');
            if (!side || !pid) return;

            if (btnPlus) {
                const res = changeGoalCount(matchId, side, pid, +1);
                if (!res.success) alert(res.error || 'Error al cambiar goles');
            } else if (btnMinus) {
                changeGoalCount(matchId, side, pid, -1);
            } else if (btnRem) {
                removeScorer(matchId, side, pid);
            }

            renderSideScorersList(section, 'local', matchState);
            renderSideScorersList(section, 'visitante', matchState);
            renderScorersSummary(section, matchState);
        }
    });

    if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
            if (statusEl) statusEl.textContent = 'Guardando goleadores...';
            saveBtn.disabled = true;
            try {
                const res = await saveScorersToSupabase(matchId);
                if (statusEl) statusEl.textContent = res.msg || '';
                const st = getScorerState(matchId);
                renderScorersSummary(section, st);
                if (editPanel && toggleBtn) {
                    editPanel.hidden = true;
                    toggleBtn.textContent = 'Editar goleadores';
                }
            } finally {
                saveBtn.disabled = false;
            }
        });
    }
};

// --- Red Cards ---

const renderRedCardsList = (sectionEl, side, state) => {
    if (!sectionEl || !state) return;
    const listEl = sectionEl.querySelector(`.redcards-list[data-side="${side}"]`);
    if (!listEl) return;

    const arr = (side === 'local' ? state.redLocal : state.redVisitante) || [];
    if (!arr.length) {
        listEl.innerHTML = `<li class="scorer-empty">Sin tarjetas rojas.</li>`;
        return;
    }

    listEl.innerHTML = arr.map(p => `
      <li class="scorer-item" data-player-id="${p.player_id}">
        <span class="scorer-name">${p.name}</span>
        <button type="button" class="btn-remove-red" data-player-id="${p.player_id}" data-side="${side}">✕</button>
      </li>
    `).join('');
};

const fillRedCardsSelects = (sectionEl, state) => {
    if (!sectionEl || !state) return;
    const fill = (side, allPlayers, currentRedPlayers) => {
        const sel = sectionEl.querySelector(`select[data-side="${side}"]`);
        if (!sel) return;
        const currentIds = new Set(currentRedPlayers.map(p => p.player_id));
        const available = allPlayers.filter(p => !currentIds.has(p.player_id));
        sel.innerHTML = `
        <option value="">Añadir jug. con roja…</option>
        ${available.map(p => `
          <option value="${p.player_id}">${p.name}</option>
        `).join('')}
      `;
    };
    fill('local', state.playersLocal || [], state.redLocal || []);
    fill('visitante', state.playersVisitante || [], state.redVisitante || []);
};

const initRedCardsEditor = async (matchId, meta) => {
    if (!bodyEl) return;
    const section = bodyEl.querySelector('.redcards-editor');
    if (!section) return;

    const statusEl = section.querySelector('.redcards-status');
    const saveBtn = section.querySelector('.btn-save-redcards');

    const state = await loadScorerStateForMatch(meta);
    if (!state) {
        if (statusEl) statusEl.textContent = 'Error cargando datos.';
        return;
    }

    const refreshUI = () => {
        fillRedCardsSelects(section, state);
        renderRedCardsList(section, 'local', state);
        renderRedCardsList(section, 'visitante', state);
    };

    refreshUI();

    section.querySelectorAll('.btn-add-red').forEach(btn => {
        btn.addEventListener('click', () => {
            const side = btn.getAttribute('data-side');
            const sel = section.querySelector(`select[data-side="${side}"]`);
            if (!sel) return;
            const val = sel.value;
            if (!val) return;
            addRedCardToState(matchId, side, val);
            refreshUI();
        });
    });

    section.addEventListener('click', (e) => {
        const target = e.target;
        const btnRem = target.closest && target.closest('.btn-remove-red');
        if (btnRem) {
            e.preventDefault();
            const side = btnRem.getAttribute('data-side');
            const pid = btnRem.getAttribute('data-player-id');
            if (side && pid) {
                removeRedCardFromState(matchId, side, pid);
                refreshUI();
            }
        }
    });

    if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
            if (statusEl) statusEl.textContent = 'Guardando...';
            saveBtn.disabled = true;
            try {
                const res = await saveRedCardsFull(matchId);
                if (statusEl) statusEl.textContent = res.msg || '';
            } finally {
                saveBtn.disabled = false;
            }
        });
    }
};

// --- Injuries ---

const renderInjuriesList = (sectionEl, side, state) => {
    if (!sectionEl || !state) return;
    const listEl = sectionEl.querySelector(`.injuries-list[data-side="${side}"]`);
    if (!listEl) return;

    const arr = (side === 'local' ? state.injuriesLocal : state.injuriesVisitante) || [];
    if (!arr.length) {
        listEl.innerHTML = `<li class="scorer-empty">Sin lesiones.</li>`;
        return;
    }

    listEl.innerHTML = arr.map(p => `
      <li class="scorer-item" data-player-id="${p.player_id}">
        <span class="scorer-name">${p.name}</span>
        <button type="button" class="btn-remove-injury" data-player-id="${p.player_id}" data-side="${side}">✕</button>
      </li>
    `).join('');
};

const fillInjuriesSelects = (sectionEl, state) => {
    if (!sectionEl || !state) return;
    const fill = (side, allPlayers, currentInjured) => {
        const sel = sectionEl.querySelector(`select[data-side="${side}"]`);
        if (!sel) return;
        const currentIds = new Set(currentInjured.map(p => p.player_id));
        const available = allPlayers.filter(p => !currentIds.has(p.player_id));
        sel.innerHTML = `
        <option value="">Añadir lesionado…</option>
        ${available.map(p => `
          <option value="${p.player_id}">${p.name}</option>
        `).join('')}
      `;
    };
    fill('local', state.playersLocal || [], state.injuriesLocal || []);
    fill('visitante', state.playersVisitante || [], state.injuriesVisitante || []);
};

const initInjuriesEditor = async (matchId, meta) => {
    if (!bodyEl) return;
    const section = bodyEl.querySelector('.injuries-editor');
    if (!section) return;

    const statusEl = section.querySelector('.injuries-status');
    const saveBtn = section.querySelector('.btn-save-injuries');

    const state = await loadScorerStateForMatch(meta);
    if (!state) {
        if (statusEl) statusEl.textContent = 'Error cargando datos.';
        return;
    }

    const refreshUI = () => {
        fillInjuriesSelects(section, state);
        renderInjuriesList(section, 'local', state);
        renderInjuriesList(section, 'visitante', state);
    };

    refreshUI();

    section.querySelectorAll('.btn-add-injury').forEach(btn => {
        btn.addEventListener('click', () => {
            const side = btn.getAttribute('data-side');
            const sel = section.querySelector(`select[data-side="${side}"]`);
            if (!sel) return;
            const val = sel.value;
            if (!val) return;
            addInjuryToState(matchId, side, val);
            refreshUI();
        });
    });

    section.addEventListener('click', (e) => {
        const target = e.target;
        const btnRem = target.closest && target.closest('.btn-remove-injury');
        if (btnRem) {
            e.preventDefault();
            const side = btnRem.getAttribute('data-side');
            const pid = btnRem.getAttribute('data-player-id');
            if (side && pid) {
                removeInjuryFromState(matchId, side, pid);
                refreshUI();
            }
        }
    });

    if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
            if (statusEl) statusEl.textContent = 'Guardando...';
            saveBtn.disabled = true;
            try {
                const res = await saveInjuriesFull(matchId);
                if (statusEl) statusEl.textContent = res.msg || '';
            } finally {
                saveBtn.disabled = false;
            }
        });
    }
};
