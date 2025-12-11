import { loadLeagueTeams } from './modules/db-helpers.js';
import { getSupabaseClient, getActiveSeason } from './modules/supabase-client.js';
import { getCurrentUser, getCurrentProfile } from './modules/auth.js';

document.addEventListener('DOMContentLoaded', async () => {
  // Si ya está logueado, redirigir al dashboard
  const currentUser = await getCurrentUser();
  if (currentUser) {
    const profile = await getCurrentProfile();
    if (profile?.is_admin) {
      window.location.href = 'admin.html';
      return;
    }
    window.location.href = 'dashboard.html';
    return;
  }

  const supabase = await getSupabaseClient();
  const season = getActiveSeason();

  const form = document.getElementById('register-form');
  const emailInput = document.getElementById('reg-email');
  const passInput = document.getElementById('reg-password');
  const nickInput = document.getElementById('reg-nickname');
  const teamSelect = document.getElementById('reg-team');
  const errorEl = document.getElementById('register-error');
  const successEl = document.getElementById('register-success');

  // 1) Cargar equipos usando helper
  async function loadTeams() {
    try {
      const data = await loadLeagueTeams({
        select: 'id, nickname',
        orderByNickname: true
      });

      if (!data || !data.length) {
        teamSelect.innerHTML = '<option value="">No hay equipos para esta temporada</option>';
        teamSelect.disabled = true;
        return;
      }

      teamSelect.innerHTML =
        '<option value="">Selecciona tu equipo</option>' +
        data.map(t => `<option value="${t.nickname}">${t.nickname}</option>`).join('');
      teamSelect.disabled = false;
    } catch (error) {
      console.error(error);
      teamSelect.innerHTML = '<option value="">Error cargando equipos</option>';
      teamSelect.disabled = true;
    }
  }

  await loadTeams();

  // 2) Manejar registro
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.textContent = '';
    successEl.textContent = '';
    form.classList.add('is-loading');

    const email = emailInput.value.trim();
    const password = passInput.value;
    const nickname = nickInput.value.trim();
    const teamNickname = teamSelect.value;

    if (!teamNickname) {
      errorEl.textContent = 'Debes seleccionar un equipo.';
      form.classList.remove('is-loading');
      return;
    }

    try {
      // a) Crear usuario en Supabase Auth
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: 'https://xaaaaii7.github.io/lliga/login.html'
        }
      });

      if (signUpError) {
        console.error(signUpError);
        if (signUpError.message && signUpError.message.includes('already registered')) {
          errorEl.textContent = 'Ese email ya está registrado.';
        } else {
          errorEl.textContent = 'Error creando el usuario.';
        }
        form.classList.remove('is-loading');
        return;
      }

      const user = signUpData.user;
      if (!user) {
        errorEl.textContent = 'No se pudo obtener el usuario tras el registro.';
        form.classList.remove('is-loading');
        return;
      }

      // b) Crear fila en profiles
      const { error: profError } = await supabase
        .from('profiles')
        .insert({
          id: user.id,
          nickname,
          team_nickname: teamNickname,
          is_admin: false,
          is_approved: false
        });

      if (profError) {
        console.error(profError);
        errorEl.textContent = 'Usuario creado, pero error creando el perfil. Contacta con el admin.';
        form.classList.remove('is-loading');
        return;
      }

      // c) Mensaje final
      successEl.textContent =
        'Registro completado. Tu cuenta está pendiente de aprobación por el administrador.';
      form.reset();
    } catch (err) {
      console.error(err);
      errorEl.textContent = 'Error inesperado durante el registro.';
    } finally {
      form.classList.remove('is-loading');
    }
  });
});
