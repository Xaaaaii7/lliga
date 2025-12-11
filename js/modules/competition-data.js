/**
 * Módulo para cargar y gestionar datos de competiciones
 * Funciones para interactuar con la tabla competitions y competition_teams
 */

import { getSupabaseClient } from './supabase-client.js';
import { getCurrentUser } from './auth.js';

/**
 * Obtiene una competición por su slug
 * @param {string} slug - Slug de la competición
 * @returns {Promise<Object|null>} Datos de la competición o null si no existe
 */
export async function getCompetitionBySlug(slug) {
  if (!slug) return null;

  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from('competitions')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();

  if (error) {
    console.error('Error obteniendo competición por slug:', error);
    return null;
  }

  return data;
}

/**
 * Obtiene una competición por su ID
 * @param {number} id - ID de la competición
 * @returns {Promise<Object|null>} Datos de la competición o null si no existe
 */
export async function getCompetitionById(id) {
  if (!id) return null;

  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from('competitions')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    console.error('Error obteniendo competición por ID:', error);
    return null;
  }

  return data;
}

/**
 * Obtiene todas las competiciones con filtros opcionales
 * @param {Object} filters - Filtros opcionales
 * @param {boolean} filters.is_public - Solo competiciones públicas
 * @param {boolean} filters.is_official - Solo competiciones oficiales
 * @param {string} filters.season - Filtrar por temporada
 * @param {string} filters.status - Filtrar por estado (draft, open, active, finished)
 * @returns {Promise<Array>} Array de competiciones
 */
export async function getCompetitions(filters = {}) {
  const supabase = await getSupabaseClient();
  let query = supabase
    .from('competitions')
    .select('*')
    .order('created_at', { ascending: false });

  if (filters.is_public !== undefined) {
    query = query.eq('is_public', filters.is_public);
  }

  if (filters.is_official !== undefined) {
    query = query.eq('is_official', filters.is_official);
  }

  if (filters.season) {
    query = query.eq('season', filters.season);
  }

  if (filters.status) {
    query = query.eq('status', filters.status);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error obteniendo competiciones:', error);
    return [];
  }

  return data || [];
}

/**
 * Obtiene las competiciones en las que está inscrito el usuario actual
 * @param {number|null} userId - ID del usuario de la tabla users (si es null, intenta obtenerlo del usuario actual)
 * @returns {Promise<Array>} Array de competiciones con información de inscripción
 */
export async function getUserCompetitions(userId = null) {
  const supabase = await getSupabaseClient();
  
  // Si no se proporciona userId, intentar obtenerlo del usuario actual
  if (!userId) {
    const user = await getCurrentUser();
    if (!user) return [];

    // Buscar el user_id en la tabla users usando el email del usuario autenticado
    const { data: userRow } = await supabase
      .from('users')
      .select('id')
      .eq('email', user.email)
      .maybeSingle();

    if (!userRow) return [];
    userId = userRow.id;
  }

  // Buscar competiciones donde el usuario tiene equipos inscritos
  // competition_teams.user_id se refiere directamente a users.id
  // y coincide con league_teams.user_id
  const { data, error } = await supabase
    .from('competition_teams')
    .select(`
      id,
      status,
      joined_at,
      competition:competitions(*)
    `)
    .eq('user_id', userId)
    .in('status', ['approved', 'active'])
    .order('joined_at', { ascending: false });

  if (error) {
    console.error('Error obteniendo competiciones del usuario:', error);
    return [];
  }

  // Filtrar y mapear resultados
  return (data || [])
    .filter(item => item.competition) // Solo incluir si tiene competición
    .map(item => ({
      ...item.competition,
      inscription_status: item.status,
      joined_at: item.joined_at
    }));
}

/**
 * Obtiene la competición activa del usuario (primera competición activa inscrita)
 * @returns {Promise<Object|null>} Competición activa o null
 */
export async function getActiveCompetition() {
  const competitions = await getUserCompetitions();
  const active = competitions.find(c => c.status === 'active');
  return active || competitions[0] || null;
}

/**
 * Verifica si un usuario está inscrito en una competición
 * @param {number} competitionId - ID de la competición
 * @param {number|null} userId - ID del usuario (si es null, usa el usuario actual)
 * @returns {Promise<boolean>} True si está inscrito
 */
export async function isUserInCompetition(competitionId, userId = null) {
  if (!competitionId) return false;

  const user = userId ? { id: userId } : await getCurrentUser();
  if (!user) return false;

  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from('competition_teams')
    .select('id')
    .eq('competition_id', competitionId)
    .eq('user_id', userId || user.id)
    .in('status', ['approved', 'active'])
    .maybeSingle();

  if (error) {
    console.error('Error verificando inscripción:', error);
    return false;
  }

  return !!data;
}

/**
 * Obtiene los equipos inscritos en una competición
 * @param {number} competitionId - ID de la competición
 * @returns {Promise<Array>} Array de equipos con información
 */
export async function getCompetitionTeams(competitionId) {
  if (!competitionId) return [];

  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from('competition_teams')
    .select(`
      id,
      status,
      joined_at,
      league_team:league_teams(
        id,
        nickname,
        display_name,
        club:clubs(id, name)
      )
    `)
    .eq('competition_id', competitionId)
    .in('status', ['approved', 'active'])
    .order('joined_at', { ascending: true });

  if (error) {
    console.error('Error obteniendo equipos de competición:', error);
    return [];
  }

  return data || [];
}

