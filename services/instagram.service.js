const axios = require('axios');

const MEDIA_FIELDS = 'id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count';
const API_VERSION = 'v21.0';
const { MEDIA_LOOKBACK_DAYS, ACCOUNT_INSIGHT_DAYS } = require('../utils/scoringConfig');

const ACCOUNT_INSIGHT_METRICS = [
    'reach',
    'views',
    'profile_views',
    'total_interactions',
    'likes',
    'comments',
    'shares',
    'saves',
    'follower_count',
    'follows_and_unfollows',
];

const REEL_INSIGHT_METRIC_GROUPS = [
    'views,reach,saved,shares,likes,comments,total_interactions,ig_reels_avg_watch_time,ig_reels_video_view_total_time,clips_replays_count,reels_skip_rate',
    'views,reach,saved,shares,likes,comments,total_interactions,ig_reels_avg_watch_time,ig_reels_video_view_total_time',
    'views,reach,saved,shares,likes,comments,total_interactions',
    'views,reach,saved,shares',
    'views,reach',
    'views',
];

// Instagram API with Instagram Login (Business Login for Instagram).
// Docs: https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/business-login/
const OAUTH_AUTHORIZE_URL = 'https://www.instagram.com/oauth/authorize';
const OAUTH_ACCESS_TOKEN_URL = 'https://api.instagram.com/oauth/access_token';
const GRAPH_ACCESS_TOKEN_URL = 'https://graph.instagram.com/access_token';
const GRAPH_REFRESH_TOKEN_URL = 'https://graph.instagram.com/refresh_access_token';
const OAUTH_SCOPES = 'instagram_business_basic,instagram_business_manage_insights';

function getOAuthScopes() {
    return process.env.INSTAGRAM_OAUTH_SCOPES?.trim() || OAUTH_SCOPES;
}

function normalizeMediaInsights(insights) {
    if (Array.isArray(insights)) return insights;
    if (Array.isArray(insights?.data)) return insights.data;
    return [];
}

function classifyInstagramOAuthError(metaError, context = {}) {
    if (metaError.code === 100 && metaError.type === 'IGApiException') {
        return {
            error: 'instagram_graph_access_denied',
            error_description:
                'Instagram login succeeded, but Meta rejected Graph API access for this account. '
                + 'Your app must be Live with Advanced Access approved for every requested permission '
                + '(instagram_business_basic, instagram_business_manage_insights), business verification '
                + 'must be complete, and the Instagram account must be a Professional account.',
            ...context,
        };
    }

    return {
        error: 'oauth_failed',
        error_description: metaError.message || 'Instagram OAuth failed',
        ...context,
    };
}

function sanitizeMetaError(error) {
    const data = error?.response?.data;
    if (!data) {
        return { message: error?.message || 'Unknown error' };
    }
    if (data.error) {
        return {
            message: data.error.message,
            type: data.error.type,
            code: data.error.code,
            fbtrace_id: data.error.fbtrace_id,
        };
    }
    return {
        message: data.error_message || data.message || JSON.stringify(data),
        type: data.error_type,
        code: data.code,
    };
}

function logOAuthStep(step, details = {}) {
    console.log('[Instagram OAuth]', step, details);
}

function describeToken(token) {
    if (!token) {
        return { present: false, length: 0 };
    }
    return { present: true, length: String(token).length };
}

async function mapWithConcurrency(items, fn, concurrency = 5) {
    const results = [];
    for (let i = 0; i < items.length; i += concurrency) {
        const chunk = items.slice(i, i + concurrency);
        const chunkResults = await Promise.all(chunk.map(fn));
        results.push(...chunkResults);
    }
    return results;
}

function normalizeRedirectUri(uri) {
    // Keep exact URI from env/embed so it matches Meta Dashboard character-for-character.
    return uri ? uri.trim() : uri;
}

function getRedirectUriFromEmbedUrl(embedUrl) {
    if (!embedUrl) return null;
    try {
        return new URL(embedUrl).searchParams.get('redirect_uri');
    } catch {
        return null;
    }
}

