# Tactic Media Maintebot

This is a serverless application taking the fuss out of automated EBS snapshot management.

## About

Maintebot provides two Lambda functions that are automatically executed once a day.

The *backup* function explores all existing EBS volumes in the current region, searching for volumes with a tag named *Backup* with either *daily* or *monthly* value.

Each tagged volume gets backed up by creating an EBS snapshot. Each snapshot is tagged with *Expires* tag containing a timestamp used by the *cleanup* function to decide
whether a snapshot should be removed or not yet. 

The *daily* backups are kept for a month, *monthly* backups are kept for a year. The only exception is a *monthly* backup created on 1st January: these snapshots are kept forewer.

## How to use Maintebot

**Requirements:**

1. Node 14 installed on the machine you'll be working with
3. An AWS CLI profile called `default` usable via your CLI

### First, deploy the code into AWS Lambda

1. Check out this repository and open it in your terminal
2. Copy `.env.dist` to `.env` and update settings to your liking
2. Run `npm install`
3. Run `npx sls deploy`

Feel free to change anything in the `.env` file to your liking. You can also override any of the environment variables by specifying the variable
name with the overriden value when you call Serverless, for example: `STAGE=prod npx sls deploy`

See https://www.serverless.com/framework/docs/environment-variables/#support-for-env-files for more info about the SLS environment variables.
### Second, tag your EBS volumes

1. Log in to your AWS account and open EC2 console
2. Find *Elastic Block Store* section in the left menu and open *Volumes*
3. Select a **volume** you would like to back up
4. Select *Tags* tab and click *Add/Edit Tags*
5. Add a tag named *Backup* with value either *daily* or *monthly*
6. Save changes
7. Repeat steps 1-6 for all individual EBS volumes

Important: Make sure you're tagging EBS volumes, not EC2 instances.

### Third, run the first backup manually (optional)

Your Maintebot is already set up, but will run once per 24 hours. It might be a good idea to make the first backup immediately. 

1. Open the Maintebot directory in your terminal
2. Run `npx sls invoke -f backup`
3. Go to the EC2 console, find Snapshots in the left menu, open it

At this point you should see new snapshots being created. Voila.

## Do you need help?

This package is a showcase of what [Tactic Media](https://tacticmedia.com.au) can do for you. We specialise in software development, DevOps and general IT consultations. 

Check out [our contact page](https://tacticmedia.com.au/contact.html) for ways to get in touch or have a look at the rest of [Tactic Media tools hosted on GitHub](https://github.com/tacticmedia).