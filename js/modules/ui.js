import { getCurrentUser, getCurrentProfile, logout } from './auth.js';
import { escapeHtml } from './utils.js';

export async function renderUserSection() {
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
    const safeName = escapeHtml(profile?.nickname || user.email);

    let html = `<span class="user-name">${safeName}</span>`;
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

export function initNavigation() {
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
        // Detectar si estamos en la landing page (index.html)
        const currentPage = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
        const isLandingPage = currentPage === 'index.html' && document.body.classList.contains('page-landing');

        let links;

        if (isLandingPage) {
            // Menú para landing page (público, neutral - sin acceso directo a liga)
            links = [
                ['index.html', 'Inicio'],
                ['competitions.html', 'Competiciones']
            ];
        } else {
            // Detectar si estamos en una página dentro de liga/
            const isInLigaFolder = window.location.pathname.includes('/liga/');
            
            if (isInLigaFolder) {
                // Menú para páginas dentro de liga/
                links = [
                    ['../index.html', 'Inicio'],
                    ['index.html', 'Liga'],
                    ['noticias.html', 'Noticias'],
                    ['clasificacion.html', 'Clasificación'],
                    ['resultados.html', 'Resultados'],
                    ['jugadores.html', 'Jugadores'],
                    ['pichichi.html', 'Pichichi'],
                    ['clubs.html', 'Clubs'],
                    ['jornada.html', 'Jornada'],
                    ['reglas.html', 'Reglas'],
                    ['directos.html', 'Directos']
                ];
            } else {
                // Menú para páginas en raíz (dashboard, admin, etc.)
                links = [
                    ['index.html', 'Inicio'],
                    ['liga/index.html', 'Liga'],
                    ['dashboard.html', 'Dashboard'],
                    ['competitions.html', 'Competiciones']
                ];
            }
        }

        nav.innerHTML = links
            .map(([href, label]) => `<a href="${href}" data-href="${href}">${label}</a>`)
            .join('');

        // Activar link
        nav.querySelectorAll('a').forEach(a => {
            if ((a.getAttribute('data-href') || '').toLowerCase() === currentPage) {
                a.classList.add('active');
            }
        });

        // Botón hamburguesa si no existe
        if (!document.getElementById('menu-toggle')) {
            const btn = document.createElement('button');
            btn.id = 'menu-toggle';
            btn.className = 'menu-toggle';
            btn.setAttribute('aria-label', 'Abrir menú');
            btn.setAttribute('aria-expanded', 'false');
            btn.innerHTML = '<span></span><span></span><span></span>';
            header.insertBefore(btn, nav);

            btn.addEventListener('click', () => {
                const open = header.classList.toggle('open');
                btn.setAttribute('aria-expanded', String(open));
            });
        }
    }

    // Renderizar info de usuario (login/admin/logout)
    // En la landing page, solo mostrar si está logueado
    renderUserSection().catch(console.error);
}
