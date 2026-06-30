const { processAndSaveImage } = require('../services/imageUpload.service');

exports.uploadCampaignImage = async (request, reply) => {
    try {
        const { type } = request.query;

        if (!['brand_logo', 'track_artwork'].includes(type)) {
            return reply.status(400).send({
                success: false,
                message: 'Query param "type" must be brand_logo or track_artwork',
            });
        }

        const data = await request.file();
        if (!data) {
            return reply.status(400).send({ success: false, message: 'No file uploaded' });
        }

        const buffer = await data.toBuffer();
        const result = await processAndSaveImage(buffer, data.mimetype, type);

        reply.send({
            success: true,
            message: 'Image uploaded successfully',
            data: result,
        });
    } catch (error) {
        if (error.code === 'FST_REQ_FILE_TOO_LARGE') {
            return reply.status(413).send({
                success: false,
                message: 'File is too large. Maximum upload size is 5MB.',
            });
        }
        reply.status(400).send({ success: false, message: error.message });
    }
};
