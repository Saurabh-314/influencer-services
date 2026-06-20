const axios = require('axios');
const { SocialAccount } = require('../models');
const { calculateInfluencerScore, calculateAdvStats } = require('../utils/scoring');

const instagramService = require('../services/instagram.service');

exports.getConnectedAccounts = async (request, reply) => {


    try {
        const accounts = await SocialAccount.findAll({
            where: { user_id: request.user.id }
        });

        reply.send({
            success: true,
            data: accounts
        });
    } catch (error) {
        reply.status(500).send({ success: false, message: error.message });
    }
};

exports.getAccountDetail = async (request, reply) => {
    try {
        const { id } = request.params;
        const account = await SocialAccount.findOne({
            where: { id, user_id: request.user.id }
        });

        if (!account) return reply.status(404).send({ success: false, message: 'Account not found' });

        reply.send({
            success: true,
            data: account
        });
    } catch (error) {
        reply.status(500).send({ success: false, message: error.message });
    }
};


exports.connectAccount = async (request, reply) => {
    try {
        const { platform, username } = request.body;

        const account = await SocialAccount.create({
            user_id: request.user.id,
            platform,
            username,
            status: 'active',
            is_connected: true
        });

        reply.status(201).send({
            success: true,
            message: `${platform} account connected successfully`,
            data: account
        });
    } catch (error) {
        reply.status(500).send({ success: false, message: error.message });
    }
};

exports.connectInstagram = async (request, reply) => {
    const appId = process.env.FACEBOOK_APP_ID;
    const redirectUri = process.env.FACEBOOK_REDIRECT_URI;
    const scope = 'pages_show_list,instagram_basic,instagram_manage_insights,pages_read_engagement,public_profile';
    const state = request.user.id;

    const url = `https://www.facebook.com/v18.0/dialog/oauth?client_id=${appId}&redirect_uri=${redirectUri}&scope=${scope}&state=${state}&response_type=code`;

    reply.send({ url });
};

exports.instagramCallback = async (request, reply) => {
    const { code, state: userId } = request.query;

    if (!code) {
        return reply.redirect(`${process.env.CLIENT_URL}/accounts?error=access_denied`);
    }

    try {
        // 1. Exchange code for User Access Token
        const tokenResponse = await axios.get(`https://graph.facebook.com/v18.0/oauth/access_token`, {
            params: {
                client_id: process.env.FACEBOOK_APP_ID,
                client_secret: process.env.FACEBOOK_APP_SECRET,
                redirect_uri: process.env.FACEBOOK_REDIRECT_URI,
                code
            }
        });

        const userAccessToken = tokenResponse.data.access_token;

        // 2. Get list of Pages user manages
        const pagesRes = await axios.get(`https://graph.facebook.com/v18.0/me/accounts`, {
            params: { access_token: userAccessToken }
        });
        const pagesList = pagesRes.data.data;

        // 3. Find Page with linked Instagram Business Account
        let igAccountData = null;
        for (const page of pagesList) {
            const pageInfo = await axios.get(`https://graph.facebook.com/v18.0/${page.id}?fields=instagram_business_account&access_token=${page.access_token}`);
            if (pageInfo.data.instagram_business_account) {
                igAccountData = {
                    id: pageInfo.data.instagram_business_account.id,
                    page_token: page.access_token
                };
                break;
            }
        }

        if (!igAccountData) {
            return reply.redirect(`${process.env.CLIENT_URL}/accounts?error=no_ig_business_account_found`);
        }

        // 4. Get Instagram Profile details
        const profile = await instagramService.getProfile(igAccountData.id, igAccountData.page_token);

        // 5. Get recent media for initial engagement calculation
        const media = await instagramService.getMedia(igAccountData.id, igAccountData.page_token, 5);

        const avgEngagement = media.length > 0
            ? media.reduce((acc, m) => acc + (m.like_count + m.comments_count), 0) / media.length
            : 0;
        const engagementRate = profile.followers_count > 0 ? (avgEngagement / profile.followers_count) * 100 : 0;

        // 6. Save or update SocialAccount
        const [account, created] = await SocialAccount.findOrCreate({
            where: { user_id: userId, platform: 'instagram' },
            defaults: {
                account_id: profile.id,
                username: profile.username,
                display_name: profile.name,
                profile_image: profile.profile_picture_url,
                followers_count: profile.followers_count,
                following_count: profile.follows_count,
                total_posts: profile.media_count,
                engagement_rate: parseFloat(engagementRate.toFixed(2)),
                access_token: igAccountData.page_token,
                is_connected: true,
                status: 'active',
                last_synced_at: new Date()
            }
        });

        if (!created) {
            await account.update({
                account_id: profile.id,
                username: profile.username,
                display_name: profile.name,
                profile_image: profile.profile_picture_url,
                followers_count: profile.followers_count,
                following_count: profile.follows_count,
                total_posts: profile.media_count,
                engagement_rate: parseFloat(engagementRate.toFixed(2)),
                access_token: igAccountData.page_token,
                is_connected: true,
                status: 'active',
                last_synced_at: new Date()
            });
        }

        reply.redirect(`${process.env.CLIENT_URL}/accounts?success=connected`);
    } catch (error) {
        console.error('FB/IG OAuth Error:', error.response?.data || error.message);
        reply.redirect(`${process.env.CLIENT_URL}/accounts?error=oauth_failed`);
    }
};

exports.syncAccountData = async (request, reply) => {
    const { id } = request.params;
    try {
        const account = await SocialAccount.findOne({
            where: { id, user_id: request.user.id }
        });

        if (!account) return reply.status(404).send({ success: false, message: 'Account not found' });

        // Fetch detailed data
        const profile = await instagramService.getProfile(account.account_id, account.access_token);
        const insights = await instagramService.getAccountInsights(account.account_id, account.access_token);
        const media = await instagramService.getMedia(account.account_id, account.access_token);

        // Recalculate engagement rate
        const avgEngagement = media.length > 0
            ? media.reduce((acc, m) => acc + (m.like_count + (m.comments_count || 0)), 0) / media.length
            : 0;
        const engagementRate = profile.followers_count > 0 ? (avgEngagement / profile.followers_count) * 100 : 0;

        await account.update({
            display_name: profile.name,
            profile_image: profile.profile_picture_url,
            followers_count: profile.followers_count,
            following_count: profile.follows_count,
            total_posts: profile.media_count,
            engagement_rate: parseFloat(engagementRate.toFixed(2)),
            last_synced_at: new Date()
        });

        reply.send({
            success: true,
            data: {
                profile,
                insights,
                media,
                engagement_rate: account.engagement_rate,
                influencer_score: calculateInfluencerScore(profile.followers_count, account.engagement_rate),
                adv_stats: calculateAdvStats(media)
            }
        });

    } catch (error) {
        reply.status(500).send({ success: false, message: error.message });
    }
};






