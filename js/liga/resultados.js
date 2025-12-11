import {
  loadAllMatches,
  getJornadas,
  getPartidoMeta,
  loadCitiesMap
} from '../modules/resultados-data.js';

import {
  renderJornada
} from '../modules/resultados-ui.js';

import {
  initModalRefs,
  openModal,
  renderStats
} from '../modules/resultados-modal.js';

import { createNavigationControls } from '../modules/navigation.js';
import { getCompetitionFromURL, getCurrentCompetitionSlug, buildBreadcrumb, renderBreadcrumb } from '../modules/competition-context.js';
import { getCompetitionBySlug } from '../modules/competition-data.js';

(async () => {
  const root = document.getElementById('resultados');
  if (!root) return;

  // --- Obtener contexto de competición ---
  let competitionId = null;
  let competitionSlug = null;
  let competitionName = null;

  try {
    competitionSlug = getCompetitionFromURL() || await getCurrentCompetitionSlug();
    if (competitionSlug) {
      const competition = await getCompetitionBySlug(competitionSlug);
      if (competition) {
        competitionId = competition.id;
        competitionName = competition.name;
      }
    }
  } catch (e) {
    console.warn('Error obteniendo contexto de competición:', e);
    // Continuar sin filtro de competición (compatibilidad hacia atrás)
  }

  // --- Renderizar breadcrumb ---
  const breadcrumbContainer = document.createElement('div');
  breadcrumbContainer.className = 'breadcrumb-container';
  breadcrumbContainer.style.marginBottom = '1rem';
  root.insertAdjacentElement('beforebegin', breadcrumbContainer);
  
  if (competitionName) {
    const breadcrumbItems = buildBreadcrumb(competitionSlug, competitionName, 'Resultados');
    renderBreadcrumb(breadcrumbContainer, breadcrumbItems);
  }

  // Modal refs
  const bodyEl = document.getElementById('stats-body');
  const titleEl = document.getElementById('stats-title');

  // Helpers init - pass IDs instead of DOM elements
  initModalRefs('stats-backdrop', 'stats-close', bodyEl, titleEl);

  // Cargar datos
  root.innerHTML = `<p class="hint">Cargando resultados...</p>`;

  // Start background loads
  loadCitiesMap();

  const { jornadas, partidoMeta } = await loadAllMatches(competitionId);

  if (!Array.isArray(jornadas) || !jornadas.length) {
    root.innerHTML = `<p class="hint">No se pudieron cargar los partidos.</p>`;
    return;
  }

  // Find last played
  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
  let lastPlayed = 0;
  jornadas.forEach(j => {
    if ((j.partidos || []).some(p => isNum(p.goles_local) && isNum(p.goles_visitante))) {
      if (j.numero > lastPlayed) lastPlayed = j.numero;
    }
  });
  if (!lastPlayed) {
    lastPlayed = jornadas[jornadas.length - 1].numero;
  }

  const minJornada = Math.min(...jornadas.map(j => j.numero));
  const maxJornada = Math.max(...jornadas.map(j => j.numero));

  // Init UI
  const navWrap = document.createElement('div');
  navWrap.className = 'jornada-nav resultados-nav';
  navWrap.innerHTML = `
    <button id="res-prev" class="nav-btn">◀</button>
    <span id="res-label" class="jornada-label chip"></span>
    <button id="res-next" class="nav-btn">▶</button>
  `;

  const jornadaWrap = document.createElement('div');
  jornadaWrap.id = 'jornada-contenido';
  jornadaWrap.className = 'resultados-jornada';

  root.innerHTML = '';
  root.appendChild(navWrap);
  root.appendChild(jornadaWrap);

  const labelEl = document.getElementById('res-label');
  const prevBtn = document.getElementById('res-prev');
  const nextBtn = document.getElementById('res-next');

  let current = lastPlayed;

  // Create navigation controls
  createNavigationControls({
    prevBtn,
    nextBtn,
    labelEl,
    minValue: minJornada,
    maxValue: maxJornada,
    initialValue: lastPlayed,
    onUpdate: async (newValue) => {
      current = newValue;
      await renderJornada(jornadas, current, jornadaWrap, labelEl, () => current);
    },
    formatLabel: (val) => `Jornada ${val}`
  });

  // Initial render
  await renderJornada(jornadas, current, jornadaWrap, labelEl, () => current);

  // Global handler for clicks in root (upload, cards)
  root.addEventListener('click', async (e) => {
    const target = e.target;

    // 1) Botón "Subir imagen" logic - handled here or in results-ui?
    // In original code it was in resultados.js main block.
    // I can rewrite it here.
    const uploadBtn = target.closest?.('.upload-photo-btn');
    if (uploadBtn) {
      e.preventDefault();
      // handleUploadClick(uploadBtn) needs to be defined or imported.
      // It was in resultados.js line 2045.
      // I forgot to export/move handleUploadClick.
      // I can duplicate it here (small) or move to results-data/results-ui.
      // It involves fetching presigned URL. It fits in resultados-data.
      // But it interacts with DOM (file input).
      // I'll define it here for simplicity as it's an "event handler" helper.
      handleUploadClick(uploadBtn);
      return;
    }

    // 2) Tarjeta de partido
    const cardBtn = target.closest?.('.partido-card');
    if (!cardBtn) return;

    const id = cardBtn.getAttribute('data-partido-id');
    if (!id) return;

    // We can fetch partidoMeta via getPartidoMeta
    const meta = getPartidoMeta(id);
    if (!meta || !bodyEl) return;

    openModal();
    // Render Stats
    await renderStats(id, meta);
    // renderStats in modal module handles internal loading of scorer editors etc.
  });

  // ---------------
  // Upload Logic (Local Copy)
  // ---------------
  const requestUploadUrl = async (matchId, file) => {
    // Config hardcoded here as in original or import?
    // original: const MATCH_UPLOAD = { enabled: true, presignEndpoint: ... }
    const MATCH_UPLOAD = {
      enabled: true,
      presignEndpoint: 'https://d39ra5ecf4.execute-api.eu-west-1.amazonaws.com/prod/presign-match-upload'
    };

    if (!MATCH_UPLOAD.enabled || !MATCH_UPLOAD.presignEndpoint) {
      throw new Error('Subida de imágenes no configurada');
    }

    const payload = {
      matchId,
      filename: file.name,
      contentType: file.type || 'image/jpeg'
    };

    const res = await fetch(MATCH_UPLOAD.presignEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) throw new Error(`Error solicitando URL: HTTP ${res.status}`);
    const data = await res.json();
    if (!data || !data.uploadUrl) throw new Error('Respuesta sin uploadUrl');
    return data.uploadUrl;
  };

  const uploadMatchImage = async (matchId, file, buttonEl) => {
    try {
      buttonEl.disabled = true;
      buttonEl.textContent = 'Subiendo...';
      const uploadUrl = await requestUploadUrl(matchId, file);
      const res = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'image/jpeg' },
        body: file
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      buttonEl.textContent = 'Imagen subida ✔';
      buttonEl.classList.add('upload-success');
    } catch (err) {
      console.error(err);
      alert('No se ha podido subir la imagen. Inténtalo de nuevo.');
      buttonEl.disabled = false;
      buttonEl.textContent = 'Subir imagen';
    }
  };

  const handleUploadClick = (btn) => {
    const matchId = btn.getAttribute('data-partido-id');
    if (!matchId) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.addEventListener('change', () => {
      const file = input.files && input.files[0];
      if (!file) return;
      uploadMatchImage(matchId, file, btn);
    });
    input.click();
  };

  // Initial Render
  await renderJornada(jornadas, current, jornadaWrap, labelEl, () => current);

})();
