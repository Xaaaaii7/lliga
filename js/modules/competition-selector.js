/**
 * Competition Selector Component
 * 
 * Componente reutilizable para seleccionar y cambiar entre competiciones
 */

import { getCurrentUser } from './auth.js';
import { getUserCompetitions, getPublicCompetitions } from './competition-data.js';
import { getCompetitionFromURL, buildURLWithCompetition, navigateWithCompetition } from './competition-context.js';
import { getCurrentCompetition } from './competitions.js';
import { escapeHtml } from './utils.js';

/**
 * Renderiza el selector de competición en el header
 * @param {HTMLElement} container - Contenedor donde renderizar (opcional, se crea si no existe)
 * @param {Object} options - Opciones
 * @param {boolean} options.showOnLanding - Mostrar en páginas de landing (default: false)
 * @param {boolean} options.compact - Modo compacto (default: false)
 * @returns {Promise<HTMLElement>} Elemento del selector
 */
export async function renderCompetitionSelector(container = null, options = {}) {
    const {
        showOnLanding = false,
        compact = false
    } = options;

    // Detectar si estamos en una página de landing
    const currentPage = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    const isLandingPage = currentPage === 'index.html' || 
                         currentPage === 'competitions.html' || 
                         currentPage === 'dashboard.html' ||
                         document.body.classList.contains('page-landing');

    // No mostrar en landing pages a menos que se especifique
    if (isLandingPage && !showOnLanding) {
        return null;
    }

    // Crear contenedor si no existe
    if (!container) {
        const header = document.querySelector('.site-header');
        if (!header) return null;

        container = document.createElement('div');
        container.id = 'competition-selector-container';
        container.className = 'competition-selector-container';
        
        // Insertar después del nav o antes del user-section
        const nav = document.getElementById('main-nav');
        const userSection = document.getElementById('user-section');
        if (nav && nav.nextSibling) {
            header.insertBefore(container, nav.nextSibling);
        } else if (userSection) {
            header.insertBefore(container, userSection);
        } else {
            header.appendChild(container);
        }
    }

    // Obtener competición actual
    const currentCompetition = await getCurrentCompetition();
    const currentSlug = getCompetitionFromURL();

    // Obtener competiciones disponibles
    let competitions = [];
    const user = await getCurrentUser();
    
    if (user) {
        // Si está logueado, mostrar sus competiciones
        competitions = await getUserCompetitions();
    } else {
        // Si no está logueado, mostrar competiciones públicas
        competitions = await getPublicCompetitions({ status: 'active' });
    }

    // Si no hay competiciones, no mostrar el selector
    if (!competitions || competitions.length === 0) {
        container.style.display = 'none';
        return null;
    }

    // Si solo hay una competición y es la actual, mostrar indicador simple
    if (competitions.length === 1 && currentCompetition && competitions[0].id === currentCompetition.id) {
        container.innerHTML = `
            <div class="competition-indicator ${compact ? 'compact' : ''}">
                <span class="competition-badge ${currentCompetition.is_official ? 'official' : 'unofficial'}">
                    ${currentCompetition.is_official ? '🏆' : '⚽'}
                </span>
                <span class="competition-name">${escapeHtml(currentCompetition.name)}</span>
            </div>
        `;
        return container;
    }

    // Renderizar selector dropdown
    const currentName = currentCompetition?.name || 'Seleccionar competición';
    const currentBadge = currentCompetition?.is_official ? '🏆' : '⚽';
    const currentClass = currentCompetition?.is_official ? 'official' : 'unofficial';

    container.innerHTML = `
        <div class="competition-selector ${compact ? 'compact' : ''}">
            <button 
                class="competition-selector-btn" 
                id="competition-selector-btn"
                aria-label="Seleccionar competición"
                aria-expanded="false"
                aria-haspopup="true"
            >
                <span class="competition-badge ${currentClass}">${currentBadge}</span>
                <span class="competition-name">${escapeHtml(currentName)}</span>
                <span class="competition-arrow">▼</span>
            </button>
            <div class="competition-dropdown" id="competition-dropdown" role="menu">
                ${competitions.map(comp => {
                    const isActive = currentCompetition && comp.id === currentCompetition.id;
                    const badge = comp.is_official ? '🏆' : '⚽';
                    const badgeClass = comp.is_official ? 'official' : 'unofficial';
                    
                    return `
                        <a 
                            href="${buildURLWithCompetition(currentPage, comp.slug)}"
                            class="competition-option ${isActive ? 'active' : ''}"
                            role="menuitem"
                            data-competition-slug="${comp.slug}"
                        >
                            <span class="competition-badge ${badgeClass}">${badge}</span>
                            <span class="competition-option-name">${escapeHtml(comp.name)}</span>
                            ${comp.season ? `<span class="competition-season">${escapeHtml(comp.season)}</span>` : ''}
                            ${isActive ? '<span class="competition-check">✓</span>' : ''}
                        </a>
                    `;
                }).join('')}
                ${user ? `
                    <div class="competition-dropdown-divider"></div>
                    <a href="competitions.html" class="competition-option competition-option-all">
                        Ver todas las competiciones →
                    </a>
                ` : ''}
            </div>
        </div>
    `;

    // Configurar eventos
    setupCompetitionSelectorEvents(container);

    return container;
}

/**
 * Configura los eventos del selector de competición
 * @param {HTMLElement} container - Contenedor del selector
 */
function setupCompetitionSelectorEvents(container) {
    const btn = container.querySelector('#competition-selector-btn');
    const dropdown = container.querySelector('#competition-dropdown');
    
    if (!btn || !dropdown) return;

    // Toggle dropdown
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = dropdown.classList.toggle('open');
        btn.setAttribute('aria-expanded', String(isOpen));
        
        if (isOpen) {
            // Cerrar al hacer click fuera
            setTimeout(() => {
                document.addEventListener('click', closeDropdown, { once: true });
            }, 0);
        }
    });

    // Cerrar dropdown
    function closeDropdown() {
        dropdown.classList.remove('open');
        btn.setAttribute('aria-expanded', 'false');
    }

    // Prevenir cierre al hacer click dentro del dropdown
    dropdown.addEventListener('click', (e) => {
        e.stopPropagation();
    });

    // Cerrar con Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && dropdown.classList.contains('open')) {
            closeDropdown();
        }
    });
}

/**
 * Actualiza el selector de competición con la competición actual
 * Útil cuando se cambia de competición sin recargar la página
 */
export async function updateCompetitionSelector() {
    const container = document.getElementById('competition-selector-container');
    if (container) {
        await renderCompetitionSelector(container);
    }
}

