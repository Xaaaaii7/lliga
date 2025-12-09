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

// Phase 4 - Replacements for Time-Based
import * as teamGiantKillers from './curiosities/team-giant-killers.js';
import * as teamUniqueScorers from './curiosities/team-unique-scorers.js';
import * as teamBestDuo from './curiosities/team-best-duo.js';
import * as playerDependency from './curiosities/player-dependency.js';

// Phase 4 - Simple
import * as teamDraws from './curiosities/team-most-draws.js';
import * as teamWinStreak from './curiosities/team-winning-streak.js';
import * as teamUnbeaten from './curiosities/team-unbeaten-streak.js';
import * as matchMostGoals from './curiosities/match-most-goals.js';
// playerFastestGoal removed (replaced by playerDependency)
import * as teamHomeDef from './curiosities/team-best-home-defense.js';
import * as teamAwayAtt from './curiosities/team-best-away-attack.js';
import * as teamPass from './curiosities/team-pass-masters.js';
import * as teamOffside from './curiosities/team-offside-trap.js';
import * as teamTackles from './curiosities/team-tackle-kings.js';
import * as teamInterceptions from './curiosities/team-interception-masters.js';
import * as playerOwnGoals from './curiosities/player-own-goals.js';

const TASKS = [
    // P1-2
    mostScoring, leastConceded, biggestWin,
    // P3
    teamFouls, teamSaves, matchPossession, teamShotEff, teamCorners,
    playerHattrick, teamCleanSheets, teamRedCards, teamInjuries, playerEfficiency,
    // P4 New Complex
    teamGiantKillers, teamUniqueScorers, teamBestDuo, playerDependency,
    // P4 Simple
    teamDraws, teamWinStreak, teamUnbeaten, matchMostGoals,
    teamHomeDef, teamAwayAtt, teamPass,
    teamOffside, teamTackles, teamInterceptions, playerOwnGoals
];

async function main() {
    console.log('--- Daily Curiosity Dispatcher ---');
    console.log(`Pool size: ${TASKS.length} tasks`);

    const randomIndex = Math.floor(Math.random() * TASKS.length);
    const selectedTask = TASKS[randomIndex];

    console.log(`Selected task index: ${randomIndex}`);

    try {
        const supabase = getSupabaseAdmin();
        await selectedTask.run(supabase);
        console.log('--- Task Completed Successfully ---');
    } catch (err) {
        console.error('--- Task Failed ---');
        console.error(err);
        process.exit(1);
    }
}

main();
