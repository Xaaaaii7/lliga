import { getSupabaseAdmin } from './utils/supabase-admin.js';

// Phase 1 & 2
import * as mostScoring from './curiosities/most-scoring-team.js';
import * as leastConceded from './curiosities/least-conceded-team.js';
import * as biggestWin from './curiosities/biggest-win.js';

// Phase 3
import * as teamFouls from './curiosities/team-most-fouls.js';
import * as teamSaves from './curiosities/team-most-saves.js';
import * as matchPossession from './curiosities/match-highest-possession.js';
import * as teamShotEff from './curiosities/team-shot-efficiency.js';
import * as teamCorners from './curiosities/team-most-corners.js';
import * as playerHattrick from './curiosities/player-hattrick.js';
import * as teamCleanSheets from './curiosities/team-clean-sheets.js';
import * as teamRedCards from './curiosities/team-red-cards.js';
import * as teamInjuries from './curiosities/team-most-injuries.js';
import * as playerEfficiency from './curiosities/player-pichichi-efficiency.js';

// Phase 4
import * as teamGiantKillers from './curiosities/team-giant-killers.js';
import * as teamUniqueScorers from './curiosities/team-unique-scorers.js';
import * as teamBestDuo from './curiosities/team-best-duo.js';
import * as playerDependency from './curiosities/player-dependency.js';
import * as teamDraws from './curiosities/team-most-draws.js';
import * as teamWinStreak from './curiosities/team-winning-streak.js';
import * as teamUnbeaten from './curiosities/team-unbeaten-streak.js';
import * as matchMostGoals from './curiosities/match-most-goals.js';
import * as teamHomeDef from './curiosities/team-best-home-defense.js';
import * as teamAwayAtt from './curiosities/team-best-away-attack.js';
import * as teamPass from './curiosities/team-pass-masters.js';
import * as teamOffside from './curiosities/team-offside-trap.js';
import * as teamTackles from './curiosities/team-tackle-kings.js';
import * as teamInterceptions from './curiosities/team-interception-masters.js';
import * as playerOwnGoals from './curiosities/player-own-goals.js';

// Phase 5 Complex
import * as teamFairPlay from './curiosities/team-fair-play.js';
import * as teamPtsPerGoal from './curiosities/team-points-per-goal.js';
import * as teamNarrowMargins from './curiosities/team-narrow-margins.js';
import * as teamHomeAwayContrast from './curiosities/team-home-away-contrast.js';
import * as teamTopHalfKiller from './curiosities/team-top-half-killer.js';
import * as teamSavePct from './curiosities/team-save-percentage.js';
import * as playerMultiTeamScorer from './curiosities/player-multi-team-scorer.js';

// Phase 5 Medium
import * as teamEntertainers from './curiosities/team-entertainers.js';
import * as teamSnoozefest from './curiosities/team-snoozefest.js';
import * as teamScoringStreak from './curiosities/team-scoring-streak.js';
import * as teamConcedingStreak from './curiosities/team-conceding-streak.js';
import * as teamCleanSheetStreak from './curiosities/team-clean-sheet-streak.js';
import * as teamDrySpell from './curiosities/team-dry-spell.js';
// REPLACED: playerPenaltyKing -> teamConsistency
import * as teamConsistency from './curiosities/team-scoring-consistency.js';

// Phase 5 Basic
import * as teamMostLosses from './curiosities/team-most-losses.js';
import * as teamFewestWins from './curiosities/team-fewest-wins.js';
import * as teamBenOGs from './curiosities/team-most-benefited-ogs.js';
import * as matchMostReds from './curiosities/match-most-red-cards.js';
import * as playerBadBoy from './curiosities/player-bad-boy.js';
import * as matchMostFouls from './curiosities/match-most-fouls.js';


