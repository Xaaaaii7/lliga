import { Modal } from './modules/modal.js';
import { loadLeagueTeams, loadMatches } from './modules/db-helpers.js';
import { getSupabaseClient, getActiveSeason } from './modules/supabase-client.js';
import { ensureAdmin } from './modules/auth.js';
import { fmtDate } from './modules/utils.js';

document.addEventListener('DOMContentLoaded', async () => {
  const ok = await ensureAdmin();
  if (!ok) return;

  const season = getActiveSeason();
  const seasonLabelEl = document.getElementById('season-label');
  const adminSeasonEl = document.getElementById('admin-season');
  if (seasonLabelEl) seasonLabelEl.textContent = season;
  if (adminSeasonEl) adminSeasonEl.textContent = season;

  const supabase = await getSupabaseClient();
  const tbody = document.getElementById('matches-tbody');

  // 1) Cargar league_teams usando helper
  let teams = [];
  try {
    teams = await loadLeagueTeams({
      select: 'id, nickname',
      orderByNickname: true
    });
  } catch (teamsError) {
    console.error(teamsError);
    tbody.innerHTML = '<tr><td colspan="8">Error cargando equipos.</td></tr>';
    return;
  }

  const teamsById = {};
  (teams || []).forEach(t => { teamsById[t.id] = t; });

  // 2) Cargar partidos usando helper
  let matches = [];
  try {
    matches = await loadMatches({
      select: `
        id,
        season,
        round_id,
        match_date,
        match_time,
        home_goals,
        away_goals,
        stream_url,
        home_league_team_id,
        away_league_team_id,
        home:league_teams!matches_home_league_team_id_fkey ( id, nickname ),
        away:league_teams!matches_away_league_team_id_fkey ( id, nickname )
      `
    });
  } catch (matchesError) {
    console.error(matchesError);
    tbody.innerHTML = '<tr><td colspan="8">Error cargando partidos.</td></tr>';
    return;
  }

  if (!matches || !matches.length) {
    tbody.innerHTML = '<tr><td colspan="8">No hay partidos para esta temporada.</td></tr>';
    return;
  }

  tbody.innerHTML = matches.map(m => {
    const fecha = m.match_date ? fmtDate(m.match_date) : '';
    const hora = m.match_time ? m.match_time.slice(0, 5) : '';
    const local = m.home?.nickname || teamsById[m.home_league_team_id]?.nickname || '-';
    const visit = m.away?.nickname || teamsById[m.away_league_team_id]?.nickname || '-';
    const res = (m.home_goals == null || m.away_goals == null)
      ? '–'
      : `${m.home_goals} - ${m.away_goals}`;

    return `
      <tr data-id="${m.id}">
        <td>${m.id}</td>
        <td>${m.round_id ?? ''}</td>
        <td>${fecha}</td>
        <td>${hora}</td>
        <td>${local}</td>
        <td>${visit}</td>
        <td>${res}</td>
        <td>
          <button class="btn btn-secondary btn-sm btn-edit-match" data-id="${m.id}">
            Editar
          </button>
        </td>
      </tr>
    `;
  }).join('');

  // ─────────────────────────────
  // Modal
  // ─────────────────────────────
  const form = document.getElementById('match-form');
  const errorEl = document.getElementById('match-error');
  const cancelBtn = document.getElementById('match-cancel-btn');

  const idHidden = document.getElementById('match-id');
  const idRead = document.getElementById('match-id-readonly');
  const roundInput = document.getElementById('match-round');
  const homeSelect = document.getElementById('match-home-team');
  const awaySelect = document.getElementById('match-away-team');
  const dateInput = document.getElementById('match-date');
  const timeInput = document.getElementById('match-time');
  const homeGoalsInput = document.getElementById('match-home-goals');
  const awayGoalsInput = document.getElementById('match-away-goals');
  const streamInput = document.getElementById('match-stream-url');

  // Create modal using Modal class
  const matchModal = new Modal('match-modal-backdrop', 'match-modal-close');

  // Override body.style.overflow behavior to use classList instead
  matchModal.onOpen = () => {
    document.body.classList.add('modal-open');
  };
  matchModal.onClose = () => {
    document.body.classList.remove('modal-open');
  };

  const renderTeamOptions = () => {
    const opts =
      '<option value="">— Selecciona equipo —</option>' +
      (teams || []).map(t => `<option value="${t.id}">${t.nickname}</option>`).join('');
    homeSelect.innerHTML = opts;
    awaySelect.innerHTML = opts;
  };
  renderTeamOptions();

  function openModal(matchId) {
    const match = matches.find(m => m.id === matchId);
    if (!match) return;

    errorEl.textContent = '';
    form.classList.remove('is-loading');

    idHidden.value = match.id;
    idRead.value = match.id;
    roundInput.value = match.round_id ?? '';

    homeSelect.value = match.home_league_team_id ?? '';
    awaySelect.value = match.away_league_team_id ?? '';

    dateInput.value = match.match_date || '';
    timeInput.value = match.match_time ? match.match_time.slice(0, 5) : '';

    homeGoalsInput.value = match.home_goals != null ? match.home_goals : '';
    awayGoalsInput.value = match.away_goals != null ? match.away_goals : '';

    streamInput.value = match.stream_url || '';

    matchModal.open();
  }

  cancelBtn.addEventListener('click', () => matchModal.close());

  tbody.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-edit-match');
    if (!btn) return;
    const id = btn.getAttribute('data-id');
    openModal(id);
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.textContent = '';
    form.classList.add('is-loading');

    const matchId = idHidden.value;
    const match = matches.find(m => m.id === matchId);
    if (!match) {
      errorEl.textContent = 'Partido no encontrado en memoria.';
      form.classList.remove('is-loading');
      return;
    }

    const homeId = homeSelect.value ? parseInt(homeSelect.value, 10) : null;
    const awayId = awaySelect.value ? parseInt(awaySelect.value, 10) : null;

    const date = dateInput.value || null;
    const time = timeInput.value || null;

    const hgStr = homeGoalsInput.value;
    const agStr = awayGoalsInput.value;

    const homeGoals = hgStr === '' ? null : Number(hgStr);
    const awayGoals = agStr === '' ? null : Number(agStr);

    if ((homeGoals !== null && (Number.isNaN(homeGoals) || homeGoals < 0)) ||
      (awayGoals !== null && (Number.isNaN(awayGoals) || awayGoals < 0))) {
      errorEl.textContent = 'Los goles deben ser ≥ 0 o vacíos para "no jugado".';
      form.classList.remove('is-loading');
      return;
    }

    const streamUrl = streamInput.value.trim() || null;

    const { error: updError } = await supabase
      .from('matches')
      .update({
        home_league_team_id: homeId,
        away_league_team_id: awayId,
        match_date: date,
        match_time: time,
        home_goals: homeGoals,
        away_goals: awayGoals,
        stream_url: streamUrl
      })
      .eq('id', matchId);

    if (updError) {
      console.error(updError);
      errorEl.textContent = 'Error guardando cambios del partido.';
      form.classList.remove('is-loading');
      return;
    }

    // Actualizar en memoria
    match.home_league_team_id = homeId;
    match.away_league_team_id = awayId;
    match.match_date = date;
    match.match_time = time;
    match.home_goals = homeGoals;
    match.away_goals = awayGoals;
    match.stream_url = streamUrl;

    // Actualizar fila tabla
    const row = tbody.querySelector(`tr[data-id="${matchId}"]`);
    if (row) {
      const fecha = date ? fmtDate(date) : '';
      const hora = time ? time.slice(0, 5) : '';
      const local = teamsById[homeId]?.nickname || '-';
      const visit = teamsById[awayId]?.nickname || '-';
      const res = (homeGoals == null || awayGoals == null)
        ? '–'
        : `${homeGoals} - ${awayGoals}`;

      row.children[2].textContent = fecha;
      row.children[3].textContent = hora;
      row.children[4].textContent = local;
      row.children[5].textContent = visit;
      row.children[6].textContent = res;
    }

    form.classList.remove('is-loading');
    matchModal.close();
  });
});
