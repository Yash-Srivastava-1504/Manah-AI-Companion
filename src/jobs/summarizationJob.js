'use strict';
const cron = require('node-cron');
const { getSessionsNeedingSummary, runSummarization } = require('../services/memoryService');

/**
 * Background summarisation job.
 * Runs every 10 minutes and processes any sessions with 5+ unsummarised user messages.
 */
function startSummarizationJob() {
  // Runs at every 10th minute
  cron.schedule('*/10 * * * *', async () => {
    console.log('[CRON] Running summarisation job...');
    try {
      const sessions = getSessionsNeedingSummary();
      if (sessions.length === 0) {
        console.log('[CRON] No sessions need summarisation.');
        return;
      }

      console.log(`[CRON] Found ${sessions.length} session(s) to summarise.`);

      // Process sessions with a small delay between each to avoid hammering the LLM
      for (const { sessionId, userId } of sessions) {
        try {
          await runSummarization(sessionId, userId);
          // Small pause between sessions
          await new Promise((r) => setTimeout(r, 500));
        } catch (err) {
          console.error(`[CRON] Failed to summarise session ${sessionId}:`, err.message);
        }
      }

      console.log('[CRON] Summarisation job complete.');
    } catch (err) {
      console.error('[CRON] Summarisation job error:', err.message);
    }
  });

  console.log('[CRON] Summarisation job scheduled (every 10 minutes)');
}

module.exports = { startSummarizationJob };
