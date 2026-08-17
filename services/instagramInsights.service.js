const instagramService = require('./instagram.service');
const {
    calculateCreatorScore,
    calculateAdvStats,
    computeReelsStats,
    getMediaViews,
    getInsightValue,
} = require('../utils/scoring');

async function ensureValidAccessToken(account) {
    let accessToken = account.access_token;
    const tokenExpiry = account.token_expiry;

    if (tokenExpiry && new Date(tokenExpiry) <= new Date()) {
        const refreshed = await instagramService.refreshLongLivedToken(accessToken);
        accessToken = refreshed.accessToken;
        const newExpiry = refreshed.expiresIn
            ? new Date(Date.now() + refreshed.expiresIn * 1000)
            : null;
        await account.update({
            access_token: accessToken,
            token_expiry: newExpiry,
        });
    }

    return accessToken;
}

async function syncAccountInsights(account) {
    const accessToken = await ensureValidAccessToken(account);

    const profile = await instagramService.getProfile(
        account.account_id,
        accessToken,
    );

    const [media, accountInsights] = await Promise.all([
        instagramService.getMedia(account.account_id, accessToken),
        instagramService.getAccountInsights(account.account_id, accessToken),
    ]);

    // console.log('media', media);
    // console.log('accountInsights', accountInsights);

    const reelsStats = computeReelsStats(media);
    const topPosts = [...media]
        .sort((a, b) => getMediaViews(b) - getMediaViews(a))
        .slice(0, 8)
        .map((m) => ({
            id: m.id,
            caption: m.caption || '',
            media_url: m.media_url,
            thumbnail_url: m.thumbnail_url,
            permalink: m.permalink,
            like_count: m.like_count,
            comments_count: m.comments_count,
            saved: getInsightValue(m, ['saved', 'saves']),
            shares: getInsightValue(m, ['shares']),
            reach: getInsightValue(m, ['reach']),
            timestamp: m.timestamp,
            views: getMediaViews(m),
        }));

    const avgEngagement =
        media.length > 0
            ? media.reduce(
                (acc, m) => acc + (m.like_count + (m.comments_count || 0)),
                0,
            ) / media.length
            : 0;
    const engagementRate =
        profile.followers_count > 0
            ? (avgEngagement / profile.followers_count) * 100
            : 0;

    const parsedEngagementRate = parseFloat(engagementRate.toFixed(2));

    await account.update({
        display_name: profile.name,
        followers_count: profile.followers_count,
        following_count: profile.follows_count,
        total_posts: profile.media_count,
        engagement_rate: parsedEngagementRate,
        last_synced_at: new Date(),
    });

    const creatorScore = calculateCreatorScore(
        profile,
        media,
        parsedEngagementRate,
        accountInsights,
    );

    return {
        profile,
        reels_stats: reelsStats,
        top_posts: topPosts,
        engagement_rate: parsedEngagementRate,
        influencer_score: creatorScore.overall,
        creator_score: creatorScore,
        adv_stats: calculateAdvStats(media),
    };
}

module.exports = {
    ensureValidAccessToken,
    syncAccountInsights,
};
