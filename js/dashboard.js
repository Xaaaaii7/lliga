import { getCurrentUser, getCurrentProfile, logout } from './modules/auth.js';
import { getUserCompetitions } from './modules/competition-data.js';
import { getPublicCompetitions, getCompetitionStats } from './modules/competitions.js';
import { buildURLWithCompetition } from './modules/competition-context.js';
import { getOfficialStatsCurrentSeason, getAllCompetitionsStats } from './modules/user-stats.js';

document.addEventListener('DOMContentLoaded', async () => {
  // Verificar autenticación
  const user = await getCurrentUser();
  if (!user) {
    window.location.href = 'login.html';
    return;
  }

  const profile = await getCurrentProfile();
  if (!profile) {
    console.warn('No se pudo cargar el perfil');
    // Podríamos redirigir o mostrar un error
  }

  // Configurar header del usuario
  setupUserHeader(user, profile);

  // Configurar botón de logout
  setupLogout();

  // Cargar datos del dashboard
  await loadDashboardData();
});

function setupUserHeader(user, profile) {
  const userNameEl = document.getElementById('user-name');
  const userEmailEl = document.getElementById('user-email');

  if (userNameEl) {
    userNameEl.textContent = profile?.nickname || user.email || 'Usuario';
  }

  if (userEmailEl) {
    userEmailEl.textContent = user.email || '';
  }
}

function setupLogout() {
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await logout();
    });
  }
}

async function loadDashboardData() {
  try {
    // Cargar competiciones del usuario y públicas en paralelo
    const [userCompetitions, publicCompetitions] = await Promise.all([
      getUserCompetitions(),
      getPublicCompetitions({ status: 'active', limit: 3 })
    ]);

    // Renderizar competiciones del usuario
    renderUserCompetitions(userCompetitions);

    // Renderizar competiciones disponibles
    renderAvailableCompetitions(publicCompetitions);

    // Calcular y mostrar resumen global
    await renderSummary(userCompetitions);

    // Cargar y mostrar estadísticas detalladas
    await renderDetailedStats();

  } catch (error) {
    console.error('Error cargando datos del dashboard:', error);
    showError('Error cargando el dashboard. Por favor, recarga la página.');
  }
}

