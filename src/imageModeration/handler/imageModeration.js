const { contentType, lambdaProxyResponse } = require('../helpers/helper');
const { fetchModerationLabels } = require('../service/imageModeration');

class ValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ValidationError';
        this.statusCode = 400;
    }
}

class ServiceError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ServiceError';
        this.statusCode = 502;
    }
}

module.exports.handler = async function (event) {
    try {
        const data = await fetchModerationLabels(event);
        return lambdaProxyResponse(200, contentType, data);
    } catch (err) {
        const statusCode = err.statusCode || 500;
        const message = err.message || 'Internal Error';
        if (statusCode === 500) {
            console.error(`Unexpected Error: ${err.stack}`);
        } else {
            console.warn(`Handled Error: ${message}`);
        }
        return lambdaProxyResponse(statusCode, contentType, { message });
    }
};
