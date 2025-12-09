import { getSupabaseAdmin } from './utils/supabase-admin.js';

// Phase 1 & 2 imports
import * as mostScoring from './curiosities/most-scoring-team.js';
import * as leastConceded from './curiosities/least-conceded-team.js';
import * as biggestWin from './curiosities/biggest-win.js';

// Phase 3 imports
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

const TASKS = [
    mostScoring,
    leastConceded,
    biggestWin,
    // Phase 3
    teamFouls,
    teamSaves,
    matchPossession,
    teamShotEff,
    teamCorners,
    playerHattrick,
    teamCleanSheets,
    teamRedCards,
    teamInjuries,
    playerEfficiency
];

async function main() {
    console.log('--- Daily Curiosity Dispatcher ---');

    // Randomly select one task
    const randomIndex = Math.floor(Math.random() * TASKS.length);
    const selectedTask = TASKS[randomIndex];

    console.log(`Selected task index: ${randomIndex}`);

    try {
        const supabase = getSupabaseAdmin();
        // Run the selected task
        await selectedTask.run(supabase);
        console.log('--- Task Completed Successfully ---');
    } catch (err) {
        console.error('--- Task Failed ---');
        console.error(err);
        process.exit(1);
    }
}

main();
