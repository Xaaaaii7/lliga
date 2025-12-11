import { Modal } from './modules/modal.js';
import { queryTable } from './modules/db-helpers.js';
import { getSupabaseClient, getActiveSeason } from './modules/supabase-client.js';
import { ensureAdmin } from './modules/auth.js';

document.addEventListener('DOMContentLoaded', async () => {
  const ok = await ensureAdmin();
  if (!ok) return;

  const season = getActiveSeason();
  const seasonLabelEl = document.getElementById('season-label');
  const adminSeasonEl = document.getElementById('admin-season');
  if (seasonLabelEl) seasonLabelEl.textContent = season;
  if (adminSeasonEl) adminSeasonEl.textContent = season;

  const supabase = await getSupabaseClient();
  const tbody = document.getElementById('league-teams-tbody');

  // 1) Cargar league_teams usando helper
  let leagueTeams = [];
  try {
    leagueTeams = await queryTable('league_teams',
      'id, season, nickname, display_name, penalty_points, penalty_reason, club_id',
      {
        useSeason: true,
        order: { column: 'id', ascending: true }
      }
    );
  } catch (error) {
    console.error(error);
    tbody.innerHTML = '<tr><td colspan="6">Error cargando equipos de liga.</td></tr>';
    return;
  }

  if (!leagueTeams || !leagueTeams.length) {
    tbody.innerHTML = '<tr><td colspan="6">No hay equipos para esta temporada.</td></tr>';
    return;
  }

  // 2) Cargar nombres de clubs
  const clubIds = [...new Set(leagueTeams.map(t => t.club_id).filter(Boolean))];

  let clubsById = {};
  if (clubIds.length) {
    try {
      const clubs = await queryTable('clubs', 'id, name', {
        useSeason: false,
        filters: {} // Usar .in() manualmente vía supabase directo para casos especiales
      });

      // Filtrar manualmente
      clubs.filter(c => clubIds.includes(c.id)).forEach(c => { clubsById[c.id] = c; });
    } catch (clubsError) {
      console.warn('Error cargando clubs, se mostrarán IDs.', clubsError);
    }
  }

  tbody.innerHTML = leagueTeams.map(t => {
    const clubName = clubsById[t.club_id]?.name || (t.club_id != null ? `Club #${t.club_id}` : '-');
    const motivoShort = t.penalty_reason
      ? (t.penalty_reason.length > 40 ? t.penalty_reason.slice(0, 37) + '…' : t.penalty_reason)
      : '';

    return `
      <tr data-id="${t.id}">
        <td>${clubName}</td>
        <td>${t.nickname}</td>
        <td>${t.display_name || ''}</td>
        <td>${t.penalty_points}</td>
        <td title="${t.penalty_reason || ''}">${motivoShort}</td>
        <td>
          <button class="btn btn-secondary btn-sm btn-edit-penalty" data-id="${t.id}">
            Editar sanción
          </button>
        </td>
      </tr>
    `;
  }).join('');

  // ─────────────────────────────
  // Modal de sanciones
  // ─────────────────────────────
  const form = document.getElementById('penalty-form');
  const errorEl = document.getElementById('penalty-error');
  const cancelBtn = document.getElementById('penalty-cancel-btn');

  const teamIdInput = document.getElementById('penalty-team-id');
  const teamNameInput = document.getElementById('penalty-team-name');
  const pointsInput = document.getElementById('penalty-points');
  const reasonInput = document.getElementById('penalty-reason');

  // Create modal using Modal class
  const penaltyModal = new Modal('penalty-modal-backdrop', 'penalty-modal-close');

  // Override body.style.overflow behavior to use classList instead
  penaltyModal.onOpen = () => {
    document.body.classList.add('modal-open');
  };
  penaltyModal.onClose = () => {
    document.body.classList.remove('modal-open');
  };

  function openPenaltyModal(teamId) {
    const team = leagueTeams.find(t => t.id === teamId);
    if (!team) return;

    const clubName = clubsById[team.club_id]?.name || (team.club_id != null ? `Club #${team.club_id}` : '-');
    const display = team.display_name || team.nickname;

    errorEl.textContent = '';
    form.classList.remove('is-loading');

    teamIdInput.value = team.id;
    teamNameInput.value = `${clubName} — ${display}`;
    pointsInput.value = team.penalty_points;
    reasonInput.value = team.penalty_reason || '';

    penaltyModal.open();
  }

  cancelBtn.addEventListener('click', () => penaltyModal.close());

  tbody.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-edit-penalty');
    if (!btn) return;
    const id = Number(btn.getAttribute('data-id'));
    openPenaltyModal(id);
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.textContent = '';
    form.classList.add('is-loading');

    const teamId = Number(teamIdInput.value);
    const team = leagueTeams.find(t => t.id === teamId);
    if (!team) {
      errorEl.textContent = 'Equipo no encontrado en memoria.';
      form.classList.remove('is-loading');
      return;
    }

    const pointsStr = pointsInput.value;
    const points = Number(pointsStr);

    if (Number.isNaN(points)) {
      errorEl.textContent = 'Los puntos de sanción deben ser un número (puede ser 0 o negativo).';
      form.classList.remove('is-loading');
      return;
    }

    const reason = reasonInput.value.trim() || null;

    const { error: updError } = await supabase
      .from('league_teams')
      .update({
        penalty_points: points,
        penalty_reason: reason
      })
      .eq('id', teamId);

    if (updError) {
      console.error(updError);
      errorEl.textContent = 'Error guardando la sanción.';
      form.classList.remove('is-loading');
      return;
    }

    // Actualizar memoria
    team.penalty_points = points;
    team.penalty_reason = reason;

    // Actualizar tabla
    const row = tbody.querySelector(`tr[data-id="${teamId}"]`);
    if (row) {
      row.children[3].textContent = points;
      const motivoShort = reason
        ? (reason.length > 40 ? reason.slice(0, 37) + '…' : reason)
        : '';
      row.children[4].textContent = motivoShort;
      row.children[4].setAttribute('title', reason || '');
    }

    form.classList.remove('is-loading');
    penaltyModal.close();
  });
});
