/**
 * Módulo para manejar el contexto de competición en URLs
 * Permite mantener el contexto de competición al navegar entre páginas
 */

/**
 * Obtiene el slug de competición desde los parámetros de la URL
 * @returns {string|null} El slug de la competición o null si no existe
 */
export function getCompetitionFromURL() {
  const params = new URLSearchParams(window.location.search);
  const comp = params.get('comp');
  console.log('[Competition Context] URL params:', window.location.search, 'comp value:', comp);
  return comp || null;
}

/**
 * Obtiene el path base de la aplicación (útil para GitHub Pages)
 * @returns {string} Path base (ej: '/lliga/' o '/')
 */
function getBasePath() {
  const pathname = window.location.pathname;
  // Si estamos en la raíz, retornar '/'
  if (pathname === '/' || pathname === '/index.html') {
    return '/';
  }
  // Extraer el path base (todo hasta el último '/')
  // Ejemplo: '/lliga/clasificacion.html' -> '/lliga/'
  const parts = pathname.split('/').filter(p => p);
  if (parts.length > 1) {
    // Hay un subdirectorio (ej: 'lliga')
    return '/' + parts[0] + '/';
  }
  return '/';
}

/**
 * Construye una URL con el contexto de competición
 * @param {string} path - Ruta relativa (ej: 'clasificacion.html')
 * @param {string|null} competitionSlug - Slug de la competición
 * @param {Object} additionalParams - Parámetros adicionales (ej: {team: 'Atalanta', jornada: 5})
 * @returns {string} URL completa con parámetros
 */
export function buildURLWithCompetition(path, competitionSlug, additionalParams = {}) {
  const basePath = getBasePath();
  // Construir la ruta completa con el path base
  const fullPath = basePath === '/' ? path : basePath + path;
  const url = new URL(fullPath, window.location.origin);
  
  if (competitionSlug) {
    url.searchParams.set('comp', competitionSlug);
  }
  
  Object.entries(additionalParams).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== '') {
      url.searchParams.set(key, value);
    }
  });
  
  return url.pathname + url.search;
}

/**
 * Navega a una URL manteniendo el contexto de competición
 * @param {string} path - Ruta relativa
 * @param {string|null} competitionSlug - Slug de la competición
 * @param {Object} additionalParams - Parámetros adicionales
 */
export function navigateWithCompetition(path, competitionSlug, additionalParams = {}) {
  const url = buildURLWithCompetition(path, competitionSlug, additionalParams);
  window.location.href = url;
}

/**
 * Obtiene el slug de competición actual o intenta obtenerlo del contexto
 * Útil para páginas que necesitan saber en qué competición están
 * @returns {Promise<string|null>} El slug de la competición o null
 */
export async function getCurrentCompetitionSlug() {
  // Primero intentar desde URL
  const fromURL = getCompetitionFromURL();
  if (fromURL) {
    return fromURL;
  }

  // Si no hay en URL, intentar obtener la competición activa del usuario
  // (esto se implementará cuando tengamos el módulo de competiciones)
  try {
    const { getActiveCompetition } = await import('./competition-data.js');
    const active = await getActiveCompetition();
    return active?.slug || null;
  } catch (e) {
    // Si el módulo no existe aún, retornar null
    return null;
  }
}

/**
 * Crea un breadcrumb para mostrar la jerarquía de navegación
 * @param {string|null} competitionSlug - Slug de la competición
 * @param {string} competitionName - Nombre de la competición (opcional)
 * @param {string} currentPage - Nombre de la página actual
 * @returns {Array<{label: string, url: string|null}>} Array de items del breadcrumb
 */
export function buildBreadcrumb(competitionSlug, competitionName, currentPage) {
  const basePath = getBasePath();
  const dashboardPath = basePath === '/' ? 'dashboard.html' : basePath + 'dashboard.html';
  
  const items = [
    { label: 'Dashboard', url: dashboardPath },
  ];

  if (competitionSlug && competitionName) {
    items.push({
      label: competitionName,
      url: buildURLWithCompetition('clasificacion.html', competitionSlug)
    });
  }

  if (currentPage) {
    items.push({
      label: currentPage,
      url: null // Página actual, no es un link
    });
  }

  return items;
}

/**
 * Renderiza un breadcrumb en el DOM
 * @param {HTMLElement} container - Elemento donde renderizar el breadcrumb
 * @param {Array<{label: string, url: string|null}>} items - Items del breadcrumb
 */
export function renderBreadcrumb(container, items) {
  if (!container || !items || items.length === 0) return;

  const breadcrumbHTML = items.map((item, index) => {
    const isLast = index === items.length - 1;
    const separator = !isLast ? '<span class="breadcrumb-separator">›</span>' : '';
    
    if (item.url && !isLast) {
      return `<a href="${item.url}" class="breadcrumb-link">${item.label}</a>${separator}`;
    } else {
      return `<span class="breadcrumb-current">${item.label}</span>${separator}`;
    }
  }).join('');

  container.innerHTML = `<nav class="breadcrumb" aria-label="Breadcrumb">${breadcrumbHTML}</nav>`;
}