function getInstagramConfig() {
    const appId = process.env.INSTAGRAM_APP_ID;
    const appSecret = process.env.INSTAGRAM_APP_SECRET;
    const embedUrl = process.env.INSTAGRAM_EMBED_URL?.trim();

    // Prefer redirect_uri from Embed URL so authorize + token exchange always match.
    const redirectUri = normalizeRedirectUri(
        getRedirectUriFromEmbedUrl(embedUrl) || process.env.INSTAGRAM_REDIRECT_URI,
    );

    if (!appId || !appSecret || !redirectUri) {
        throw new Error(
            'Instagram OAuth is not configured. Set INSTAGRAM_APP_ID, INSTAGRAM_APP_SECRET, and INSTAGRAM_REDIRECT_URI.',
        );
    }

    return { appId, appSecret, redirectUri, embedUrl };
}

function parseTokenResponse(data) {
    if (data?.error || data?.error_message) {
        throw new Error(
            data.error?.message || data.error_message || 'Instagram token exchange failed',
        );
    }

    const entry = Array.isArray(data?.data) ? data.data[0] : data;
    const accessToken = entry?.access_token;
    const userId = entry?.user_id ?? entry?.id;

    if (!accessToken) {
        throw new Error('Instagram token exchange returned no access token');
    }

    return {
        accessToken,
        userId: userId != null ? String(userId) : undefined,
        permissions: entry?.permissions,
    };
}

class InstagramService {
    constructor() {
        this.baseUrl = `https://graph.instagram.com/${API_VERSION}`;
    }

    getRedirectUri() {
        return getInstagramConfig().redirectUri;
    }

    getOAuthScopes() {
        return getOAuthScopes();
    }

    getOAuthUrl(state) {
        const { embedUrl, appId, redirectUri } = getInstagramConfig();
        const scope = getOAuthScopes();

        if (embedUrl) {
            const url = new URL(embedUrl);
            url.searchParams.set('state', state);
            // Keep Meta's redirect_uri/client_id from the Embed URL, but restrict scopes
            // to permissions this app actually needs and has Advanced Access for.
            url.searchParams.set('scope', scope);
            return url.toString();
        }

        const params = new URLSearchParams({
            client_id: appId,
            redirect_uri: redirectUri,
            scope,
            response_type: 'code',
            state,
            enable_fb_login: 'false',
        });

        return `${OAUTH_AUTHORIZE_URL}?${params.toString()}`;
    }

    async exchangeCodeForToken(code) {
        const { appId, appSecret, redirectUri } = getInstagramConfig();
        const cleanCode = String(code).split('#')[0].trim();

        logOAuthStep('exchangeCodeForToken:start', {
            endpoint: OAUTH_ACCESS_TOKEN_URL,
            method: 'POST',
            contentType: 'application/x-www-form-urlencoded',
            redirectUri,
            codePresent: Boolean(cleanCode),
            codeLength: cleanCode.length,
        });

        const body = new URLSearchParams({
            client_id: appId,
            client_secret: appSecret,
            grant_type: 'authorization_code',
            redirect_uri: redirectUri,
            code: cleanCode,
        });

        const res = await axios.post(OAUTH_ACCESS_TOKEN_URL, body.toString(), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });

        const parsed = parseTokenResponse(res.data);

        logOAuthStep('exchangeCodeForToken:success', {
            httpStatus: res.status,
            token: describeToken(parsed.accessToken),
            userId: parsed.userId,
            permissions: parsed.permissions,
        });

