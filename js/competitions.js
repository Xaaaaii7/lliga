import { getCurrentUser } from './modules/auth.js';
import { getCompetitions, isUserInCompetition, getUserCompetitions } from './modules/competition-data.js';
import { getPublicCompetitions, getCompetitionStats } from './modules/competitions.js';
import { buildURLWithCompetition } from './modules/competition-context.js';
import { getSupabaseClient, getActiveSeason } from './modules/supabase-client.js';
import { loadLeagueTeams } from './modules/db-helpers.js';

document.addEventListener('DOMContentLoaded', async () => {
  // Verificar si el usuario está logueado (opcional para esta página)
  const user = await getCurrentUser();

  // Cargar temporadas disponibles
  await loadSeasons();

  // Cargar competiciones iniciales
  await loadCompetitions();

  // Configurar filtros
  setupFilters();

  // Configurar búsqueda
  setupSearch();
});

let allCompetitions = [];
let filteredCompetitions = [];

async function loadSeasons() {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from('competitions')
    .select('season')
    .order('season', { ascending: false });

  if (error) {
    console.error('Error cargando temporadas:', error);
    return;
  }

  const seasons = [...new Set((data || []).map(c => c.season).filter(Boolean))];
  const seasonSelect = document.getElementById('filter-season');
  
  if (seasonSelect) {
    const currentSeason = getActiveSeason();
    seasons.forEach(season => {
      const option = document.createElement('option');
      option.value = season;
      option.textContent = season;
      if (season === currentSeason) {
        option.selected = true;
      }
      seasonSelect.appendChild(option);
    });
  }
}

async function loadCompetitions() {
  const loadingEl = document.getElementById('competitions-loading');
  const gridEl = document.getElementById('competitions-grid');
  const emptyEl = document.getElementById('competitions-empty');

  try {
    // Cargar todas las competiciones públicas
    allCompetitions = await getPublicCompetitions();
    
    // También incluir competiciones privadas si el usuario está logueado
    const user = await getCurrentUser();
    if (user) {
      // Las competiciones privadas se mostrarán si el usuario está inscrito
      // Por ahora solo mostramos públicas
    }

    // Aplicar filtros iniciales
    applyFilters();

  } catch (error) {
    console.error('Error cargando competiciones:', error);
    if (loadingEl) loadingEl.style.display = 'none';
    if (gridEl) {
      gridEl.innerHTML = '<p class="error-message">Error cargando competiciones. Por favor, recarga la página.</p>';
    }
  }
}

function setupFilters() {
  const typeFilter = document.getElementById('filter-type');
  const statusFilter = document.getElementById('filter-status');
  const seasonFilter = document.getElementById('filter-season');

  [typeFilter, statusFilter, seasonFilter].forEach(filter => {
    if (filter) {
      filter.addEventListener('change', () => {
        applyFilters();
      });
    }
  });
}

function setupSearch() {
  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    let searchTimeout;
    searchInput.addEventListener('input', () => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        applyFilters();
      }, 300);
    });
  }
}

function applyFilters() {
  const typeFilter = document.getElementById('filter-type')?.value || '';
  const statusFilter = document.getElementById('filter-status')?.value || '';
  const seasonFilter = document.getElementById('filter-season')?.value || '';
  const searchInput = document.getElementById('search-input')?.value.toLowerCase() || '';

  filteredCompetitions = allCompetitions.filter(comp => {
    // Filtro por tipo
    if (typeFilter === 'official' && !comp.is_official) return false;
    if (typeFilter === 'unofficial' && comp.is_official) return false;

    // Filtro por estado
    if (statusFilter && comp.status !== statusFilter) return false;

    // Filtro por temporada
    if (seasonFilter && comp.season !== seasonFilter) return false;

    // Filtro por búsqueda
    if (searchInput) {
      const nameMatch = comp.name?.toLowerCase().includes(searchInput);
      const descMatch = comp.description?.toLowerCase().includes(searchInput);
      if (!nameMatch && !descMatch) return false;
    }

    return true;
  });

  renderCompetitions();
}

async function renderCompetitions() {
  const loadingEl = document.getElementById('competitions-loading');
  const gridEl = document.getElementById('competitions-grid');
  const emptyEl = document.getElementById('competitions-empty');

  if (loadingEl) loadingEl.style.display = 'none';

  if (!filteredCompetitions || filteredCompetitions.length === 0) {
    if (gridEl) gridEl.innerHTML = '';
    if (emptyEl) emptyEl.style.display = 'block';
    return;
  }

  if (emptyEl) emptyEl.style.display = 'none';

  // Verificar inscripciones del usuario en paralelo
  const user = await getCurrentUser();
  const userCompetitions = user ? await getUserCompetitionsForDisplay() : [];

  // Cargar estadísticas para cada competición
  const competitionsWithStats = await Promise.all(
    filteredCompetitions.map(async comp => {
      const stats = await getCompetitionStats(comp.id);
      const isEnrolled = userCompetitions.some(uc => uc.id === comp.id);
      const enrollmentStatus = isEnrolled 
        ? userCompetitions.find(uc => uc.id === comp.id)?.inscription_status 
        : null;

      return {
        ...comp,
        stats,
        is_enrolled: isEnrolled,
        enrollment_status: enrollmentStatus
      };
    })
  );

  if (gridEl) {
    gridEl.innerHTML = competitionsWithStats.map(comp => renderCompetitionCard(comp)).join('');
  }

  // Configurar botones de inscripción
  setupEnrollmentButtons();
}

async function getUserCompetitionsForDisplay() {
  try {
    return await getUserCompetitions();
  } catch (error) {
    console.error('Error obteniendo competiciones del usuario:', error);
    return [];
  }
}

