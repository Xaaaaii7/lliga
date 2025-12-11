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

    // Dashboard solo aparece si está logueado, al lado del nombre
    let html = `<span class="user-name">${safeName}</span>`;
    html += ` | <a href="dashboard.html">Dashboard</a>`;
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
    // ✔ Convertir automáticamente el LOGO del header en enlace
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
        // Detectar si estamos en una página de landing (index.html, competitions.html, dashboard.html)
        const currentPage = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
        const isLandingPage = (currentPage === 'index.html' && document.body.classList.contains('page-landing')) ||
                             currentPage === 'competitions.html' ||
                             currentPage === 'dashboard.html';

        let links;

        if (isLandingPage) {
            // Menú para landing pages (index.html y competitions.html tienen el mismo menú)
            // Dashboard también usa este menú pero solo se muestra si está logueado
            if (currentPage === 'dashboard.html') {
                // Dashboard tiene un menú especial
                links = [
                    ['index.html', 'Inicio'],
                    ['competitions.html', 'Competiciones']
                ];
            } else {
                // index.html y competitions.html tienen el mismo menú
                links = [
                    ['index.html', 'Inicio'],
                    ['competitions.html', 'Competiciones']
                ];
            }
        } else {
            // Menú para páginas de liga (clasificacion, resultados, etc.)
            // Verificar si es una página de liga por el nombre del archivo
            const ligaPages = ['clasificacion.html', 'resultados.html', 'jornada.html', 'club.html', 
                              'pichichi.html', 'clubs.html', 'jugadores.html', 'noticias.html', 
                              'reglas.html', 'directos.html'];
            const isLigaPage = ligaPages.includes(currentPage);
            
            if (isLigaPage) {
                // Menú para páginas de liga
                links = [
                    ['liga.html', 'Inicio'],
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
                // Menú para otras páginas (admin, login, register, etc.)
                links = [
                    ['index.html', 'Inicio'],
                    ['competitions.html', 'Competiciones']
                ];
            }
        }

        nav.innerHTML = links
            .map(([href, label]) => `<a href="${href}" data-href="${href}">${label}</a>`)
            .join('');

        // Activar link
        const pageToCompare = currentPage;
        
        nav.querySelectorAll('a').forEach(a => {
            const href = a.getAttribute('data-href') || '';
            const hrefFile = href.split('/').pop().toLowerCase();
            if (hrefFile === pageToCompare) {
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
