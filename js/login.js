import { login, getCurrentUser, getCurrentProfile } from './modules/auth.js';
import { getSupabaseClient } from './modules/supabase-client.js';

document.addEventListener('DOMContentLoaded', async () => {
  // Si ya está logueado, redirigir al dashboard
  const user = await getCurrentUser();
  if (user) {
    const profile = await getCurrentProfile();
    if (profile?.is_admin) {
      window.location.href = 'admin.html';
      return;
    }
    window.location.href = 'dashboard.html';
    return;
  }

  const form = document.getElementById('login-form');
  const emailInput = document.getElementById('login-email');
  const passInput = document.getElementById('login-password');
  const errorEl = document.getElementById('login-error');

  const forgotLink = document.getElementById('forgot-password-link');
  const forgotSection = document.getElementById('forgot-password-section');
  const forgotForm = document.getElementById('forgot-form');
  const forgotEmailInput = document.getElementById('forgot-email');
  const forgotMsg = document.getElementById('forgot-msg');

  // ─────────────────────────────
  // Login normal
  // ─────────────────────────────
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.textContent = '';
    form.classList.add('is-loading');

    const email = emailInput.value.trim();
    const password = passInput.value;

    try {
      await login(email, password);

      // Después de login, decidir destino según profile
      const user = await getCurrentUser();
      if (!user) {
        errorEl.textContent = 'No se pudo obtener el usuario tras el login.';
        form.classList.remove('is-loading');
        return;
      }

      const profile = await getCurrentProfile();

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
        errorEl.textContent = 'Tu cuenta está creada pero aún no ha sido aprobada por el organizador.';
        form.classList.remove('is-loading');
        return;
      }

      // NUEVO: Redirigir a dashboard en lugar de club directamente
      // El dashboard mostrará las competiciones del usuario y desde ahí podrá navegar
      window.location.href = 'dashboard.html';
      return;
    } catch (err) {
      console.error(err);
      errorEl.textContent = err?.message || 'Error de login. Revisa email y contraseña.';
    } finally {
      form.classList.remove('is-loading');
    }
  });

  // ─────────────────────────────
  // Mostrar / ocultar bloque "olvidé contraseña"
  // ─────────────────────────────
  if (forgotLink && forgotSection && forgotForm && forgotEmailInput && forgotMsg) {
    forgotLink.addEventListener('click', () => {
      const hidden = forgotSection.hidden;
      forgotSection.hidden = !hidden;
      forgotMsg.textContent = '';

      // Si lo acabamos de abrir y el campo está vacío, copiamos el email del login
      if (!forgotSection.hidden && !forgotEmailInput.value && emailInput.value) {
        forgotEmailInput.value = emailInput.value;
      }
    });

    // ─────────────────────────────
    // Enviar email de restablecimiento
    // ─────────────────────────────
    forgotForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      forgotMsg.textContent = '';
      forgotForm.classList.add('is-loading');

      const email = forgotEmailInput.value.trim();
      if (!email) {
        forgotMsg.textContent = 'Introduce un email válido.';
        forgotForm.classList.remove('is-loading');
        return;
      }

      try {
        const supabase = await getSupabaseClient();
        const { error } = await supabase.auth.resetPasswordForEmail(email);
        if (error) {
          console.error(error);
          forgotMsg.textContent = 'No se ha podido enviar el correo. Inténtalo de nuevo en unos minutos.';
          forgotForm.classList.remove('is-loading');
          return;
        }

        // Mensaje neutro (sin decir si el email existe o no)
        forgotMsg.textContent = 'Si la dirección existe en el sistema, recibirás un correo con instrucciones para crear una nueva contraseña.';
      } catch (err) {
        console.error(err);
        forgotMsg.textContent = 'Ha ocurrido un error. Inténtalo más tarde.';
      } finally {
        forgotForm.classList.remove('is-loading');
      }
    });
  }
});
