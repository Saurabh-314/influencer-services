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
    // Insights can arrive as an array (per-media insights call) or nested under
    // `insights.data` (field expansion on the media edge). Support both.
    const insights = Array.isArray(media.insights)
        ? media.insights
        : media.insights?.data ?? [];
    const viewsInsight = insights.find(
        (i) => i.name === 'views' || i.name === 'video_views' || i.name === 'plays',
    );
    if (viewsInsight?.values?.[0]?.value != null) {
        return viewsInsight.values[0].value;
    }
    return (media.like_count || 0) * 10;
}

function getViewBucket(views) {
    if (views >= 10_000_000) return '>10m';
    if (views >= 1_000_000) return '>1m';
    if (views >= 100_000) return '>100k';
    if (views >= 10_000) return '>10k';
    if (views >= 1_000) return '>1k';
    return '<1k';
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

function clampScore(n) {
    return Math.max(0, Math.min(100, Math.round(n)));
}

function getMediaInsights(media) {
    return Array.isArray(media?.insights)
        ? media.insights
        : media?.insights?.data ?? [];
}

function getInsightValue(media, names) {
    const insights = getMediaInsights(media);
    const nameList = Array.isArray(names) ? names : [names];
    for (const name of nameList) {
        const found = insights.find((i) => i.name === name);
        if (found?.values?.[0]?.value != null) {
            return Number(found.values[0].value) || 0;
        }
    }
    return 0;
}

function sumAccountInsight(accountInsights, name) {
    const metric = (accountInsights || []).find((i) => i.name === name);
    if (!metric?.values?.length) return 0;
    return metric.values.reduce((acc, v) => acc + (Number(v.value) || 0), 0);
}

function average(values) {
    if (!values.length) return 0;
    return values.reduce((acc, v) => acc + v, 0) / values.length;
}

function median(values) {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function isReel(media) {
    return media?.media_product_type === 'REELS'
        || media?.media_type === 'REELS'
        || media?.media_type === 'VIDEO';
}

function scoreBand(overall) {
    if (overall >= 90) {
        return {
            label: 'Exceptional creator',
            percentile_label: 'Top 2% of creators',
            description: 'Strong audience engagement, high content reach and consistent performance across recent content.',
        };
    }
    if (overall >= 80) {
        return {
            label: 'Outstanding creator',
            percentile_label: 'Top 8% of creators',
            description: 'High reach and engagement with reliable content performance against similar audience sizes.',
        };
    }
    if (overall >= 70) {
        return {
            label: 'Strong creator',
            percentile_label: 'Top 20% of creators',
            description: 'Solid audience response and content performance, with room to grow reach and consistency.',
        };
    }
    if (overall >= 55) {
        return {
            label: 'Rising creator',
            percentile_label: 'Top 40% of creators',
            description: 'Promising engagement and content traction. Improving consistency will lift the overall score.',
        };
    }
    return {
        label: 'Developing creator',
        percentile_label: 'Building on the platform',
        description: 'Early-stage performance. Focus on posting consistently and improving engagement quality.',
    };
}

function changeLabel(current, previous, suffix = 'vs previous period') {
    if (previous == null || previous <= 0 || current == null) return null;
    const delta = ((current - previous) / previous) * 100;
    const abs = Math.abs(delta).toFixed(1);
    const arrow = delta >= 0 ? '↑' : '↓';
    return suffix ? `${arrow} ${abs}% ${suffix}` : `${arrow} ${abs}%`;
}

/**
 * Build the Creator Score payload used by the admin creator detail page.
 */
function calculateCreatorScore(profile, media, engagementRate, accountInsights = []) {
    const followers = Number(profile?.followers_count) || 0;
    const reels = (media || []).filter(isReel);
    const views = reels.map((m) => getMediaViews(m));
    const reaches = reels.map((m) => getInsightValue(m, ['reach']));
    const saves = reels.map((m) => getInsightValue(m, ['saved', 'saves']));
    const shares = reels.map((m) => getInsightValue(m, ['shares']));
    const likes = reels.map((m) => Number(m.like_count) || 0);
    const comments = reels.map((m) => Number(m.comments_count) || 0);

    const hasReach = reaches.some((v) => v > 0);
    const hasSaves = saves.some((v) => v > 0);
    const hasShares = shares.some((v) => v > 0);

    const avgViews = average(views);
    const avgReach = hasReach ? average(reaches.filter((v) => v > 0)) : avgViews;
    const avgLikes = average(likes);
    const avgComments = average(comments);
    const avgSaves = average(saves);
    const avgShares = average(shares);
    const medianViews = median(views.filter((v) => v > 0));

    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    const recentReels = reels.filter((m) => m.timestamp && now - new Date(m.timestamp).getTime() <= 15 * day);
    const previousReels = reels.filter((m) => {
        if (!m.timestamp) return false;
        const age = now - new Date(m.timestamp).getTime();
        return age > 15 * day && age <= 30 * day;
    });
    const recentAvgViews = average(recentReels.map((m) => getMediaViews(m)));
    const previousAvgViews = average(previousReels.map((m) => getMediaViews(m)));

    const denom = avgReach || avgViews || 1;
    const likeRate = (avgLikes / denom) * 100;
    const commentRate = (avgComments / denom) * 100;
    const saveRate = hasSaves ? (avgSaves / denom) * 100 : null;
    const shareRate = hasShares ? (avgShares / denom) * 100 : null;

    const reachRatio = followers > 0 ? avgReach / followers : 0;
    const reachPower = clampScore(40 + Math.min(60, reachRatio * 30));

    const engagementQuality = clampScore(((engagementRate || 0) / 6) * 100);

    const viralShare = views.length
        ? views.filter((v) => v >= 10_000).length / views.length
        : 0;
    const contentPerformance = clampScore(
        20 + Math.min(50, reachRatio * 25) + Math.min(30, viralShare * 100),
    );

    const audienceScale = clampScore(Math.log10(Math.max(followers, 1)) * 16.6);

    const aboveBaselineCount = views.filter((v) => v >= (medianViews || avgViews) * 0.8).length;
    const aboveBaselinePct = views.length ? (aboveBaselineCount / views.length) * 100 : 0;
    const mean = avgViews || 1;
    const variance = views.length
        ? views.reduce((acc, v) => acc + (v - mean) ** 2, 0) / views.length
        : 0;
    const cv = Math.sqrt(variance) / mean;
    const consistencyFromSpread = clampScore(100 - Math.min(70, cv * 55));
    const consistency = clampScore(aboveBaselinePct * 0.65 + consistencyFromSpread * 0.35);

    const overall = clampScore(
        reachPower * 0.25
        + engagementQuality * 0.25
        + contentPerformance * 0.2
        + audienceScale * 0.15
        + consistency * 0.15,
    );

    const band = scoreBand(overall);

    const newFollowers30d = sumAccountInsight(accountInsights, 'follower_count');
    const priorFollowers = Math.max(followers - newFollowers30d, 1);
    const growthPct = newFollowers30d > 0
        ? (newFollowers30d / priorFollowers) * 100
        : null;

    const nonFollowerPct = avgReach > followers
        ? clampScore((1 - followers / avgReach) * 100)
        : null;

    const adv = calculateAdvStats(reels);
    const postsPerWeek = adv?.postsPerWeek ?? 0;

    const badges = [];
    if ((growthPct != null && growthPct >= 8) || postsPerWeek >= 4) {
        badges.push({ key: 'growth', label: '↑ Fast Growing', tone: 'green' });
    }
    if (reachRatio >= 1.2 || views.some((v) => v >= 100_000)) {
        badges.push({ key: 'video', label: '◎ Strong Video', tone: 'blue' });
    }
    if ((engagementRate || 0) >= 3.5) {
        badges.push({ key: 'engaged', label: '✦ Highly Engaged', tone: 'yellow' });
    }

    const medianVsAvg = avgViews > 0 ? Math.round((medianViews / avgViews) * 100) : null;

    const categoryER = 3.5;
    const erDelta = (engagementRate || 0) - categoryER;
    const engagementChange = `${erDelta >= 0 ? '↑' : '↓'} ${Math.abs(erDelta).toFixed(1)}% vs category`;

    const nonFollowerNote = nonFollowerPct == null
        ? null
        : nonFollowerPct >= 60
            ? 'Excellent discovery'
            : nonFollowerPct >= 40
                ? 'Strong discovery'
                : 'Building discovery';

    const consistencyTitle = aboveBaselinePct >= 70 ? 'Reliable performance' : 'Variable performance';
    const baselineNote = aboveBaselinePct >= 70 ? 'Very consistent' : 'Needs more consistency';
    const growthNote = growthPct == null
        ? null
        : growthPct >= 10
            ? 'Faster than category'
            : 'Steady growth';
    const medianNote = medianVsAvg == null ? null : `${medianVsAvg}% of average views`;

    return {
        overall,
        ...band,
        badges,
        breakdown: [
            { key: 'reach', name: 'Reach Power', score: reachPower },
            { key: 'engagement', name: 'Engagement Quality', score: engagementQuality },
            { key: 'content', name: 'Content Performance', score: contentPerformance },
            { key: 'audience', name: 'Audience Scale', score: audienceScale },
            { key: 'consistency', name: 'Consistency', score: consistency },
        ],
        audience: {
            avg_reach: Math.round(avgReach),
            avg_reach_change: changeLabel(recentAvgViews, previousAvgViews),
            engagement_rate: parseFloat((engagementRate || 0).toFixed(2)),
            engagement_change: engagementChange,
            avg_reel_views: Math.round(avgViews),
            avg_reel_views_change: changeLabel(recentAvgViews, previousAvgViews, ''),
            non_follower_reach_pct: nonFollowerPct,
            non_follower_note: nonFollowerNote,
        },
        engagement: {
            like_rate: parseFloat(likeRate.toFixed(2)),
            comment_rate: parseFloat(commentRate.toFixed(2)),
            save_rate: saveRate == null ? null : parseFloat(saveRate.toFixed(2)),
            share_rate: shareRate == null ? null : parseFloat(shareRate.toFixed(2)),
        },
        consistency: {
            title: consistencyTitle,
            median_reel_views: Math.round(medianViews),
            median_vs_average_pct: medianVsAvg,
            median_note: medianNote,
            above_baseline_pct: Math.round(aboveBaselinePct),
            baseline_note: baselineNote,
            growth_30d_pct: growthPct == null ? null : parseFloat(growthPct.toFixed(1)),
            growth_note: growthNote,
            posts_per_week: postsPerWeek,
        },
    };
}

module.exports = {
    calculateInfluencerScore,
    calculateAdvStats,
    calculateCreatorScore,
    getVusicRank,
    getPayoutForRank,
    getMediaViews,
    getInsightValue,
    getViewBucket,
    computeReelsStats,
};
