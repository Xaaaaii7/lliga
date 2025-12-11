/**
 * Landing Page - Página de inicio neutral
 * Muestra información general, competiciones destacadas y CTAs
 */

import { getPublicCompetitions } from './modules/competition-data.js';
import { buildURLWithCompetition } from './modules/competition-context.js';
import { escapeHtml } from './modules/utils.js';

document.addEventListener('DOMContentLoaded', async () => {
  await loadFeaturedCompetitions();
});

/**
 * Carga y muestra competiciones destacadas
 */
async function loadFeaturedCompetitions() {
  const container = document.getElementById('featured-competitions');
  if (!container) return;

  try {
    // Obtener competiciones públicas activas (máximo 6)
    const competitions = await getPublicCompetitions({ 
      status: 'active' 
    });

    if (!competitions || competitions.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <p class="muted">No hay competiciones públicas disponibles en este momento.</p>
          <a href="competitions.html" class="btn btn-primary">Explorar todas</a>
        </div>
      `;
      return;
    }

    // Mostrar máximo 6 competiciones
    const featured = competitions.slice(0, 6);

    container.innerHTML = featured.map(comp => {
      const statusBadge = getStatusBadge(comp.status);
      const typeBadge = comp.is_official 
        ? '<span class="badge badge-official">Oficial</span>'
        : '<span class="badge badge-unofficial">No Oficial</span>';

      return `
        <div class="competition-preview-card">
          <div class="competition-preview-header">
            <h3>${escapeHtml(comp.name)}</h3>
            <div class="competition-badges">
              ${typeBadge}
              ${statusBadge}
            </div>
          </div>
          <div class="competition-preview-body">
            <p class="competition-preview-description">
              ${escapeHtml(comp.description || 'Sin descripción')}
            </p>
            <div class="competition-preview-meta">
              <span><strong>Temporada:</strong> ${escapeHtml(comp.season)}</span>
              ${comp.start_date ? `
                <span><strong>Inicio:</strong> ${formatDate(comp.start_date)}</span>
              ` : ''}
            </div>
          </div>
          <div class="competition-preview-footer">
            <a href="${buildURLWithCompetition('clasificacion.html', comp.slug)}" 
               class="btn btn-primary btn-small">
              Ver competición
            </a>
          </div>
        </div>
      `;
    }).join('');

  } catch (error) {
    console.error('Error cargando competiciones destacadas:', error);
    container.innerHTML = `
      <p class="muted">Error cargando competiciones. Por favor, intenta más tarde.</p>
    `;
  }
}

function getStatusBadge(status) {
  const badges = {
    'draft': '<span class="badge badge-draft">Borrador</span>',
    'open': '<span class="badge badge-open">Inscripciones abiertas</span>',
    'active': '<span class="badge badge-active">Activa</span>',
    'finished': '<span class="badge badge-finished">Finalizada</span>'
  };
  return badges[status] || '';
}

function formatDate(dateString) {
  if (!dateString) return '';
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('es-ES', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
  } catch (e) {
    return dateString;
  }
}
