(async () => {
  // Carga segura
  let data = [];
  try {
    data = await loadJSON('data/noticias.json');
  } catch (e) {
    console.error('No se pudo cargar noticias.json', e);
    data = [];
  }

  // Normaliza/ordena
  data.forEach(n => n.fechaObj = new Date(n.fecha));
  data.sort((a,b)=> b.fechaObj - a.fechaObj);

  // ---------- HERO CARRUSEL (destacadas) ----------
  try {
    const destacadas = data.filter(n=>n.destacado);
    const hero = document.querySelector('.hero-carousel');
    const track = document.getElementById('hero-track');
    const dots  = document.getElementById('hero-dots');
    const prev  = document.getElementById('hero-prev');
    const next  = document.getElementById('hero-next');

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

      dots.innerHTML = heroSlides.map((_,i)=>`<button data-i="${i}" aria-label="Ir al slide ${i+1}"></button>`).join('');
      let idx = 0, timer;
      const go = (i)=>{
        idx = (i + heroSlides.length) % heroSlides.length;
        track.style.transform = `translateX(-${idx*100}%)`;
        dots.querySelectorAll('button').forEach((b,j)=> b.classList.toggle('active', j===idx));
        restart();
      };
      const restart = ()=>{ clearInterval(timer); timer = setInterval(()=> go(idx+1), 5000); };

      next.addEventListener('click', ()=> go(idx+1));
      prev.addEventListener('click', ()=> go(idx-1));
      dots.querySelectorAll('button').forEach(b=> b.addEventListener('click', ()=> go(+b.dataset.i)));
      go(0);

      // Click en slide → popup
      track.querySelectorAll('.hero-slide').forEach(sl => {
        sl.style.cursor = 'pointer';
        sl.addEventListener('click', ()=>{
          const id = sl.getAttribute('data-id');
          const nota = data.find(n=> String(n.id) === String(id));
          openNewsModal(nota);
        });
      });
    }
  } catch (err) {
    console.warn('Carrusel desactivado por error:', err);
    const hero = document.querySelector('.hero-carousel');
    if (hero) hero.style.display = 'none';
  }

  // ---------- HISTÓRICO (listado) ----------
try {
  const grid = document.getElementById('news-grid');
  if (!grid) throw new Error('news-grid no encontrado');

  if (!data.length) {
    grid.innerHTML = `<p>No hay noticias por ahora.</p>`;
  } else {
    grid.innerHTML = data.map(n=>`
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

    grid.querySelectorAll('.news-open').forEach(el=>{
      el.addEventListener('click', ()=>{
        const nota = data.find(n=> String(n.id) === String(el.dataset.id));
        openNewsModal(nota);
      });
    });
  }
} catch (e) {
  console.error('Error pintando histórico:', e);
}

// ---------- MODAL NOTICIA ----------
function openNewsModal(n){
  if (!n) return;
  titleEl.textContent = n.titulo || '';
  metaEl.textContent  = fmtDate(n.fecha) || '';

  const imgs = Array.isArray(n.imagenes) ? n.imagenes : (n.img ? [n.img] : []);
  const galeria = imgs.length ? `
    <div class="hero-carousel" style="margin:10px 0">
      <div class="hero-track" id="galeria-track">
        ${imgs.map(src=>`<div class="hero-slide" style="height:260px"><img src="${src}" alt=""></div>`).join('')}
      </div>
    </div>` : '';

  // 👉 En el popup mostramos SOLO el cuerpo completo (y si no hay, el resumen)
  const cuerpoHTML = n.cuerpo || (n.resumen ? `<p>${n.resumen}</p>` : '');

  bodyEl.innerHTML = cuerpoHTML + galeria;

  const gt = document.getElementById('galeria-track');
  if (gt && imgs.length>1){
    let i=0; setInterval(()=>{ i=(i+1)%imgs.length; gt.style.transform=`translateX(-${i*100}%)`; }, 4000);
  }
  open();
}

})();