function renderUserCompetitions(competitions) {
  const container = document.getElementById('competitions-list');
  if (!container) return;

  if (!competitions || competitions.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p class="muted">No estás inscrito en ninguna competición todavía.</p>
        <a href="competitions.html" class="btn btn-primary">Explorar competiciones</a>
      </div>
    `;
    return;
  }

  // Separar activas y finalizadas
  const active = competitions.filter(c => c.status === 'active');
  const finished = competitions.filter(c => c.status === 'finished');

  const competitionsToShow = [...active, ...finished];

  container.innerHTML = competitionsToShow.map(comp => {
    const statusBadge = getStatusBadge(comp.status);
    const typeBadge = comp.is_official 
      ? '<span class="badge badge-official">Oficial</span>'
      : '<span class="badge badge-unofficial">No Oficial</span>';

    return `
      <div class="competition-card">
        <div class="competition-card-header">
          <h3>${escapeHtml(comp.name)}</h3>
          <div class="competition-badges">
            ${typeBadge}
            ${statusBadge}
          </div>
        </div>
        <div class="competition-card-body">
          <p class="competition-description">${escapeHtml(comp.description || 'Sin descripción')}</p>
          <div class="competition-meta">
            <span class="competition-meta-item">
              <strong>Temporada:</strong> ${escapeHtml(comp.season)}
            </span>
            ${comp.start_date ? `
              <span class="competition-meta-item">
                <strong>Inicio:</strong> ${formatDate(comp.start_date)}
              </span>
            ` : ''}
          </div>
        </div>
        <div class="competition-card-footer">
          <a href="${buildURLWithCompetition('clasificacion.html', comp.slug)}" 
             class="btn btn-primary">
            Ver competición
          </a>
        </div>
      </div>
    `;
  }).join('');
}

function renderAvailableCompetitions(competitions) {
  const container = document.getElementById('available-competitions');
  if (!container) return;

  if (!competitions || competitions.length === 0) {
    container.innerHTML = `
      <p class="muted">No hay competiciones públicas disponibles en este momento.</p>
    `;
    return;
  }

  container.innerHTML = competitions.slice(0, 3).map(comp => {
    const statusBadge = getStatusBadge(comp.status);
    const typeBadge = comp.is_official 
      ? '<span class="badge badge-official">Oficial</span>'
      : '<span class="badge badge-unofficial">No Oficial</span>';

    return `
      <div class="competition-card competition-card-preview">
        <div class="competition-card-header">
          <h3>${escapeHtml(comp.name)}</h3>
          <div class="competition-badges">
            ${typeBadge}
            ${statusBadge}
          </div>
        </div>
        <div class="competition-card-body">
          <p class="competition-description">${escapeHtml(comp.description || 'Sin descripción')}</p>
        </div>
        <div class="competition-card-footer">
          <a href="competitions.html" class="btn btn-outline">Ver detalles</a>
        </div>
      </div>
    `;
  }).join('');
}

async function renderSummary(competitions) {
  if (!competitions || competitions.length === 0) {
    // Si no hay competiciones, mostrar ceros
    updateSummaryValue('summary-active-competitions', 0);
    updateSummaryValue('summary-matches-played', 0);
    updateSummaryValue('summary-goals-scored', 0);
    updateSummaryValue('summary-wins', 0);
    return;
  }

  // Contar competiciones activas
  const activeCount = competitions.filter(c => c.status === 'active').length;
  updateSummaryValue('summary-active-competitions', activeCount);

  // Calcular estadísticas globales (todas las competiciones)
  try {
    const allStats = await getAllCompetitionsStats();
    updateSummaryValue('summary-matches-played', allStats.matches_played);
    updateSummaryValue('summary-goals-scored', allStats.goals_for);
    updateSummaryValue('summary-wins', allStats.wins);
  } catch (error) {
    console.error('Error calculando estadísticas globales:', error);
    updateSummaryValue('summary-matches-played', '—');
    updateSummaryValue('summary-goals-scored', '—');
    updateSummaryValue('summary-wins', '—');
  }
}

function updateSummaryValue(id, value) {
  const el = document.getElementById(id);
  if (el) {
    el.textContent = value;
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

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

async function renderDetailedStats() {
  try {
    // Mostrar temporada actual
    const { getActiveSeason } = await import('./modules/supabase-client.js');
    const currentSeason = getActiveSeason();
    const seasonLabel = document.getElementById('current-season-label');
    if (seasonLabel) {
      seasonLabel.textContent = currentSeason || 'N/A';
    }

    // Cargar estadísticas oficiales (temporada actual)
    const officialStats = await getOfficialStatsCurrentSeason();
    renderStatsTable('official-stats-container', officialStats, 'Competiciones Oficiales');

    // Cargar estadísticas todas las competiciones
    const allStats = await getAllCompetitionsStats();
    renderStatsTable('all-stats-container', allStats, 'Todas las Competiciones');

  } catch (error) {
    console.error('Error cargando estadísticas detalladas:', error);
    const officialContainer = document.getElementById('official-stats-container');
    const allContainer = document.getElementById('all-stats-container');
    if (officialContainer) {
      officialContainer.innerHTML = '<p class="error-message">Error cargando estadísticas oficiales.</p>';
    }
    if (allContainer) {
      allContainer.innerHTML = '<p class="error-message">Error cargando estadísticas globales.</p>';
    }
  }
}

function renderStatsTable(containerId, stats, title) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!stats || stats.matches_played === 0) {
    container.innerHTML = '<p class="muted">No hay estadísticas disponibles.</p>';
    return;
  }

  container.innerHTML = `
    <table class="stats-table">
      <thead>
        <tr>
          <th>Métrica</th>
          <th>Valor</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Partidos jugados</td>
          <td><strong>${stats.matches_played}</strong></td>
        </tr>
        <tr>
          <td>Victorias</td>
          <td><strong>${stats.wins}</strong></td>
        </tr>
        <tr>
          <td>Empates</td>
          <td><strong>${stats.draws}</strong></td>
        </tr>
        <tr>
          <td>Derrotas</td>
          <td><strong>${stats.losses}</strong></td>
        </tr>
        <tr>
          <td>Goles a favor</td>
          <td><strong>${stats.goals_for}</strong></td>
        </tr>
        <tr>
          <td>Goles en contra</td>
          <td><strong>${stats.goals_against}</strong></td>
        </tr>
        <tr>
          <td>Diferencia de goles</td>
          <td><strong>${stats.goal_difference >= 0 ? '+' : ''}${stats.goal_difference}</strong></td>
        </tr>
        <tr>
          <td>Puntos totales</td>
          <td><strong>${stats.points}</strong></td>
        </tr>
        <tr>
          <td>Promedio goles a favor</td>
          <td><strong>${stats.avg_goals_for}</strong></td>
        </tr>
        <tr>
          <td>Promedio goles en contra</td>
          <td><strong>${stats.avg_goals_against}</strong></td>
        </tr>
      </tbody>
    </table>
  `;
}

function showError(message) {
  const container = document.querySelector('.dashboard-container');
  if (container) {
    const errorEl = document.createElement('div');
    errorEl.className = 'error-message';
    errorEl.textContent = message;
    container.insertBefore(errorEl, container.firstChild);
  }
}

