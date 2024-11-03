const AWS = require('aws-sdk');
const rekognition = new AWS.Rekognition();
const LABEL_CONFIDENCE_THRESHOLD = 70; 
const bucketName = 'image-moderation-rekognition';

const s3 = new AWS.S3({
    accessKeyId: '',
    secretAccessKey: '',
    region: 'ap-south-1'
});

async function uploadImageS3(imageBase64, fileName){
  const buffer = Buffer.from(imageBase64, 'base64');
  const addParams = {
    Bucket: bucketName,
    Key: fileName,
    Body: buffer,
    ContentEncoding: 'base64', 
    ContentType: 'image/jpeg' 
  };
  await s3.putObject(addParams).promise();
  return true;
}

async function fetchModerationLabels(event) {
  const { imageBase64, fileName } = JSON.parse(event.body);
  validateRequestData(imageBase64, fileName);
  try {
      // Upload image to S3
      await uploadImageS3(imageBase64, fileName);
      const imageData = await getImagesFromS3(fileName);
      if (!imageData || !imageData.Body) { throw new Error('Failed to retrieve image data from S3.');  }
      const rekognitionParams = {
          Image: { Bytes: imageData.Body },
          MinConfidence: 70,
      };
      const moderationData = await rekognition.detectModerationLabels(rekognitionParams).promise();
      const moderationInfo = moderationData.ModerationLabels || [];
      // Describe image in one line
      const imageDescription = await describeImageInOneLine(imageData.Body);
      if (moderationInfo.length > 0) {
          console.log('Moderation labels detected:', moderationInfo.map(label => ({
              Name: label.Name,
              Confidence: label.Confidence.toFixed(2),
          })));
      } else {
          console.log('No moderation labels detected.');
      }
      return { moderationInfo, imageDescription };
  } catch (err) {
      throw new Error('Failed to process moderation labels.');
  }
}

// Helper for request data validation
function validateRequestData(imageBase64, fileName) {
  if (!imageBase64 || !fileName) {
      throw new Error("Both 'imageBase64' and 'fileName' are required in the request.");
  }
}

async function describeImageInOneLine(imageBytes) {
  const params = {
    Image: { Bytes: imageBytes },
    MaxLabels: 5, // Limit to the top 5 labels for a concise description
    MinConfidence: LABEL_CONFIDENCE_THRESHOLD
  };
  try {
    const response = await rekognition.detectLabels(params).promise();
    if (!response.Labels || response.Labels.length === 0) {
      return "The image content could not be identified with confidence.";
    }
    const topLabels = response.Labels.map(label => label.Name);
    if (topLabels.length === 0) {
      return "The image content is unclear based on confidence levels.";
    }
    const description = `This image contains ${topLabels.slice(0, -1).join(', ')}${topLabels.length > 1 ? ', and ' : ''}${topLabels.slice(-1)}.`;
    return description;
  } catch (error) {
    console.error('Error in describeImageInOneLine:', error.message);
    throw new Error('Failed to describe the image content.');
  }
}

async function getImagesFromS3(fileName){
  const getParams = {
    Bucket: bucketName,
    Key: fileName,
  };
  const imageData = await s3.getObject(getParams).promise();
  return imageData;
}

module.exports = {
	fetchModerationLabels
};