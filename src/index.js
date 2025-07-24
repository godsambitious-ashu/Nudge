const github = require('@actions/github');
const { exec } = require('@actions/exec');
const { ReviewProcessor } = require('./lib/review');
const { FeedbackAggregator } = require('./lib/aggregator');
const { execSync } = require('child_process');

async function setupGit() {
  console.log('Setting up Git configuration...');
  await exec('git', ['config', '--global', '--add', 'safe.directory', process.env.GITHUB_WORKSPACE]);
  await exec('git', ['config', '--global', 'user.email', 'github-actions[bot]@users.noreply.github.com']);
  await exec('git', ['config', '--global', 'user.name', 'github-actions[bot]']);
  console.log('Git configuration completed successfully');
}

async function setupCody() {
  console.log('Authenticating Cody CLI...');
  await exec('cody', [
    'auth',
    'login',
    '--access-token',
    process.env.SRC_ACCESS_TOKEN,
    '--endpoint',
    process.env.SRC_ENDPOINT || 'https://sourcegraph.com OR your custom endpoint',
  ]);
  console.log('Cody authentication successful');
}

async function run() {
  console.log('Starting PR review process...');
  console.log(`Repository: ${process.env.GITHUB_REPOSITORY}`);
  console.log(`PR Number: ${github.context.payload.pull_request.number}`);

  await setupGit();
  await setupCody();

  const reviewer = new ReviewProcessor();
  const aggregator = new FeedbackAggregator();

  try {
    console.log('Fetching changed files...');
    const files = await reviewer.getChangedFiles();
    console.log(`Found ${files.length} files to review:`);
    console.log(files.map((f) => f.filename).join('\n'));

    console.log('Creating review batches...');
    const batches = reviewer.createBatches(files);
    console.log(`Created ${batches.length} review batches with batch size: ${batches[0]?.length || 0}`);

    console.log('Processing review batches...');
    const batchFeedback = [];
    const failedBatches = [];

    for (const batch of batches) {
      console.log(`Starting batch with files: ${batch.map((f) => f.filename).join(', ')}`);
      try {
        const feedback = await reviewer.processBatch(batch);
        console.log(`Received Cody feedback for batch`);
        batchFeedback.push(feedback);

        // Create inline comments for this batch immediately
        await reviewer.createInlineComments(feedback);
        console.log('Created inline comments for current batch');
      } catch (error) {
        console.warn(`Cody error processing batch: ${error.message}`);
        failedBatches.push({
          files: batch.map((f) => f.filename),
          error: error.message,
        });

        // Add empty feedback to maintain batch count
        batchFeedback.push({
          comments: [],
          error: error.message,
        });
      }
      console.log(`Finished processing batch with ${batch.length} files`);
    }

    console.log('Generating review summary...');
    // Include information about failed batches in summary

    const summary = await aggregator.generateSummary(batchFeedback, failedBatches);
    console.log(`Generated summary successfully`);

    console.log('Posting final review...');
    await aggregator.postFinalReview(github.getOctokit(process.env.GITHUB_TOKEN), reviewer.context, summary);
    console.log(`Review posted to PR #${github.context.payload.pull_request.number}`);

    if (failedBatches.length > 0) {
      console.log(`Note: ${failedBatches.length} batches failed but workflow continued successfully`);
    }
  } catch (error) {
    console.error('Non-Cody error during review process:', error);
    throw error;
  }
  console.log('PR review process completed successfully');
}

run();
