const SCORE_VERSION = '1.0.0';
const MIN_REELS_FOR_SCORE = 5;
const MIN_PEERS_FOR_PERCENTILE = 5;
const ACCOUNT_INSIGHT_DAYS = 30;
const SYNC_CACHE_MS = 30 * 60 * 1000;

const DEFAULT_WEIGHTS = {
    like: 1,
    comment: 3,
    save: 4,
    share: 5,
    categories: {
        reach_power: 0.25,
        engagement_quality: 0.25,
        content_performance: 0.20,
        audience_scale: 0.15,
        consistency: 0.15,
    },
    reach_power: {
        median_reach: 0.40,
        avg_reel_views: 0.30,
        profile_visit_rate: 0.15,
        non_follower_reach: 0.15,
        without_non_follower: {
            median_reach: 0.40,
            avg_reel_views: 0.35,
            profile_visit_rate: 0.25,
        },
    },
    engagement_quality: {
        weighted_er: 0.40,
        save_rate: 0.25,
        share_rate: 0.20,
        comment_rate: 0.10,
        like_rate: 0.05,
    },
    content_performance: {
        reel_performance: 0.35,
        watch_time: 0.25,
        reel_engagement: 0.20,
        story_performance: 0.20,
        outlier_blend: {
            median: 0.50,
            average: 0.30,
            best: 0.20,
        },
    },
    audience_scale: {
        follower_score: 0.70,
        follower_growth: 0.20,
        audience_quality: 0.10,
    },
    consistency: {
        median_vs_average: 0.40,
        above_baseline: 0.30,
        stability: 0.30,
    },
    rising: {
        follower_growth: 0.30,
        reach_growth: 0.25,
        view_growth: 0.20,
        engagement_growth: 0.15,
        consistency: 0.10,
    },
};

const FOLLOWER_TIERS = [
    { key: 'mega', min: 1_000_000, max: Infinity, label: 'Mega' },
    { key: 'macro', min: 500_000, max: 1_000_000, label: 'Macro' },
    { key: 'mid', min: 100_000, max: 500_000, label: 'Mid' },
    { key: 'micro', min: 10_000, max: 100_000, label: 'Micro' },
    { key: 'nano', min: 1_000, max: 10_000, label: 'Nano' },
    { key: 'emerging', min: 0, max: 1_000, label: 'Emerging' },
];

function getFollowerTier(followers) {
    const count = Number(followers) || 0;
    return FOLLOWER_TIERS.find((tier) => count >= tier.min && count < tier.max) || FOLLOWER_TIERS[FOLLOWER_TIERS.length - 1];
}

function isProfessionalAccount(accountType) {
    const type = String(accountType || '').toUpperCase();
    return type === 'BUSINESS' || type === 'MEDIA_CREATOR' || type === 'CREATOR';
}

function mergeWeights(stored) {
    if (!stored || typeof stored !== 'object') return JSON.parse(JSON.stringify(DEFAULT_WEIGHTS));
    return {
        ...DEFAULT_WEIGHTS,
        ...stored,
        categories: { ...DEFAULT_WEIGHTS.categories, ...stored.categories },
        reach_power: {
            ...DEFAULT_WEIGHTS.reach_power,
            ...stored.reach_power,
            without_non_follower: {
                ...DEFAULT_WEIGHTS.reach_power.without_non_follower,
                ...stored.reach_power?.without_non_follower,
            },
        },
        engagement_quality: { ...DEFAULT_WEIGHTS.engagement_quality, ...stored.engagement_quality },
        content_performance: {
            ...DEFAULT_WEIGHTS.content_performance,
            ...stored.content_performance,
            outlier_blend: {
                ...DEFAULT_WEIGHTS.content_performance.outlier_blend,
                ...stored.content_performance?.outlier_blend,
            },
        },
        audience_scale: { ...DEFAULT_WEIGHTS.audience_scale, ...stored.audience_scale },
        consistency: { ...DEFAULT_WEIGHTS.consistency, ...stored.consistency },
        rising: { ...DEFAULT_WEIGHTS.rising, ...stored.rising },
    };
}

module.exports = {
    SCORE_VERSION,
    MIN_REELS_FOR_SCORE,
    MIN_PEERS_FOR_PERCENTILE,
    ACCOUNT_INSIGHT_DAYS,
    SYNC_CACHE_MS,
    DEFAULT_WEIGHTS,
    FOLLOWER_TIERS,
    getFollowerTier,
    isProfessionalAccount,
    mergeWeights,
};
