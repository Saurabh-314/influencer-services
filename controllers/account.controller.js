const db = require("../models");
const social_accounts = db.models.social_accounts;
const instagramService = require("../services/instagram.service");
const { syncAccountInsights, ensureValidAccessToken } = require("../services/instagramInsights.service");
const { sanitizeMetaError, logOAuthStep, classifyInstagramOAuthError } = instagramService;
const {
    getMediaViews,
    getViewBucket,
} = require("../utils/scoring");

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
        profile_image: profile.profile_picture_url || null,
        biography: profile.biography || null,
        account_type: profile.account_type || null,
        followers_count: profile.followers_count || 0,
        following_count: profile.follows_count || 0,
        total_posts: profile.media_count || 0,
        engagement_rate: 0,
        access_token: accessToken,
        token_expiry: tokenExpiry,
        is_connected: true,
        status: "active",
        connected_at: new Date(),
        last_synced_at: null,
        score_status: "collecting",
    };

    const [account, created] = await social_accounts.findOrCreate({
        where: { user_id: userId, platform: "instagram" },
        defaults: accountData,
    });

    if (!created) {
        await account.update({
            ...accountData,
            connected_at: account.connected_at || accountData.connected_at,
        });
    }

    syncAccountInsights(account, { force: true }).catch((error) => {
        logOAuthStep('connectInstagramAccount:initialSyncFailed', {
            accountId: account.id,
            message: error.message,
        });
    });

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

        const data = await syncAccountInsights(account);

        reply.send({
            success: true,
            data: {
                ...data,
                engagement_rate: account.engagement_rate,
            },
        });
    } catch (error) {
        const meta = error.response?.data?.error || error.response?.data || {};
        console.error("Sync Account Data Error:", error.response?.data || error.message);
        reply.status(500).send({
            success: false,
            message: error.message,
            diagnostics: {
                hint: 'Instagram sync threw before a score could be built. Use instagram_errors to debug in live mode.',
                instagram_errors: [{
                    stage: 'account_sync',
                    message: meta.message || error.message,
                    type: meta.type || error.name || null,
                    code: meta.code || error.code || null,
                    fbtrace_id: meta.fbtrace_id || null,
                }],
            },
        });
    }
};

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

        const mediaResult = await instagramService.getMediaWithStatus(
            account.account_id,
            accessToken,
        );
        const rawReels = mediaResult.media || [];

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

