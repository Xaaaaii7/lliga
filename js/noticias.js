(async () => {
  const data = await loadJSON('data/noticias.json');
  data.forEach(n => n.fechaObj = new Date(n.fecha));
  data.sort((a,b)=> b.fechaObj - a.fechaObj);

  // ---------- HERO CARRUSEL ----------
  const destacadas = data.filter(n=>n.destacado);
  const track = document.getElementById('hero-track');
  const dots  = document.getElementById('hero-dots');
  const prev  = document.getElementById('hero-prev');
  const next  = document.getElementById('hero-next');

  const heroSlides = destacadas.map(n => ({
    id: n.id,
    titulo: n.titulo,
    fecha: n.fecha,
    img: (Array.isArray(n.imagenes) && n.imagenes.length ? n.imagenes[0] : n.img)
  }));

  if (heroSlides.length === 0) {
    document.querySelector('.hero-carousel').style.display = 'none';
  } else {
    track.innerHTML = heroSlides.map(s => `
      <div class="hero-slide" data-id="${s.id}">
        <img src="${s.img}" alt="${s.titulo}">
        <div class="hero-caption">
          <strong>${s.titulo}</strong><br/>
          <small>${fmtDate(s.fecha)}</small>
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
    const restart = ()=>{
      clearInterval(timer);
      timer = setInterval(()=> go(idx+1), 5000);
    };

    next.addEventListener('click', ()=> go(idx+1));
    prev.addEventListener('click', ()=> go(idx-1));
    dots.querySelectorAll('button').forEach(b=> b.addEventListener('click', ()=> go(+b.dataset.i)));
    go(0);

    // Click en slide abre popup
    track.querySelectorAll('.hero-slide').forEach(sl => {
      sl.style.cursor = 'pointer';
      sl.addEventListener('click', ()=>{
        const id = sl.getAttribute('data-id');
        const nota = data.find(n=> String(n.id) === String(id));
        openNewsModal(nota);
      });
    });
  }

  // ---------- HISTÓRICO ----------
  const grid = document.getElementById('news-grid');
  grid.innerHTML = data.map(n=>`
    <article class="news-card">
      <button class="news-open" data-id="${n.id}" aria-label="Abrir noticia" style="all:unset;display:block;cursor:pointer">
        <img src="${n.img}" alt="${n.titulo}">
        <div class="content">
          <h3>${n.titulo}</h3>
          <p>${n.resumen || ''}</p>
          <p><small>${fmtDate(n.fecha)}</small></p>
        </div>
      </button>
    </article>
  `).join('');
  grid.querySelectorAll('.news-open').forEach(el=>{
    el.addEventListener('click', ()=>{
      const nota = data.find(n=> String(n.id) === String(el.dataset.id));
      openNewsModal(nota);
    });
  });

  // ---------- MODAL NOTICIA ----------
  const backdrop = document.getElementById('news-backdrop');
  const closeBtn = document.getElementById('news-close');
  const titleEl  = document.getElementById('news-title');
  const metaEl   = document.getElementById('news-meta');
  const bodyEl   = document.getElementById('news-content');

  const open = ()=> { backdrop.hidden = false; };
  const close = ()=> { backdrop.hidden = true; titleEl.textContent=''; metaEl.textContent=''; bodyEl.innerHTML=''; };
  closeBtn.addEventListener('click', close);
  backdrop.addEventListener('click', (e)=> { if (e.target === backdrop) close(); });
  document.addEventListener('keydown', (e)=> { if (e.key === 'Escape' && !backdrop.hidden) close(); });

  function openNewsModal(n){
    if (!n) return;
    titleEl.textContent = n.titulo;
    metaEl.textContent  = fmtDate(n.fecha);
    const imgs = Array.isArray(n.imagenes) ? n.imagenes : (n.img ? [n.img] : []);
    const galeria = imgs.length ? `
      <div class="hero-carousel" style="margin:10px 0">
        <div class="hero-track" id="galeria-track">${imgs.map(src=>`
          <div class="hero-slide" style="height:260px"><img src="${src}" alt=""></div>`).join('')}
        </div>
      </div>` : '';
    bodyEl.innerHTML = (n.contenido ? n.contenido : `<p>${n.resumen || ''}</p>`) + galeria;
    const gt = document.getElementById('galeria-track');
    if (gt && imgs.length>1){
      let i=0; setInterval(()=>{ i=(i+1)%imgs.length; gt.style.transform=`translateX(-${i*100}%)`; }, 4000);
    }
    open();
  }
})();
