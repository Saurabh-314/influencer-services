function coerceInsightNumber(value) {
    if (value == null) return null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'string' && value.trim() !== '') {
        const n = Number(value);
        return Number.isFinite(n) ? n : null;
    }
    if (typeof value === 'object') {
        if (value.value != null) return coerceInsightNumber(value.value);
        if (value.count != null) return coerceInsightNumber(value.count);
    }
    return null;
}

function readInsightNumber(insight) {
    if (!insight) return null;

    const fromTotal = coerceInsightNumber(insight.total_value?.value ?? insight.total_value);
    if (fromTotal != null) return fromTotal;

    const values = Array.isArray(insight.values) ? insight.values : [];
    for (let i = values.length - 1; i >= 0; i -= 1) {
        const n = coerceInsightNumber(values[i]?.value ?? values[i]);
        if (n != null) return n;
    }

    return coerceInsightNumber(insight.value);
}

function getMediaInsights(media) {
    if (Array.isArray(media?.insights)) return media.insights;
    if (Array.isArray(media?.insights?.data)) return media.insights.data;
    return [];
}

function hasInsight(media, names) {
    const insights = getMediaInsights(media);
    const nameList = Array.isArray(names) ? names : [names];
    return insights.some((item) => nameList.includes(item?.name));
}

function getInsightValue(media, names) {
    const insights = getMediaInsights(media);
    const nameList = Array.isArray(names) ? names : [names];
    for (const name of nameList) {
        const found = insights.find((item) => item?.name === name);
        if (!found) continue;
        const value = readInsightNumber(found);
        if (value != null) return value;
        const values = Array.isArray(found.values) ? found.values : [];
        if (values.some((row) => row?.value === 0 || row === 0) || found.total_value?.value === 0) {
            return 0;
        }
        return null;
    }
    return null;
}

function average(values) {
    const nums = (values || []).filter((v) => v != null && Number.isFinite(v));
    if (!nums.length) return null;
    return nums.reduce((acc, v) => acc + v, 0) / nums.length;
}

function median(values) {
    const nums = (values || []).filter((v) => v != null && Number.isFinite(v)).sort((a, b) => a - b);
    if (!nums.length) return null;
    const mid = Math.floor(nums.length / 2);
    return nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
}

function maxValue(values) {
    const nums = (values || []).filter((v) => v != null && Number.isFinite(v));
    if (!nums.length) return null;
    return Math.max(...nums);
}

function stdev(values) {
    const nums = (values || []).filter((v) => v != null && Number.isFinite(v));
    if (nums.length < 2) return null;
    const mean = average(nums);
    const variance = nums.reduce((acc, v) => acc + (v - mean) ** 2, 0) / nums.length;
    return Math.sqrt(variance);
}

function sumNullable(values) {
    const nums = (values || []).filter((v) => v != null && Number.isFinite(v));
    if (!nums.length) return null;
    return nums.reduce((acc, v) => acc + v, 0);
}

function rate(numerator, denominator, asPercent = true) {
    if (numerator == null || denominator == null || denominator === 0) return null;
    const value = numerator / denominator;
    return asPercent ? value * 100 : value;
}

function clampScore(n) {
    if (n == null || !Number.isFinite(n)) return null;
    return Math.max(0, Math.min(100, Math.round(n)));
}

function weightedAverage(components) {
    const available = (components || []).filter((item) => item && item.score != null && Number.isFinite(item.score) && item.weight > 0);
    if (!available.length) return null;
    const totalWeight = available.reduce((acc, item) => acc + item.weight, 0);
    if (totalWeight <= 0) return null;
    return available.reduce((acc, item) => acc + item.score * (item.weight / totalWeight), 0);
}

function logisticScore(value, midpoint, scale) {
    if (value == null || !Number.isFinite(value) || !scale) return null;
    const x = (value - midpoint) / scale;
    return 100 / (1 + Math.exp(-x));
}

function percentileRank(value, population) {
    if (value == null || !Number.isFinite(value)) return null;
    const peers = (population || []).filter((v) => v != null && Number.isFinite(v));
    if (!peers.length) return null;
    const below = peers.filter((v) => v < value).length;
    const equal = peers.filter((v) => v === value).length;
    return ((below + 0.5 * equal) / peers.length) * 100;
}

function metricScore(value, peers = [], fallback) {
    if (value == null || !Number.isFinite(value)) return null;
    const population = (peers || []).filter((v) => v != null && Number.isFinite(v));
    const fallbackScore = fallback != null ? clampScore(fallback) : null;

    if (population.length >= 5) {
        return clampScore(percentileRank(value, population));
    }

    if (population.length >= 2 && fallbackScore != null) {
        const percentile = percentileRank(value, population);
        const weight = population.length / 5;
        return clampScore(percentile * weight + fallbackScore * (1 - weight));
    }

    return fallbackScore;
}

