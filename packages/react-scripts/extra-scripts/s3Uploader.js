import AWS from 'aws-sdk';

export function createS3Uploader(
  AWS_REGION,
  AWS_COGNITO_IDENTITY_POOL_ID,
  AWS_S3_BUCKET
) {
  AWS.config.region = AWS_REGION;
  AWS.config.credentials = new AWS.CognitoIdentityCredentials({
    IdentityPoolId: AWS_COGNITO_IDENTITY_POOL_ID,
  });

  let s3 = new AWS.S3({
    apiVersion: '2006-03-01',
    params: { Bucket: AWS_S3_BUCKET },
  });

  // https://blog.mturk.com/tutorial-how-to-create-hits-that-ask-workers-to-upload-files-using-amazon-cognito-and-amazon-s3-38acb1108633
  return function(fileName, data) {
    console.log(fileName, data);
    return s3
      .upload({
        Key: fileName,
        Body: JSON.stringify(data),
        ContentType: 'json',
        ACL: 'bucket-owner-full-control',
      })
      .promise();
  };
}
