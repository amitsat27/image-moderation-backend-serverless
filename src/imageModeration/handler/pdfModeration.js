const {contentType, lambdaProxyResponse} = require('../helpers/helper');
const { pdftoImages } = require('../service/pdfModeration');

module.exports.handler = async function (event) {
try {
        const req = {
            body: event.body,
            file: event.file
        };
        const data = await pdftoImages(req);
        return lambdaProxyResponse(200, contentType, data);
    } catch (err) {
        console.log(`err ${JSON.stringify(err)}`);
        return lambdaProxyResponse(500, contentType, {message: 'Internal Error'});
    }
};