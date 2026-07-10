const db = require("../models");
const social_accounts = db.models.social_accounts;
const {
    calculateInfluencerScore,
    calculateAdvStats,
    computeReelsStats,
    getMediaViews,
} = require("../utils/scoring");

const instagramService = require("../services/instagram.service");

exports.getConnectedAccounts = async (request, reply) => {
    try {
        const accounts = await social_accounts.findAll({
            where: { user_id: request.user.id },
        });

        reply.send({
            success: true,
            data: accounts,
        });
    } catch (error) {
        reply.status(500).send({ success: false, message: error.message });
    }
};

exports.getAccountDetail = async (request, reply) => {
    try {
        const { id } = request.params;
        const account = await social_accounts.findOne({
            where: { id, user_id: request.user.id },
        });

        if (!account)
            return reply
                .status(404)
                .send({ success: false, message: "Account not found" });

        reply.send({
            success: true,
            data: account,
        });
    } catch (error) {
        reply.status(500).send({ success: false, message: error.message });
    }
};

exports.connectAccount = async (request, reply) => {
    try {
        const { platform, username } = request.body;

        const account = await social_accounts.create({
            user_id: request.user.id,
            platform,
            username,
            status: "active",
            is_connected: true,
        });

        reply.status(201).send({
            success: true,
            message: `${platform} account connected successfully`,
            data: account,
        });
    } catch (error) {
        reply.status(500).send({ success: false, message: error.message });
    }
};

function getOAuthRedirectPath(returnTo) {
    return returnTo === "creator" ? "/creator/dashboard" : "/accounts";
}

function redirectToClient(reply, redirectPath, params = {}) {
    const clientUrl = (process.env.CLIENT_URL || 'https://app.melotap.com').replace(/\/$/, '');
    const query = new URLSearchParams(params).toString();
    const destination = `${clientUrl}${redirectPath}${query ? `?${query}` : ''}`;
    return reply.redirect(destination);
}

async function connectInstagramAccount(userId, code) {
    const { accessToken: shortLivedToken } =
        await instagramService.exchangeCodeForToken(code);

    const { accessToken, expiresIn } =
        await instagramService.exchangeForLongLivedToken(shortLivedToken);

    const tokenExpiry = expiresIn
        ? new Date(Date.now() + expiresIn * 1000)
        : null;

    const profile = await instagramService.getMe(accessToken);

    const accountData = {
        account_id: profile.id,
        username: profile.username,
        display_name: profile.name,
        followers_count: profile.followers_count || 0,
        following_count: profile.follows_count || 0,
        total_posts: profile.media_count || 0,
        engagement_rate: 0,
        access_token: accessToken,
        token_expiry: tokenExpiry,
        is_connected: true,
        status: "active",
        last_synced_at: new Date(),
    };

    const [account, created] = await social_accounts.findOrCreate({
        where: { user_id: userId, platform: "instagram" },
        defaults: accountData,
    });

    if (!created) {
        await account.update(accountData);
    }

    return account;
}

exports.connectInstagram = async (request, reply) => {
    try {
        const returnTo = request.query.returnTo || "accounts";
        const state = `${request.user.id}|${returnTo}`;
        const url = instagramService.getOAuthUrl(state);

        reply.send({
            url,
            redirect_uri: instagramService.getRedirectUri(),
            setup_hint:
                'Register redirect_uri in Meta Dashboard > Instagram > API setup with Instagram login > Business login settings > OAuth redirect URIs',
        });
    } catch (error) {
        reply.status(400).send({
            success: false,
            message: error.message,
        });
    }
};

exports.instagramCallback = async (request, reply) => {
    const { code, state, error: oauthError, error_description: errorDescription } = request.query;
    const [userId, returnTo = "accounts"] = (state || "").split("|");
    const redirectPath = getOAuthRedirectPath(returnTo);

    if (oauthError || !code) {
        return redirectToClient(reply, redirectPath, {
            error: oauthError || 'access_denied',
            error_description: errorDescription,
        });
    }

    try {
        await connectInstagramAccount(userId, code);
        return redirectToClient(reply, redirectPath, { success: 'connected' });
    } catch (error) {
        console.error("Instagram OAuth Error:", error.response?.data || error.message);
        return redirectToClient(reply, redirectPath, { error: 'oauth_failed' });
    }
};

exports.syncAccountData = async (request, reply) => {
    const { id } = request.params;
    try {
        const account = await social_accounts.findOne({
            where: { id, user_id: request.user.id },
        });

        if (!account)
            return reply
                .status(404)
                .send({ success: false, message: "Account not found" });

        let accessToken = account.access_token;
        let tokenExpiry = account.token_expiry;

        if (tokenExpiry && new Date(tokenExpiry) <= new Date()) {
            const refreshed = await instagramService.refreshLongLivedToken(accessToken);
            accessToken = refreshed.accessToken;
            tokenExpiry = refreshed.expiresIn
                ? new Date(Date.now() + refreshed.expiresIn * 1000)
                : null;
            await account.update({
                access_token: accessToken,
                token_expiry: tokenExpiry,
            });
        }

        const profile = await instagramService.getProfile(
            account.account_id,
            accessToken,
        );

        const media = await instagramService.getMedia(
            account.account_id,
            accessToken,
        );

        const reelsStats = computeReelsStats(media);
        const topPosts = [...media]
            .sort((a, b) => getMediaViews(b) - getMediaViews(a))
            .slice(0, 8)
            .map((m) => ({
                id: m.id,
                media_url: m.media_url,
                permalink: m.permalink,
                like_count: m.like_count,
                comments_count: m.comments_count,
                timestamp: m.timestamp,
                views: getMediaViews(m),
            }));

        const avgEngagement =
            media.length > 0
                ? media.reduce(
                    (acc, m) => acc + (m.like_count + (m.comments_count || 0)),
                    0,
                ) / media.length
                : 0;
        const engagementRate =
            profile.followers_count > 0
                ? (avgEngagement / profile.followers_count) * 100
                : 0;

        await account.update({
            display_name: profile.name,
            followers_count: profile.followers_count,
            following_count: profile.follows_count,
            total_posts: profile.media_count,
            engagement_rate: parseFloat(engagementRate.toFixed(2)),
            last_synced_at: new Date(),
        });

        reply.send({
            success: true,
            data: {
                profile,
                reels_stats: reelsStats,
                top_posts: topPosts,
                engagement_rate: account.engagement_rate,
                influencer_score: calculateInfluencerScore(
                    profile.followers_count,
                    account.engagement_rate,
                ),
                adv_stats: calculateAdvStats(media),
            },
        });
    } catch (error) {
        console.error("Sync Account Data Error:", error.response?.data || error.message);
        reply.status(500).send({ success: false, message: error.message });
    }
};
