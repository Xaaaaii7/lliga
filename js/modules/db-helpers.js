/**
 * Database Query Helpers
 * 
 * Módulo para centralizar queries comunes a Supabase y reducir código duplicado.
 * Incluye manejo automático de temporada (season) y errores consistente.
 */

import { getSupabaseClient, getActiveSeason } from './supabase-client.js';

/**
 * Query simple con filtro de temporada automático
 * @param {string} table - Nombre de la tabla
 * @param {string} select - Columnas a seleccionar (formato Supabase)
 * @param {Object} options - Opciones adicionales
 * @param {boolean} options.useSeason - Si debe filtrar por temporada (default: true)
 * @param {Object} options.filters - Filtros adicionales { column: value }
 * @param {Object} options.order - Ordenamiento { column: string, ascending: boolean }
 * @param {number} options.limit - Límite de resultados
 * @returns {Promise<Array>} Datos de la query
 * @throws {Error} Si hay error en la query
 */
export async function queryTable(table, select = '*', options = {}) {
    const {
        useSeason = true,
        filters = {},
        order = null,
        limit = null
    } = options;

    const supabase = await getSupabaseClient();
    let query = supabase.from(table).select(select);

    // Filtro de temporada automático
    if (useSeason) {
        const season = getActiveSeason();
        if (season) {
            query = query.eq('season', season);
        }
    }

    // Filtros adicionales
    for (const [column, value] of Object.entries(filters)) {
        if (value !== null && value !== undefined) {
            query = query.eq(column, value);
        }
    }

    // Ordenamiento
    if (order) {
        query = query.order(order.column, { ascending: order.ascending ?? true });
    }

    // Límite
    if (limit) {
        query = query.limit(limit);
    }

    const { data, error } = await query;

    if (error) {
        console.error(`Error querying ${table}:`, error);
        throw error;
    }

    return data || [];
}

/**
 * Query con múltiples filtros NOT NULL
 * Útil para obtener solo partidos jugados, etc.
 * @param {string} table - Nombre de la tabla
 * @param {string} select - Columnas a seleccionar
 * @param {string[]} notNullColumns - Columnas que no deben ser null
 * @param {Object} options - Opciones adicionales (igual que queryTable)
 * @returns {Promise<Array>}
 */
export async function queryTableNotNull(table, select, notNullColumns = [], options = {}) {
    const supabase = await getSupabaseClient();
    const season = options.useSeason !== false ? getActiveSeason() : null;

    let query = supabase.from(table).select(select);

    if (season && options.useSeason !== false) {
        query = query.eq('season', season);
    }

    // Aplicar filtros NOT NULL
    for (const col of notNullColumns) {
        query = query.not(col, 'is', null);
    }

    // Filtros adicionales
    if (options.filters) {
        for (const [column, value] of Object.entries(options.filters)) {
            if (value !== null && value !== undefined) {
                query = query.eq(column, value);
            }
        }
    }

    // Ordenamiento
    if (options.order) {
        query = query.order(options.order.column, { ascending: options.order.ascending ?? true });
    }

    // Límite
    if (options.limit) {
        query = query.limit(options.limit);
    }

    const { data, error } = await query;

    if (error) {
        console.error(`Error querying ${table}:`, error);
        throw error;
    }

    return data || [];
}

/**
 * Query por ID único
 * @param {string} table - Nombre de la tabla
 * @param {string|number} id - ID del registro
 * @param {string} select - Columnas a seleccionar
 * @param {string} idColumn - Nombre de la columna ID (default: 'id')
 * @returns {Promise<Object|null>}
 */
export async function queryById(table, id, select = '*', idColumn = 'id') {
    const supabase = await getSupabaseClient();

    const { data, error } = await supabase
        .from(table)
        .select(select)
        .eq(idColumn, id)
        .single();

    if (error) {
        console.error(`Error querying ${table} by ${idColumn}:`, error);
        throw error;
    }

    return data;
}

/**
 * Carga equipos de la liga para la temporada actual
 * (Wrapper específico, muy usado)
 * @param {Object} options - Opciones
 * @param {string} options.select - Columnas a seleccionar
 * @param {boolean} options.orderByNickname - Ordenar por nickname (default: true)
 * @returns {Promise<Array>}
 */
export async function loadLeagueTeams(options = {}) {
    const {
        select = 'id, nickname, display_name',
        orderByNickname = true
    } = options;

    return queryTable('league_teams', select, {
        useSeason: true,
        order: orderByNickname ? { column: 'nickname', ascending: true } : null
    });
}

/**
 * Carga partidos con relaciones a equipos
 * (Wrapper específico, muy usado)
 * @param {Object} options - Opciones adicionales
 * @returns {Promise<Array>}
 */
export async function loadMatches(options = {}) {
    const defaultSelect = `
    id,
    season,
    round_id,
    match_date,
    match_time,
    home_goals,
    away_goals,
    stream_url,
    home_league_team_id,
    away_league_team_id,
    home:league_teams!matches_home_league_team_id_fkey ( id, nickname, display_name ),
    away:league_teams!matches_away_league_team_id_fkey ( id, nickname, display_name )
  `;

    const { select = defaultSelect, ...restOptions } = options;

    return queryTable('matches', select, {
        useSeason: true,
        order: { column: 'round_id', ascending: true },
        ...restOptions
    });
}

/**
 * Helper para manejar errores de forma consistente
 * Ejecuta una función async y maneja errores de forma estándar
 * @param {Function} asyncFn - Función async a ejecutar
 * @param {Object} options - Opciones
 * @param {string} options.errorMessage - Mensaje de error customizado
 * @param {*} options.fallback - Valor de fallback si hay error (default: null)
 * @returns {Promise<*>}
 */
export async function withErrorHandling(asyncFn, options = {}) {
    const { errorMessage = 'Error en query', fallback = null } = options;

    try {
        return await asyncFn();
    } catch (err) {
        console.error(errorMessage, err);
        return fallback;
    }
}
