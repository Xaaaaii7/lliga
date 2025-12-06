// ─────────────────────────────
// CONFIGURACIÓN SUPABASE
// ─────────────────────────────
window.SUPABASE_CONFIG = {
  url: "https://jdbjgrkvwawdibntngpk.supabase.co",
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpkYmpncmt2d2F3ZGlibnRuZ3BrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQwMTQ4NTQsImV4cCI6MjA3OTU5MDg1NH0.t8KkjGmcCwriKfcG8pzZfCwqgddyG2jmYFxuAHH4NfA",
  season: "2025-26"
};

const AppUtils = window.AppUtils || {};

// ─────────────────────────────
// HELPERS BASE
// ─────────────────────────────
const normalizeText = (value) => String(value || '')
  .toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .replace(/[^a-z0-9\s-]/g,'')
  .trim();

const slugify = (value) => normalizeText(value).replace(/\s+/g,'-');
const logoPath = (name, base='img') => `${base}/${slugify(name)}.png`;

const getSupabaseConfig = () => ({
  url: window?.SUPABASE_URL || window?.SUPABASE_CONFIG?.url || '',
  anonKey: window?.SUPABASE_ANON_KEY || window?.SUPABASE_CONFIG?.anonKey || '',
  season: window?.ACTIVE_SEASON || window?.SUPABASE_CONFIG?.season || ''
});

let supabaseClient = window.__supabaseClient || null;
let supabaseClientPromise = window.__supabaseClientPromise || null;

async function loadSupabaseFactory() {
  const cdnUrls = [
    // 1º intento: esm.sh (muy estable para ESM)
    'https://esm.sh/@supabase/supabase-js@2.49.1',
    // 2º intento: jsDelivr (el que tenías antes)
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.1/+esm'
  ];

  let createClient = null;
  let lastError = null;

  for (const url of cdnUrls) {
    try {
      const mod = await import(url);
      createClient = mod.createClient;
      if (createClient) break;
    } catch (err) {
      console.warn('No se pudo cargar la librería de BD desde', url, err);
      lastError = err;
    }
  }

  if (!createClient) {
    console.error('No se pudo cargar la librería de BD desde ningún CDN', lastError);
    throw new Error('No se puede conectar con el backend en este momento.');
  }

  return createClient;
}

async function getSupabaseClient() {
  if (supabaseClient) return supabaseClient;
  if (supabaseClientPromise) return supabaseClientPromise;

  supabaseClientPromise = (async () => {
    const createClient = await loadSupabaseFactory();

    const { url, anonKey } = getSupabaseConfig();
    if (!url || !anonKey) throw new Error('Falta configuración de BD');

    supabaseClient = createClient(url, anonKey);
    window.__supabaseClient = supabaseClient;
    return supabaseClient;
  })();

  window.__supabaseClientPromise = supabaseClientPromise;
  return supabaseClientPromise;
}

function getActiveSeason() {
  const { season } = getSupabaseConfig();
  return season;
}

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

// Generar alineación automáticamente desde "4-4-2"
function genAlineacionFromEsquema(esquema){
  const [def, mid, fwd] = (esquema||'4-4-2').split('-').map(n=>parseInt(n,10)||0);

  const fila = (n, row, pref) =>
    Array.from({length:n},(_,i)=>({
      slot:`${pref}${i+1}`,
      posicion: pref === 'POR' ? 'POR' : pref,
      fila: row,
      col: i+1
    }));

  return [
    ...fila(fwd,2,'DEL'),
    ...fila(mid,3,'MED'),
    ...fila(def,4,'DEF'),
    { slot:'POR1', posicion:'POR', fila:5, col:3 }
  ];
}

// ─────────────────────────────
// AUTH HELPERS (NUEVO)
// ─────────────────────────────

async function getCurrentUser() {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    console.warn('Error obteniendo usuario actual', error);
    return null;
  }
  return data.user || null;
}

