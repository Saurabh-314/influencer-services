const axios = require('axios');

const MEDIA_FIELDS = 'id,caption,media_type,media_product_type,media_url,permalink,timestamp,like_count,comments_count';

async function mapWithConcurrency(items, fn, concurrency = 5) {
    const results = [];
    for (let i = 0; i < items.length; i += concurrency) {
        const chunk = items.slice(i, i + concurrency);
        const chunkResults = await Promise.all(chunk.map(fn));
        results.push(...chunkResults);
    }
    return results;
}

/**
 * Service to handle Instagram Graph API interactions
 */
class InstagramService {
    constructor() {
        this.baseUrl = 'https://graph.facebook.com/v18.0';
    }

    /**
     * Get Instagram Business Account Profile Data
     */
    async getProfile(igAccountId, accessToken) {
        const res = await axios.get(`${this.baseUrl}/${igAccountId}`, {
            params: {
                fields: 'id,username,name,biography,profile_picture_url,followers_count,follows_count,media_count',
                access_token: accessToken,
            },
        });
        return res.data;
    }

    /**
     * Get Instagram Business Account Insights
     */
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

    /**
     * Paginate through all media and return reels only.
     */
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

    /**
     * Fetch view insights for a single reel.
     */
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

    /**
     * Attach view insights to each reel (batched to reduce rate-limit risk).
     */
    async attachReelInsights(reels, accessToken, concurrency = 5) {
        return mapWithConcurrency(reels, async (item) => {
            const insights = await this.getReelInsights(item.id, accessToken);
            return { ...item, insights };
        }, concurrency);
    }

    /**
     * Get all reels with view insights.
     */
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
