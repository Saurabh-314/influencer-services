const axios = require('axios');

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
                access_token: accessToken
            }
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
                    access_token: accessToken
                }
            });
            return res.data.data;
        } catch (error) {
            console.warn('Could not fetch account insights:', error.response?.data || error.message);
            return [];
        }
    }

    /**
     * Get Media and their insights
     */
    async getMedia(igAccountId, accessToken, limit = 10) {
        const res = await axios.get(`${this.baseUrl}/${igAccountId}/media`, {
            params: {
                fields: 'id,caption,media_type,media_url,permalink,timestamp,like_count,comments_count',
                limit,
                access_token: accessToken
            }
        });

        const mediaList = res.data.data;

        // Fetch insights for each media item (asynchronous)
        const mediaWithInsights = await Promise.all(mediaList.map(async (item) => {
            try {
                let metrics = 'engagement,impressions,reach';
                if (item.media_type === 'VIDEO' || item.media_type === 'REELS') {
                    metrics += ',video_views';
                }

                const insightRes = await axios.get(`${this.baseUrl}/${item.id}/insights`, {
                    params: {
                        metric: metrics,
                        access_token: accessToken
                    }
                });
                return { ...item, insights: insightRes.data.data };
            } catch (err) {
                return { ...item, insights: [] };
            }
        }));

        return mediaWithInsights;
    }
}

module.exports = new InstagramService();
