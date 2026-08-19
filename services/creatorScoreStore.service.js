const { Op } = require('sequelize');
const db = require('../models');
const {
    mergeWeights,
    SCORE_VERSION,
    getFollowerTier,
    ACCOUNT_INSIGHT_DAYS,
} = require('../utils/scoringConfig');
const { dateKey, getInsightValue } = require('../utils/metrics');

const creator_media = db.models.creator_media;
const creator_account_insights = db.models.creator_account_insights;
const creator_media_insights = db.models.creator_media_insights;
const creator_scores = db.models.creator_scores;
const scoring_weights = db.models.scoring_weights;

const PEER_METRIC_KEYS = [
    'median_reach',
    'avg_reel_views',
    'profile_visit_rate',
    'non_follower_reach_pct',
    'weighted_er',
    'save_rate',
    'share_rate',
    'comment_rate',
    'like_rate',
    'reel_performance',
    'avg_watch_time',
    'reel_engagement',
    'story_engagement',
    'follower_score',
    'follower_growth_pct',
    'audience_quality',
    'median_vs_average',
    'above_baseline_pct',
    'stability',
    'reach_growth',
    'view_growth',
    'engagement_growth',
];

async function getActiveWeights() {
    const row = await scoring_weights.findOne({
        where: { is_active: true },
        order: [['updatedAt', 'DESC']],
    });
    let config = row?.config;
    if (typeof config === 'string') {
        try { config = JSON.parse(config); } catch { config = {}; }
    }
    return mergeWeights(config);
}

function fillMissing(existing, incoming) {
    const next = { ...incoming };
    for (const [key, value] of Object.entries(incoming)) {
        if (value == null && existing[key] != null) {
            next[key] = existing[key];
        }
    }
    return next;
}

async function upsertMedia(account, mediaItems = []) {
    const saved = [];
    for (const item of mediaItems) {
        const payload = {
            social_account_id: account.id,
            user_id: account.user_id,
            instagram_media_id: String(item.id),
            media_type: item.media_type || null,
            media_product_type: item.media_product_type || null,
            caption: item.caption || null,
            media_url: item.media_url || null,
            thumbnail_url: item.thumbnail_url || null,
            permalink: item.permalink || null,
            published_at: item.timestamp ? new Date(item.timestamp) : null,
            like_count: item.like_count ?? null,
            comments_count: item.comments_count ?? null,
        };

        const [row, created] = await creator_media.findOrCreate({
            where: {
                social_account_id: account.id,
                instagram_media_id: payload.instagram_media_id,
            },
            defaults: payload,
        });

        if (!created) {
            await row.update(payload);
        }
        saved.push(row);
    }
    return saved;
}

async function saveAccountInsightSnapshots(account, dailyRows = [], profileFollowers = null) {
    const today = dateKey(new Date());
    for (const row of dailyRows) {
        const insightDate = row.date || today;
        const incoming = {
            social_account_id: account.id,
            user_id: account.user_id,
            insight_date: insightDate,
            reach: row.reach ?? null,
            impressions: row.impressions ?? null,
            profile_views: row.profile_views ?? null,
            total_interactions: row.total_interactions ?? null,
            likes: row.likes ?? null,
            comments: row.comments ?? null,
            shares: row.shares ?? null,
            saves: row.saves ?? null,
            views: row.views ?? null,
            follower_count: row.follower_count ?? null,
            followers_total: insightDate === today ? (profileFollowers ?? row.followers_total ?? null) : (row.followers_total ?? null),
            follows: row.follows ?? null,
            unfollows: row.unfollows ?? null,
        };

        const existing = await creator_account_insights.findOne({
            where: { social_account_id: account.id, insight_date: insightDate },
        });

        if (!existing) {
            await creator_account_insights.create(incoming);
            continue;
        }

        if (insightDate === today) {
            await existing.update(fillMissing(existing.toJSON(), incoming));
        } else {
            const patch = {};
            for (const [key, value] of Object.entries(incoming)) {
                if (existing[key] == null && value != null) patch[key] = value;
            }
            if (Object.keys(patch).length) await existing.update(patch);
        }
    }
}

