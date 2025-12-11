import { Modal } from '../modules/modal.js';
import { queryTable, withErrorHandling } from '../modules/db-helpers.js';
import { getCompetitionFromURL, getCurrentCompetitionSlug } from '../modules/competition-context.js';
import { getCompetitionBySlug } from '../modules/competition-data.js';

(async () => {
  // --- Obtener contexto de competición ---
  let competitionId = null;
  try {
    const competitionSlug = getCompetitionFromURL() || await getCurrentCompetitionSlug();
    if (competitionSlug) {
      const competition = await getCompetitionBySlug(competitionSlug);
      if (competition) {
        competitionId = competition.id;
      }
    }
  } catch (e) {
    console.warn('Error obteniendo contexto de competición:', e);
  }

  // Carga segura desde Supabase usando el nuevo helper
  const data = await withErrorHandling(
    () => queryTable('noticias', '*', { 
      useSeason: false,
      competitionId: competitionId,
      autoCompetitionId: true // Intentar obtener automáticamente si no se proporciona
    }),
    {
      errorMessage: 'No se pudo cargar noticias desde Supabase',
      fallback: []
    }
  );

  // Filtra ocultas: { "oculta": true } -> no se muestran
  const visibles = (data || []).filter(n => !n.oculta);

  // Normaliza/ordena SOLO visibles
  visibles.forEach(n => n.fechaObj = new Date(n.fecha));
  visibles.sort((a, b) => b.fechaObj - a.fechaObj);

  // ====== MODAL (refs + helpers) ======
  const titleEl = document.getElementById('news-title');
  const metaEl = document.getElementById('news-meta');
  const bodyEl = document.getElementById('news-content');

  // Create modal using new Modal module
  const newsModal = new Modal('news-backdrop', 'news-close');

  // Set cleanup hook
  newsModal.onClose = () => {
    if (titleEl) titleEl.textContent = '';
    if (metaEl) metaEl.textContent = '';
    if (bodyEl) bodyEl.innerHTML = '';
  };

  // ====== HERO CARRUSEL (destacadas) ======
  try {
    const destacadas = visibles.filter(n => n.destacado);
    const hero = document.querySelector('.hero-carousel');
    const track = document.getElementById('hero-track');
    const dots = document.getElementById('hero-dots');
    const prev = document.getElementById('hero-prev');
    const next = document.getElementById('hero-next');

    if (!hero || !track || !dots || !prev || !next) throw new Error('Hero DOM faltante');

    const heroSlides = destacadas.map(n => ({
      id: n.id,
      titulo: n.titulo,
      fecha: n.fecha,
      img: (Array.isArray(n.imagenes) && n.imagenes.length ? n.imagenes[0] : n.img)
    }));

    if (heroSlides.length === 0) {
      hero.style.display = 'none';
    } else {
      track.innerHTML = heroSlides.map(s => `
        <div class="hero-slide" data-id="${s.id}">
          <img src="${s.img || 'https://picsum.photos/1200/600?blur=2'}" alt="${s.titulo || ''}">
          <div class="hero-caption">
            <strong>${s.titulo || ''}</strong><br/>
            <small>${fmtDate(s.fecha) || ''}</small>
          </div>
        </div>
      `).join('');

      dots.innerHTML = heroSlides.map((_, i) => `<button data-i="${i}" aria-label="Ir al slide ${i + 1}"></button>`).join('');
      let idx = 0, timer;
      const go = (i) => {
        idx = (i + heroSlides.length) % heroSlides.length;
        track.style.transform = `translateX(-${idx * 100}%)`;
        dots.querySelectorAll('button').forEach((b, j) => b.classList.toggle('active', j === idx));
        restart();
      };
      const restart = () => { clearInterval(timer); timer = setInterval(() => go(idx + 1), 5000); };

      next.addEventListener('click', () => go(idx + 1));
      prev.addEventListener('click', () => go(idx - 1));
      dots.querySelectorAll('button').forEach(b => b.addEventListener('click', () => go(+b.dataset.i)));
      go(0);

      // Click en slide → popup (buscar en visibles)
      track.querySelectorAll('.hero-slide').forEach(sl => {
        sl.style.cursor = 'pointer';
        sl.addEventListener('click', () => {
          const id = sl.getAttribute('data-id');
          const nota = visibles.find(n => String(n.id) === String(id));
          openNewsModal(nota);
        });
      });
    }
  } catch (err) {
    console.warn('Carrusel desactivado por error:', err);
    const hero = document.querySelector('.hero-carousel');
    if (hero) hero.style.display = 'none';
  }

  // ====== HISTÓRICO (listado) ======
  try {
    const grid = document.getElementById('news-grid');
    if (!grid) {
      // En páginas sin histórico (por ejemplo la home) simplemente no hacemos nada
      return;
    }

    if (!visibles.length) {
      grid.innerHTML = `<p>No hay noticias por ahora.</p>`;
    } else {
      grid.innerHTML = visibles.map(n => `
        <article class="news-card">
          <a class="news-open" data-id="${n.id}" href="javascript:void(0)" aria-label="Abrir noticia" style="display:block">
            <img src="${n.img || 'https://picsum.photos/800/450?blur=2'}" alt="${n.titulo || ''}">
            <div class="content">
              <h3 class="news-title">${n.titulo || ''}</h3>
              ${n.resumen ? `<p class="news-resumen"><em>${n.resumen}</em></p>` : ''}
              <p class="news-fecha"><small>${fmtDate(n.fecha) || ''}</small></p>
            </div>
          </a>
        </article>
      `).join('');

      grid.querySelectorAll('.news-open').forEach(el => {
        el.addEventListener('click', () => {
          const nota = visibles.find(n => String(n.id) === String(el.dataset.id));
          openNewsModal(nota);
        });
      });
    }
  } catch (e) {
    console.error('Error pintando histórico:', e);
  }


  // ====== MODAL NOTICIA ======
  function openNewsModal(n) {
    if (!n) return;

    // Título y fecha (fuera del body)
    if (titleEl) titleEl.textContent = n.titulo || '';
    if (metaEl) metaEl.textContent = fmtDate(n.fecha) || '';

    // Imágenes: usamos la primera como "hero"
    const imgs = Array.isArray(n.imagenes) ? n.imagenes : (n.img ? [n.img] : []);
    const hero = imgs.length ? `
      <figure class="news-hero">
        <img src="${imgs[0]}" alt="${n.titulo || ''}">
      </figure>
    ` : '';

    // Resumen (cursiva) + cuerpo completo
    const resumenHTML = n.resumen ? `<p class="news-summary"><em>${n.resumen}</em></p>` : '';
    const cuerpoHTML = n.cuerpo || '';

    // Contenido del popup (resumen → imagen → cuerpo)
    if (bodyEl) bodyEl.innerHTML = `
      ${resumenHTML}
      ${hero}
      <div class="news-article">${cuerpoHTML}</div>
    `;

    newsModal.open();
  }
})();
