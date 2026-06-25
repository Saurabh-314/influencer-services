const db = require('../models');
const campaigns = db.models.campaigns;
const campaign_assets = db.models.campaign_assets;
const campaign_captions = db.models.campaign_captions;

exports.createCampaign = async (request, reply) => {
    try {
        const {
            title,
            description,
            campaign_type,
            reward_points,
            start_date,
            end_date,
            spotify_link,
            genre,
            required_tags,
            hashtags,
            brand_name,
            brand_logo_url,
            track_artwork_url,
            bonus_target_views,
            bonus_reward,
            bonus_max_creators,
            audience_gender,
            audience_age,
            specific_creators,
            rank_allocations,
            total_budget,
            expected_reels,
            assets,
            captions,
        } = request.body;

        const campaign = await campaigns.create({
            title,
            description,
            campaign_type: campaign_type || 'reel',
            reward_points: reward_points || 0,
            start_date: start_date || new Date(),
            end_date: end_date || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            spotify_link,
            genre,
            required_tags,
            hashtags,
            brand_name,
            brand_logo_url,
            track_artwork_url,
            bonus_target_views,
            bonus_reward,
            bonus_max_creators,
            audience_gender,
            audience_age,
            specific_creators,
            rank_allocations,
            total_budget,
            expected_reels,
            created_by: request.user.id,
            status: 'active',
        });

        if (assets && assets.length > 0) {
            const assetData = assets.map((asset) => ({ ...asset, campaign_id: campaign.id }));
            await campaign_assets.bulkCreate(assetData);
        }

        if (captions && captions.length > 0) {
            const captionData = captions.map((caption) => ({ ...caption, campaign_id: campaign.id }));
            await campaign_captions.bulkCreate(captionData);
        }

        const fullCampaign = await campaigns.findByPk(campaign.id, {
            include: ['assets', 'captions'],
        });

        reply.status(201).send({
            success: true,
            message: 'Campaign created successfully',
            data: fullCampaign,
        });
    } catch (error) {
        reply.status(500).send({ success: false, message: error.message });
    }
};

exports.getAllCampaigns = async (request, reply) => {
    try {
        const campaignList = await campaigns.findAll({
            where: { status: 'active' },
            include: ['assets', 'captions'],
        });

        reply.send({
            success: true,
            data: campaignList,
        });
    } catch (error) {
        reply.status(500).send({ success: false, message: error.message });
    }
};

exports.getCampaignById = async (request, reply) => {
    try {
        const campaign = await campaigns.findByPk(request.params.id, {
            include: ['assets', 'captions'],
        });

        if (!campaign) {
            return reply.status(404).send({ success: false, message: 'Campaign not found' });
        }

        reply.send({
            success: true,
            data: campaign,
        });
    } catch (error) {
        reply.status(500).send({ success: false, message: error.message });
    }
};
