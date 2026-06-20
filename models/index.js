const sequelize = require('../config/database');
const User = require('./User');
const SocialAccount = require('./SocialAccount');
const Campaign = require('./Campaign');
const CampaignAsset = require('./CampaignAsset');
const CampaignCaption = require('./CampaignCaption');
const CampaignSubmission = require('./CampaignSubmission');
const CreatorPoints = require('./CreatorPoints');
const CreatorRank = require('./CreatorRank');
const Notification = require('./Notification');

// Associations
User.hasMany(SocialAccount, { foreignKey: 'user_id', as: 'socialAccounts' });
SocialAccount.belongsTo(User, { foreignKey: 'user_id' });

User.hasMany(CampaignSubmission, { foreignKey: 'user_id', as: 'submissions' });
CampaignSubmission.belongsTo(User, { foreignKey: 'user_id' });

User.hasMany(CreatorPoints, { foreignKey: 'user_id', as: 'pointHistory' });
CreatorPoints.belongsTo(User, { foreignKey: 'user_id' });

User.hasOne(CreatorRank, { foreignKey: 'user_id', as: 'rank' });
CreatorRank.belongsTo(User, { foreignKey: 'user_id' });

Campaign.hasMany(CampaignAsset, { foreignKey: 'campaign_id', as: 'assets' });
CampaignAsset.belongsTo(Campaign, { foreignKey: 'campaign_id' });

Campaign.hasMany(CampaignCaption, { foreignKey: 'campaign_id', as: 'captions' });
CampaignCaption.belongsTo(Campaign, { foreignKey: 'campaign_id' });

Campaign.hasMany(CampaignSubmission, { foreignKey: 'campaign_id', as: 'submissions' });
CampaignSubmission.belongsTo(Campaign, { foreignKey: 'campaign_id' });

CampaignSubmission.belongsTo(SocialAccount, { foreignKey: 'social_account_id', as: 'socialAccount' });
SocialAccount.hasMany(CampaignSubmission, { foreignKey: 'social_account_id', as: 'submissions' });

User.hasMany(Notification, { foreignKey: 'user_id', as: 'notifications' });
Notification.belongsTo(User, { foreignKey: 'user_id' });

module.exports = {
    sequelize,
    User,
    SocialAccount,
    Campaign,
    CampaignAsset,
    CampaignCaption,
    CampaignSubmission,
    CreatorPoints,
    CreatorRank,
    Notification
};
