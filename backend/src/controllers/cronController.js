const cronService = require('../services/cronService');

async function triggerCronScrape(req, res, next) {
  try {
    console.log('[CronController] Authorized cron scrape triggered.');

    // Start the scheduled scrape in the background.
    // Do not wait for completion because cron-job.org
    // has a maximum HTTP timeout of 30 seconds.
    cronService.runScheduledScrape()
      .then((summary) => {
        console.log(
          `[CronController] Background scrape completed: ` +
          `${summary.succeeded} succeeded, ` +
          `${summary.retried} retried, ` +
          `${summary.failed} failed ` +
          `in ${summary.durationMs}ms.`
        );
      })
      .catch((err) => {
        console.error(
          '[CronController] Background scheduled scrape failed:',
          err.message
        );
      });

    // Respond immediately so cron-job.org does not timeout.
    return res.status(202).json({
      success: true,
      message: 'Scheduled batch scrape started in background.'
    });

  } catch (err) {
    next(err);
  }
}

module.exports = {
  triggerCronScrape
};
