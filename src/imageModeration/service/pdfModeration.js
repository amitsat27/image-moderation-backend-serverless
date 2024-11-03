const AWS = require('aws-sdk');
const { PDFDocument } = require('pdf-lib');
const pdf = require('pdf-poppler');
const folderName = 'pdf-files';
const fs = require('fs');
const path = require('path');
const rekognition = new AWS.Rekognition();
const axios = require('axios');

const sightengineUserId = '';
const signengineAPISecret = '';

const bucketName = 'image-moderation-rekognition';

const s3 = new AWS.S3({
    accessKeyId: '',
    secretAccessKey: '',
    region: 'ap-south-1'
});

async function uploadPagesInS3(event){
    const { pdfBase64, fileName } = JSON.parse(event.body);
    const pdfBuffer = Buffer.from(pdfBase64, 'base64');
    const pdfDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
    const pages = pdfDoc.getPages();
    
       // Set temporary paths based on the environment
    const tempPdfPath = path.join(__dirname, 'tmp', `${fileName}.pdf`); // Local path
    const tempImagePath = path.join(__dirname, 'tmp', 'images');

    // Ensure the tmp directory exists
    if (!fs.existsSync(path.join(__dirname, 'tmp'))) {
        fs.mkdirSync(path.join(__dirname, 'tmp'));
    }
    if (!fs.existsSync(tempImagePath)) {
        fs.mkdirSync(tempImagePath);
    }
     // Save the PDF to a temporary file
    fs.writeFileSync(tempPdfPath, pdfBuffer);

    const options = {
        format: 'png',
        out_dir: tempImagePath,
        out_prefix: fileName,
        page: null // Converts all pages
    };

    try {
        // Convert the PDF to images
        await pdf.convert(tempPdfPath, options);
  
        // Read the generated images
        const files = fs.readdirSync(tempImagePath);
        const imageKeys = [];
  
        for (const file of files) {
            const filePath = path.join(tempImagePath, file);
            const pngBuffer = fs.readFileSync(filePath);
  
            // Define the S3 key (path) for the image
            const imageKey = `${fileName}/${file}`;
  
            // Upload image to S3
            await s3.upload({
                Bucket: bucketName,
                Key: imageKey,
                Body: pngBuffer,
                ContentType: 'image/png',
            }).promise();
  
            imageKeys.push(imageKey); // Add the S3 key to the list
        }
  
        // Clean up temporary files
        fs.unlinkSync(tempPdfPath);
        files.forEach(file => fs.unlinkSync(path.join(tempImagePath, file)));
  
        return { images: imageKeys};
  
    } catch (error) {
        console.error('Error converting PDF to images:', error);
        return {
            statusCode: 400,
            body: JSON.stringify({
                message: 'Failed to convert PDF',
                error: error.message,
            }),
        };
    }
}

async function pdftoImages(event){
    const imagetoPDFConvertSave =  await uploadPagesInS3(event);
    const { fileName } = JSON.parse(event.body);
    try {
        const allTextParagraphs = await processImagesFromS3(bucketName, fileName);
        console.log('Extracted Text Paragraphs:', allTextParagraphs);
        return allTextParagraphs;
    } catch (error) {
        console.error('Error:', error.message);
    }
}

async function processImagesFromS3(bucketName, folderPath) {
    try {
        const imageKeys = await listImagesInS3(bucketName, folderPath);
        
        // Process all images concurrently
        const results = await Promise.all(
            imageKeys.map(async (key, index) => {
                const imageBuffer = await getImageFromS3(bucketName, key);
                const textParagraph = await fetchTextFromImage(imageBuffer);
                const abusiveText = await runTextCheck(textParagraph);
                const checkImages = await fetchModerationLabels(imageBuffer);
                
                // Return the result for each image
                return { page: `Page No ${index + 1}`, checktext: abusiveText,checkImages };
            })
        );
        
        console.log(`Final result: ${JSON.stringify(results)}`);
        return results;
    } catch (error) {
        console.error('Error processing images from S3:', error);
        throw new Error('Failed to process images');
    }
}


