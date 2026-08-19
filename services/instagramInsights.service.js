const instagramService = require('./instagram.service');
const {
    calculateCreatorScore,
    calculateAdvStats,
    computeReelsStats,
    getMediaViews,
    getInsightValue,
} = require('../utils/scoring');
const { getFollowerTier, isProfessionalAccount, SYNC_CACHE_MS } = require('../utils/scoringConfig');
const { seriesByDate, getNonFollowerReachPct } = require('../utils/metrics');
const store = require('./creatorScoreStore.service');

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

function mapTopPosts(media) {
    return [...(media || [])]
        .sort((a, b) => (getMediaViews(b) || 0) - (getMediaViews(a) || 0))
        .slice(0, 8)
        .map((item) => ({
            id: item.id,
            caption: item.caption || '',
            media_url: item.media_url,
            thumbnail_url: item.thumbnail_url,
            permalink: item.permalink,
            like_count: item.like_count,
            comments_count: item.comments_count,
            saved: getInsightValue(item, ['saved', 'saves']),
            shares: getInsightValue(item, ['shares']),
            reach: getInsightValue(item, ['reach']),
            timestamp: item.timestamp,
            views: getMediaViews(item),
        }));
}

async function buildScorePayload(account, profile, media, accountInsightRows, rawAccountInsights, fetchError) {
    const weights = await store.getActiveWeights();
    const tier = getFollowerTier(profile.followers_count);
    const peerMetrics = await store.loadPeerMetrics(tier.key, account.id);
    const followerGrowthPct = store.followerGrowthFromSnapshots(accountInsightRows, profile.followers_count);

    return calculateCreatorScore(
        profile,
        media,
        null,
        accountInsightRows.length ? accountInsightRows : rawAccountInsights,
        {
            weights,
            peerMetrics,
            accountType: profile.account_type || account.account_type,
            followerGrowthPct,
            nonFollowerReachPct: getNonFollowerReachPct(rawAccountInsights),
            fetchError,
        },
    );
}

function toPublicPayload({ profile, media, creatorScore, account }) {
    const engagementRate = creatorScore.audience?.engagement_rate ?? null;
    return {
        profile,
        reels_stats: computeReelsStats(media),
        top_posts: mapTopPosts(media),
        engagement_rate: engagementRate,
        influencer_score: creatorScore.overall,
        creator_score: creatorScore,
        adv_stats: calculateAdvStats(media),
        account_type: profile.account_type || account.account_type,
        eligible: isProfessionalAccount(profile.account_type || account.account_type)
            || !profile.account_type,
    };
}

async function persistAndScore(account, { profile, media, rawAccountInsights, fetchError }) {
    const dailyRows = seriesByDate(rawAccountInsights);
    if (!dailyRows.length) {
        dailyRows.push({ date: new Date().toISOString().slice(0, 10) });
    }

    const mediaRows = await store.upsertMedia(account, media);
    await store.saveAccountInsightSnapshots(account, dailyRows, profile.followers_count);
    await store.saveMediaInsightSnapshots(account, mediaRows, media);

    const storedMedia = await store.loadStoredMedia(account.id);
    const accountInsightRows = await store.loadAccountInsightRows(account.id);

    if (fetchError) {
        const previous = await store.loadLatestScore(account.id);
        if (previous?.payload_json && !['error', 'collecting'].includes(previous.status)) {
            await account.update({
                display_name: profile.name,
                username: profile.username || account.username,
                profile_image: profile.profile_picture_url || account.profile_image,
                biography: profile.biography || null,
                account_type: profile.account_type || account.account_type,
                followers_count: profile.followers_count || 0,
                following_count: profile.follows_count || 0,
                total_posts: profile.media_count || 0,
                status: 'error',
            });
            return previous.payload_json;
        }
    }

    const creatorScore = await buildScorePayload(
        account,
        profile,
        storedMedia.length ? storedMedia : media,
        accountInsightRows,
        rawAccountInsights,
        fetchError,
    );

    await store.saveScore(account, creatorScore);

    const engagementRate = creatorScore.audience?.engagement_rate;
    await account.update({
        display_name: profile.name,
        username: profile.username || account.username,
        profile_image: profile.profile_picture_url || account.profile_image,
        biography: profile.biography || null,
        account_type: profile.account_type || account.account_type,
        followers_count: profile.followers_count || 0,
        following_count: profile.follows_count || 0,
        total_posts: profile.media_count || 0,
        engagement_rate: engagementRate == null ? account.engagement_rate : engagementRate,
        last_synced_at: fetchError ? account.last_synced_at : new Date(),
        score_status: creatorScore.status,
        status: fetchError ? 'error' : 'active',
    });

    return creatorScore;
}

