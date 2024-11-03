const AWS = require('aws-sdk');
AWS.config.update({ region: 'ap-south-1' });

const s3 = new AWS.S3();
const rekognition = new AWS.Rekognition();
// Example usage
const imageBucket = 'image-moderation-rekognition'; // Replace with your S3 bucket name
const imageName = 'testimage_voilance.jpg'; // Replace with your image file name

async function analyzeImage(imageBucket, imageName) {
    try {
        // Fetch the image from S3
        const params = {
            Bucket: imageBucket,
            Key: imageName,
        };

        // Get the image from S3
        const data = await s3.getObject(params).promise();

        // Send the image to Rekognition for moderation
        const rekognitionParams = {
            Image: {
                Bytes: data.Body,
            },
            MinConfidence: 75, // Set your confidence threshold
        };

        const moderationData = await rekognition.detectModerationLabels(rekognitionParams).promise();

        // Log the moderation labels
        console.log('Moderation Labels:', moderationData.ModerationLabels);
        
        // Check for any moderation labels
        if (moderationData.ModerationLabels.length > 0) {
            console.log('This image contains the following moderation labels:');
            moderationData.ModerationLabels.forEach(label => {
                console.log(`- ${label.Name} (Confidence: ${label.Confidence.toFixed(2)}%)`);
            });
        } else {
            console.log('No moderation labels detected in the image.');
        }

          // let isModerated = false;
  // const organizedLabels = moderationData.ModerationLabels.reduce((acc, label) => {
  //   const { Name, Confidence, ParentName } = label;
  //   const parentCategory = ParentName || "Uncategorized";

  //   // Check if any label exceeds the confidence threshold
  //   if (Confidence >= MODERATION_CONFIDENCE_THRESHOLD) {
  //     isModerated = true;
  //   }
  //   if (!acc[parentCategory]) {
  //     acc[parentCategory] = [];
  //   }
  //   acc[parentCategory].push({
  //     name: Name,
  //     confidence: `${Confidence.toFixed(2)}%`
  //   });

  //   return acc;
  // }, {});
  
    } catch (error) {
        console.error('Error fetching image or analyzing with Rekognition:', error);
    }
}



analyzeImage(imageBucket, imageName);