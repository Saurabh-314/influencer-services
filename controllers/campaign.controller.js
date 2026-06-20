const { Campaign, CampaignAsset, CampaignCaption, User } = require('../models');

exports.createCampaign = async (request, reply) => {
    try {
        const { title, description, campaign_type, reward_points, start_date, end_date, assets, captions } = request.body;

        const campaign = await Campaign.create({
            title,
            description,
            campaign_type,
            reward_points,
            start_date,
            end_date,
            created_by: request.user.id,
            status: 'active'
        });

        if (assets && assets.length > 0) {
            const assetData = assets.map(asset => ({ ...asset, campaign_id: campaign.id }));
            await CampaignAsset.bulkCreate(assetData);
        }

        if (captions && captions.length > 0) {
            const captionData = captions.map(caption => ({ ...caption, campaign_id: campaign.id }));
            await CampaignCaption.bulkCreate(captionData);
        }

        const fullCampaign = await Campaign.findByPk(campaign.id, {
            include: ['assets', 'captions']
        });

        reply.status(201).send({
            success: true,
            message: 'Campaign created successfully',
            data: fullCampaign
        });
    } catch (error) {
        reply.status(500).send({ success: false, message: error.message });
    }
};

exports.getAllCampaigns = async (request, reply) => {
    try {
        const campaigns = await Campaign.findAll({
            where: { status: 'active' },
            include: ['assets', 'captions']
        });

        reply.send({
            success: true,
            data: campaigns
        });
    } catch (error) {
        reply.status(500).send({ success: false, message: error.message });
    }
};

exports.getCampaignById = async (request, reply) => {
    try {
        const campaign = await Campaign.findByPk(request.params.id, {
            include: ['assets', 'captions']
        });

        if (!campaign) {
            return reply.status(404).send({ success: false, message: 'Campaign not found' });
        }

        reply.send({
            success: true,
            data: campaign
        });
    } catch (error) {
        reply.status(500).send({ success: false, message: error.message });
    }
};

