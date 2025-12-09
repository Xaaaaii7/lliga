import { getSupabaseAdmin } from './utils/supabase-admin.js';

// Import all curiosity scripts
import * as mostScoring from './curiosities/most-scoring-team.js';
import * as leastConceded from './curiosities/least-conceded-team.js';
import * as biggestWin from './curiosities/biggest-win.js';

const TASKS = [
    mostScoring,
    leastConceded,
    biggestWin
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