function renderCompetitionCard(comp) {
  const statusBadge = getStatusBadge(comp.status);
  const typeBadge = comp.is_official 
    ? '<span class="badge badge-official">Oficial</span>'
    : '<span class="badge badge-unofficial">No Oficial</span>';

  const enrollmentButton = getEnrollmentButton(comp);

  return `
    <div class="competition-card" data-competition-id="${comp.id}">
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
          <div class="meta-row">
            <span class="meta-label">Temporada:</span>
            <span class="meta-value">${escapeHtml(comp.season)}</span>
          </div>
          ${comp.start_date ? `
            <div class="meta-row">
              <span class="meta-label">Inicio:</span>
              <span class="meta-value">${formatDate(comp.start_date)}</span>
            </div>
          ` : ''}
          ${comp.end_date ? `
            <div class="meta-row">
              <span class="meta-label">Fin:</span>
              <span class="meta-value">${formatDate(comp.end_date)}</span>
            </div>
          ` : ''}
          ${comp.registration_deadline ? `
            <div class="meta-row">
              <span class="meta-label">Deadline inscripción:</span>
              <span class="meta-value">${formatDate(comp.registration_deadline)}</span>
            </div>
          ` : ''}
        </div>

        <div class="competition-stats">
          <div class="stat-item">
            <span class="stat-label">Equipos:</span>
            <span class="stat-value">${comp.stats?.total_teams || 0}${comp.max_teams ? ` / ${comp.max_teams}` : ''}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Partidos:</span>
            <span class="stat-value">${comp.stats?.played_matches || 0} / ${comp.stats?.total_matches || 0}</span>
          </div>
        </div>
      </div>
      <div class="competition-card-footer">
        ${enrollmentButton}
        <a href="${buildURLWithCompetition('clasificacion.html', comp.slug)}" 
           class="btn btn-outline">
          Ver detalles
        </a>
      </div>
    </div>
  `;
}

function getEnrollmentButton(comp) {
  if (comp.is_enrolled) {
    const statusText = comp.enrollment_status === 'pending' 
      ? 'Pendiente de aprobación' 
      : comp.enrollment_status === 'approved' || comp.enrollment_status === 'active'
      ? 'Inscrito'
      : 'Estado desconocido';
    
    return `
      <button class="btn btn-disabled" disabled>
        ${statusText}
      </button>
    `;
  }

  // Verificar si está llena
  if (comp.max_teams && comp.stats?.total_teams >= comp.max_teams) {
    return `
      <button class="btn btn-disabled" disabled>
        Competición llena
      </button>
    `;
  }

  // Verificar deadline
  if (comp.registration_deadline) {
    const deadline = new Date(comp.registration_deadline);
    const now = new Date();
    if (now > deadline) {
      return `
        <button class="btn btn-disabled" disabled>
          Inscripción cerrada
        </button>
      `;
    }
  }

  // Verificar estado
  if (comp.status !== 'open' && comp.status !== 'active') {
    return `
      <button class="btn btn-disabled" disabled>
        No disponible
      </button>
    `;
  }

  return `
    <button class="btn btn-primary enroll-btn" data-competition-id="${comp.id}">
      Solicitar inscripción
    </button>
  `;
}

function setupEnrollmentButtons() {
  const enrollButtons = document.querySelectorAll('.enroll-btn');
  enrollButtons.forEach(btn => {
    btn.addEventListener('click', async () => {
      const competitionId = parseInt(btn.getAttribute('data-competition-id'));
      await handleEnrollment(competitionId);
    });
  });
}

async function handleEnrollment(competitionId) {
  const user = await getCurrentUser();
  if (!user) {
    alert('Debes iniciar sesión para inscribirte en una competición.');
    window.location.href = 'login.html';
    return;
  }

  // Verificar si ya está inscrito
  const isEnrolled = await isUserInCompetition(competitionId);
  if (isEnrolled) {
    alert('Ya estás inscrito en esta competición.');
    return;
  }

  // Obtener el league_team del usuario
  const leagueTeams = await loadLeagueTeams({
    select: 'id, nickname, display_name, user_id',
    orderByNickname: true
  });

  if (!leagueTeams || leagueTeams.length === 0) {
    alert('No tienes ningún equipo disponible. Contacta con el administrador.');
    return;
  }

  // Si solo tiene un equipo, usarlo directamente
  // Si tiene varios, mostrar selector (por ahora usamos el primero)
  const leagueTeam = leagueTeams[0];

  // Confirmar inscripción
  const confirmed = confirm(`¿Deseas inscribirte en esta competición con el equipo "${leagueTeam.nickname}"?`);
  if (!confirmed) return;

  try {
    const supabase = await getSupabaseClient();
    
    // Insertar en competition_teams
    const { data, error } = await supabase
      .from('competition_teams')
      .insert({
        competition_id: competitionId,
        league_team_id: leagueTeam.id,
        user_id: user.id, // auth.users.id
        status: 'pending' // Requiere aprobación por defecto
      })
      .select()
      .single();

    if (error) {
      console.error('Error inscribiéndose:', error);
      if (error.code === '23505') { // Unique constraint violation
        alert('Ya estás inscrito en esta competición.');
      } else {
        alert('Error al inscribirse. Por favor, inténtalo de nuevo.');
      }
      return;
    }

    alert('Solicitud de inscripción enviada. Espera la aprobación del administrador.');
    
    // Recargar competiciones para actualizar el estado
    await loadCompetitions();

  } catch (error) {
    console.error('Error inscribiéndose:', error);
    alert('Error al inscribirse. Por favor, inténtalo de nuevo.');
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

