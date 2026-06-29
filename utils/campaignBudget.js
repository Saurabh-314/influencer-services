function calculateCampaignLiability(rankAllocations, bonusReward, bonusMaxCreators) {
    const allocations = typeof rankAllocations === 'string'
        ? JSON.parse(rankAllocations)
        : (rankAllocations || []);

    const baseTotal = allocations.reduce((sum, r) => sum + (Number(r.payout) * Number(r.qty)), 0);
    const bonusTotal = Number(bonusReward || 0) * Number(bonusMaxCreators || 0);
    return baseTotal + bonusTotal;
}

module.exports = { calculateCampaignLiability };
