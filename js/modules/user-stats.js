/**
 * Módulo para calcular estadísticas globales del usuario
 * Estadísticas agregadas de todas las competiciones en las que participa
 */

import { getSupabaseClient } from './supabase-client.js';
import { getCurrentUser } from './auth.js';
import { getActiveSeason } from './supabase-client.js';

/**
 * Obtiene los league_teams del usuario en competiciones específicas
 * @param {Object} options - Opciones de filtrado
 * @param {boolean} options.is_official - Solo competiciones oficiales
 * @param {string} options.season - Filtrar por temporada (null = todas)
 * @returns {Promise<Array>} Array de objetos con competition_id, league_team_id, competition info
 */
async function getUserLeagueTeams(options = {}) {
  const user = await getCurrentUser();
  if (!user) return [];

  const supabase = await getSupabaseClient();

  // competition_teams.user_id referencia auth.users.id directamente
  // user.id es el UUID de auth.users
  const userId = user.id;

  // Construir query para obtener competition_teams del usuario
  let query = supabase
    .from('competition_teams')
    .select(`
      competition_id,
      league_team_id,
      competition:competitions(
        id,
        name,
        slug,
        season,
        is_official,
        status
      ),
      league_team:league_teams(
        id,
        nickname,
        display_name
      )
    `)
    .eq('user_id', userId)
    .in('status', ['approved', 'active']);

  const { data, error } = await query;

  if (error) {
    console.error('Error obteniendo league_teams del usuario:', error);
    return [];
  }

  if (!data || data.length === 0) return [];

  // Aplicar filtros
  let filtered = data.filter(item => {
    const comp = item.competition;
    if (!comp) return false;

    // Filtrar por is_official si se especifica
    if (options.is_official !== undefined && comp.is_official !== options.is_official) {
      return false;
    }

    // Filtrar por temporada si se especifica
    if (options.season && comp.season !== options.season) {
      return false;
    }

    return true;
  });

  return filtered;
}

/**
 * Obtiene los partidos de los league_teams del usuario en competiciones específicas
 * @param {Array} userLeagueTeams - Array de objetos con competition_id y league_team_id
 * @returns {Promise<Array>} Array de partidos con información completa
 */
async function getUserMatches(userLeagueTeams) {
  if (!userLeagueTeams || userLeagueTeams.length === 0) return [];

  const supabase = await getSupabaseClient();

  // Obtener todos los league_team_ids
  const leagueTeamIds = userLeagueTeams.map(ult => ult.league_team_id).filter(Boolean);
  if (leagueTeamIds.length === 0) return [];

  // Obtener todos los competition_ids
  const competitionIds = userLeagueTeams
    .map(ult => ult.competition?.id)
    .filter(Boolean)
    .filter((id, index, self) => self.indexOf(id) === index); // únicos

  if (competitionIds.length === 0) return [];

  // Cargar partidos donde el usuario participa
  // Usar .or() con sintaxis correcta de Supabase
  let query = supabase
    .from('matches')
    .select(`
      id,
      competition_id,
      home_league_team_id,
      away_league_team_id,
      home_goals,
      away_goals,
      match_date,
      round_id
    `)
    .in('competition_id', competitionIds)
    .or(`home_league_team_id.in.(${leagueTeamIds.join(',')}),away_league_team_id.in.(${leagueTeamIds.join(',')})`)
    .not('home_goals', 'is', null)
    .not('away_goals', 'is', null)
    .order('match_date', { ascending: true });

  const { data, error } = await query;

  if (error) {
    console.error('Error obteniendo partidos del usuario:', error);
    return [];
  }

  if (!data || data.length === 0) return [];

  // Filtrar solo los partidos donde el usuario realmente participa
  // y asociar con el league_team_id correspondiente
  const matches = [];
  for (const match of data) {
    for (const ult of userLeagueTeams) {
      if (match.competition_id !== ult.competition?.id) continue;
      
      const isHome = match.home_league_team_id === ult.league_team_id;
      const isAway = match.away_league_team_id === ult.league_team_id;
      
      if (isHome || isAway) {
        matches.push({
          ...match,
          user_league_team_id: ult.league_team_id,
          user_team_nickname: ult.league_team?.nickname,
          is_home: isHome,
          goals_for: isHome ? match.home_goals : match.away_goals,
          goals_against: isHome ? match.away_goals : match.home_goals,
          competition_name: ult.competition?.name,
          competition_slug: ult.competition?.slug
        });
        break; // Solo agregar una vez por partido
      }
    }
  }

  return matches;
}