        return parsed;
    }

    async exchangeForLongLivedToken(shortLivedToken) {
        if (!shortLivedToken) {
            throw new Error('Missing short-lived Instagram token for long-lived exchange');
        }

        const { appSecret } = getInstagramConfig();

        logOAuthStep('exchangeForLongLivedToken:start', {
            endpoint: GRAPH_ACCESS_TOKEN_URL,
            method: 'GET',
            token: describeToken(shortLivedToken),
        });

        const res = await axios.get(GRAPH_ACCESS_TOKEN_URL, {
            params: {
                grant_type: 'ig_exchange_token',
                client_secret: appSecret,
                access_token: shortLivedToken,
            },
        });

        logOAuthStep('exchangeForLongLivedToken:success', {
            httpStatus: res.status,
            token: describeToken(res.data.access_token),
            expiresIn: res.data.expires_in,
        });

        return {
            accessToken: res.data.access_token,
            expiresIn: res.data.expires_in,
        };
    }

    async refreshLongLivedToken(accessToken) {
        logOAuthStep('refreshLongLivedToken:start', {
            endpoint: GRAPH_REFRESH_TOKEN_URL,
            method: 'GET',
            token: describeToken(accessToken),
        });

        const res = await axios.get(GRAPH_REFRESH_TOKEN_URL, {
            params: {
                grant_type: 'ig_refresh_token',
                access_token: accessToken,
            },
        });

        logOAuthStep('refreshLongLivedToken:success', {
            httpStatus: res.status,
            token: describeToken(res.data.access_token),
            expiresIn: res.data.expires_in,
        });

        return {
            accessToken: res.data.access_token,
            expiresIn: res.data.expires_in,
        };
    }

    async getMe(accessToken) {
        logOAuthStep('getMe:start', {
            endpoint: `${this.baseUrl}/me`,
            method: 'GET',
            token: describeToken(accessToken),
        });

        const res = await axios.get(`${this.baseUrl}/me`, {
            params: {
                fields: 'user_id,id,username,name,biography,profile_picture_url,followers_count,follows_count,media_count,account_type',
                access_token: accessToken,
            },
        });
        const profile = res.data;
        const igAccountId = profile.user_id || profile.id;

        logOAuthStep('getMe:success', {
            httpStatus: res.status,
            igAccountId,
            username: profile.username,
            accountType: profile.account_type,
        });

        return {
            ...profile,
            id: igAccountId,
        };
    }

    async getProfile(igAccountId, accessToken) {
        if (!igAccountId || igAccountId === 'me') {
            return this.getMe(accessToken);
        }

        try {
            const res = await axios.get(`${this.baseUrl}/${igAccountId}`, {
                params: {
                    fields: 'user_id,id,username,name,biography,profile_picture_url,followers_count,follows_count,media_count,account_type',
                    access_token: accessToken,
                },
            });
            const profile = res.data;
            return {
                ...profile,
                id: profile.user_id || profile.id,
            };
        } catch (error) {
            const metaError = sanitizeMetaError(error);
            // OAuth user_id is app-scoped and often cannot be used as a Graph node ID.
            // Fall back to /me, which returns the Instagram professional account ID.
            if (metaError.code === 100) {
                logOAuthStep('getProfile:fallbackToMe', {
                    igAccountId,
                    reason: metaError.message,
                });
                return this.getMe(accessToken);
            }
            throw error;
        }
    }

    async fetchAccountInsights(igAccountId, accessToken, params) {
        const res = await axios.get(`${this.baseUrl}/${igAccountId}/insights`, {
            params: {
                ...params,
                access_token: accessToken,
            },
        });
        return res.data.data || [];
    }

    async getReachFollowBreakdown(igAccountId, accessToken, since, until) {
        const attempts = [
            { metric: 'reach', breakdown: 'follow_type' },
            { metric: 'views', breakdown: 'follower_type' },
        ];

        for (const attempt of attempts) {
            try {
                const data = await this.fetchAccountInsights(igAccountId, accessToken, {
                    metric: attempt.metric,
                    period: 'day',
                    metric_type: 'total_value',
                    breakdown: attempt.breakdown,
                    since,
                    until,
                });
                const metric = data.find((item) => item?.total_value?.breakdowns?.length);
                if (metric) return metric;
            } catch (error) {
                console.warn(
                    `Could not fetch ${attempt.metric} ${attempt.breakdown} breakdown:`,
                    error.response?.data || error.message,
                );
            }
        }

        return null;
    }

    isUnsupportedMetricError(error) {
        const meta = sanitizeMetaError(error);
        const message = String(meta.message || '').toLowerCase();
        return meta.code === 100
            || message.includes('invalid metric')
            || message.includes('does not support')
            || message.includes('unsupported')
            || message.includes('not available')
            || message.includes('nonexisting field')
            || message.includes('reduce the amount of data')
            || message.includes('must be one of the following');
    }

    isAuthOrRateLimitError(error) {
        const meta = sanitizeMetaError(error);
        return [4, 17, 32, 190, 803, 80004].includes(meta.code);
    }

    async getAccountInsights(igAccountId, accessToken) {
        const until = Math.floor(Date.now() / 1000);
        const since = until - ACCOUNT_INSIGHT_DAYS * 24 * 60 * 60;
        const collected = [];
        const errors = [];
        const missing_metrics = [];

        try {
            const batch = await this.fetchAccountInsights(igAccountId, accessToken, {
                metric: ACCOUNT_INSIGHT_METRICS.join(','),
                period: 'day',
                since,
                until,
            });
            collected.push(...batch);
        } catch (error) {
            const meta = sanitizeMetaError(error);
            errors.push({ stage: 'account_insights_batch', metrics: ACCOUNT_INSIGHT_METRICS.join(','), ...meta });
            for (const metric of ACCOUNT_INSIGHT_METRICS) {
                try {
                    const data = await this.fetchAccountInsights(igAccountId, accessToken, {
                        metric,
                        period: 'day',
                        since,
                        until,
                    });
                    collected.push(...data);
                } catch (metricError) {
                    const metricMeta = sanitizeMetaError(metricError);
                    missing_metrics.push(metric);
                    errors.push({ stage: 'account_insights_metric', metric, ...metricMeta });
                    if (!this.isUnsupportedMetricError(metricError)) {
                        console.warn(
                            `Could not fetch account insights (${metric}):`,
                            metricError.response?.data || metricError.message,
                        );
                    }
                }
            }
        }

        const returned = new Set(collected.map((item) => item?.name).filter(Boolean));
        for (const metric of ACCOUNT_INSIGHT_METRICS) {
            if (!returned.has(metric) && !missing_metrics.includes(metric)) {
                missing_metrics.push(metric);
            }
        }

        const followBreakdown = await this.getReachFollowBreakdown(igAccountId, accessToken, since, until);
        if (followBreakdown) collected.push(followBreakdown);

        return {
            data: collected,
            error: collected.length === 0 && errors.length > 0,
            errors,
            missing_metrics,
            returned_metrics: [...returned],
            since,
            until,
        };
    }

    isOlderThanLookback(item) {
        if (!item?.timestamp) return false;
        return Date.now() - new Date(item.timestamp).getTime() > MEDIA_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
    }

    withinLookback(item) {
        return !this.isOlderThanLookback(item);
    }

    isVideoOrReel(item) {
        const product = String(item?.media_product_type || '').toUpperCase();
        const type = String(item?.media_type || '').toUpperCase();
        return product === 'REELS' || type === 'REELS' || type === 'VIDEO';
    }

    summarizeMedia(items) {
        const types = {};
        for (const item of items || []) {
            const key = item.media_product_type || item.media_type || 'UNKNOWN';
            types[key] = (types[key] || 0) + 1;
        }
        return {
            count: (items || []).length,
            types,
            reels_or_video: (items || []).filter((item) => this.isVideoOrReel(item)).length,
        };
    }

    async paginateMedia(igAccountId, accessToken, extraParams = {}, errors = []) {
        let url = `${this.baseUrl}/${igAccountId}/media`;
        const items = [];
        let pages = 0;
        const maxPages = 10;

        while (url && pages < maxPages) {
            const isFirstPage = pages === 0;
            try {
                const res = await axios.get(url, {
                    params: isFirstPage
                        ? {
                            fields: MEDIA_FIELDS,
                            limit: 100,
                            access_token: accessToken,
                            ...extraParams,
                        }
                        : {},
                });
                const pageItems = res.data.data || [];
                items.push(...pageItems.filter((item) => this.withinLookback(item)));
                const reachedLookback = pageItems.some((item) => this.isOlderThanLookback(item));
                url = reachedLookback ? null : (res.data.paging?.next || null);
                pages += 1;
                if (!pageItems.length) break;
            } catch (err) {
                errors.push({
                    stage: 'paginate_media',
                    node: igAccountId,
                    extra: extraParams,
                    ...sanitizeMetaError(err),
                });
                break;
            }
        }

        return items;
    }

    async getAllMedia(igAccountId, accessToken, errors = []) {
        const attempts = [
            { node: igAccountId, extra: {} },
            { node: igAccountId, extra: { media_type: 'REELS' } },
            { node: 'me', extra: {} },
        ];
        let best = [];

        for (const attempt of attempts) {
            const items = await this.paginateMedia(attempt.node, accessToken, attempt.extra, errors);
            if (items.length > best.length) best = items;
            if (best.length) break;
        }

        return best;
    }

    async getAllReels(igAccountId, accessToken) {
        const media = await this.getAllMedia(igAccountId, accessToken);
        return media.filter((item) => this.isVideoOrReel(item));
    }

    async getReelsWithInsights(igAccountId, accessToken, metrics = REEL_INSIGHT_METRIC_GROUPS[3]) {
        const reels = await this.getAllReels(igAccountId, accessToken);
        return reels.map((item) => ({ ...item, insights: normalizeMediaInsights(item.insights) }));
    }

    async getReelInsights(mediaId, accessToken) {
        const errors = [];
        for (const metric of REEL_INSIGHT_METRIC_GROUPS) {
            try {
                const insightRes = await axios.get(`${this.baseUrl}/${mediaId}/insights`, {
                    params: {
                        metric,
                        access_token: accessToken,
                    },
                });
                return { data: insightRes.data.data || [], error: false, errors, metrics_used: metric };
            } catch (err) {
                const meta = sanitizeMetaError(err);
                errors.push({ stage: 'reel_insights', media_id: mediaId, metrics: metric, ...meta });
                console.warn(
                    `Insights error for ${mediaId} (${metric}):`,
                    err.response?.data || err.message,
                );
            }
        }

        return { data: [], error: false, errors };
    }

    async attachReelInsights(reels, accessToken, concurrency = 5) {
        const errors = [];
        const items = await mapWithConcurrency(reels, async (item) => {
            const result = await this.getReelInsights(item.id, accessToken);
            if (result.errors?.length) errors.push(...result.errors.slice(0, 3));
            return { ...item, insights: result.data };
        }, concurrency);
        return { media: items, error: false, errors };
    }

    async getMedia(igAccountId, accessToken) {
        const result = await this.getMediaWithStatus(igAccountId, accessToken);
        if (result.error && !result.media.length) {
            throw new Error('Failed to fetch Instagram media insights');
        }
        return result.media;
    }

    async getMediaWithStatus(igAccountId, accessToken) {
        const errors = [];
        const media = await this.getAllMedia(igAccountId, accessToken, errors);
        const summary = this.summarizeMedia(media);
        const reels = media.filter((item) => this.isVideoOrReel(item));
        const other = media.filter((item) => !this.isVideoOrReel(item));

        if (!reels.length) {
            return {
                media,
                error: false,
                errors,
                metrics_used: 'all_media_metadata',
                summary,
            };
        }

        const attached = await this.attachReelInsights(reels, accessToken);
        return {
            media: [...attached.media, ...other],
            error: false,
            errors: [...errors, ...(attached.errors || [])],
            metrics_used: 'metadata_then_reel_insights',
            summary: this.summarizeMedia([...attached.media, ...other]),
        };
    }
}

module.exports = new InstagramService();
module.exports.sanitizeMetaError = sanitizeMetaError;
module.exports.logOAuthStep = logOAuthStep;
module.exports.classifyInstagramOAuthError = classifyInstagramOAuthError;
module.exports.getOAuthScopes = getOAuthScopes;
