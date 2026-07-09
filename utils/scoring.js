/**
 * Calculate Influencer Score based on followers and engagement rate
 * @param {number} followers 
 * @param {number} engagementRate 
 * @returns {number} Score from 0 to 100
 */
function calculateInfluencerScore(followers, engagementRate) {
    // Basic logic: Logarithmic base score from followers + multiplier for engagement
    // 10k followers = ~40 points
    // 100k followers = ~50 points
    // 1M followers = ~60 points
    const baseScore = Math.log10(followers || 1) * 10; 

    // Engagement rate (e.g., 3.2%) adds up to 40 points
    const engagementBoost = (engagementRate || 0) * 8;

    return Math.min(100, Math.round(baseScore + engagementBoost));
}

function getMediaViews(media) {
    const viewsInsight = media.insights?.find(
        (i) => i.name === 'views' || i.name === 'video_views' || i.name === 'plays',
    );
    if (viewsInsight?.values?.[0]?.value != null) {
        return viewsInsight.values[0].value;
    }
    return (media.like_count || 0) * 10;
}

function computeReelsStats(media) {
    const reels = media.filter(
        (m) => m.media_product_type === 'REELS' || m.media_type === 'REELS' || m.media_type === 'VIDEO',
    );
    const stats = { total: reels.length, '>1k': 0, '>10k': 0, '>100k': 0, '>1m': 0, '>10m': 0 };

    reels.forEach((item) => {
        const views = getMediaViews(item);
        if (views >= 10_000_000) stats['>10m']++;
        else if (views >= 1_000_000) stats['>1m']++;
        else if (views >= 100_000) stats['>100k']++;
        else if (views >= 10_000) stats['>10k']++;
        else if (views >= 1_000) stats['>1k']++;
    });

    return stats;
}

function calculateAdvStats(media) {
    if (!media || media.length === 0) return null;

    const totalLikes = media.reduce((acc, m) => acc + (m.like_count || 0), 0);
    const totalComments = media.reduce((acc, m) => acc + (m.comments_count || 0), 0);

    const avgLikes = totalLikes / media.length;
    const avgComments = totalComments / media.length;

    // Simplified frequency calculation
    const now = new Date();
    const thirtyDaysAgo = new Date(now.setDate(now.getDate() - 30));
    const recentMedia = media.filter(m => new Date(m.timestamp) > thirtyDaysAgo);
    const postsPerDay = recentMedia.length / 30;

    return {
        avgLikes: Math.round(avgLikes),
        avgComments: parseFloat(avgComments.toFixed(2)),
        postsPerDay: parseFloat(postsPerDay.toFixed(2)),
        postsPerWeek: parseFloat((postsPerDay * 7).toFixed(2))
    };
}

function getVusicRank(followers) {
    if (followers >= 1_000_000) return 1;
    if (followers >= 100_000) return 2;
    if (followers >= 10_000) return 3;
    return 4;
}

function getPayoutForRank(campaign, userRank) {
    if (!campaign?.rank_allocations) return 0;
    const allocations = typeof campaign.rank_allocations === 'string'
        ? JSON.parse(campaign.rank_allocations)
        : campaign.rank_allocations;
    const allocation = allocations.find((r) => r.rank === userRank);
    return Number(allocation?.payout ?? 0);
}

module.exports = {
    calculateInfluencerScore,
    calculateAdvStats,
    getVusicRank,
    getPayoutForRank,
    getMediaViews,
    computeReelsStats,
};
