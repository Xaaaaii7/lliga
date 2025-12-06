document.addEventListener('DOMContentLoaded', async () => {
  const supabase = await AppUtils.getSupabaseClient();
  const season = AppUtils.getActiveSeason();

  const form = document.getElementById('register-form');
  const emailInput = document.getElementById('reg-email');
  const passInput = document.getElementById('reg-password');
  const nickInput = document.getElementById('reg-nickname');
  const teamSelect = document.getElementById('reg-team');
  const errorEl = document.getElementById('register-error');
  const successEl = document.getElementById('register-success');

  // Si ya está logueado, redirigir (por ejemplo al index o admin)
  const currentUser = await AppUtils.getCurrentUser();
  if (currentUser) {
    window.location.href = 'index.html';
    return;
  }

  // 1) Cargar equipos de la temporada actual
  async function loadTeams() {
    const { data, error } = await supabase
      .from('league_teams')
      .select('id, nickname')
      .eq('season', season)
      .order('nickname', { ascending: true });

    if (error) {
      console.error(error);
      teamSelect.innerHTML = '<option value="">Error cargando equipos</option>';
      teamSelect.disabled = true;
      return;
    }

    if (!data || !data.length) {
      teamSelect.innerHTML = '<option value="">No hay equipos para esta temporada</option>';
      teamSelect.disabled = true;
      return;
    }

    teamSelect.innerHTML =
      '<option value="">Selecciona tu equipo</option>' +
      data.map(t => `<option value="${t.nickname}">${t.nickname}</option>`).join('');
    teamSelect.disabled = false;
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
        password
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
