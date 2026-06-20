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

module.exports = {
    calculateInfluencerScore,
    calculateAdvStats
};
