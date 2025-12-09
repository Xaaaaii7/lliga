// ─────────────────────────────
// HELPERS BASE
// ─────────────────────────────

export const normalizeText = (value) => String(value || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim();

export const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export const slugify = (value) => normalizeText(value).replace(/\s+/g, '-');

export const logoPath = (name, base = 'img') => `${base}/${slugify(name)}.png`;

export const fmtDate = (iso) => {
    const d = new Date(iso);
    if (isNaN(d)) return '';
    return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
};

export async function loadJSON(path) {
    const res = await fetch(path, { cache: 'no-store' });
    if (!res.ok) throw new Error('No se pudo cargar ' + path);

    export const isNum = (v) => typeof v === "number" && Number.isFinite(v);

    export const toNum = (v) => {
        if (v == null || v === "") return 0;
        const n = parseFloat(String(v).replace(",", "."));
        return Number.isFinite(n) ? n : 0;
    };

