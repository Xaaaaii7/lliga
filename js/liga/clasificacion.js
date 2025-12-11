

import { logoPath, isNum } from '../modules/utils.js';
import { getResultados } from '../modules/stats-data.js';
import { computeClasificacion, dg } from '../modules/stats-calc.js';
import { computePartidosEquipo, computePosicionesEquipo } from '../modules/stats-analyze.js';
import * as Render from '../modules/render.js';
import { Modal } from '../modules/modal.js';
import { createNavigationControls } from '../modules/navigation.js';
import { getCompetitionFromURL, getCurrentCompetitionSlug, buildBreadcrumb, renderBreadcrumb } from '../modules/competition-context.js';
import { getCompetitionBySlug } from '../modules/competition-data.js';

(async () => {
  const tbody = document.getElementById('tabla-clasificacion');
  if (!tbody) return;

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
  tbody.parentElement.insertAdjacentElement('beforebegin', breadcrumbContainer);
  
  if (competitionName) {
    const breadcrumbItems = buildBreadcrumb(competitionSlug, competitionName, 'Clasificación');
    renderBreadcrumb(breadcrumbContainer, breadcrumbItems);
  }

  // --- Data Loading ---
  let jornadas = [];
  try {
    jornadas = await getResultados(competitionId);
  } catch (e) {
    console.error("Error loading matches:", e);
    Render.renderError(tbody.parentElement, 'No se pudieron cargar los resultados.');
    return;
  }

  if (!Array.isArray(jornadas) || !jornadas.length) {
    Render.renderError(tbody.parentElement, 'No hay jornadas disponibles.');
    return;
  }

  // Detect last played match
  let lastPlayed = 0;
  jornadas.forEach((j, idx) => {
    if ((j.partidos || []).some(p => isNum(p.goles_local) && isNum(p.goles_visitante))) {
      lastPlayed = idx + 1;
    }
  });

  if (lastPlayed === 0) {
    Render.renderEmpty(tbody.parentElement, 'Aún no se ha jugado ninguna jornada.');
    return;
  }

  // --- Create Navigation ---
  const navWrap = document.createElement('div');
  navWrap.className = 'jornada-nav';
  navWrap.innerHTML = `
        <button id="prevJornada" class="nav-btn">◀</button>
        <span id="jornadaLabel" class="jornada-label chip"></span>
        <button id="nextJornada" class="nav-btn">▶</button>
    `;
  tbody.parentElement.insertAdjacentElement('beforebegin', navWrap);

  const label = document.getElementById('jornadaLabel');
  const prevBtn = document.getElementById('prevJornada');
  const nextBtn = document.getElementById('nextJornada');

  // --- Modal Refs ---
  const teamTitleEl = document.getElementById('team-modal-title');
  const teamSummaryEl = document.getElementById('team-modal-summary');
  const teamMetaEl = document.getElementById('team-modal-meta');
  const teamMatchesEl = document.getElementById('team-modal-matches');
  const teamBadgeImg = document.getElementById('team-modal-badge');
  const teamPosHistoryEl = document.getElementById('team-modal-poshistory');

  // Create team modal using Modal module
  const teamModal = new Modal('team-backdrop', 'team-modal-close');

  // Set cleanup hook
  teamModal.onClose = () => {
    if (teamTitleEl) teamTitleEl.textContent = '';
    if (teamSummaryEl) teamSummaryEl.textContent = '';
    if (teamMetaEl) teamMetaEl.textContent = '';
    if (teamMatchesEl) teamMatchesEl.innerHTML = '';
    if (teamPosHistoryEl) teamPosHistoryEl.innerHTML = '';
    if (teamBadgeImg) {
      teamBadgeImg.removeAttribute('src');
      teamBadgeImg.alt = '';
      teamBadgeImg.style.visibility = '';
    }
  };

  // --- Logic: Open Team History ---
  const abrirHistorialEquipo = async (equipos, hasta, teamName) => {
    const eq = equipos.find(e => e.nombre === teamName);
    const partidos = computePartidosEquipo(jornadas, hasta, teamName);
    const posHistory = await computePosicionesEquipo(hasta, teamName, competitionId);

    if (!eq && partidos.length === 0 && posHistory.length === 0) return;

    if (teamBadgeImg) {
      teamBadgeImg.style.visibility = '';
      teamBadgeImg.src = logoPath(teamName);
      teamBadgeImg.alt = `Escudo ${teamName}`;
      teamBadgeImg.onerror = () => teamBadgeImg.style.visibility = 'hidden';
    }

    if (teamTitleEl) teamTitleEl.textContent = teamName;

    if (eq && teamSummaryEl) {
      const diff = dg(eq);
      const diffStr = diff > 0 ? `+${diff}` : `${diff}`;
      teamSummaryEl.textContent =
        `${eq.pj} PJ · ${eq.g} G ${eq.e} E ${eq.p} P · ${eq.gf} GF · ${eq.gc} GC · DG ${diffStr} · ${eq.pts} pts`;
    } else if (teamSummaryEl) {
      teamSummaryEl.textContent = '';
    }

    if (teamMetaEl) teamMetaEl.textContent = `Resultados hasta la jornada ${hasta}`;

    // Render Positions
    if (teamPosHistoryEl) {
      if (!posHistory.length) {
        teamPosHistoryEl.innerHTML = '';
      } else {
        const historyHtml = posHistory.map((h, idx) => {
          const prev = idx > 0 ? posHistory[idx - 1].pos : null;
          let trend = '';
          if (prev !== null) {
            if (h.pos < prev) trend = '↑';
            else if (h.pos > prev) trend = '↓';
          }
          const trendClass = !trend ? '' : (trend === '↑' ? 'pos-up' : 'pos-down');

          return `
                <div class="team-pos-row">
                  <span class="chip chip-jornada">J${h.jornada}</span>
                  <span class="team-pos-value">
                    ${h.pos}º
                    ${trend ? `<span class="team-pos-trend ${trendClass}">${trend}</span>` : ''}
                  </span>
                  <span class="team-pos-points">${h.pts} pts</span>
                </div>
              `;
        }).join('');

        Render.renderContent(teamPosHistoryEl, `
                    <h3 class="team-pos-title">Evolución en la clasificación</h3>
                    <div class="team-pos-list">${historyHtml}</div>
                `);
      }
    }

    // Render Matches
    if (teamMatchesEl) {
      if (!partidos.length) {
        Render.renderEmpty(teamMatchesEl, `Este equipo todavía no ha disputado partidos cerrados hasta la jornada ${hasta}.`);
      } else {
        const matchesHtml = partidos.map(m => {
          const resClass = m.result === 'V' ? 'result-win' : m.result === 'D' ? 'result-loss' : 'result-draw';
          const label = m.result === 'V' ? 'Victoria' : m.result === 'D' ? 'Derrota' : 'Empate';
          return `
            <div class="team-match-row ${resClass}">
              <div class="team-match-left">
                <span class="chip chip-jornada">J${m.jornada}</span>
              </div>
              <div class="team-match-center">
                <span class="team-match-team ${m.isLocal ? 'highlight-team' : ''}">${m.local}</span>
                <span class="team-match-score">${m.gl} – ${m.gv}</span>
                <span class="team-match-team ${!m.isLocal ? 'highlight-team' : ''}">${m.visitante}</span>
              </div>
              <div class="team-match-right">
                <span class="result-pill">${label}</span>
              </div>
            </div>`;
        }).join('');
        Render.renderContent(teamMatchesEl, matchesHtml);
      }
    }

    teamModal.open();
  };

  // --- Render Table Logic ---
  let current = lastPlayed;

  const render = (equipos, jNum) => {
    label.textContent = `Jornada ${jNum}`;

    const tierClass = (i, len) => (
      i < 8 ? 'tier-top' :
        (i < 12 ? 'tier-mid' :
          (i >= len - 4 ? 'tier-bottom' : ''))
    );

    const rowsHtml = equipos.map((e, i) => `
      <tr class="${tierClass(i, equipos.length)}">
        <td class="pos-cell">
          <span class="pos-index">${i + 1}</span>
        </td>
        <td class="team-cell">
          <img class="team-badge"
               src="${logoPath(e.nombre)}"
               alt="Escudo ${e.nombre}"
               onerror="this.style.visibility='hidden'">
          <button type="button"
                  class="team-name-btn"
                  data-team="${e.nombre}">
            ${e.nombre}
          </button>
        </td>
        <td>${e.pj}</td>
        <td>${e.g}</td>
        <td>${e.e}</td>
        <td>${e.p}</td>
        <td>${e.gf}</td>
        <td>${e.gc}</td>
        <td>${dg(e)}</td>
        <td>${e.pts}</td>
      </tr>
    `).join('');

    tbody.innerHTML = rowsHtml;

    tbody.querySelectorAll('.team-name-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const teamName = btn.dataset.team;
        if (!teamName) return;
        await abrirHistorialEquipo(equipos, jNum, teamName);
      });
    });
  };

  // --- Navigation Controls ---
  const labelEl = document.getElementById('jornadaLabel');

  createNavigationControls({
    prevBtn,
    nextBtn,
    labelEl,
    minValue: 1,
    maxValue: lastPlayed,
    initialValue: lastPlayed,
    onUpdate: async (newValue) => {
      current = newValue;
      const equipos = await computeClasificacion(current, { competitionId });
      render(equipos, current);
    },
    formatLabel: (val) => `Jornada ${val}`
  });

  // Initial Render
  const equiposInicial = await computeClasificacion(current, { competitionId });
  render(equiposInicial, current);

})();
