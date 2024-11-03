const contentType = { 'content-type': 'application/json' };

function lambdaProxyResponse(statusCode = 200, headers = contentType, body = {}) {
    return {
        statusCode,
        headers: {
            ...headers,
            'Access-Control-Allow-Origin': '*', // Required for CORS support
            'Access-Control-Allow-Credentials': true // For cookies, authorization headers with HTTPS
        },
        body: JSON.stringify(body)
    };
}

module.exports = {
    contentType,
    lambdaProxyResponse
};