async function saveMediaInsightSnapshots(account, mediaRows, mediaItems = []) {
    const today = dateKey(new Date());
    const byIgId = new Map(mediaRows.map((row) => [row.instagram_media_id, row]));

    for (const item of mediaItems) {
        const mediaRow = byIgId.get(String(item.id));
        if (!mediaRow) continue;

        const incoming = {
            social_account_id: account.id,
            user_id: account.user_id,
            creator_media_id: mediaRow.id,
            instagram_media_id: mediaRow.instagram_media_id,
            insight_date: today,
            reach: getInsightValue(item, ['reach']),
            views: getInsightValue(item, ['views', 'video_views', 'plays']),
            likes: getInsightValue(item, ['likes']) ?? item.like_count ?? null,
            comments: getInsightValue(item, ['comments']) ?? item.comments_count ?? null,
            shares: getInsightValue(item, ['shares']),
            saves: getInsightValue(item, ['saved', 'saves']),
            total_interactions: getInsightValue(item, ['total_interactions']),
            video_view_total_time: getInsightValue(item, ['ig_reels_video_view_total_time']),
            average_watch_time: getInsightValue(item, ['ig_reels_avg_watch_time']),
            replays: getInsightValue(item, ['clips_replays_count']),
            skip_rate: getInsightValue(item, ['reels_skip_rate']),
        };

        const existing = await creator_media_insights.findOne({
            where: { creator_media_id: mediaRow.id, insight_date: today },
        });

        if (!existing) {
            await creator_media_insights.create(incoming);
        } else {
            await existing.update(fillMissing(existing.toJSON(), incoming));
        }
    }
}

function insightsFromRow(row) {
    if (!row) return [];
    const mapping = [
        ['reach', row.reach],
        ['views', row.views],
        ['likes', row.likes],
        ['comments', row.comments],
        ['shares', row.shares],
        ['saved', row.saves],
        ['saves', row.saves],
        ['total_interactions', row.total_interactions],
        ['ig_reels_video_view_total_time', row.video_view_total_time],
        ['ig_reels_avg_watch_time', row.average_watch_time],
        ['clips_replays_count', row.replays],
        ['reels_skip_rate', row.skip_rate],
    ];
    return mapping
        .filter(([, value]) => value != null)
        .map(([name, value]) => ({ name, values: [{ value: Number(value) }] }));
}

async function loadStoredMedia(accountId, days = 90) {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const rows = await creator_media.findAll({
        where: {
            social_account_id: accountId,
            [Op.or]: [
                { published_at: { [Op.gte]: cutoff } },
                { published_at: null },
            ],
        },
        include: [{
            model: creator_media_insights,
            as: 'insights',
            separate: true,
            limit: 1,
            order: [['insight_date', 'DESC']],
        }],
        order: [['published_at', 'DESC']],
        limit: 100,
    });

    return rows.map((row) => {
        const plain = row.toJSON();
        const latest = plain.insights?.[0];
        return {
            id: plain.instagram_media_id,
            caption: plain.caption,
            media_type: plain.media_type,
            media_product_type: plain.media_product_type,
            media_url: plain.media_url,
            thumbnail_url: plain.thumbnail_url,
            permalink: plain.permalink,
            timestamp: plain.published_at,
            like_count: latest?.likes ?? plain.like_count,
            comments_count: latest?.comments ?? plain.comments_count,
            insights: insightsFromRow(latest),
        };
    });
}

