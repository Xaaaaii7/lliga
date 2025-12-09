import { SUPABASE_CONFIG } from './config.js';

let supabaseClient = window.__supabaseClient || null;
let supabaseClientPromise = window.__supabaseClientPromise || null;

export function getSupabaseConfig() {
    return {
        url: window?.SUPABASE_URL || window?.SUPABASE_CONFIG?.url || SUPABASE_CONFIG.url || '',
        anonKey: window?.SUPABASE_ANON_KEY || window?.SUPABASE_CONFIG?.anonKey || SUPABASE_CONFIG.anonKey || '',
        season: window?.ACTIVE_SEASON || window?.SUPABASE_CONFIG?.season || SUPABASE_CONFIG.season || ''
    };
}

export function getActiveSeason() {
    const { season } = getSupabaseConfig();
    return season;
}

export async function loadSupabaseFactory() {
    const cdnUrls = [
        // 1º intento: esm.sh (muy estable para ESM)
        'https://esm.sh/@supabase/supabase-js@2.49.1',
        // 2º intento: jsDelivr (el que tenías antes)
        'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.1/+esm'
    ];

    let createClient = null;
    let lastError = null;

    for (const url of cdnUrls) {
        try {
            const mod = await import(url);
            createClient = mod.createClient;
            if (createClient) break;
        } catch (err) {
            console.warn('No se pudo cargar la librería de BD desde', url, err);
            lastError = err;
        }
    }

    if (!createClient) {
        console.error('No se pudo cargar la librería de BD desde ningún CDN', lastError);
        throw new Error('No se puede conectar con el backend en este momento.');
    }

    return createClient;
}

export async function getSupabaseClient() {
    if (supabaseClient) return supabaseClient;
    if (supabaseClientPromise) return supabaseClientPromise;

    supabaseClientPromise = (async () => {
        const createClient = await loadSupabaseFactory();

        const { url, anonKey } = getSupabaseConfig();
        if (!url || !anonKey) throw new Error('Falta configuración de BD');

        supabaseClient = createClient(url, anonKey);
        // Keep exposing globally for other non-modular scripts if they access via global var directly (unlikely if they use AppUtils, but good for debug)
        window.__supabaseClient = supabaseClient;
        return supabaseClient;
    })();

    window.__supabaseClientPromise = supabaseClientPromise;
    return supabaseClientPromise;
}