function blendOutliers(values, blend = { median: 0.5, average: 0.3, best: 0.2 }) {
    const medianValue = median(values);
    const averageValue = average(values);
    const bestValue = maxValue(values);
    return weightedAverage([
        { score: medianValue, weight: blend.median },
        { score: averageValue, weight: blend.average },
        { score: bestValue, weight: blend.best },
    ]);
}

function dateKey(value) {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
    return date.toISOString().slice(0, 10);
}

function isReel(media) {
    return media?.media_product_type === 'REELS'
        || media?.media_type === 'REELS'
        || media?.media_type === 'VIDEO';
}

function parseFollowsAndUnfollows(insight) {
    const breakdown = insight?.total_value?.breakdowns?.[0];
    if (breakdown?.results?.length) {
        const keys = breakdown.dimension_keys || [];
        const dimIndex = Math.max(keys.findIndex((key) => /follow/i.test(key)), 0);
        let follows = 0;
        let unfollows = 0;
        let found = false;
        for (const row of breakdown.results) {
            const label = String(row.dimension_values?.[dimIndex] ?? '').toUpperCase();
            const value = coerceInsightNumber(row.value) || 0;
            if (label.includes('UNFOLLOW')) {
                unfollows += value;
                found = true;
            } else if (label.includes('FOLLOW')) {
                follows += value;
                found = true;
            }
        }
        if (found) return { follows, unfollows };
    }

    const total = readInsightNumber(insight);
    if (total == null) return { follows: null, unfollows: null };
    return { follows: total, unfollows: null };
}

function getNonFollowerReachPct(accountInsights) {
    const metric = (accountInsights || []).find((item) => {
        const keys = item?.total_value?.breakdowns?.[0]?.dimension_keys || [];
        return keys.includes('follow_type') || keys.includes('follower_type');
    });

    const breakdown = metric?.total_value?.breakdowns?.[0];
    if (!breakdown?.results?.length) return null;

    const keys = breakdown.dimension_keys || [];
    const dimIndex = keys.includes('follow_type')
        ? keys.indexOf('follow_type')
        : Math.max(keys.indexOf('follower_type'), 0);

    let nonFollower = 0;
    let total = 0;
    for (const row of breakdown.results) {
        const value = Number(row.value) || 0;
        total += value;
        const label = String(row.dimension_values?.[dimIndex] ?? '').toUpperCase();
        if (label === 'NON_FOLLOWER' || label === 'NONFOLLOWER') {
            nonFollower += value;
        }
    }

    if (total <= 0) return null;
    return (nonFollower / total) * 100;
}

function seriesByDate(accountInsights) {
    const byDate = {};
    for (const metric of accountInsights || []) {
        const name = metric?.name;
        const values = Array.isArray(metric?.values) ? metric.values : [];
        for (const row of values) {
            const key = dateKey(row.end_time || row.endTime);
            if (!key) continue;
            if (!byDate[key]) byDate[key] = { date: key };
            const value = coerceInsightNumber(row.value);
            if (name === 'follows_and_unfollows') {
                const parsed = parseFollowsAndUnfollows({
                    ...metric,
                    values: [row],
                    total_value: metric.total_value,
                });
                if (parsed.follows != null) byDate[key].follows = parsed.follows;
                if (parsed.unfollows != null) byDate[key].unfollows = parsed.unfollows;
            } else if (name) {
                byDate[key][name] = value;
            }
        }

        if (!values.length && metric?.total_value) {
            const key = dateKey(new Date());
            if (!byDate[key]) byDate[key] = { date: key };
            if (name === 'follows_and_unfollows') {
                const parsed = parseFollowsAndUnfollows(metric);
                if (parsed.follows != null) byDate[key].follows = parsed.follows;
                if (parsed.unfollows != null) byDate[key].unfollows = parsed.unfollows;
            } else if (name) {
                byDate[key][name] = readInsightNumber(metric);
            }
        }
    }
    return Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));
}

function sumSeriesMetric(rows, name) {
    return sumNullable((rows || []).map((row) => row?.[name]));
}

function changeLabel(current, previous, suffix = 'vs previous period') {
    if (previous == null || previous <= 0 || current == null) return null;
    const delta = ((current - previous) / previous) * 100;
    const abs = Math.abs(delta).toFixed(1);
    const arrow = delta >= 0 ? '↑' : '↓';
    return suffix ? `${arrow} ${abs}% ${suffix}` : `${arrow} ${abs}%`;
}

function growthRate(current, previous) {
    if (current == null || previous == null || previous === 0) return null;
    return ((current - previous) / previous) * 100;
}

module.exports = {
    coerceInsightNumber,
    readInsightNumber,
    getMediaInsights,
    hasInsight,
    getInsightValue,
    average,
    median,
    maxValue,
    stdev,
    sumNullable,
    rate,
    clampScore,
    weightedAverage,
    logisticScore,
    percentileRank,
    metricScore,
    blendOutliers,
    dateKey,
    isReel,
    parseFollowsAndUnfollows,
    getNonFollowerReachPct,
    seriesByDate,
    sumSeriesMetric,
    changeLabel,
    growthRate,
};