async function payloadFromStore(account, profileOverride = null) {
    const media = await store.loadStoredMedia(account.id);
    const accountInsightRows = await store.loadAccountInsightRows(account.id);
    const latestScore = await store.loadLatestScore(account.id);
    const profile = profileOverride || {
        id: account.account_id,
        username: account.username,
        name: account.display_name,
        biography: account.biography,
        profile_picture_url: account.profile_image,
        followers_count: account.followers_count,
        follows_count: account.following_count,
        media_count: account.total_posts,
        account_type: account.account_type,
    };

    if (latestScore?.payload_json) {
        return toPublicPayload({
            profile,
            media,
            creatorScore: latestScore.payload_json,
            account,
        });
    }

    const creatorScore = await buildScorePayload(account, profile, media, accountInsightRows, [], false);
    return toPublicPayload({ profile, media, creatorScore, account });
}

async function syncAccountInsights(account, { force = false } = {}) {
    const stale = account.last_synced_at
        && Date.now() - new Date(account.last_synced_at).getTime() < SYNC_CACHE_MS;

    if (!force && stale) {
        return payloadFromStore(account);
    }

    const accessToken = await ensureValidAccessToken(account);
    const profile = await instagramService.getProfile(account.account_id, accessToken);

    if (!isProfessionalAccount(profile.account_type) && profile.account_type) {
        await account.update({
            display_name: profile.name,
            username: profile.username || account.username,
            profile_image: profile.profile_picture_url || account.profile_image,
            biography: profile.biography || null,
            account_type: profile.account_type,
            followers_count: profile.followers_count || 0,
            following_count: profile.follows_count || 0,
            total_posts: profile.media_count || 0,
            last_synced_at: new Date(),
            score_status: 'ineligible',
        });
        const creatorScore = calculateCreatorScore(profile, [], null, [], {
            accountType: profile.account_type,
        });
        await store.saveScore(account, creatorScore);
        return toPublicPayload({ profile, media: [], creatorScore, account });
    }

    const [mediaResult, accountInsightsResult] = await Promise.all([
        instagramService.getMediaWithStatus(account.account_id, accessToken),
        instagramService.getAccountInsights(account.account_id, accessToken),
    ]);

    const fetchError = Boolean(mediaResult.error && !mediaResult.media.length);
    if (fetchError && mediaResult.error && !mediaResult.media.length) {
        const previous = await store.loadLatestScore(account.id);
        if (previous?.payload_json && previous.status !== 'error') {
            return payloadFromStore(account, profile);
        }
        const creatorScore = calculateCreatorScore(profile, [], null, [], {
            accountType: profile.account_type,
            fetchError: true,
        });
        await store.saveScore(account, creatorScore);
        await account.update({
            biography: profile.biography || null,
            account_type: profile.account_type || account.account_type,
            score_status: 'error',
            status: 'error',
        });
        return toPublicPayload({ profile, media: [], creatorScore, account });
    }

    const creatorScore = await persistAndScore(account, {
        profile,
        media: mediaResult.media,
        rawAccountInsights: accountInsightsResult.data || [],
        fetchError,
    });

    const storedMedia = await store.loadStoredMedia(account.id);
    return toPublicPayload({
        profile,
        media: storedMedia.length ? storedMedia : mediaResult.media,
        creatorScore,
        account,
    });
}

module.exports = {
    ensureValidAccessToken,
    syncAccountInsights,
};
