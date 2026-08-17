const axios = require('axios');

const MEDIA_FIELDS = 'id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count';
const API_VERSION = 'v21.0';

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

    async getAccountInsights(igAccountId, accessToken) {
        const until = Math.floor(Date.now() / 1000);
        const since = until - 30 * 24 * 60 * 60;
        const attempts = ['reach,follower_count', 'reach'];

        for (const metric of attempts) {
            try {
                const res = await axios.get(`${this.baseUrl}/${igAccountId}/insights`, {
                    params: {
                        metric,
                        period: 'day',
                        since,
                        until,
                        access_token: accessToken,
                    },
                });
                return res.data.data || [];
            } catch (error) {
                console.warn(
                    `Could not fetch account insights (${metric}):`,
                    error.response?.data || error.message,
                );
            }
        }

        return [];
    }

    async getAllReels(igAccountId, accessToken) {
        let url = `${this.baseUrl}/${igAccountId}/media`;
        const reels = [];

        while (url) {
            const isFirstPage = url === `${this.baseUrl}/${igAccountId}/media`;
            const res = await axios.get(url, {
                params: isFirstPage
                    ? {
                        fields: MEDIA_FIELDS,
                        media_type: 'VIDEO',
                        limit: 100,
                        access_token: accessToken,
                    }
                    : {},
            });


            const pageReels = (res.data.data || []).filter(
                (item) => item.media_product_type === 'REELS',
            );
            reels.push(...pageReels);

            url = res.data.paging?.next || null;
        }

        return reels;
    }

    async getReelsWithInsights(igAccountId, accessToken, metrics = 'views,reach,saved,shares') {
        let url = `${this.baseUrl}/${igAccountId}/media`;
        const reels = [];

        while (url) {
            const isFirstPage = url === `${this.baseUrl}/${igAccountId}/media`;
            const res = await axios.get(url, {
                params: isFirstPage
                    ? {
                        // Field expansion pulls insights inline, avoiding an
                        // extra insights request per reel (N+1).
                        fields: `${MEDIA_FIELDS},insights.metric(${metrics})`,
                        limit: 100,
                        access_token: accessToken,
                    }
                    : {},
            });

            const pageReels = (res.data.data || []).filter(
                (item) => item.media_product_type === 'REELS',
            );
            console.log('pageReels', pageReels);
            reels.push(...pageReels);

            url = res.data.paging?.next || null;
        }

        return reels;
    }

    async getReelInsights(mediaId, accessToken) {
        try {
            const insightRes = await axios.get(`${this.baseUrl}/${mediaId}/insights`, {
                params: {
                    metric: 'views',
                    access_token: accessToken,
                },
            });
            return insightRes.data.data || [];
        } catch (err) {
            console.error(
                `Insights error for ${mediaId}:`,
                err.response?.data || err.message,
            );
            return [];
        }
    }

    async attachReelInsights(reels, accessToken, concurrency = 5) {
        return mapWithConcurrency(reels, async (item) => {
            const insights = await this.getReelInsights(item.id, accessToken);
            return { ...item, insights };
        }, concurrency);
    }

    async getMedia(igAccountId, accessToken) {
        const metricAttempts = ['views,reach,saved,shares', 'views'];

        for (const metrics of metricAttempts) {
            try {
                return await this.getReelsWithInsights(igAccountId, accessToken, metrics);
            } catch (err) {
                console.warn(
                    `getMedia with metrics ${metrics} failed:`,
                    err.response?.data || err.message,
                );
            }
        }

        try {
            const reels = await this.getAllReels(igAccountId, accessToken);
            if (!reels.length) return [];
            return this.attachReelInsights(reels, accessToken);
        } catch (err) {
            console.error(err.response?.data || err.message);
            throw err;
        }
    }
}

module.exports = new InstagramService();
module.exports.sanitizeMetaError = sanitizeMetaError;
module.exports.logOAuthStep = logOAuthStep;
module.exports.classifyInstagramOAuthError = classifyInstagramOAuthError;
module.exports.getOAuthScopes = getOAuthScopes;
