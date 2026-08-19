const {
    SCORE_VERSION,
    MIN_REELS_FOR_SCORE,
    getFollowerTier,
    isProfessionalAccount,
    mergeWeights,
    DEFAULT_WEIGHTS,
} = require('./scoringConfig');
const {
    getInsightValue,
    getMediaInsights,
    hasInsight,
    average,
    median,
    stdev,
    rate,
    clampScore,
    weightedAverage,
    logisticScore,
    metricScore,
    blendOutliers,
    isReel,
    getNonFollowerReachPct,
    seriesByDate,
    sumSeriesMetric,
    changeLabel,
    growthRate,
} = require('./metrics');

function getMediaViews(media) {
    return getInsightValue(media, ['views', 'video_views', 'plays']);
}

function getViewBucket(views) {
    if (views == null) return 'unknown';
    if (views >= 10_000_000) return '>10m';
    if (views >= 1_000_000) return '>1m';
    if (views >= 100_000) return '>100k';
    if (views >= 10_000) return '>10k';
    if (views >= 1_000) return '>1k';
    return '<1k';
}

function computeReelsStats(media) {
    const reels = (media || []).filter(isReel);
    const stats = { total: reels.length, '>1k': 0, '>10k': 0, '>100k': 0, '>1m': 0, '>10m': 0, unknown: 0 };

    reels.forEach((item) => {
        const views = getMediaViews(item);
        if (views == null) {
            stats.unknown += 1;
            return;
        }
        if (views >= 10_000_000) stats['>10m'] += 1;
        else if (views >= 1_000_000) stats['>1m'] += 1;
        else if (views >= 100_000) stats['>100k'] += 1;
        else if (views >= 10_000) stats['>10k'] += 1;
        else if (views >= 1_000) stats['>1k'] += 1;
    });

    return stats;
}

function calculateAdvStats(media) {
    if (!media || media.length === 0) return null;

    const likes = media.map((m) => (m.like_count == null ? null : Number(m.like_count)));
    const comments = media.map((m) => (m.comments_count == null ? null : Number(m.comments_count)));
    const avgLikes = average(likes);
    const avgComments = average(comments);

    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
    const recentMedia = media.filter((m) => m.timestamp && new Date(m.timestamp).getTime() > thirtyDaysAgo);
    const postsPerDay = recentMedia.length / 30;

    return {
        avgLikes: avgLikes == null ? null : Math.round(avgLikes),
        avgComments: avgComments == null ? null : parseFloat(avgComments.toFixed(2)),
        postsPerDay: parseFloat(postsPerDay.toFixed(2)),
        postsPerWeek: parseFloat((postsPerDay * 7).toFixed(2)),
    };
}

