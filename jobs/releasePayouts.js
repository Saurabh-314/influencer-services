const { releaseDuePayouts } = require('../services/payout.service');

const INTERVAL_MS = 5 * 60 * 1000;

function startPayoutReleaseJob(logger) {
    const run = async () => {
        try {
            const result = await releaseDuePayouts();
            if (result.released > 0 || result.failed > 0) {
                logger.info(`Payout release job: ${result.released} released, ${result.failed} failed`);
            }
        } catch (error) {
            logger.error(`Payout release job error: ${error.message}`);
        }
    };

    run();
    return setInterval(run, INTERVAL_MS);
}

module.exports = { startPayoutReleaseJob };