const TASKS = [
    // P1-2 (3)
    mostScoring, leastConceded, biggestWin,
    // P3 (10)
    teamFouls, teamSaves, matchPossession, teamShotEff, teamCorners,
    playerHattrick, teamCleanSheets, teamRedCards, teamInjuries, playerEfficiency,
    // P4 (15)
    teamGiantKillers, teamUniqueScorers, teamBestDuo, playerDependency,
    teamDraws, teamWinStreak, teamUnbeaten, matchMostGoals,
    teamHomeDef, teamAwayAtt, teamPass,
    teamOffside, teamTackles, teamInterceptions, playerOwnGoals,
    // P5 (20)
    teamFairPlay, teamPtsPerGoal, teamNarrowMargins, teamHomeAwayContrast, teamTopHalfKiller, teamSavePct, playerMultiTeamScorer,
    teamEntertainers, teamSnoozefest, teamScoringStreak, teamConcedingStreak, teamCleanSheetStreak, teamDrySpell, teamConsistency,
    teamMostLosses, teamFewestWins, teamBenOGs, matchMostReds, playerBadBoy, matchMostFouls
];

/**
 * Obtiene el competition_id a usar para las curiosidades
 * Prioridad:
 * 1. Variable de entorno COMPETITION_ID
 * 2. Competición oficial activa de la temporada actual
 * 3. Primera competición activa de la temporada
 */
async function getCompetitionId(supabase) {
    // 1. Intentar desde variable de entorno
    const envCompetitionId = process.env.COMPETITION_ID;
    if (envCompetitionId) {
        const id = parseInt(envCompetitionId, 10);
        if (!isNaN(id)) {
            console.log(`Using competition_id from env: ${id}`);
            return id;
        }
    }

    // 2. Buscar competición oficial activa de la temporada actual
    const SEASON = process.env.SEASON || '2025-26';
    const { data: competitions, error } = await supabase
        .from('competitions')
        .select('id')
        .eq('season', SEASON)
        .eq('status', 'active')
        .eq('is_official', true)
        .order('created_at', { ascending: false })
        .limit(1);

    if (error) {
        console.warn(`Error fetching official competition: ${error.message}`);
    } else if (competitions && competitions.length > 0) {
        const id = competitions[0].id;
        console.log(`Using official active competition_id: ${id}`);
        return id;
    }

    // 3. Fallback: primera competición activa de la temporada
    const { data: fallbackComps, error: fallbackError } = await supabase
        .from('competitions')
        .select('id')
        .eq('season', SEASON)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1);

    if (fallbackError) {
        console.warn(`Error fetching fallback competition: ${fallbackError.message}`);
        return null;
    }

    if (fallbackComps && fallbackComps.length > 0) {
        const id = fallbackComps[0].id;
        console.log(`Using fallback active competition_id: ${id}`);
        return id;
    }

    console.warn(`No active competition found for season ${SEASON}. Curiosities will not be linked to a competition.`);
    return null;
}

async function main() {
    console.log('--- Daily Curiosity Dispatcher ---');
    console.log(`Pool size: ${TASKS.length} tasks`);

    const randomIndex = Math.floor(Math.random() * TASKS.length);
    const selectedTask = TASKS[randomIndex];

    console.log(`Selected task index: ${randomIndex}`);

    try {
        const supabase = getSupabaseAdmin();
        
        // Obtener competition_id
        const competitionId = await getCompetitionId(supabase);
        if (competitionId !== null) {
            console.log(`Running task with competition_id: ${competitionId}`);
        } else {
            console.warn('Running task without competition_id (legacy mode)');
        }

        // Pasar competition_id al script (compatibilidad hacia atrás: si no lo acepta, solo recibe supabase)
        if (selectedTask.run.length === 2) {
            // El script acepta (supabase, competitionId)
            await selectedTask.run(supabase, competitionId);
        } else {
            // El script solo acepta (supabase) - modo legacy
            await selectedTask.run(supabase);
        }

        console.log('--- Task Completed Successfully ---');
    } catch (err) {
        console.error('--- Task Failed ---');
        console.error(err);
        process.exit(1);
    }
}

main();