/**
 * Calcula estadísticas agregadas de un array de partidos
 * @param {Array} matches - Array de partidos
 * @returns {Object} Objeto con estadísticas agregadas
 */
function calculateStats(matches) {
  if (!matches || matches.length === 0) {
    return {
      matches_played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goals_for: 0,
      goals_against: 0,
      goal_difference: 0,
      points: 0,
      avg_goals_for: 0,
      avg_goals_against: 0
    };
  }

  let wins = 0;
  let draws = 0;
  let losses = 0;
  let goalsFor = 0;
  let goalsAgainst = 0;

  for (const match of matches) {
    const gf = match.goals_for || 0;
    const ga = match.goals_against || 0;

    goalsFor += gf;
    goalsAgainst += ga;

    if (gf > ga) {
      wins++;
    } else if (gf < ga) {
      losses++;
    } else {
      draws++;
    }
  }

  const matchesPlayed = matches.length;
  const points = wins * 3 + draws;
  const goalDifference = goalsFor - goalsAgainst;

  return {
    matches_played: matchesPlayed,
    wins,
    draws,
    losses,
    goals_for: goalsFor,
    goals_against: goalsAgainst,
    goal_difference: goalDifference,
    points,
    avg_goals_for: matchesPlayed > 0 ? (goalsFor / matchesPlayed).toFixed(2) : 0,
    avg_goals_against: matchesPlayed > 0 ? (goalsAgainst / matchesPlayed).toFixed(2) : 0
  };
}

/**
 * Obtiene estadísticas globales del usuario para competiciones oficiales de la temporada actual
 * @returns {Promise<Object>} Objeto con estadísticas agregadas
 */
export async function getOfficialStatsCurrentSeason() {
  const currentSeason = getActiveSeason();
  if (!currentSeason) {
    return calculateStats([]);
  }

  const userLeagueTeams = await getUserLeagueTeams({
    is_official: true,
    season: currentSeason
  });

  if (userLeagueTeams.length === 0) {
    return calculateStats([]);
  }

  const matches = await getUserMatches(userLeagueTeams);
  return calculateStats(matches);
}

/**
 * Obtiene estadísticas globales del usuario para todas las competiciones (oficiales + no oficiales)
 * @returns {Promise<Object>} Objeto con estadísticas agregadas
 */
export async function getAllCompetitionsStats() {
  const userLeagueTeams = await getUserLeagueTeams({
    // Sin filtros: todas las competiciones
  });

  if (userLeagueTeams.length === 0) {
    return calculateStats([]);
  }

  const matches = await getUserMatches(userLeagueTeams);
  return calculateStats(matches);
}

/**
 * Obtiene estadísticas desglosadas por competición
 * @returns {Promise<Array>} Array de objetos con estadísticas por competición
 */
export async function getStatsByCompetition() {
  const userLeagueTeams = await getUserLeagueTeams({});

  if (userLeagueTeams.length === 0) {
    return [];
  }

  // Agrupar por competición
  const byCompetition = new Map();
  for (const ult of userLeagueTeams) {
    const compId = ult.competition?.id;
    if (!compId) continue;

    if (!byCompetition.has(compId)) {
      byCompetition.set(compId, {
        competition: ult.competition,
        league_teams: []
      });
    }

    byCompetition.get(compId).league_teams.push(ult);
  }

  // Calcular estadísticas por competición
  const statsByComp = [];
  for (const [compId, data] of byCompetition.entries()) {
    const matches = await getUserMatches(data.league_teams);
    const stats = calculateStats(matches);

    statsByComp.push({
      competition_id: compId,
      competition_name: data.competition?.name,
      competition_slug: data.competition?.slug,
      competition_season: data.competition?.season,
      is_official: data.competition?.is_official,
      ...stats
    });
  }

  return statsByComp;
}

