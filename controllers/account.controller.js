const db = require("../models");
const social_accounts = db.models.social_accounts;
const {
    calculateInfluencerScore,
    calculateAdvStats,
    computeReelsStats,
    getMediaViews,
    getViewBucket,
} = require("../utils/scoring");

const instagramService = require("../services/instagram.service");
const { sanitizeMetaError, logOAuthStep, classifyInstagramOAuthError } = instagramService;

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

function describeTokenSafe(token) {
    return {
        present: Boolean(token),
        length: token ? String(token).length : 0,
    };
}

async function connectInstagramAccount(userId, code) {
    logOAuthStep('connectInstagramAccount:start', {
        userId,
        requestedScopes: instagramService.getOAuthScopes(),
    });

    const { accessToken: shortLivedToken, userId: igUserId, permissions } =
        await instagramService.exchangeCodeForToken(code);

    logOAuthStep('connectInstagramAccount:shortLivedTokenReady', {
        igUserId,
        grantedPermissions: permissions,
        token: describeTokenSafe(shortLivedToken),
    });

    const { accessToken, expiresIn } =
        await instagramService.exchangeForLongLivedToken(shortLivedToken);

    logOAuthStep('connectInstagramAccount:longLivedTokenReady', {
        igUserId,
        token: describeTokenSafe(accessToken),
        expiresIn,
    });

    const tokenExpiry = expiresIn
        ? new Date(Date.now() + expiresIn * 1000)
        : null;

    // Use /me — the OAuth user_id is app-scoped and cannot be used as a Graph node ID.
    const profile = await instagramService.getMe(accessToken);

    logOAuthStep('connectInstagramAccount:profileReady', {
        igAccountId: profile.id,
        oauthUserId: igUserId,
        username: profile.username,
        accountType: profile.account_type,
    });

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
        const redirectUri = instagramService.getRedirectUri();
        const url = instagramService.getOAuthUrl(state);

        reply.send({
            url,
            redirect_uri: redirectUri,
            client_id: process.env.INSTAGRAM_APP_ID,
            scopes: instagramService.getOAuthScopes(),
            setup_hint:
                'Use the Instagram App ID/Secret from Meta Dashboard > Instagram > API setup with Instagram login > Business login settings. '
                + 'Only request scopes with Advanced Access approved. Set INSTAGRAM_OAUTH_SCOPES if needed.',
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

    logOAuthStep('instagramCallback:received', {
        redirectPath,
        userId: userId || null,
        returnTo,
        codePresent: Boolean(code),
        codeLength: code ? String(code).split('#')[0].trim().length : 0,
        oauthError: oauthError || null,
        redirectUri: instagramService.getRedirectUri(),
    });

    if (oauthError || !code) {
        return redirectToClient(reply, redirectPath, {
            error: oauthError || 'access_denied',
            error_description: errorDescription,
        });
    }

    if (!userId) {
        logOAuthStep('instagramCallback:invalidState', { statePresent: Boolean(state) });
        return redirectToClient(reply, redirectPath, { error: 'invalid_state' });
    }

    try {
        await connectInstagramAccount(userId, code);
        return redirectToClient(reply, redirectPath, { success: 'connected' });
    } catch (error) {
        const metaError = sanitizeMetaError(error);
        const classified = classifyInstagramOAuthError(metaError, {
            requestedScopes: instagramService.getOAuthScopes(),
        });
        logOAuthStep('instagramCallback:failed', {
            ...metaError,
            classifiedError: classified.error,
            requestedScopes: instagramService.getOAuthScopes(),
        });
        return redirectToClient(reply, redirectPath, {
            error: classified.error,
            error_description: classified.error_description,
            error_code: metaError.code,
        });
    }
};

exports.disconnectAccount = async (request, reply) => {
    try {
        const { id } = request.params;
        const account = await social_accounts.findOne({
            where: { id, user_id: request.user.id },
        });

        if (!account)
            return reply
                .status(404)
                .send({ success: false, message: "Account not found" });

        await account.destroy();

        reply.send({
            success: true,
            message: "Account disconnected successfully",
        });
    } catch (error) {
        reply.status(500).send({ success: false, message: error.message });
    }
};

async function ensureValidAccessToken(account) {
    let accessToken = account.access_token;
    const tokenExpiry = account.token_expiry;

    if (tokenExpiry && new Date(tokenExpiry) <= new Date()) {
        const refreshed = await instagramService.refreshLongLivedToken(accessToken);
        accessToken = refreshed.accessToken;
        const newExpiry = refreshed.expiresIn
            ? new Date(Date.now() + refreshed.expiresIn * 1000)
            : null;
        await account.update({
            access_token: accessToken,
            token_expiry: newExpiry,
        });
    }

    return accessToken;
}

exports.getAccountReels = async (request, reply) => {
    const { id } = request.params;
    const { bucket = "total", limit = 30 } = request.query;
    try {
        const account = await social_accounts.findOne({
            where: { id, user_id: request.user.id },
        });

        if (!account)
            return reply
                .status(404)
                .send({ success: false, message: "Account not found" });

        const accessToken = await ensureValidAccessToken(account);

        const rawReels = await instagramService.getReelsWithInsights(
            account.account_id,
            accessToken,
        );

        const reels = rawReels
            .map((m) => {
                const views = getMediaViews(m);
                return {
                    id: m.id,
                    media_url: m.media_url,
                    thumbnail_url: m.thumbnail_url,
                    permalink: m.permalink,
                    caption: m.caption,
                    timestamp: m.timestamp,
                    like_count: m.like_count,
                    comments_count: m.comments_count,
                    views,
                    bucket: getViewBucket(views),
                };
            })
            .sort((a, b) => b.views - a.views);

        const filtered =
            bucket === "total" ? reels : reels.filter((r) => r.bucket === bucket);

        reply.send({
            success: true,
            data: {
                bucket,
                reels: filtered.slice(0, Number(limit)),
            },
        });
    } catch (error) {
        console.error(
            "Get Account Reels Error:",
            error.response?.data || error.message,
        );
        reply.status(500).send({ success: false, message: error.message });
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

        const accessToken = await ensureValidAccessToken(account);

        const profile = await instagramService.getProfile(
            account.account_id,
            accessToken,
        );

        const media = await instagramService.getMedia(
            account.account_id,
            accessToken,
        );
        console.log("media", media);

        const reelsStats = computeReelsStats(media);
        const topPosts = [...media]
            .sort((a, b) => getMediaViews(b) - getMediaViews(a))
            .slice(0, 8)
            .map((m) => ({
                id: m.id,
                media_url: m.media_url,
                thumbnail_url: m.thumbnail_url,
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