async function getImageFromS3(bucketName, key) {
    const params = {
        Bucket: bucketName,
        Key: key,
    };

    try {
        const data = await s3.getObject(params).promise();
        return data.Body; // Return image buffer
    } catch (error) {
        console.error(`Error getting object ${key} from S3:`, error);
        throw new Error('Failed to get image from S3');
    }
}

async function listImagesInS3(bucketName, folderPath) {
    const params = {
        Bucket: bucketName,
        Prefix: folderPath, // Specify the folder path
    };

    try {
        const data = await s3.listObjectsV2(params).promise();
        return data.Contents.map(object => object.Key); // Return array of object keys
    } catch (error) {
        console.error('Error listing objects in S3:', error);
        throw new Error('Failed to list images in S3');
    }
}

async function fetchTextFromImage(imageBuffer) {
    const params = {
        Image: {
            Bytes: imageBuffer,
        },
    };
    try {
        const response = await rekognition.detectText(params).promise();
        const detectedText = response.TextDetections;
        // Construct the paragraph
        let paragraph = '';
        for (const text of detectedText) {
            if (text.Type === 'LINE') {
                paragraph += `${text.DetectedText} `;
            }
        }
        console.log(`paragraph ${paragraph.trim()}`);
        return paragraph.trim();
    } catch (error) {
        console.error('Error detecting text:', error);
        throw new Error('Failed to fetch text from image');
    }
}


/**
 * Checks the provided text using the Sightengine API.
 * @param {string} text - The text to be checked.
 * @param {string} lang - The language of the text.
 * @param {string} categories - Categories for moderation.
 * @param {string} apiUser - Your Sightengine API user.
 * @param {string} apiSecret - Your Sightengine API secret.
 * @returns {Promise<Object>} - The API response.
 */
const checkTextWithSightengine = async (text, lang, categories, apiUser, apiSecret) => {
    // Create FormData instance
    const data = new (require('form-data'))();
    data.append('text', text);
    data.append('lang', lang);
    data.append('categories', categories);
    data.append('mode', 'rules');
    data.append('api_user', apiUser);
    data.append('api_secret', apiSecret);
  
    try {
      // Sending the request and awaiting the response
      const response = await axios({
        url: 'https://api.sightengine.com/1.0/text/check.json',
        method: 'post',
        data: data,
        headers: data.getHeaders(),
      });
  
      // Return the successful response data
      return response.data;
    } catch (error) {
      // Handle error
      if (error.response) {
        console.error('Error Response:', error.response.data);
        throw new Error(error.response.data); // Rethrow the error with response data
      } else {
        console.error('Error Message:', error.message);
        throw new Error(error.message); // Rethrow the error message
      }
    }
  };
  
  // Example usage of the function
const runTextCheck = async (sampleText) => {
    const text = sampleText;
    const lang = 'en';
    const categories = 'profanity,personal,link,drug,weapon,spam,content-trade,money-transaction,extremism,violence,self-harm,medical';
    const apiUser = sightengineUserId; // Use environment variables
    const apiSecret = signengineAPISecret;
  
    try {
      const result = await checkTextWithSightengine(text, lang, categories, apiUser, apiSecret);
      console.log('Check Result:', result);
      return result;
    } catch (error) {
      console.error('Failed to check text:', error.message);
    }
};

async function fetchModerationLabels(imageBuffer) {
    try {
        const rekognitionParams = {
            Image: {
                Bytes: imageBuffer,
            },
            MinConfidence: 60, // Set your confidence threshold
        };
        
        const moderationData = await rekognition.detectModerationLabels(rekognitionParams).promise();
        const moderationInfo = moderationData.ModerationLabels;
        
        if (moderationInfo.length > 0) {
            console.log('This image contains the following moderation labels:');
            moderationInfo.forEach(label => {
                console.log(`- ${label.Name} (Confidence: ${label.Confidence.toFixed(2)}%)`);
            });
        } else { 
            console.log('No moderation labels detected in the image.');     
        }
        
        return moderationInfo;
    } catch (error) {
        console.error('Error detecting moderation labels:', error);
        throw new Error('Failed to fetch moderation labels');
    }
}


module.exports = {
	pdftoImages
};