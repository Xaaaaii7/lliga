import {
    fmtDate,
    logoPath,
    isNum
} from './utils.js'; // From standard utils, or resultados-utils? 
// results.js used AppUtils which mapped to standard utils logic.
// resultados-utils.js only has weather. 
// So I should import from ../modules/utils.js which is adjacent.

import {
    getCityForKey,
    loadSuspensionsForMatches
} from './resultados-data.js';

import {
    fetchWeatherForCity
} from './resultados-utils.js';

const MATCH_UPLOAD = {
    enabled: true,
    presignEndpoint: 'https://d39ra5ecf4.execute-api.eu-west-1.amazonaws.com/prod/presign-match-upload'
};

const logoFor = (name) => logoPath(name); // Wrapper to match existing usage if needed, or just use logoPath directly.

export const renderJornada = async (jornadas, num, jornadaWrap, labelEl, currentNavCallback) => {
    const j = jornadas.find(x => x.numero === num);
    if (!j) {
        jornadaWrap.innerHTML = `<p class="hint">No se ha encontrado la jornada ${num}.</p>`;
        return;
    }

    const labelParts = [`Jornada ${j.numero}`];
    if (j.fecha) labelParts.push(fmtDate(j.fecha));
    if (labelEl) labelEl.textContent = labelParts.join(' · ');

    const partidos = j.partidos || [];
    if (!partidos.length) {
        jornadaWrap.innerHTML = `<p class="hint">Esta jornada no tiene partidos definidos.</p>`;
        return;
    }

    const cardsHtml = partidos.map((p, idx) => {
        const pid = p.id || `J${j.numero}-P${idx + 1}`;
        const gl = isNum(p.goles_local) ? p.goles_local : null;
        const gv = isNum(p.goles_visitante) ? p.goles_visitante : null;
        const marcador = (gl !== null && gv !== null) ? `${gl} – ${gv}` : '-';
        const jugado = (gl !== null && gv !== null);

        let chipText = '';
        let chipClass = '';
        if (jugado) {
            if (gl > gv) {
                chipText = 'Victoria local';
                chipClass = 'chip chip-pos';
            } else if (gl < gv) {
                chipText = 'Victoria visitante';
                chipClass = 'chip chip-neg';
            } else {
                chipText = 'Empate';
                chipClass = 'chip';
            }
        }
        const chipHTML = chipText
            ? `<span class="result-chip ${chipClass}">${chipText}</span>`
            : '';

        const fechaHora = (p.fecha || j.fecha || p.hora)
            ? `<div class="fecha-hora">
             ${p.fecha ? fmtDate(p.fecha) : (j.fecha ? fmtDate(j.fecha) : '')}
             ${p.hora ? ` · ${p.hora}` : ''}
           </div>`
            : '';

        const streamHTML = p.stream
            ? `<div class="result-stream">
             <a href="${p.stream}" target="_blank" rel="noopener noreferrer">
               🔴 Ver directo / VOD
             </a>
           </div>`
            : '';

        const uploadHTML = (!jugado && MATCH_UPLOAD.enabled)
            ? `<div class="result-upload">
             <button type="button"
                     class="upload-photo-btn"
                     data-partido-id="${pid}">
               Subir imagen
             </button>
           </div>`
            : '';

        const hasStats = true;

        const cityName = getCityForKey(p.local);
        const meteoPlaceholder = cityName
            ? `<div class="result-meteo muted"
                 data-city="${cityName}">
             Meteo cargando...
           </div>`
            : '';

        return `
        <article class="result-card ${jugado ? 'result-played' : 'result-pending'}">
          <button class="result-main partido-card"
                  data-partido-id="${pid}"
                  aria-label="Ver estadísticas del partido">
            <div class="result-teams">
              <div class="result-team-block">
                <img class="result-badge" src="${logoFor(p.local)}"
                     alt="Escudo ${p.local}"
                     onerror="this.style.visibility='hidden'">
                <span class="team-name">${p.local}</span>
              </div>
              <span class="result-score">${marcador}</span>
              <div class="result-team-block">
                <img class="result-badge" src="${logoFor(p.visitante)}"
                     alt="Escudo ${p.visitante}"
                     onerror="this.style.visibility='hidden'">
                <span class="team-name">${p.visitante}</span>
              </div>
            </div>
            ${fechaHora}
            ${meteoPlaceholder}
            <div class="result-status-line">
              <div class="result-status-left">
                <span class="result-status ${jugado ? 'played' : 'pending'}">
                  ${jugado ? 'Finalizado' : 'Pendiente'}
                </span>
                ${chipHTML}
              </div>
              ${hasStats ? '<span class="result-link">Ver estadísticas ▸</span>' : ''}
            </div>
          </button>
          ${streamHTML}
          ${uploadHTML}
        </article>
      `;
    }).join('');

    jornadaWrap.innerHTML = `
      <section class="jornada-bloque">
        <div class="results-grid">
          ${cardsHtml}
        </div>
      </section>
    `;

    // Meteo async
    partidos.forEach((p, idx) => {
        const cityName = getCityForKey(p.local);
        if (!cityName) return;

        const pid = p.id || `J${j.numero}-P${idx + 1}`;
        const cardBtn = jornadaWrap.querySelector(`.partido-card[data-partido-id="${pid}"]`);
        if (!cardBtn) return;

        const meteoEl = cardBtn.querySelector('.result-meteo[data-city]');
        if (!meteoEl) return;

        fetchWeatherForCity(cityName)
            .then(cat => {
                // Check if current jornada changed? passed 'currentNavCallback' to check current state?
                // Or just update if element exists.
                // results.js had `if (current !== num) return;`
                // I will assume if the element is still in DOM it's valid to update, or checking `currentNavCallback()`
                if (currentNavCallback && currentNavCallback() !== num) return;

                if (!cat) {
                    meteoEl.textContent = '';
                    return;
                }
                meteoEl.textContent = `Meteo hoy en ${cityName}: ${cat.emoji} ${cat.label}`;
            })
            .catch(() => { });
    });

    // Suspensions
    // assuming hasSupabase is true if this module is loaded/used properly
    if (partidos.length > 0) {
        loadSuspensionsForMatches(partidos)
            .then(suspensionsMap => {
                if (currentNavCallback && currentNavCallback() !== num) return;

                Object.keys(suspensionsMap).forEach(mId => {
                    const cardBtn = jornadaWrap.querySelector(`.partido-card[data-partido-id="${mId}"]`);
                    if (!cardBtn) return;
                    const susList = suspensionsMap[mId];
                    if (!susList || !susList.length) return;

                    const statusLine = cardBtn.querySelector('.result-status-line');
                    if (!statusLine) return;

                    // Check if suspensions already exist to prevent duplicates
                    const existing = cardBtn.querySelector('.result-suspensions');
                    if (existing) return;

                    const div = document.createElement('div');
                    div.className = 'result-suspensions';
                    div.style.marginTop = '8px';
                    div.style.fontSize = '0.8rem';
                    div.style.color = '#ef4444';

                    const sancionados = susList.filter(s => s.reason === 'red_card' || !s.reason);
                    const lesionados = susList.filter(s => s.reason === 'injury');

                    let html = '';
                    if (sancionados.length) {
                        const names = sancionados.map(s => `${s.playerName} (${s.teamName})`).join(', ');
                        html += `<div style="color:#ef4444"><strong>Sancionados:</strong> ${names}</div>`;
                    }
                    if (lesionados.length) {
                        const names = lesionados.map(s => `${s.playerName} (${s.teamName})`).join(', ');
                        html += `<div style="color:#f59e0b"><strong>Lesionados:</strong> ${names}</div>`;
                    }
                    div.innerHTML = html;
                    statusLine.parentNode.insertBefore(div, statusLine.nextSibling);
                });
            })
            .catch(err => console.warn('Error loading suspensions', err));
    }
};
