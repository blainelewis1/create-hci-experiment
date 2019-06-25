#!/usr/bin/env node
/* eslint-disable no-unused-expressions */

'use strict';

const chalk = require('chalk');
const AWS = require('aws-sdk');
const inquirer = require('inquirer');
const _ = require('lodash');
const fs = require('fs');
const os = require('os');

const path = require('path');
const paths = require('../config/paths');

// TODO: this should come from config...
// TODO: the Secret key and everything should be prompted
AWS.config.region = 'us-east-2';

const appPath = '.';

const appPackage = require(paths.appPackageJson);

let appName = appPackage.name;

const s3 = new AWS.S3();
const cognito = new AWS.CognitoIdentity();
const iam = new AWS.IAM();

Promise.all([createUploadsBucket(appName), createWebsiteBucket(appName)]).then(
  () => {
    console.log('Finished setting up S3 uploads and website.');
  }
);

appPackage.scripts.deploy = getDeployScript(appName);
appPackage.scripts.predeploy = 'npm run build';

fs.writeFileSync(
  path.join(appPath, 'package.json'),
  JSON.stringify(appPackage, null, 2) + os.EOL
);

//TODO: this should use the node API so there isn't a dependency of a CLI application
function getDeployScript(appName) {
  return `aws s3 sync build/ s3://${appName}`;
}

async function createWebsiteBucket(appName) {
  console.log(`Creating bucket ${chalk.green(appName)}...`);
  await s3.createBucket({ Bucket: appName }).promise();
  console.log(`${chalk.green(appName)} created!`);

  console.log(`Converting ${chalk.green(appName)} to website bucket...`);
  await s3
    .putBucketWebsite({
      Bucket: appName,
      WebsiteConfiguration: {
        ErrorDocument: {
          Key: 'index.html',
        },
        IndexDocument: {
          Suffix: 'index.html',
        },
      },
    })
    .promise();

  console.log(`Applying bucket policy to ${chalk.green(appName)}...`);
  await s3
    .putBucketPolicy({
      Bucket: appName,
      Policy: JSON.stringify({
        Version: '2012-10-17',
        Statement: [
          {
            Sid: 'PublicReadGetObject',
            Effect: 'Allow',
            Principal: '*',
            Action: ['s3:GetObject'],
            Resource: [`arn:aws:s3:::${appName}/*`],
          },
        ],
      }),
    })
    .promise();

  console.log(`Setup complete!`);
  console.log(
    `http://${appName}.s3-website-${s3.config.region}.amazonaws.com/`
  );
}

async function createUploadsBucket(appName) {
  appName = `${appName}-uploads`;

  console.log(`Creating bucket ${chalk.green(appName)}...`);
  await s3.createBucket({ Bucket: appName }).promise();

  console.log(`Updating CORS policy for ${chalk.green(appName)}...`);
  s3.putBucketCors({
    Bucket: appName,
    CORSConfiguration: {
      CORSRules: [
        {
          AllowedOrigins: ['*'],
          AllowedMethods: ['PUT', 'POST'],
          AllowedHeaders: ['*'],
          ExposeHeaders: ['ETag'],
        },
      ],
    },
  })
    .promise()
    .then(() => console.log(`Updated CORS policy for ${chalk.green(appName)}`));

  const cognitoName = appName.replace(/[^\w]/g, '_');
  console.log(`Creating cognito pool ${chalk.blue(cognitoName)}...`);

  const cognitoIdentityPool = await cognito
    .createIdentityPool({
      AllowUnauthenticatedIdentities: true,
      IdentityPoolName: cognitoName,
    })
    .promise();

  console.log(`Cognito pool ${chalk.blue(cognitoName)} created!`);

  var RoleName = `Cognito_${cognitoIdentityPool.IdentityPoolName}Unauth_Role`;
  var IdentityPoolId = cognitoIdentityPool.IdentityPoolId;

  console.log(`Creating role for congito users ${chalk.yellow(RoleName)}...`);
  const Role = await iam
    .createRole({
      RoleName,
      AssumeRolePolicyDocument: JSON.stringify({
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Principal: { Federated: 'cognito-identity.amazonaws.com' },
            Action: 'sts:AssumeRoleWithWebIdentity',
            Condition: {
              StringEquals: {
                'cognito-identity.amazonaws.com:aud': IdentityPoolId,
              },
              'ForAnyValue:StringLike': {
                'cognito-identity.amazonaws.com:amr': 'unauthenticated',
              },
            },
          },
        ],
      }),
    })
    .promise();

  console.log(`Creating policy for bucket access...`);
  console.log(`Assigning role to cognito pool...`);
  await Promise.all([
    cognito
      .setIdentityPoolRoles({
        IdentityPoolId,
        Roles: {
          unauthenticated: Role.Role.Arn,
        },
      })
      .promise(),
    iam
      .putRolePolicy({
        RoleName,
        PolicyName: 'S3',
        PolicyDocument: JSON.stringify({
          Version: '2012-10-17',
          Statement: [
            {
              Effect: 'Allow',
              Action: ['s3:PutObject', 's3:PutObjectAcl'],
              Resource: `arn:aws:s3:::${appName}/*`,
            },
          ],
        }),
      })
      .promise(),
  ]);

  console.log('Uploads bucket setup complete!');
}
// // TODO: have something check if AWS and whatnot is setup properly

async function deleteUploads(appName) {
  appName = `${appName}-uploads`;

  const answer = await inquirer.prompt([
    {
      name: 'confirm',
      type: 'confirm',
      message: chalk.red(
        'This is a destructive action! It deletes the uploads bucket, pool and IAM role.'
      ),
    },
  ]);

  if (answer.confirm) {
    s3.deleteBucket({ Bucket: appName })
      .promise()
      .then(() => console.log(chalk.green(`Deleted bucket ${appName}.`)));

    const IdentityPoolName = appName.replace(/[^\w]/g, '_');
    var RoleName = `Cognito_${IdentityPoolName}Unauth_Role`;

    const pools = await cognito.listIdentityPools({ MaxResults: 60 }).promise();
    const IdentityPoolId = _.find(pools.IdentityPools, {
      IdentityPoolName,
    }).IdentityPoolId;

    cognito
      .deleteIdentityPool({ IdentityPoolId })
      .promise()
      .then(() =>
        console.log(chalk.green(`Deleted cognito pool ${IdentityPoolName}.`))
      );

    iam
      .deleteRolePolicy({
        RoleName,
        PolicyName: 'S3',
      })
      .promise()
      .then(() => {
        console.log(chalk.green(`Role Policy deleted.`));
        iam
          .deleteRole({ RoleName })
          .promise()
          .then(() =>
            console.log(chalk.green(`Deleted IAM Role ${RoleName}.`))
          );
      });
  }
}

async function deleteWebsite(appName) {
  const answer = await inquirer.prompt([
    {
      name: 'confirm',
      type: 'confirm',
      message: chalk.red(
        'This is a destructive action! It deletes the website bucket.'
      ),
    },
  ]);

  if (answer.confirm) {
    s3.deleteBucket({ Bucket: appName }).promise();
  }
}