async function loadAccountInsightRows(accountId, days = ACCOUNT_INSIGHT_DAYS) {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const rows = await creator_account_insights.findAll({
        where: {
            social_account_id: accountId,
            insight_date: { [Op.gte]: cutoff },
        },
        order: [['insight_date', 'ASC']],
    });
    return rows.map((row) => {
        const plain = row.toJSON();
        return {
            date: plain.insight_date,
            reach: plain.reach != null ? Number(plain.reach) : null,
            impressions: plain.impressions != null ? Number(plain.impressions) : null,
            profile_views: plain.profile_views != null ? Number(plain.profile_views) : null,
            total_interactions: plain.total_interactions != null ? Number(plain.total_interactions) : null,
            likes: plain.likes != null ? Number(plain.likes) : null,
            comments: plain.comments != null ? Number(plain.comments) : null,
            shares: plain.shares != null ? Number(plain.shares) : null,
            saves: plain.saves != null ? Number(plain.saves) : null,
            views: plain.views != null ? Number(plain.views) : null,
            follower_count: plain.follower_count != null ? Number(plain.follower_count) : null,
            followers_total: plain.followers_total != null ? Number(plain.followers_total) : null,
            follows: plain.follows != null ? Number(plain.follows) : null,
            unfollows: plain.unfollows != null ? Number(plain.unfollows) : null,
        };
    });
}

function followerGrowthFromSnapshots(rows, currentFollowers) {
    const totals = (rows || []).map((row) => row.followers_total).filter((v) => v != null);
    if (totals.length >= 2) {
        const oldest = totals[0];
        const newest = totals[totals.length - 1];
        if (oldest > 0) return ((newest - oldest) / oldest) * 100;
    }
    const newFollowers = (rows || []).reduce((acc, row) => {
        const value = row.follows ?? row.follower_count;
        return value == null ? acc : acc + Number(value);
    }, 0);
    if (!newFollowers || !currentFollowers) return null;
    const prior = Math.max(currentFollowers - newFollowers, 1);
    return (newFollowers / prior) * 100;
}

async function loadPeerMetrics(tierKey, excludeAccountId) {
    const latestIds = await creator_scores.findAll({
        attributes: [
            'social_account_id',
            [db.sequelize.fn('MAX', db.sequelize.col('id')), 'id'],
        ],
        where: {
            peer_tier: tierKey,
            status: { [Op.in]: ['ready', 'provisional'] },
            social_account_id: { [Op.ne]: excludeAccountId },
        },
        group: ['social_account_id'],
        raw: true,
    });

    if (!latestIds.length) return {};

    const rows = await creator_scores.findAll({
        where: { id: { [Op.in]: latestIds.map((row) => row.id) } },
    });

    const peers = {};
    for (const key of PEER_METRIC_KEYS) peers[key] = [];
    for (const row of rows) {
        const metrics = row.metrics_json || {};
        for (const key of PEER_METRIC_KEYS) {
            if (metrics[key] != null && Number.isFinite(Number(metrics[key]))) {
                peers[key].push(Number(metrics[key]));
            }
        }
    }
    return peers;
}

async function saveScore(account, payload) {
    const breakdown = Object.fromEntries((payload.breakdown || []).map((item) => [item.key, item.score]));
    const row = await creator_scores.create({
        social_account_id: account.id,
        user_id: account.user_id,
        reach_power: breakdown.reach ?? null,
        engagement_quality: breakdown.engagement ?? null,
        content_performance: breakdown.content ?? null,
        audience_scale: breakdown.audience ?? null,
        consistency: breakdown.consistency ?? null,
        creator_score: payload.overall ?? null,
        rising_score: payload.rising_score ?? null,
        status: payload.status,
        score_version: payload.score_version || SCORE_VERSION,
        peer_tier: payload.peer_tier || getFollowerTier(account.followers_count).key,
        metrics_json: payload.metrics || null,
        payload_json: payload,
        calculated_at: new Date(),
    });
    return row;
}

async function loadLatestScore(accountId) {
    return creator_scores.findOne({
        where: { social_account_id: accountId },
        order: [['calculated_at', 'DESC']],
    });
}

module.exports = {
    getActiveWeights,
    upsertMedia,
    saveAccountInsightSnapshots,
    saveMediaInsightSnapshots,
    loadStoredMedia,
    loadAccountInsightRows,
    followerGrowthFromSnapshots,
    loadPeerMetrics,
    saveScore,
    loadLatestScore,
};
