const db = require('../models');
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
        .sort((a, b) => {
            const aRank = getMediaViews(a) || a.like_count || 0;
            const bRank = getMediaViews(b) || b.like_count || 0;
            return bRank - aRank;
        })
        .slice(0, 8)
        .map((item) => ({
            id: item.id,
            caption: item.caption || '',
            media_type: item.media_type,
            media_product_type: item.media_product_type,
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

function trimErrors(errors, limit = 12) {
        return (errors || []).slice(0, limit).map((item) => ({
        stage: item.stage || null,
        metric: item.metric || null,
        metrics: item.metrics || null,
        media_id: item.media_id || null,
        message: item.message || null,
        type: item.type || null,
        code: item.code || null,
        error_subcode: item.error_subcode || null,
        reason: item.reason || null,
        skipped: item.skipped || null,
        fbtrace_id: item.fbtrace_id || null,
    }));
}

function buildDiagnostics({
    profile,
    media,
    account,
    creatorScore,
    mediaResult = {},
    accountInsightsResult = {},
}) {
    const instagramErrors = trimErrors([
        ...(mediaResult.errors || []),
        ...(accountInsightsResult.errors || []),
    ]);

    return {
        sync_ok: !mediaResult.error,
        media: {
            count: (media || []).length,
            metrics_used: mediaResult.metrics_used || null,
            error: Boolean(mediaResult.error),
            summary: mediaResult.summary || null,
        },
        account_insights: {
            returned_metrics: accountInsightsResult.returned_metrics || [],
            missing_metrics: accountInsightsResult.missing_metrics || [],
            error: Boolean(accountInsightsResult.error),
        },
        score_status: creatorScore?.status || null,
        calculation_gaps: creatorScore?.calculation_gaps || [],
        data_summary: creatorScore?.data_summary || {
            account_type: profile?.account_type || account?.account_type || null,
            followers: profile?.followers_count ?? account?.followers_count ?? null,
            reels_count: (media || []).length,
        },
        instagram_errors: instagramErrors,
        hint: instagramErrors.some((item) => item.reason === 'pre_professional_conversion' || item.error_subcode === 2108006)
            ? 'Some posts were published before this account became Professional, so Instagram cannot return Insights (views/reach) for them. Those posts are still stored; the score uses posts that do have Insights, plus like/comment counts from media metadata.'
            : instagramErrors.length
                ? 'Instagram returned the errors in instagram_errors. calculation_gaps lists score inputs that were unavailable.'
                : 'No Instagram request errors. calculation_gaps lists score inputs that were unavailable or skipped.',
    };
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

function toPublicPayload({ profile, media, creatorScore, account, diagnostics }) {
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
        diagnostics: diagnostics || buildDiagnostics({ profile, media, account, creatorScore }),
    };
}

async function persistAndScore(account, {
    profile,
    media,
    rawAccountInsights,
    fetchError,
    mediaResult,
    accountInsightsResult,
}) {
    const dailyRows = seriesByDate(rawAccountInsights);
    if (!dailyRows.length) {
        dailyRows.push({ date: new Date().toISOString().slice(0, 10) });
    }

    const mediaRows = await store.upsertMedia(account, media);
    await store.saveAccountInsightSnapshots(account, dailyRows, profile.followers_count);
    await store.saveMediaInsightSnapshots(account, mediaRows, media);

    const storedMedia = await store.loadStoredMedia(account.id);
    const accountInsightRows = await store.loadAccountInsightRows(account.id);

    const creatorScore = await buildScorePayload(
        account,
        profile,
        storedMedia.length ? storedMedia : media,
        accountInsightRows,
        rawAccountInsights,
        fetchError && !(storedMedia.length || media.length),
    );

    await store.saveScore(account, creatorScore);

    if (profile.profile_picture_url) {
        await db.models.users.update(
            { profile_image: profile.profile_picture_url },
            { where: { id: account.user_id } },
        );
    }

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
        last_synced_at: new Date(),
        score_status: creatorScore.status,
        status: fetchError && !media.length ? 'error' : 'active',
    });

    return {
        creatorScore,
        media: storedMedia.length ? storedMedia : media,
        diagnostics: buildDiagnostics({
            profile,
            media: storedMedia.length ? storedMedia : media,
            account,
            creatorScore,
            mediaResult,
            accountInsightsResult,
        }),
    };
}

async function payloadFromStore(account, profileOverride = null, extraDiagnostics = {}) {
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

    const staleError = !latestScore?.payload_json || ['error'].includes(latestScore.status);
    const creatorScore = staleError
        ? await buildScorePayload(account, profile, media, accountInsightRows, [], false)
        : latestScore.payload_json;

    return toPublicPayload({
        profile,
        media,
        creatorScore,
        account,
        diagnostics: buildDiagnostics({
            profile,
            media,
            account,
            creatorScore,
            ...extraDiagnostics,
        }),
    });
}

async function syncAccountInsights(account, { force = false } = {}) {
    const stale = account.last_synced_at
        && Date.now() - new Date(account.last_synced_at).getTime() < SYNC_CACHE_MS;
    const storedMedia = (!force && stale) ? await store.loadStoredMedia(account.id) : [];
    const shouldRetryEmptyMedia = account.total_posts > 0 && storedMedia.length === 0;

    if (!force && stale && account.score_status !== 'error' && !shouldRetryEmptyMedia) {
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
        return toPublicPayload({
            profile,
            media: [],
            creatorScore,
            account,
            diagnostics: buildDiagnostics({ profile, media: [], account, creatorScore }),
        });
    }

    const [mediaResult, accountInsightsResult] = await Promise.all([
        instagramService.getMediaWithStatus(account.account_id, accessToken),
        instagramService.getAccountInsights(account.account_id, accessToken),
    ]);

    const media = mediaResult.media || [];
    const fetchError = Boolean(mediaResult.error && !media.length);

    const persisted = await persistAndScore(account, {
        profile,
        media,
        rawAccountInsights: accountInsightsResult.data || [],
        fetchError,
        mediaResult,
        accountInsightsResult,
    });

    return toPublicPayload({
        profile,
        media: persisted.media,
        creatorScore: persisted.creatorScore,
        account,
        diagnostics: persisted.diagnostics,
    });
}

module.exports = {
    ensureValidAccessToken,
    syncAccountInsights,
};
