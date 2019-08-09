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

// TODO: have something check if AWS and what not is setup properly
// TODO: Explaining how to setup credentials is tricky, it would be nice if there was a better way.
// TODO: should use a better way to get the region.

AWS.config.region = 'us-east-2';

const appPath = '.';

const appPackage = require(paths.appPackageJson);

let appName = appPackage.name;

const s3 = new AWS.S3();
const cognito = new AWS.CognitoIdentity();
const iam = new AWS.IAM();

Promise.all([deleteUploads(appName), deleteWebsite(appName)]).then(() => {
  console.log('Cleanup complete.');
});

//TODO: this should use the node API so there isn't a dependency of a CLI application
delete appPackage.scripts.deploy;
delete appPackage.scripts.predeploy;
delete appPackage.scripts['sync-data'];

fs.writeFileSync(
  path.join(appPath, 'package.json'),
  JSON.stringify(appPackage, null, 2) + os.EOL
);

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
