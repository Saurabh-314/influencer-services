const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');

const UPLOAD_DIR = path.join(__dirname, '../uploads/campaigns');
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/jpg']);

const IMAGE_CONFIG = {
    brand_logo: { width: 512, height: 512, fit: 'cover' },
    track_artwork: { width: 800, height: 800, fit: 'inside' },
};

async function ensureUploadDir() {
    await fs.promises.mkdir(UPLOAD_DIR, { recursive: true });
}

function validateImageFile(mimetype, size) {
    if (!ALLOWED_MIME_TYPES.has(mimetype)) {
        throw new Error('Invalid file type. Allowed: JPG, PNG, WEBP');
    }
    if (size > MAX_FILE_SIZE) {
        throw new Error('File size exceeds 5MB limit');
    }
}

async function processAndSaveImage(buffer, mimetype, type) {
    validateImageFile(mimetype, buffer.length);

    const config = IMAGE_CONFIG[type];
    if (!config) {
        throw new Error('Invalid image type. Use brand_logo or track_artwork');
    }

    await ensureUploadDir();

    const filename = `${type}-${Date.now()}-${crypto.randomBytes(6).toString('hex')}.webp`;
    let pipeline = sharp(buffer).rotate();

    if (config.fit === 'cover') {
        pipeline = pipeline.resize(config.width, config.height, { fit: 'cover', position: 'centre' });
    } else {
        pipeline = pipeline.resize(config.width, config.height, {
            fit: 'inside',
            withoutEnlargement: true,
        });
    }

    const outputBuffer = await pipeline.webp({ quality: 82 }).toBuffer();
    await fs.promises.writeFile(path.join(UPLOAD_DIR, filename), outputBuffer);

    return {
        url: `/uploads/campaigns/${filename}`,
        filename,
        size: outputBuffer.length,
    };
}

module.exports = {
    MAX_FILE_SIZE,
    ALLOWED_MIME_TYPES,
    validateImageFile,
    processAndSaveImage,
};
