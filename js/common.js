// ─────────────────────────────
// CONFIGURACIÓN SUPABASE (parte superior del script)
// ─────────────────────────────
window.SUPABASE_CONFIG = {
  url: "https://jdbjgrkvwawdibntngpk.supabase.co",
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpkYmpncmt2d2F3ZGlibnRuZ3BrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQwMTQ4NTQsImV4cCI6MjA3OTU5MDg1NH0.t8KkjGmcCwriKfcG8pzZfCwqgddyG2jmYFxuAHH4NfA",
  season: "2025-26"
};
const AppUtils = window.AppUtils || {};

// Helpers base reusables
const normalizeText = (value) => String(value || '')
  .toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .replace(/[^a-z0-9\s-]/g,'')
  .trim();

const slugify = (value) => normalizeText(value).replace(/\s+/g,'-');
const logoPath = (name, base='img') => `${base}/${slugify(name)}.png`;

// Supabase config compartida
const getSupabaseConfig = () => ({
  url: window?.SUPABASE_URL || window?.SUPABASE_CONFIG?.url || '',
  anonKey: window?.SUPABASE_ANON_KEY || window?.SUPABASE_CONFIG?.anonKey || '',
  season: window?.ACTIVE_SEASON || window?.SUPABASE_CONFIG?.season || ''
});

let supabaseClient = null;
async function getSupabaseClient() {
  if (supabaseClient) return supabaseClient;
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.1/+esm');
  const { url, anonKey } = getSupabaseConfig();
  if (!url || !anonKey) throw new Error('Falta configuración de Supabase');
  supabaseClient = createClient(url, anonKey);
  return supabaseClient;
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

Object.assign(AppUtils, {
  loadJSON,
  fmtDate,
  normalizeText,
  slugify,
  logoPath,
  getSupabaseConfig,
  getSupabaseClient,
  getActiveSeason,
  genAlineacionFromEsquema
});

window.AppUtils = AppUtils;

document.addEventListener('DOMContentLoaded', () => {
  const header = document.querySelector('.site-header');
  const nav = document.getElementById('main-nav');
  if (nav && header) {
    // Menú
    const links = [
      ['noticias.html','Noticias'],
      ['clasificacion.html','Clasificación'],
      ['resultados.html','Resultados'],
      ['jugadores.html','Jugadores'],
      ['pichichi.html','Pichichi'],
      ['clubs.html','Clubs'],
      ['jornada.html','Jornada'],
      ['reglas.html','Reglas'],
      ['directos.html','Directos']// 👈 añadido
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
  }
});
