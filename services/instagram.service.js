const axios = require('axios');

const MEDIA_FIELDS = 'id,caption,media_type,media_product_type,media_url,permalink,timestamp,like_count,comments_count';
const API_VERSION = 'v21.0';

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
    if (!uri) return uri;

    let normalized = uri.trim();
    if (process.env.INSTAGRAM_REDIRECT_TRAILING_SLASH !== 'false' && !normalized.endsWith('/')) {
        normalized += '/';
    }
    return normalized;
}

function getInstagramConfig() {
    const appId = process.env.INSTAGRAM_APP_ID;
    const appSecret = process.env.INSTAGRAM_APP_SECRET;
    const redirectUri = process.env.INSTAGRAM_REDIRECT_URI;

    if (!appId || !appSecret || !redirectUri) {
        throw new Error(
            'Instagram OAuth is not configured. Set INSTAGRAM_APP_ID, INSTAGRAM_APP_SECRET, and INSTAGRAM_REDIRECT_URI.',
        );
    }

    return { appId, appSecret, redirectUri };
}

function parseTokenResponse(data) {
    if (data?.data?.[0]) {
        return {
            accessToken: data.data[0].access_token,
            userId: data.data[0].user_id,
        };
    }
    return {
        accessToken: data.access_token,
        userId: data.user_id,
    };
}

class InstagramService {
    constructor() {
        this.baseUrl = `https://graph.instagram.com/${API_VERSION}`;
    }

    getRedirectUri() {
        return getInstagramConfig().redirectUri;
    }

    getOAuthUrl(state) {
        const embedUrl = process.env.INSTAGRAM_EMBED_URL?.trim();
        if (embedUrl) {
            const url = new URL(embedUrl);
            url.searchParams.set('state', state);
            return url.toString();
        }

        const { appId, redirectUri } = getInstagramConfig();
        const scope = 'instagram_business_basic,instagram_business_manage_insights';
        const params = [
            `client_id=${appId}`,
            `redirect_uri=${encodeURIComponent(redirectUri)}`,
            `scope=${scope}`,
            `response_type=code`,
            `state=${encodeURIComponent(state)}`,
            `enable_fb_login=false`,
        ].join('&');

        return `https://www.instagram.com/oauth/authorize?${params}`;
    }

    async exchangeCodeForToken(code) {
        const { appId, appSecret, redirectUri } = getInstagramConfig();
        const cleanCode = String(code).split('#')[0].trim();

        const form = new FormData();
        form.append('client_id', appId);
        form.append('client_secret', appSecret);
        form.append('grant_type', 'authorization_code');
        form.append('redirect_uri', redirectUri);
        form.append('code', cleanCode);

        const res = await axios.post('https://api.instagram.com/oauth/access_token', form);
        return parseTokenResponse(res.data);
    }

    async exchangeForLongLivedToken(shortLivedToken) {
        const { appSecret } = getInstagramConfig();
        const res = await axios.get('https://graph.instagram.com/access_token', {
            params: {
                grant_type: 'ig_exchange_token',
                client_secret: appSecret,
                access_token: shortLivedToken,
            },
        });
        return {
            accessToken: res.data.access_token,
            expiresIn: res.data.expires_in,
        };
    }

    async refreshLongLivedToken(accessToken) {
        const res = await axios.get('https://graph.instagram.com/refresh_access_token', {
            params: {
                grant_type: 'ig_refresh_token',
                access_token: accessToken,
            },
        });
        return {
            accessToken: res.data.access_token,
            expiresIn: res.data.expires_in,
        };
    }

    async getMe(accessToken) {
        const res = await axios.get(`${this.baseUrl}/me`, {
            params: {
                fields: 'user_id,username,name,biography,profile_picture_url,followers_count,follows_count,media_count',
                access_token: accessToken,
            },
        });
        const profile = res.data;
        return {
            ...profile,
            id: profile.user_id || profile.id,
        };
    }

    async getProfile(igAccountId, accessToken) {
        if (!igAccountId || igAccountId === 'me') {
            return this.getMe(accessToken);
        }

        const res = await axios.get(`${this.baseUrl}/${igAccountId}`, {
            params: {
                fields: 'user_id,username,name,biography,profile_picture_url,followers_count,follows_count,media_count',
                access_token: accessToken,
            },
        });
        const profile = res.data;
        return {
            ...profile,
            id: profile.user_id || profile.id,
        };
    }

    async getAccountInsights(igAccountId, accessToken) {
        try {
            const res = await axios.get(`${this.baseUrl}/${igAccountId}/insights`, {
                params: {
                    metric: 'reach',
                    period: 'day',
                    access_token: accessToken,
                },
            });
            return res.data.data;
        } catch (error) {
            console.warn('Could not fetch account insights:', error.response?.data || error.message);
            return [];
        }
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
