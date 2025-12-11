import { Modal } from './modules/modal.js';
import { queryTable } from './modules/db-helpers.js';
import { getSupabaseClient } from './modules/supabase-client.js';
import { ensureAdmin } from './modules/auth.js';
import { escapeHtml } from './modules/utils.js';

document.addEventListener('DOMContentLoaded', async () => {
  const ok = await ensureAdmin();
  if (!ok) return;

  const supabase = await getSupabaseClient();
  const tbody = document.getElementById('users-tbody');

  // 1) Cargar profiles usando helper
  let profiles = [];
  try {
    profiles = await queryTable('profiles',
      'id, nickname, team_nickname, is_admin, is_approved, created_at',
      {
        useSeason: false,
        order: { column: 'created_at', ascending: true }
      }
    );
  } catch (error) {
    console.error(error);
    tbody.innerHTML = '<tr><td colspan="6">Error cargando usuarios.</td></tr>';
    return;
  }

  if (!profiles || !profiles.length) {
    tbody.innerHTML = '<tr><td colspan="6">No hay usuarios registrados.</td></tr>';
    return;
  }

  // Ordenar: primero pendientes, luego aprobados
  profiles.sort((a, b) => {
    if (a.is_approved === b.is_approved) {
      return new Date(a.created_at) - new Date(b.created_at);
    }
    return a.is_approved ? 1 : -1; // pendientes primero
  });

  const fmtDate = (iso) => {
    const d = new Date(iso);
    if (isNaN(d)) return '';
    return d.toLocaleString('es-ES', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const renderStatus = (p) => {
    if (p.is_approved) {
      return '<span class="status-pill status-ok">Aprobado</span>';
    }
    return '<span class="status-pill status-pending">Pendiente</span>';
  };

  tbody.innerHTML = profiles.map(p => {
    const created = fmtDate(p.created_at);
    const adminTxt = p.is_admin ? 'Sí' : 'No';
    const statusHtml = renderStatus(p);

    const safeNickname = escapeHtml(p.nickname || '');
    const safeTeam = escapeHtml(p.team_nickname || '');

    const actions = p.is_approved
      ? `<button class="btn btn-secondary btn-sm btn-mark-pending" data-id="${p.id}">Marcar pendiente</button>`
      : `<button class="btn btn-primary btn-sm btn-approve" data-id="${p.id}">Aprobar</button>`;

    const clubLink = p.team_nickname
      ? `<a href="club.html?team=${encodeURIComponent(p.team_nickname)}" target="_blank">${safeTeam}</a>`
      : '';

    return `
      <tr data-id="${p.id}">
        <td>${safeNickname}</td>
        <td>${clubLink}</td>
        <td>${adminTxt}</td>
        <td>${statusHtml}</td>
        <td>${created}</td>
        <td>
          ${actions}
          <button class="btn btn-secondary btn-sm btn-user-details" data-id="${p.id}">
            Detalles
          </button>
        </td>
      </tr>
    `;
  }).join('');

  // ─────────────────────────────
  // Handlers para aprobar / marcar pendiente / detalles
  // ─────────────────────────────

  tbody.addEventListener('click', async (e) => {
    const approveBtn = e.target.closest('.btn-approve');
    const pendingBtn = e.target.closest('.btn-mark-pending');
    const detailsBtn = e.target.closest('.btn-user-details');

    if (!approveBtn && !pendingBtn && !detailsBtn) return;

    if (detailsBtn) {
      const id = detailsBtn.getAttribute('data-id');
      openDetailsModal(id, profiles);
      return;
    }

    const btn = approveBtn || pendingBtn;
    const id = btn.getAttribute('data-id');
    const profile = profiles.find(p => p.id === id);
    if (!profile) return;

    const newApproved = !!approveBtn; // true si es botón aprobar, false si es marcar pendiente

    btn.disabled = true;

    const { error: updError } = await supabase
      .from('profiles')
      .update({ is_approved: newApproved })
      .eq('id', id);

    if (updError) {
      console.error(updError);
      alert('Error actualizando el estado del usuario.');
      btn.disabled = false;
      return;
    }

    // Actualizar en memoria
    profile.is_approved = newApproved;

    // Actualizar fila
    const row = tbody.querySelector(`tr[data-id="${id}"]`);
    if (row) {
      // estado
      row.children[3].innerHTML = renderStatus(profile);
      // acciones
      row.children[5].innerHTML = `
        ${profile.is_approved
          ? `<button class="btn btn-secondary btn-sm btn-mark-pending" data-id="${profile.id}">Marcar pendiente</button>`
          : `<button class="btn btn-primary btn-sm btn-approve" data-id="${profile.id}">Aprobar</button>`
        }
        <button class="btn btn-secondary btn-sm btn-user-details" data-id="${profile.id}">
          Detalles
        </button>
      `;
    }
  });

  // ─────────────────────────────
  // Modal de detalles
  // ─────────────────────────────
  const nickSpan = document.getElementById('user-modal-nickname');
  const teamSpan = document.getElementById('user-modal-team');
  const adminSpan = document.getElementById('user-modal-is-admin');
  const approvedSpan = document.getElementById('user-modal-is-approved');
  const createdSpan = document.getElementById('user-modal-created');
  const closeBtn2 = document.getElementById('user-modal-close-btn');

  // Create modal using Modal class
  const userModal = new Modal('user-modal-backdrop', 'user-modal-close');

  // Override body.style.overflow behavior to use classList instead
  userModal.onOpen = () => {
    document.body.classList.add('modal-open');
  };
  userModal.onClose = () => {
    document.body.classList.remove('modal-open');
  };

  function openDetailsModal(id, profilesArr) {
    const p = profilesArr.find(x => x.id === id);
    if (!p) return;

    nickSpan.textContent = p.nickname || '(sin nickname)';
    teamSpan.textContent = p.team_nickname || '(sin equipo asignado)';
    adminSpan.textContent = p.is_admin ? 'Sí' : 'No';
    approvedSpan.textContent = p.is_approved ? 'Aprobado' : 'Pendiente';
    createdSpan.textContent = fmtDate(p.created_at);

    userModal.open();
  }

  closeBtn2.addEventListener('click', () => userModal.close());
});