function calculateInfluencerScore(followers, engagementRate) {
    const baseScore = Math.log10(followers || 1) * 10;
    const engagementBoost = (engagementRate || 0) * 8;
    return Math.min(100, Math.round(baseScore + engagementBoost));
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

function scoreBand(overall) {
    if (overall == null) {
        return {
            label: 'Collecting data',
            percentile_label: 'Score pending',
            description: 'Buzzooka is gathering enough recent Reels and Insights before publishing a mature Creator Score.',
        };
    }
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

function mediaMetricList(reels, reader) {
    return reels.map(reader).filter((v) => v != null);
}

function splitPeriod(reels, days = 15) {
    const now = Date.now();
    const windowMs = days * 24 * 60 * 60 * 1000;
    const recent = [];
    const previous = [];
    for (const item of reels) {
        if (!item.timestamp) continue;
        const age = now - new Date(item.timestamp).getTime();
        if (age <= windowMs) recent.push(item);
        else if (age <= windowMs * 2) previous.push(item);
    }
    return { recent, previous };
}

function mediaInsightNames(media) {
    const names = new Set();
    for (const item of media || []) {
        for (const insight of getMediaInsights(item)) {
            if (insight?.name) names.add(insight.name);
        }
    }
    return [...names];
}

function accountInsightNames(accountInsights) {
    if (Array.isArray(accountInsights) && accountInsights[0]?.date) {
        const names = new Set();
        for (const row of accountInsights) {
            for (const [key, value] of Object.entries(row)) {
                if (key !== 'date' && value != null) names.add(key);
            }
        }
        return [...names];
    }
    return [...new Set((accountInsights || []).map((item) => item?.name).filter(Boolean))];
}

function sampleReels(reels) {
    return (reels || []).slice(0, 8).map((item) => ({
        id: item.id,
        media_type: item.media_type || null,
        media_product_type: item.media_product_type || null,
        timestamp: item.timestamp || null,
        like_count: item.like_count ?? null,
        comments_count: item.comments_count ?? null,
        insight_names: getMediaInsights(item).map((insight) => insight?.name).filter(Boolean),
        views: getMediaViews(item),
        reach: getInsightValue(item, ['reach']),
        saved: getInsightValue(item, ['saved', 'saves']),
        shares: getInsightValue(item, ['shares']),
    }));
}

function addGap(gaps, key, available, reason) {
    if (available) return;
    gaps.push({ key, available: false, reason });
}

function buildCalculationGaps({
    profile,
    reels,
    usableInsights,
    series,
    values = {},
    fetchError = false,
}) {
    const gaps = [];
    const accountType = profile?.account_type || null;
    if (accountType && !isProfessionalAccount(accountType)) {
        gaps.push({
            key: 'account_type',
            available: false,
            reason: `account_type=${accountType} is not a Professional Instagram account`,
        });
    }
    if (fetchError) {
        gaps.push({
            key: 'media_fetch',
            available: false,
            reason: 'Instagram media/insights request failed. See diagnostics.instagram_errors.',
        });
    }
    if ((reels || []).length < MIN_REELS_FOR_SCORE) {
        gaps.push({
            key: 'min_reels',
            available: false,
            reason: `Need at least ${MIN_REELS_FOR_SCORE} recent Reels, found ${(reels || []).length}`,
            found: (reels || []).length,
            required: MIN_REELS_FOR_SCORE,
        });
    }
    if ((usableInsights || []).length === 0) {
        gaps.push({
            key: 'media_insights',
            available: false,
            reason: 'No Reel Insights (views/reach/saved/shares) were returned',
            found: 0,
        });
    }

    addGap(gaps, 'views', values.views != null, 'views / video_views / plays not returned on Reel Insights');
    addGap(gaps, 'reach', values.reach != null, 'reach not returned on Reel or account Insights');
    addGap(gaps, 'saves', values.saves != null, 'saved/saves not returned');
    addGap(gaps, 'shares', values.shares != null, 'shares not returned');
    addGap(gaps, 'likes', values.likes != null, 'likes not returned');
    addGap(gaps, 'comments', values.comments != null, 'comments not returned');
    addGap(gaps, 'weighted_er', values.weighted_er != null, 'cannot compute weighted ER without reach + interaction counts');
    addGap(gaps, 'profile_views', values.profile_visit_rate != null, 'profile_views or account reach missing, so Profile Visit Rate was skipped');
    addGap(gaps, 'non_follower_reach', values.non_follower_reach_pct != null, 'follow_type/follower_type breakdown was not returned');
    addGap(gaps, 'watch_time', values.avg_watch_time != null, 'ig_reels_avg_watch_time and ig_reels_video_view_total_time were not returned');
    addGap(gaps, 'story_performance', values.story_engagement != null, 'Story Insights are not fetched yet, weight redistributed');
    addGap(gaps, 'follower_growth', values.follower_growth_pct != null, 'no follower snapshot history or follows metric');
    addGap(gaps, 'impressions', (series || []).some((row) => row?.impressions != null), 'impressions is not available on this API version/account');

    return gaps;
}

function buildCollectingPayload({ status, label, description, percentileLabel, profile, reels, extra = {} }) {
    return {
        overall: null,
        status,
        score_version: SCORE_VERSION,
        rising_score: null,
        peer_tier: getFollowerTier(profile?.followers_count).key,
        label,
        percentile_label: percentileLabel,
        description,
        badges: [],
        breakdown: [
            { key: 'reach', name: 'Reach Power', score: null },
            { key: 'engagement', name: 'Engagement Quality', score: null },
            { key: 'content', name: 'Content Performance', score: null },
            { key: 'audience', name: 'Audience Scale', score: null },
            { key: 'consistency', name: 'Consistency', score: null },
        ],
        audience: {
            avg_reach: null,
            avg_reach_change: null,
            engagement_rate: null,
            engagement_change: null,
            avg_reel_views: null,
            avg_reel_views_change: null,
            non_follower_reach_pct: null,
            non_follower_note: null,
        },
        engagement: {
            like_rate: null,
            comment_rate: null,
            save_rate: null,
            share_rate: null,
            weighted_er: null,
        },
        consistency: {
            title: 'Collecting data',
            median_reel_views: null,
            median_vs_average_pct: null,
            median_note: null,
            above_baseline_pct: null,
            baseline_note: null,
            growth_30d_pct: null,
            growth_note: null,
            posts_per_week: calculateAdvStats(reels)?.postsPerWeek ?? 0,
        },
        ...extra,
    };
}

function calculateCreatorScore(profile, media, engagementRate, accountInsights = [], options = {}) {
    const weights = mergeWeights(options.weights);
    const peers = options.peerMetrics || {};
    const followers = Number(profile?.followers_count) || 0;
    const accountType = profile?.account_type || options.accountType;
    const reels = (media || []).filter(isReel);
    const fetchError = Boolean(options.fetchError);
    const usableInsights = reels.filter((item) => hasInsight(item, ['views', 'reach', 'saved', 'saves', 'shares', 'total_interactions']));
    const series = Array.isArray(accountInsights) && accountInsights[0]?.date
        ? accountInsights
        : seriesByDate(accountInsights);

    const dataSummary = {
        account_type: accountType || null,
        followers,
        reels_count: reels.length,
        reels_with_insights: usableInsights.length,
        media_insight_names: mediaInsightNames(reels),
        account_insight_names: accountInsightNames(accountInsights),
        sample_reels: sampleReels(reels),
    };

    if (!isProfessionalAccount(accountType) && accountType) {
        return buildCollectingPayload({
            status: 'ineligible',
            label: 'Profile only',
            percentileLabel: 'Not eligible',
            description: 'Creator Score requires an Instagram Professional account (Business or Creator) with Insights access.',
            profile,
            reels,
            extra: {
                calculation_gaps: buildCalculationGaps({ profile, reels, usableInsights, series }),
                data_summary: dataSummary,
            },
        });
    }

    if (reels.length < MIN_REELS_FOR_SCORE || usableInsights.length === 0) {
        const reason = reels.length < MIN_REELS_FOR_SCORE
            ? `Need at least ${MIN_REELS_FOR_SCORE} recent Reels, found ${reels.length}.`
            : 'Reels were found, but none included usable Insights (views/reach/saved/shares).';
        return buildCollectingPayload({
            status: fetchError && !reels.length ? 'error' : 'collecting',
            label: fetchError && !reels.length ? 'Insights sync failed' : 'Collecting data',
            percentileLabel: fetchError && !reels.length ? 'Retry required' : 'Score pending',
            description: fetchError && !reels.length
                ? 'An Instagram media request failed. Check diagnostics.instagram_errors for the Meta response.'
                : `${reason} Buzzooka will keep collecting; missing metrics are listed in calculation_gaps.`,
            profile,
            reels,
            extra: {
                calculation_gaps: buildCalculationGaps({
                    profile,
                    reels,
                    usableInsights,
                    series,
                    fetchError,
                }),
                data_summary: dataSummary,
            },
        });
    }

    const views = mediaMetricList(reels, getMediaViews);
    const reaches = mediaMetricList(reels, (item) => getInsightValue(item, ['reach']));
    const saves = mediaMetricList(reels, (item) => getInsightValue(item, ['saved', 'saves']));
    const shares = mediaMetricList(reels, (item) => getInsightValue(item, ['shares']));
    const likes = mediaMetricList(reels, (item) => {
        const fromInsight = getInsightValue(item, ['likes']);
        if (fromInsight != null) return fromInsight;
        return item.like_count == null ? null : Number(item.like_count);
    });
    const comments = mediaMetricList(reels, (item) => {
        const fromInsight = getInsightValue(item, ['comments']);
        if (fromInsight != null) return fromInsight;
        return item.comments_count == null ? null : Number(item.comments_count);
    });
    const interactions = mediaMetricList(reels, (item) => getInsightValue(item, ['total_interactions']));
    const watchTimes = mediaMetricList(reels, (item) => getInsightValue(item, ['ig_reels_avg_watch_time']));
    const totalWatchTimes = mediaMetricList(reels, (item) => getInsightValue(item, ['ig_reels_video_view_total_time']));
    const replays = mediaMetricList(reels, (item) => getInsightValue(item, ['clips_replays_count']));
    const skipRates = mediaMetricList(reels, (item) => getInsightValue(item, ['reels_skip_rate']));

    const avgViews = average(views);
    const medianViews = median(views);
    const avgReach = average(reaches);
    const medianReach = median(reaches);
    const avgLikes = average(likes);
    const avgComments = average(comments);
    const avgSaves = average(saves);
    const avgShares = average(shares);
    const { recent, previous } = splitPeriod(reels);
    const recentAvgViews = average(recent.map(getMediaViews));
    const previousAvgViews = average(previous.map(getMediaViews));
    const recentAvgReach = average(recent.map((item) => getInsightValue(item, ['reach'])));
    const previousAvgReach = average(previous.map((item) => getInsightValue(item, ['reach'])));

    const totalLikes = likes.length ? likes.reduce((acc, v) => acc + v, 0) : null;
    const totalComments = comments.length ? comments.reduce((acc, v) => acc + v, 0) : null;
    const totalSaves = saves.length ? saves.reduce((acc, v) => acc + v, 0) : null;
    const totalShares = shares.length ? shares.reduce((acc, v) => acc + v, 0) : null;
    const totalReach = reaches.length ? reaches.reduce((acc, v) => acc + v, 0) : sumSeriesMetric(series, 'reach');
    const totalViews = views.length ? views.reduce((acc, v) => acc + v, 0) : sumSeriesMetric(series, 'views');
    const accountProfileViews = sumSeriesMetric(series, 'profile_views');
    const accountReach = sumSeriesMetric(series, 'reach') ?? totalReach;

    const likeRate = rate(totalLikes, totalReach);
    const commentRate = rate(totalComments, totalReach);
    const saveRate = rate(totalSaves, totalReach);
    const shareRate = rate(totalShares, totalReach);
    const weightedParts = [
        [totalLikes, weights.like],
        [totalComments, weights.comment],
        [totalSaves, weights.save],
        [totalShares, weights.share],
    ];
    const weightedInteractions = weightedParts.some(([value]) => value != null)
        ? weightedParts.reduce((acc, [value, weight]) => (value == null ? acc : acc + value * weight), 0)
        : null;
    const weightedEr = rate(weightedInteractions, totalReach);
    const totalInteractionsValue = interactions.length
        ? interactions.reduce((acc, v) => acc + v, 0)
        : [totalLikes, totalComments, totalSaves, totalShares].every((v) => v != null)
            ? totalLikes + totalComments + totalSaves + totalShares
            : null;
    const engagementRateValue = rate(totalInteractionsValue, totalReach) ?? (engagementRate || null);

    const profileVisitRate = rate(accountProfileViews, accountReach);
    const nonFollowerPct = options.nonFollowerReachPct ?? getNonFollowerReachPct(accountInsights);
    const followerGrowthPct = options.followerGrowthPct ?? (() => {
        const newFollowers = sumSeriesMetric(series, 'follows') ?? sumSeriesMetric(series, 'follower_count');
        if (newFollowers == null || followers <= 0) return null;
        const prior = Math.max(followers - newFollowers, 1);
        return (newFollowers / prior) * 100;
    })();

    const blendedViews = blendOutliers(views, weights.content_performance.outlier_blend);
    const reelPerformance = followers > 0 && blendedViews != null ? blendedViews / followers : null;
    const avgWatchTime = average(watchTimes) ?? (
        totalWatchTimes.length && totalViews
            ? totalWatchTimes.reduce((acc, v) => acc + v, 0) / totalViews
            : null
    );
    const reelEngagement = rate(totalInteractionsValue, totalReach);
    const storyEngagement = options.storyEngagement ?? null;

    const medianVsAvg = rate(medianViews, avgViews, false);
    const aboveBaselineCount = views.filter((v) => v >= (medianViews ?? avgViews ?? 0)).length;
    const aboveBaselinePct = views.length ? (aboveBaselineCount / views.length) * 100 : null;
    const cv = avgViews ? (stdev(views) ?? 0) / avgViews : null;
    const stabilityScore = cv == null ? null : clampScore(100 / (1 + cv));

    const reachPowerScore = clampScore(weightedAverage([
        {
            score: metricScore(medianReach, peers.median_reach, logisticScore((medianReach || 0) / Math.max(followers, 1), 0.8, 0.5)),
            weight: nonFollowerPct == null ? weights.reach_power.without_non_follower.median_reach : weights.reach_power.median_reach,
        },
        {
            score: metricScore(avgViews, peers.avg_reel_views, logisticScore((avgViews || 0) / Math.max(followers, 1), 0.6, 0.4)),
            weight: nonFollowerPct == null ? weights.reach_power.without_non_follower.avg_reel_views : weights.reach_power.avg_reel_views,
        },
        {
            score: metricScore(profileVisitRate, peers.profile_visit_rate, logisticScore(profileVisitRate, 8, 6)),
            weight: nonFollowerPct == null ? weights.reach_power.without_non_follower.profile_visit_rate : weights.reach_power.profile_visit_rate,
        },
        {
            score: metricScore(nonFollowerPct, peers.non_follower_reach_pct, logisticScore(nonFollowerPct, 45, 20)),
            weight: nonFollowerPct == null ? 0 : weights.reach_power.non_follower_reach,
        },
    ]));

    const engagementQualityScore = clampScore(weightedAverage([
        { score: metricScore(weightedEr, peers.weighted_er, logisticScore(weightedEr, 4, 3)), weight: weights.engagement_quality.weighted_er },
        { score: metricScore(saveRate, peers.save_rate, logisticScore(saveRate, 1.5, 1.2)), weight: weights.engagement_quality.save_rate },
        { score: metricScore(shareRate, peers.share_rate, logisticScore(shareRate, 0.4, 0.4)), weight: weights.engagement_quality.share_rate },
        { score: metricScore(commentRate, peers.comment_rate, logisticScore(commentRate, 0.3, 0.3)), weight: weights.engagement_quality.comment_rate },
        { score: metricScore(likeRate, peers.like_rate, logisticScore(likeRate, 4, 3)), weight: weights.engagement_quality.like_rate },
    ]));

    const contentPerformanceScore = clampScore(weightedAverage([
        { score: metricScore(reelPerformance, peers.reel_performance, logisticScore(reelPerformance, 0.5, 0.4)), weight: weights.content_performance.reel_performance },
        { score: metricScore(avgWatchTime, peers.avg_watch_time, logisticScore(avgWatchTime, 8, 6)), weight: weights.content_performance.watch_time },
        { score: metricScore(reelEngagement, peers.reel_engagement, logisticScore(reelEngagement, 5, 4)), weight: weights.content_performance.reel_engagement },
        { score: metricScore(storyEngagement, peers.story_engagement, logisticScore(storyEngagement, 4, 3)), weight: weights.content_performance.story_performance },
    ]));

    const followerLogScore = clampScore(Math.log10(Math.max(followers, 1)) * 16.6);
    const audienceScaleScore = clampScore(weightedAverage([
        { score: metricScore(followerLogScore, peers.follower_score, followerLogScore), weight: weights.audience_scale.follower_score },
        { score: metricScore(followerGrowthPct, peers.follower_growth_pct, logisticScore(followerGrowthPct, 5, 8)), weight: weights.audience_scale.follower_growth },
        { score: metricScore(nonFollowerPct, peers.audience_quality, logisticScore(nonFollowerPct, 45, 20)), weight: weights.audience_scale.audience_quality },
    ]));

    const medianVsAvgScore = medianVsAvg == null ? null : clampScore(medianVsAvg * 100);
    const consistencyScore = clampScore(weightedAverage([
        { score: metricScore(medianVsAvgScore, peers.median_vs_average, medianVsAvgScore), weight: weights.consistency.median_vs_average },
        { score: metricScore(aboveBaselinePct, peers.above_baseline_pct, aboveBaselinePct), weight: weights.consistency.above_baseline },
        { score: metricScore(stabilityScore, peers.stability, stabilityScore), weight: weights.consistency.stability },
    ]));

    const overall = clampScore(weightedAverage([
        { score: reachPowerScore, weight: weights.categories.reach_power },
        { score: engagementQualityScore, weight: weights.categories.engagement_quality },
        { score: contentPerformanceScore, weight: weights.categories.content_performance },
        { score: audienceScaleScore, weight: weights.categories.audience_scale },
        { score: consistencyScore, weight: weights.categories.consistency },
    ]));

    const viewGrowth = growthRate(recentAvgViews, previousAvgViews);
    const reachGrowth = growthRate(recentAvgReach, previousAvgReach);
    const periodEr = (items) => {
        const interactions = items.map((item) => {
            const fromInsight = getInsightValue(item, ['total_interactions']);
            if (fromInsight != null) return fromInsight;
            if (item.like_count == null && item.comments_count == null) return null;
            return (item.like_count || 0) + (item.comments_count || 0);
        });
        const reachValues = items.map((item) => getInsightValue(item, ['reach']));
        const interactionSum = interactions.every((v) => v == null) ? null : interactions.reduce((acc, v) => acc + (v || 0), 0);
        const reachSum = reachValues.every((v) => v == null) ? null : reachValues.reduce((acc, v) => acc + (v || 0), 0);
        return rate(interactionSum, reachSum);
    };
    const recentEr = periodEr(recent);
    const previousEr = periodEr(previous);
    const engagementGrowth = growthRate(recentEr, previousEr);

    const risingScore = clampScore(weightedAverage([
        { score: metricScore(followerGrowthPct, peers.follower_growth_pct, logisticScore(followerGrowthPct, 8, 8)), weight: weights.rising.follower_growth },
        { score: metricScore(reachGrowth, peers.reach_growth, logisticScore(reachGrowth, 10, 12)), weight: weights.rising.reach_growth },
        { score: metricScore(viewGrowth, peers.view_growth, logisticScore(viewGrowth, 10, 12)), weight: weights.rising.view_growth },
        { score: metricScore(engagementGrowth, peers.engagement_growth, logisticScore(engagementGrowth, 8, 10)), weight: weights.rising.engagement_growth },
        { score: consistencyScore, weight: weights.rising.consistency },
    ]));

    const peerCount = Math.max(
        ...(Object.values(peers).map((list) => (Array.isArray(list) ? list.length : 0))),
        0,
    );
    const status = peerCount >= 5 ? 'ready' : 'provisional';
    const band = scoreBand(overall);
    const adv = calculateAdvStats(reels);
    const postsPerWeek = adv?.postsPerWeek ?? 0;

    const badges = [];
    if ((followerGrowthPct != null && followerGrowthPct >= 8) || postsPerWeek >= 4) {
        badges.push({ key: 'growth', label: '↑ Fast Growing', tone: 'green' });
    }
    if ((avgReach != null && followers > 0 && avgReach / followers >= 1.2) || views.some((v) => v >= 100_000)) {
        badges.push({ key: 'video', label: '◎ Strong Video', tone: 'blue' });
    }
    if ((engagementRateValue || 0) >= 3.5 || (weightedEr || 0) >= 8) {
        badges.push({ key: 'engaged', label: '✦ Highly Engaged', tone: 'yellow' });
    }

    const medianVsAvgPct = medianVsAvg == null ? null : Math.round(medianVsAvg * 100);
    const nonFollowerNote = nonFollowerPct == null
        ? null
        : nonFollowerPct >= 60
            ? 'Excellent discovery'
            : nonFollowerPct >= 40
                ? 'Strong discovery'
                : 'Building discovery';
    const consistencyTitle = (aboveBaselinePct || 0) >= 70 ? 'Reliable performance' : 'Variable performance';
    const baselineNote = aboveBaselinePct == null ? null : aboveBaselinePct >= 70 ? 'Very consistent' : 'Needs more consistency';
    const growthNote = followerGrowthPct == null
        ? null
        : followerGrowthPct >= 10
            ? 'Faster than category'
            : 'Steady growth';

    const categoryER = 3.5;
    const erDelta = engagementRateValue == null ? null : engagementRateValue - categoryER;

    return {
        overall,
        status,
        score_version: SCORE_VERSION,
        rising_score: risingScore,
        peer_tier: getFollowerTier(followers).key,
        peer_count: peerCount,
        ...band,
        badges,
        breakdown: [
            { key: 'reach', name: 'Reach Power', score: reachPowerScore },
            { key: 'engagement', name: 'Engagement Quality', score: engagementQualityScore },
            { key: 'content', name: 'Content Performance', score: contentPerformanceScore },
            { key: 'audience', name: 'Audience Scale', score: audienceScaleScore },
            { key: 'consistency', name: 'Consistency', score: consistencyScore },
        ],
        audience: {
            avg_reach: avgReach == null ? null : Math.round(avgReach),
            avg_reach_change: changeLabel(recentAvgReach, previousAvgReach),
            engagement_rate: engagementRateValue == null ? null : parseFloat(engagementRateValue.toFixed(2)),
            engagement_change: erDelta == null ? null : `${erDelta >= 0 ? '↑' : '↓'} ${Math.abs(erDelta).toFixed(1)}% vs category`,
            avg_reel_views: avgViews == null ? null : Math.round(avgViews),
            avg_reel_views_change: changeLabel(recentAvgViews, previousAvgViews, ''),
            non_follower_reach_pct: nonFollowerPct == null ? null : clampScore(nonFollowerPct),
            non_follower_note: nonFollowerNote,
        },
        engagement: {
            like_rate: likeRate == null ? null : parseFloat(likeRate.toFixed(2)),
            comment_rate: commentRate == null ? null : parseFloat(commentRate.toFixed(2)),
            save_rate: saveRate == null ? null : parseFloat(saveRate.toFixed(2)),
            share_rate: shareRate == null ? null : parseFloat(shareRate.toFixed(2)),
            weighted_er: weightedEr == null ? null : parseFloat(weightedEr.toFixed(2)),
        },
        consistency: {
            title: consistencyTitle,
            median_reel_views: medianViews == null ? null : Math.round(medianViews),
            median_vs_average_pct: medianVsAvgPct,
            median_note: medianVsAvgPct == null ? null : `${medianVsAvgPct}% of average views`,
            above_baseline_pct: aboveBaselinePct == null ? null : Math.round(aboveBaselinePct),
            baseline_note: baselineNote,
            growth_30d_pct: followerGrowthPct == null ? null : parseFloat(followerGrowthPct.toFixed(1)),
            growth_note: growthNote,
            posts_per_week: postsPerWeek,
        },
        metrics: {
            median_reach: medianReach,
            avg_reel_views: avgViews,
            profile_visit_rate: profileVisitRate,
            non_follower_reach_pct: nonFollowerPct,
            weighted_er: weightedEr,
            save_rate: saveRate,
            share_rate: shareRate,
            comment_rate: commentRate,
            like_rate: likeRate,
            reel_performance: reelPerformance,
            avg_watch_time: avgWatchTime,
            reel_engagement: reelEngagement,
            story_engagement: storyEngagement,
            follower_score: followerLogScore,
            follower_growth_pct: followerGrowthPct,
            audience_quality: nonFollowerPct,
            median_vs_average: medianVsAvgScore,
            above_baseline_pct: aboveBaselinePct,
            stability: stabilityScore,
            reach_growth: reachGrowth,
            view_growth: viewGrowth,
            engagement_growth: engagementGrowth,
            replays: average(replays),
            skip_rate: average(skipRates),
            followers,
        },
        calculation_gaps: buildCalculationGaps({
            profile,
            reels,
            usableInsights,
            series,
            fetchError: options.fetchError,
            values: {
                views: avgViews,
                reach: medianReach ?? avgReach,
                saves: saveRate,
                shares: shareRate,
                likes: likeRate,
                comments: commentRate,
                weighted_er: weightedEr,
                profile_visit_rate: profileVisitRate,
                non_follower_reach_pct: nonFollowerPct,
                avg_watch_time: avgWatchTime,
                story_engagement: storyEngagement,
                follower_growth_pct: followerGrowthPct,
            },
        }),
        data_summary: dataSummary,
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
    SCORE_VERSION,
    DEFAULT_WEIGHTS,
};