async function getCurrentProfile() {
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from('profiles')
    .select('nickname, is_admin, is_approved, team_nickname')
    .eq('id', user.id)
    .maybeSingle(); // o .single() si prefieres, pero maybeSingle es más permisivo

  if (error) {
    console.warn('Error cargando profile', error);
    return null;
  }
  return data || null;
}


async function isAdmin() {
  const profile = await getCurrentProfile();
  return !!(profile && profile.is_admin === true);
}

async function ensureAdmin(options = {}) {
  const {
    redirectIfNotLogged = 'login.html',
    redirectIfNotAdmin = 'index.html'
  } = options;

  const user = await getCurrentUser();
  if (!user) {
    window.location.href = redirectIfNotLogged;
    return false;
  }

  const profile = await getCurrentProfile();
  if (!profile?.is_admin) {
    window.location.href = redirectIfNotAdmin;
    return false;
  }

  return true;
}

async function login(email, password) {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

async function logout() {
  const supabase = await getSupabaseClient();
  await supabase.auth.signOut();
  // Redirigimos a inicio por defecto
  window.location.href = 'index.html';
}

// Renderizar zona usuario (login/admin/logout) en el header
async function renderUserSection() {
  const header = document.querySelector('.site-header');
  if (!header) return;

  let container = document.getElementById('user-section');
  if (!container) {
    container = document.createElement('div');
    container.id = 'user-section';
    container.className = 'user-section';
    header.appendChild(container);
  }

  const user = await getCurrentUser();
  if (!user) {
    container.innerHTML = `<a href="login.html">Login</a>`;
    return;
  }

  const profile = await getCurrentProfile();

  let html = `<span class="user-name">${profile?.nickname || user.email}</span>`;
  if (profile?.is_admin) {
    html += ` | <a href="admin.html">Admin</a>`;
  }
  html += ` | <a href="#" id="logout-btn">Logout</a>`;

  container.innerHTML = html;

  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      await logout();
    });
  }
}

// Exponer helpers en AppUtils
Object.assign(AppUtils, {
  loadJSON,
  fmtDate,
  normalizeText,
  slugify,
  logoPath,
  getSupabaseConfig,
  getSupabaseClient,
  getActiveSeason,
  genAlineacionFromEsquema,
  getCurrentUser,
  getCurrentProfile,
  isAdmin,
  ensureAdmin,
  login,
  logout
});

window.AppUtils = AppUtils;

// ─────────────────────────────
// HEADER + NAV AUTOMÁTICO
// ─────────────────────────────
document.addEventListener('DOMContentLoaded', () => {

  // ✔ Convertir automáticamente el LOGO del header en enlace a index.html
  const headerLogo = document.querySelector('.site-header .logo');
  if (headerLogo && !headerLogo.closest('a')) {
    const wrapper = document.createElement('a');
    wrapper.href = 'index.html';
    wrapper.style.display = 'inline-block';
    headerLogo.parentNode.insertBefore(wrapper, headerLogo);
    wrapper.appendChild(headerLogo);
  }

  const header = document.querySelector('.site-header');
  const nav = document.getElementById('main-nav');
  if (nav && header) {

    // Menú principal
    const links = [
      ['index.html','Inicio'],
      ['noticias.html','Noticias'],
      ['clasificacion.html','Clasificación'],
      ['resultados.html','Resultados'],
      ['jugadores.html','Jugadores'],
      ['pichichi.html','Pichichi'],
      ['clubs.html','Clubs'],
      ['jornada.html','Jornada'],
      ['reglas.html','Reglas'],
      ['directos.html','Directos']
    ];

    nav.innerHTML = links
      .map(([href,label]) => `<a href="${href}" data-href="${href}">${label}</a>`)
      .join('');

    // Activar link
    const here = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    nav.querySelectorAll('a').forEach(a => {
      if ((a.getAttribute('data-href')||'').toLowerCase() === here) {
        a.classList.add('active');
      }
    });

    // Botón hamburguesa si no existe
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
  }

  // Renderizar info de usuario (login/admin/logout)
  renderUserSection().catch(console.error);
});
