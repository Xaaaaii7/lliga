// ================================
// CONFIG SUPABASE (rellenar)
// ===============================
const SUPABASE_URL = 'https://jdbjgrkvwawdibntngpk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpkYmpncmt2d2F3ZGlibnRuZ3BrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQwMTQ4NTQsImV4cCI6MjA3OTU5MDg1NH0.t8KkjGmcCwriKfcG8pzZfCwqgddyG2jmYFxuAHH4NfA';

// Cliente Supabase (se inicializa más abajo)
let supabase = null;

// Estado global minimal
window.currentUser = null;
window.isAdmin = () => !!(window.currentUser && window.currentUser.role === 'admin');

document.addEventListener('DOMContentLoaded', () => {
  const header = document.querySelector('.site-header');
  const nav = document.getElementById('main-nav');
  if (nav && header) {
    // Menú
    const links = [
      ['index.html','Noticias'],
      ['clasificacion.html','Clasificación'],
      ['resultados.html','Resultados'],
      ['jugadores.html','Jugadores'],
      ['pichichi.html','Pichichi'],
      ['clubs.html','Clubs'],
      ['jornada.html','Jornada'],
      ['reglas.html','Reglas'],
      ['directos.html','Directos']
    ];
    nav.innerHTML = links.map(([href,label]) =>
      `<a href="${href}" data-href="${href}">${label}</a>`).join('');

    // Activo
    const here = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    nav.querySelectorAll('a').forEach(a => {
      if ((a.getAttribute('data-href')||'').toLowerCase() === here) a.classList.add('active');
    });

    // Botón hamburguesa (insertado si no existe)
    if (!document.getElementById('menu-toggle')) {
      const btn = document.createElement('button');
      btn.id = 'menu-toggle';
      btn.className = 'menu-toggle';
      btn.setAttribute('aria-label','Abrir menú');
      btn.setAttribute('aria-expanded','false');
      btn.innerHTML = '<span></span><span></span><span></span>';
      header.insertBefore(btn, nav);
      btn.addEventListener('click', () => {
        const open = header.classList.toggle('open');
        btn.setAttribute('aria-expanded', String(open));
      });
    }

    // Inicializar auth + UI usuario
    void initAuthUI(header);
  }
});

// ===============================
// Auth + UI usuario (Supabase)
// ===============================
async function initAuthUI(headerEl) {
  // 1) Cargar librería Supabase dinámicamente (sin bundler)
  try {
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } catch (e) {
    console.error('Error cargando Supabase JS:', e);
    return;
  }

  // 2) Crear contenedor en el header para el estado de usuario
  let userBox = document.getElementById('user-status');
  if (!userBox) {
    userBox = document.createElement('div');
    userBox.id = 'user-status';
    userBox.className = 'user-status';
    // Lo metemos al final del header
    headerEl.appendChild(userBox);
  }

  // Función para pintar el estado visual
  const renderUserBox = () => {
    const u = window.currentUser;
    if (!u) {
      userBox.innerHTML = `
        <button type="button" class="btn-login" id="btn-login">
          Iniciar sesión
        </button>
      `;
      const loginBtn = document.getElementById('btn-login');
      loginBtn?.addEventListener('click', handleLoginClick);
      return;
    }

    const roleLabel = u.role === 'admin'
      ? '<span class="badge badge-admin">ADMIN</span>'
      : `<span class="badge badge-role">${u.role}</span>`;

    userBox.innerHTML = `
      <span class="user-chip">
        ${roleLabel}
        <span class="user-name">${u.nickname || u.email || 'Usuario'}</span>
      </span>
      <button type="button" class="btn-logout" id="btn-logout">
        Cerrar sesión
      </button>
    `;
    const logoutBtn = document.getElementById('btn-logout');
    logoutBtn?.addEventListener('click', handleLogoutClick);
  };

  // 3) Cargar sesión actual
  try {
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      window.currentUser = null;
      renderUserBox();
      return;
    }

    const userId = session.user.id;

    // 4) Cargar perfil (nickname, role) desde la tabla profiles
    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('nickname, role')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      console.warn('Error leyendo profiles:', error);
    }

    window.currentUser = {
      id: userId,
      email: session.user.email,
      nickname: profiles?.nickname || session.user.email,
      role: profiles?.role || 'viewer'
    };
    renderUserBox();
  } catch (e) {
    console.error('Error inicializando sesión:', e);
    window.currentUser = null;
    renderUserBox();
  }

  // 5) Escuchar cambios de sesión (login/logout en otras pestañas)
  supabase.auth.onAuthStateChange(async (event, session) => {
    if (!session) {
      window.currentUser = null;
      renderUserBox();
      return;
    }
    const userId = session.user.id;
    const { data: profiles } = await supabase
      .from('profiles')
      .select('nickname, role')
      .eq('id', userId)
      .maybeSingle();

    window.currentUser = {
      id: userId,
      email: session.user.email,
      nickname: profiles?.nickname || session.user.email,
      role: profiles?.role || 'viewer'
    };
    renderUserBox();
  });

  // ==========================
  // Handlers login/logout
  // ==========================
  async function handleLoginClick() {
    const email = window.prompt('Introduce tu email para entrar (magic link de Supabase):');
    if (!email) return;

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          // Redirigir de vuelta a la misma página
          emailRedirectTo: window.location.href
        }
      });
      if (error) {
        alert('Error iniciando sesión: ' + error.message);
        return;
      }
      alert('Te he enviado un enlace de login a tu email. Ábrelo y vuelve aquí.');
    } catch (e) {
      console.error('Error login OTP:', e);
      alert('No se ha podido iniciar sesión.');
    }
  }

  async function handleLogoutClick() {
    try {
      await supabase.auth.signOut();
      window.currentUser = null;
      renderUserBox();
      // Opcional: recargar para limpiar estado de páginas
      // location.reload();
    } catch (e) {
      console.error('Error al cerrar sesión:', e);
      alert('No se ha podido cerrar sesión.');
    }
  }
}

// ===============================
// Helpers compartidos existentes
// ===============================
async function loadJSON(path){
  const res = await fetch(path, { cache: 'no-store' });
  if(!res.ok) throw new Error('No se pudo cargar '+path);
  return res.json();
}

function fmtDate(iso){
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return d.toLocaleDateString('es-ES',{day:'2-digit',month:'short',year:'numeric'});
}

// Alineación automática desde "4-4-2"
function genAlineacionFromEsquema(esquema){
  const [def, mid, fwd] = (esquema||'4-4-2').split('-').map(n=>parseInt(n,10)||0);
  const fila = (n, row, pref) =>
    Array.from({length:n},(_,i)=>({slot:`${pref}${i+1}`,posicion:pref==='POR'?'POR':pref,fila:row,col:i+1}));
  return [
    ...fila(fwd,2,'DEL'),
    ...fila(mid,3,'MED'),
    ...fila(def,4,'DEF'),
    {slot:'POR1',posicion:'POR',fila:5,col:3}
  ];
}
