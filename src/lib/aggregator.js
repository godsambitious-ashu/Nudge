const { exec } = require('@actions/exec');
const path = require('path');
const fs = require('fs').promises;

class FeedbackAggregator {
  async generateSummary(batchFeedback) {
    const programmingEnv = process.env.PROGRAMMING_ENVIRONMENT;
    const customPrompt = process.env.CUSTOM_SUMMARY_PROMPT;
    const guidelinesPath = path.join(process.env.GITHUB_WORKSPACE, 'PR-Review-Guidelines.md');
    const guidelines = await fs.readFile(guidelinesPath, 'utf8');

    console.log('Programming Languages', programmingEnv);
    console.log('Custom Prompt', customPrompt);

    let reviewOutput = '';

    const envRule = `Follow best practices for ${programmingEnv}.`;
    const guidelinesRule = `Follow these guidelines for crafting the summary: ${guidelines}.`;
    const prompt = customPrompt
      ? `${customPrompt} ${envRule} ${guidelinesRule}`
      : `Create a concise, well-structured summary of all code review feedback. Focus on key patterns, important findings, and actionable recommendations as well as testing recommendations. Group similar feedback items together. Provide code snippets if applicable in ${programmingEnv} following the platform's best practices.`;

    try {
      await exec(
        'cody',
        [
          'chat',
          '--stdin',
          '-m',
          prompt,
          '--access-token',
          process.env.SRC_ACCESS_TOKEN,
          '--endpoint',
          process.env.SRC_ENDPOINT || 'https://sourcegraph.com OR your custom endpoint'
        ],
        {
          input: batchFeedback.join('\n'),
          listeners: {
            stdout: (data) => {
              reviewOutput += data.toString();
            },
          },
        },
      );
    } catch (error) {
      console.log('Error generating summary:', error.message);
      reviewOutput = this.generateFallbackSummary(batchFeedback);
    }

    return reviewOutput;
  }

  generateFallbackSummary(batchFeedback) {
    return `Code Review Summary:
    
    ${batchFeedback.join('\n\n')}
    
    Note: This is a simplified summary due to an error in the summary generation process.`;
  }

  async postFinalReview(octokit, context, summary) {
    try {
      await octokit.rest.pulls.createReview({
        owner: process.env.GITHUB_REPOSITORY.split('/')[0],
        repo: process.env.GITHUB_REPOSITORY.split('/')[1],
        pull_number: context.issue.number,
        body: summary,
        event: 'COMMENT',
      });
      console.log('Successfully posted final review summary');
    } catch (error) {
      console.log('Error posting final review:', error.message);
      // Post review as individual comments if bulk review fails
      const summaryChunks = this.chunkSummary(summary);
      for (const chunk of summaryChunks) {
        try {
          await octokit.rest.issues.createComment({
            owner: process.env.GITHUB_REPOSITORY.split('/')[0],
            repo: process.env.GITHUB_REPOSITORY.split('/')[1],
            issue_number: context.issue.number,
            body: chunk,
          });
          console.log('Posted review chunk as comment');
        } catch (innerError) {
          console.log('Failed to post review chunk:', innerError.message);
        }
      }
    }
  }

  chunkSummary(summary, chunkSize = 65000) {
    const chunks = [];
    for (let i = 0; i < summary.length; i += chunkSize) {
      chunks.push(summary.slice(i, i + chunkSize));
    }
    return chunks;
  }
}

module.exports = { FeedbackAggregator };
