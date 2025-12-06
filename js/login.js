document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('login-form');
  const emailInput = document.getElementById('login-email');
  const passInput = document.getElementById('login-password');
  const errorEl = document.getElementById('login-error');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.textContent = '';
    form.classList.add('is-loading');

    const email = emailInput.value.trim();
    const password = passInput.value;

    try {
      await AppUtils.login(email, password);

      // Después de login, decidir destino según profile
      const user = await AppUtils.getCurrentUser();
      if (!user) {
        errorEl.textContent = 'No se pudo obtener el usuario tras el login.';
        form.classList.remove('is-loading');
        return;
      }

      const profile = await AppUtils.getCurrentProfile();

      // Admin => panel admin
      if (profile?.is_admin) {
        window.location.href = 'admin.html';
        return;
      }

      // Si no hay perfil por algún motivo
      if (!profile) {
        window.location.href = 'index.html';
        return;
      }

      // Si no está aprobado
      if (profile.is_approved === false) {
        errorEl.textContent = 'Tu cuenta está creada pero aún no ha sido aprobada por el administrador.';
        form.classList.remove('is-loading');
        return;
      }

      // Si tiene team_nickname => redirigir a su club
      if (profile.team_nickname) {
        const team = encodeURIComponent(profile.team_nickname);
        window.location.href = `club.html?team=${team}`;
        return;
      }

      // Fallback: inicio
      window.location.href = 'index.html';
    } catch (err) {
      console.error(err);
      errorEl.textContent = 'Error de login. Revisa email y contraseña.';
    } finally {
      form.classList.remove('is-loading');
    }
  });
});
