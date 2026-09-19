const cronService = require('../services/cronService');

async function triggerCronScrape(req, res, next) {
  try {
    console.log('[CronController] Authorized cron scrape triggered.');
    const summary = await cronService.runScheduledScrape();
    res.json({
      success: true,
      message: 'Scheduled batch scrape completed.',
      summary
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  triggerCronScrape
};
