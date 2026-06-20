class BaseProvider {
    constructor(config = {}) {
        this.config = config;
    }

    async connect() {
        throw new Error('connect() must be implemented');
    }

    async refreshToken() {
        throw new Error('refreshToken() must be implemented');
    }

    async fetchProfile() {
        throw new Error('fetchProfile() must be implemented');
    }

    async fetchAnalytics() {
        throw new Error('fetchAnalytics() must be implemented');
    }

    async disconnect() {
        throw new Error('disconnect() must be implemented');
    }
}

module.exports = BaseProvider;
